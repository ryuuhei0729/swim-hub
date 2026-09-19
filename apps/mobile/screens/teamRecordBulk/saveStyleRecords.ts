// =============================================================================
// チーム大会記録 - 種目単位の保存ロジック (upsert 化)
// =============================================================================
//
// 種目詳細画面 (TeamRecordStyleDetailScreen) から呼ばれる、1種目 (個人 or リレー)
// ぶんの保存関数。画面コンポーネントから抽出したのは、サーバーへの絞り込み
// (delete/update の対象 id 集合、relay_records の scope) を screen を render せずに
// 直接検証できるようにするため (QA Sprint Contract の制約ハーネス要求)。
//
// 保存方針 (PM確定):
//   - `existingRecordIds` への membership のみで INSERT/UPDATE/DELETE を振り分ける
//     (computeRecordSaveDiff、apps/shared/utils/recordSaveDiff.ts が唯一の定義元)
//   - UPDATE の SET句に video_path/video_thumbnail_path を絶対含めない
//     (触れなければ自動的に保持される。含めると undefined で上書きして悪化する)
//   - 動画アップロード対象は「保存成功した insert 行 + update 行」の両方
//   - リレーは `TeamRelayRecordsAPI.replace()` を「画面が読み込んだ relay_records.id」
//     スコープで呼ぶ (`existingRelayRecordIds`)。DB 列条件 (relay_kind + leg_distance) で
//     絞ると、同一種目に登録された別チーム/別組の行を巻き込んで削除してしまう (事実1)
//   - 削除スコープは「この種目の全ての組に属する既存 records.id のうち、今回のフォームに
//     無いもの」に限定する。他種目の records には一切触れない
//   - UPDATE は `.select("id")` で対象0件 (= 他セッションが既に削除済み) を検知したら
//     INSERT にフォールバックする。PostgREST は対象0件の UPDATE でもエラーを返さないため、
//     `error` だけを見ていると無言でユーザーの入力を失う (事実2)

import type { SupabaseClient } from "@supabase/supabase-js";
import type { RecordInsert, PoolType } from "@apps/shared/types";
import { toReactionTimeValue } from "@apps/shared/utils/reactionTime";
import { formatTimeBest } from "@apps/shared/utils/time";
import { computeRecordSaveDiff } from "@apps/shared/utils/recordSaveDiff";
import {
  resolveRelayGenderCategory,
  type RelaySavePlan,
} from "@apps/shared/utils/relayRecordSave";
import { TeamRelayRecordsAPI } from "@apps/shared/api/teams/relayRecords";
import {
  calcCumulativeTimes,
  getRelayLegBoundaries,
  getLegStartCumulative,
  toLegRelativeSplitTime,
} from "@apps/shared/utils/relayEvents";
import { uploadVideoForTeamMember, MissingThumbnailError } from "@/utils/videoUpload";
import type {
  StyleEntry,
  SplitTimeEntry,
  StyleLookup,
  PendingVideoAsset,
} from "./buildStyleEntries";

/**
 * 既存 records (大会全体、id のみで良い) から、対象の StyleEntry 群 (この種目の
 * 全ての「組」) に属する records.id だけを取り出す。`computeRecordSaveDiff` の
 * `existingRecordIds` は保存対象のスコープに絞って渡すこと (絞らないと他種目の
 * 削除に波及する)。
 *
 * MemberRecord.id は既存記録由来なら records.id、エントリー由来の新規行なら
 * entries.id、新規追加行なら genId() の生成値のいずれかで文字列からは区別が
 * つかない。ここでは「大会全体の生の records.id 集合」への membership で判定する
 * (文字列パターンでの推測はしない)。
 *
 * 複数「組」がある場合 (事実4) は全ての組を合算してひとつの Set にする。保存時は
 * 画面全体を1回の diff (computeRecordSaveDiff) で処理するため、組をまたいだ
 * membership 判定になる。
 */
export function scopeExistingRecordIdsForEntries(
  existingRecords: readonly { id: string }[],
  entries: readonly StyleEntry[],
): Set<string> {
  const rawRecordIds = new Set(existingRecords.map((r) => r.id));
  const scoped = new Set<string>();
  for (const entry of entries) {
    for (const mr of entry.memberRecords) {
      if (rawRecordIds.has(mr.id)) scoped.add(mr.id);
    }
  }
  return scoped;
}

/**
 * リレーのレグに該当する records.id (`scopeExistingRecordIdsForEntries` の結果) から、
 * relay_record_legs 経由でその relay_records.id を解決する。
 *
 * 【修正ラウンド 2026-09-17】実体は shared 側に移設した
 * (`apps/shared/api/teams/relayRecords.ts` の `TeamRelayRecordsAPI.resolveRelayRecordIdsForRecords`)。
 * web もリレー保存で同じ逆引きが必要になったため、二重管理を避けて shared に
 * 集約している。この関数は既存の呼び出し元 (`TeamRecordStyleDetailScreen.tsx`) の
 * import を変えずに済ませるための薄い委譲のみ。挙動 (失敗時に空集合を返す等) は
 * 移設先の docstring を参照。
 */
export async function scopeRelayRecordIdsForLegRecords(
  supabase: SupabaseClient,
  legRecordIds: readonly string[],
): Promise<Set<string>> {
  return new TeamRelayRecordsAPI(supabase).resolveRelayRecordIdsForRecords(legRecordIds);
}

export type SaveStyleRecordsValidationCode =
  | "relayFullTeam"
  | "relayAllTimes"
  | "cumulativeTimeInverted"
  | "relaySplitBeforeLegStart"
  | "atLeastOneRecord";

/**
 * 書き込む前に弾くバリデーション失敗。呼び出し側 (画面) がこの `code` を
 * `t("competition.records.validation." + code, params)` に渡して Alert 表示する。
 * 生の PostgrestError と違い、これはユーザー入力の問題なので文言をそのまま
 * 翻訳キーに使ってよい。
 */
export class SaveStyleRecordsValidationError extends Error {
  constructor(
    public readonly code: SaveStyleRecordsValidationCode,
    public readonly params?: Record<string, number>,
  ) {
    super(code);
    this.name = "SaveStyleRecordsValidationError";
  }
}

export type StyleRecordVideoError =
  | { kind: "noSession" }
  | { kind: "noThumbnail"; memberName: string }
  | { kind: "generic"; memberName: string };

export interface SaveStyleRecordsResult {
  hasError: boolean;
  videoErrors: StyleRecordVideoError[];
}

export interface SaveStyleRecordsParams {
  supabase: SupabaseClient;
  competitionId: string;
  teamId: string;
  poolType: PoolType;
  /**
   * 保存対象の1種目ぶんの全「組」(個人種目 or リレー種目。1本のみでも配列で渡す)。
   * styleEntries 全体ではない。
   */
  entries: StyleEntry[];
  /** `scopeExistingRecordIdsForEntries` で絞り込んだ、この種目の全ての組の既存 records.id 集合 */
  existingRecordIds: ReadonlySet<string>;
  /**
   * `scopeRelayRecordIdsForLegRecords` で解決した、この種目の全ての組に属する
   * relay_records.id 集合。個人種目では常に空集合。
   */
  existingRelayRecordIds: ReadonlySet<string>;
  memberGenderByUserId: ReadonlyMap<string, number>;
  styles: readonly StyleLookup[];
  isPremium: boolean;
  getAccessToken: () => Promise<string | null>;
}

interface ValidRecordRow {
  id: string;
  styleId: number;
  memberUserId: string;
  memberName: string;
  time: number;
  isRelaying: boolean;
  note: string;
  reactionTime: string;
  splitTimes: SplitTimeEntry[];
  videoAsset?: PendingVideoAsset | null;
}

/**
 * INSERT / UPDATE の両方に使う書き込みペイロード。
 *
 * 【PM訂正 2026-09-17】当初 UPDATE の SET句を time/note/is_relaying/reaction_time の
 * 4列に絞っていたが、これは誤りだった。`updateMemberRecordByIndex` (詳細画面) は
 * `{...mr, ...updates}` で MemberRecord.id を据え置いたまま memberUserId だけ
 * 差し替えるため、リレーのレグ泳者を変更して保存すると UPDATE で user_id が
 * 書かれず DB は前の泳者のままになる (第1泳者以外は引き継ぎタイムが付くため、
 * 他人の記録が別人の名前で残る)。style_id / pool_type も同様の理由で欠落は禁止
 * (旧 delete-all 方式では正しく書けていたので、絞ると退行になる)。
 *
 * そこで UPDATE は **旧 insert payload と同一の列集合** を使う。video_path /
 * video_thumbnail_path はそもそもこの payload に含まれないため、結果的に
 * SET句に含まれない (触れない) という当初の要件は自動的に満たされる。
 *
 * competition_id / team_id はこの保存スコープでは不変 (呼び出し元の
 * competitionId/teamId から常に同じ値が入る) だが、旧 delete-all 方式と
 * 列単位で等価であることを自明にするため除外せず含める。
 */
function buildRecordWritePayload(
  row: Pick<
    ValidRecordRow,
    "memberUserId" | "styleId" | "time" | "note" | "isRelaying" | "reactionTime"
  >,
  ctx: { competitionId: string; teamId: string; poolType: PoolType },
): RecordInsert {
  return {
    competition_id: ctx.competitionId,
    user_id: row.memberUserId,
    team_id: ctx.teamId,
    style_id: row.styleId,
    time: row.time,
    note: row.note || null,
    is_relaying: row.isRelaying,
    pool_type: ctx.poolType,
    reaction_time: toReactionTimeValue(row.reactionTime),
  };
}

/** 種目距離と同 distance の split は除外する (ゴールタイム = split ではない) */
function filterPersistableSplitTimes(
  splitTimes: SplitTimeEntry[],
  raceDistance: number | undefined,
): SplitTimeEntry[] {
  return splitTimes.filter(
    (st) => st.distance > 0 && st.splitTime > 0 && !(raceDistance && st.distance === raceDistance),
  );
}

interface InsertRecordOutcome {
  id: string;
  /** split_times の insert だけ失敗した場合 true。records 行自体は作成済みなので id は返す */
  splitError: boolean;
}

/**
 * `records` 1行 + その split_times を新規 insert する。`diff.toInsert` の通常経路と、
 * UPDATE 対象0件検知時 (事実2) の INSERT フォールバックの両方から呼ぶ共通処理。
 */
async function insertRecordWithSplits(
  supabase: SupabaseClient,
  row: ValidRecordRow,
  ctx: { competitionId: string; teamId: string; poolType: PoolType },
  findRaceDistance: (styleId: number) => number | undefined,
): Promise<InsertRecordOutcome | null> {
  const insertPayload = buildRecordWritePayload(row, ctx);
  const { data: newRecord, error: recordError } = await supabase
    .from("records")
    .insert(insertPayload)
    .select("id")
    .single();

  if (recordError || !newRecord) {
    console.error(`Record作成エラー (${row.memberName}):`, recordError);
    return null;
  }

  let splitError = false;
  const validSplitTimes = filterPersistableSplitTimes(row.splitTimes, findRaceDistance(row.styleId));
  if (validSplitTimes.length > 0) {
    const { error } = await supabase.from("split_times").insert(
      validSplitTimes.map((st) => ({
        record_id: newRecord.id,
        distance: st.distance as number,
        split_time: st.splitTime,
      })),
    );
    if (error) {
      console.error(`SplitTime作成エラー (${row.memberName}):`, error);
      splitError = true;
    }
  }

  return { id: newRecord.id, splitError };
}

export async function saveStyleRecords(
  params: SaveStyleRecordsParams,
): Promise<SaveStyleRecordsResult> {
  const {
    supabase,
    competitionId,
    teamId,
    poolType,
    entries,
    existingRecordIds,
    existingRelayRecordIds,
    memberGenderByUserId,
    styles,
    isPremium,
    getAccessToken,
  } = params;

  // 詳細画面は常に styleId (個人) または relayEventId (リレー) を確定させて開くため
  // 実運用では通らないが、型上 styleId は number | "" なので防御的に扱う。
  if (entries.length === 0 || entries.every((e) => e.styleId === "")) {
    return { hasError: false, videoErrors: [] };
  }

  // この画面が対象にしているリレー種目 (個人種目では undefined)。全ての組で同じ
  // relayEventId を共有する前提 (呼び出し元の詳細画面が種目単位でしか開かないため)。
  const relayEventId = entries.find((e) => e.relayEventId)?.relayEventId;

  const validRecords: ValidRecordRow[] = [];
  const relayPlans: RelaySavePlan[] = [];

  // 「+」で追加したがまだ何も入力していない組 (泳者未選択かつ通算タイム未入力の
  // リレー組) は検証対象から除外する。除外しないと、既に入力済みの1本目を保存
  // しようとしただけで、触っていない2本目ぶんの relayFullTeam/relayAllTimes が
  // 発火してしまう (CompetitionTabFormScreen の isDefaultUntouchedEntry と同じ考え方)。
  const isUntouchedRelayGroup = (e: StyleEntry): boolean =>
    !!e.relayEventId &&
    e.memberRecords.every((mr) => !mr.memberUserId && (mr.cumulativeTimeSeconds ?? 0) <= 0);

  // 組ごとに検証・行の組み立てを行う。バリデーションは書き込みの前段なので、
  // どこかの組で1件でも失敗すれば他の組の分も含めて何も書き込まれない
  // (書く前に弾く方針を組単位に拡張しても崩れない)。
  for (const entry of entries) {
    if (entry.styleId === "") continue;
    if (isUntouchedRelayGroup(entry)) continue;

    // リレー種目の各 leg 開始通算タイム (record.time ベース)。split の事前バリデーションと
    // leg 相対 split 変換で共有する。
    const legCumulativeTimes = entry.relayEventId
      ? calcCumulativeTimes(entry.memberRecords.map((mr) => mr.time))
      : [];

    if (entry.relayEventId) {
      const hasUnselectedMember = entry.memberRecords.some((mr) => !mr.memberUserId);
      if (hasUnselectedMember) {
        throw new SaveStyleRecordsValidationError("relayFullTeam");
      }

      const cumulatives = entry.memberRecords.map((mr) => mr.cumulativeTimeSeconds ?? 0);
      const inputtedLegs = cumulatives.filter((c) => c > 0);
      if (inputtedLegs.length > 0 && inputtedLegs.length < 4) {
        throw new SaveStyleRecordsValidationError("relayAllTimes");
      }

      if (inputtedLegs.length === 4) {
        for (let i = 1; i < cumulatives.length; i++) {
          const prev = cumulatives[i - 1];
          const curr = cumulatives[i];
          if (prev === undefined || curr === undefined) continue; // i>=1 かつ i<cumulatives.length なので理論上ここに来ないが防御的に扱う
          if (curr <= prev) {
            throw new SaveStyleRecordsValidationError("cumulativeTimeInverted", {
              current: i + 1,
              prev: i,
            });
          }
        }
      }

      // リレー split の事前バリデーション（書き込む前に弾く）: 各 split (通算値) が、
      // その split が属する leg の開始通算タイム以下だと物理的に成立しない。
      if (entry.relaySplitTimes && entry.relaySplitTimes.length > 0) {
        const legBoundaries = getRelayLegBoundaries(entry.relayEventId);
        const INVERSION_TOLERANCE = 0.005;
        for (const st of entry.relaySplitTimes) {
          if (st.splitTime <= 0) continue;
          const legIdx = legBoundaries.findIndex((boundary) => st.distance <= boundary);
          if (legIdx === -1) continue;
          const legStart = getLegStartCumulative(legCumulativeTimes, legIdx);
          if (st.splitTime <= legStart + INVERSION_TOLERANCE) {
            throw new SaveStyleRecordsValidationError("relaySplitBeforeLegStart", {
              distance: st.distance,
              leg: legIdx + 1,
            });
          }
        }
      }

      const totalTime = legCumulativeTimes.at(-1);
      relayPlans.push({
        relayEventId: entry.relayEventId,
        // 総合タイムは通算タイムの最終要素。レグの和をここで再計算し直さない。
        totalTime: totalTime ?? 0,
        legCount: entry.memberRecords.length,
        genderCategory: resolveRelayGenderCategory(
          entry.memberRecords.map((mr) => mr.memberUserId),
          memberGenderByUserId,
        ),
        legs: [],
      });
    }

    for (let legIdx = 0; legIdx < entry.memberRecords.length; legIdx++) {
      const mr = entry.memberRecords[legIdx];
      if (!mr) continue; // legIdx < entry.memberRecords.length なので理論上ここに来ないが防御的に扱う
      const shouldSave = entry.relayEventId ? (mr.cumulativeTimeSeconds ?? 0) > 0 : mr.time > 0;
      if (!shouldSave) continue;

      const styleId = entry.relayEventId
        ? (mr.relayLegStyleId ?? (entry.styleId as number))
        : (entry.styleId as number);

      // リレー種目: relaySplitTimes を各 leg に分配して leg 内距離・leg 相対タイムに変換
      let splitTimes = mr.splitTimes;
      if (entry.relayEventId && entry.relaySplitTimes) {
        const legBoundaries = getRelayLegBoundaries(entry.relayEventId);
        const legLow = legIdx === 0 ? 0 : legBoundaries[legIdx - 1];
        const legHigh = legBoundaries[legIdx];
        if (legLow !== undefined && legHigh !== undefined) {
          const legStart = getLegStartCumulative(legCumulativeTimes, legIdx);
          splitTimes = entry.relaySplitTimes
            .filter((st) => st.distance > legLow && st.distance <= legHigh)
            .map((st) => {
              const legRelativeSplitTime = toLegRelativeSplitTime(st.splitTime, legStart);
              return {
                ...st,
                distance: legIdx === 0 ? st.distance : st.distance - legLow,
                splitTime: legRelativeSplitTime,
                displayValue: formatTimeBest(legRelativeSplitTime),
              };
            });
        }
      }

      validRecords.push({
        id: mr.id,
        styleId,
        memberUserId: mr.memberUserId,
        memberName: mr.memberName,
        time: mr.time,
        isRelaying: mr.isRelaying,
        note: mr.note,
        reactionTime: mr.reactionTime || "",
        splitTimes,
        videoAsset: mr.videoAsset ?? null,
      });

      if (entry.relayEventId) {
        // この entry (組) のために直前に push した plan。relayPlans は組ごとに
        // 高々1件しか push しないため、常に「この組自身の plan」を指す。
        const plan = relayPlans.at(-1);
        if (plan) {
          plan.legs.push({
            legIndex: legIdx,
            userId: mr.memberUserId,
            styleId,
            legTime: mr.time,
            reactionTime: toReactionTimeValue(mr.reactionTime),
            validRecordIndex: validRecords.length - 1,
          });
        }
      }
    }
  }

  if (validRecords.length === 0) {
    throw new SaveStyleRecordsValidationError("atLeastOneRecord");
  }

  let hasError = false;

  // `idx` は validRecords (= relay leg の validRecordIndex と同じ添字空間) 上の位置。
  // computeRecordSaveDiff に渡した後も relay_records へ渡す insertedRecordIds の
  // 添字を保つために保持する。
  const indexedRows = validRecords.map((row, idx) => ({ row, idx }));
  const diff = computeRecordSaveDiff(existingRecordIds, indexedRows, (item) => item.row.id);

  const savedIdsByIndex: Array<string | null> = new Array(validRecords.length).fill(null);
  const savedRecords: Array<{ recordId: string; record: ValidRecordRow }> = [];

  const findRaceDistance = (styleId: number): number | undefined =>
    styles.find((s) => s.id === styleId)?.distance;

  // ---- DELETE (フォームから削除された既存行のみ。他種目の records には触れない) ----
  if (diff.toDeleteIds.length > 0) {
    const { error: splitDeleteError } = await supabase
      .from("split_times")
      .delete()
      .in("record_id", diff.toDeleteIds);
    if (splitDeleteError) {
      // 生の PostgrestError.message はテーブル名等を含みうるため文字列に埋め込まない
      console.error("スプリットタイム削除エラー:", splitDeleteError);
      hasError = true;
    }

    const { error: deleteError } = await supabase
      .from("records")
      .delete()
      .in("id", diff.toDeleteIds);
    if (deleteError) {
      console.error("既存レコード削除エラー:", deleteError);
      hasError = true;
    }
  }

  // ---- UPDATE (id 保持。旧 insert payload と同一の列集合で書く) ----
  for (const { row, idx } of diff.toUpdate) {
    const updatePayload = buildRecordWritePayload(row, { competitionId, teamId, poolType });
    const { data: updatedRows, error: updateError } = await supabase
      .from("records")
      .update(updatePayload)
      .eq("id", row.id)
      .select("id");

    if (updateError) {
      console.error(`Record更新エラー (${row.memberName}):`, updateError);
      hasError = true;
      continue;
    }

    if ((updatedRows ?? []).length === 0) {
      // 対象行が既に存在しない (別セッションでの削除等)。PostgREST は対象0件の
      // UPDATE でもエラーを返さないため、`error` だけを見ていると無言でユーザーの
      // 入力を失う。旧 delete-all → insert-all 方式なら insert として必ず残って
      // いた挙動に戻すため、INSERT にフォールバックする (事実2)。
      console.error(
        `Record更新対象が見つかりません。INSERT にフォールバックします (${row.memberName}, id=${row.id})`,
      );
      const inserted = await insertRecordWithSplits(
        supabase,
        row,
        { competitionId, teamId, poolType },
        findRaceDistance,
      );
      if (!inserted) {
        hasError = true;
        continue;
      }
      savedIdsByIndex[idx] = inserted.id;
      savedRecords.push({ recordId: inserted.id, record: row });
      if (inserted.splitError) hasError = true;
      continue;
    }

    savedIdsByIndex[idx] = row.id;
    savedRecords.push({ recordId: row.id, record: row });

    const { error: splitDeleteError } = await supabase
      .from("split_times")
      .delete()
      .eq("record_id", row.id);
    if (splitDeleteError) {
      console.error(`SplitTime再作成エラー (${row.memberName}):`, splitDeleteError);
      hasError = true;
      continue;
    }

    const validSplitTimes = filterPersistableSplitTimes(
      row.splitTimes,
      findRaceDistance(row.styleId),
    );
    if (validSplitTimes.length > 0) {
      const { error: splitError } = await supabase.from("split_times").insert(
        validSplitTimes.map((st) => ({
          record_id: row.id,
          distance: st.distance as number,
          split_time: st.splitTime,
        })),
      );
      if (splitError) {
        console.error(`SplitTime作成エラー (${row.memberName}):`, splitError);
        hasError = true;
      }
    }
  }

  // ---- INSERT ----
  for (const { row, idx } of diff.toInsert) {
    const inserted = await insertRecordWithSplits(
      supabase,
      row,
      { competitionId, teamId, poolType },
      findRaceDistance,
    );
    if (!inserted) {
      hasError = true;
      continue;
    }
    savedIdsByIndex[idx] = inserted.id;
    savedRecords.push({ recordId: inserted.id, record: row });
    if (inserted.splitError) hasError = true;
  }

  // ---- relay_records / relay_record_legs (画面が読み込んだ relay_records.id スコープで差し替え) ----
  const savableRelayPlans = relayPlans.filter((plan) => plan.legs.length > 0);
  // このリレー種目に以前から relay_records があった (existingRelayRecordIds が非空) 場合は、
  // 全ての組をフォームから削除して保存したときも stale な relay_records を消すために
  // replace を呼ぶ必要がある。
  const needsRelayWork =
    relayEventId != null && (savableRelayPlans.length > 0 || existingRelayRecordIds.size > 0);

  if (needsRelayWork && !hasError) {
    const relayResult = await new TeamRelayRecordsAPI(supabase).replace(
      {
        teamId,
        competitionId,
        poolType,
        // DB 列条件 (relay_kind + leg_distance) ではなく、画面が読み込んだ
        // relay_records.id だけを渡す (事実1)。同一種目の別チーム/別組の行を
        // 巻き込まない。
        relayRecordIds: Array.from(existingRelayRecordIds),
      },
      savableRelayPlans,
      savedIdsByIndex,
    );
    if (relayResult.failed) hasError = true;
  } else if (needsRelayWork && hasError) {
    console.error("records の書き込みに失敗したため relay_records の差し替えを中止しました");
  }

  if (hasError) {
    return { hasError: true, videoErrors: [] };
  }

  // ---- 代理動画アップロード（team-assign 経由）。Premium のみ。
  // 対象は「保存成功した insert 行 + update 行」の両方 (insert のみに絞らない)。
  const videoErrors: StyleRecordVideoError[] = [];
  if (isPremium) {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      if (savedRecords.some((s) => s.record.videoAsset)) {
        videoErrors.push({ kind: "noSession" });
      }
    } else {
      for (const { recordId, record } of savedRecords) {
        if (!record.videoAsset) continue;
        try {
          // read replica 反映待ち（team-assign が records を SELECT するため）
          await new Promise((resolve) => setTimeout(resolve, 300));
          await uploadVideoForTeamMember({
            type: "record",
            id: recordId,
            targetUserId: record.memberUserId,
            teamId,
            videoUri: record.videoAsset.uri,
            mimeType: record.videoAsset.mimeType,
            accessToken,
          });
        } catch (videoErr) {
          console.error("代理動画アップロードエラー:", videoErr);
          videoErrors.push(
            videoErr instanceof MissingThumbnailError
              ? { kind: "noThumbnail", memberName: record.memberName }
              : { kind: "generic", memberName: record.memberName },
          );
        }
      }
    }
  }

  return { hasError: false, videoErrors };
}
