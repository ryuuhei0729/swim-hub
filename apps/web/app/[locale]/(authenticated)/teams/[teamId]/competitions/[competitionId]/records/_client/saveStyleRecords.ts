// =============================================================================
// 大会記録の代理入力 - 1種目ぶんの保存処理
// =============================================================================
//
// 種目の入力画面 (RecordStyleDetail) から呼ぶ、1種目 (個人種目 or リレー種目) ぶんの
// 保存処理。mobile の apps/mobile/screens/teamRecordBulk/saveStyleRecords.ts と同じく
// 保存の範囲をその種目に絞る:
//   - `existingRecords` には「この種目の全ての組に属する既存 records」だけを渡す
//     (scopeExistingRecordsForEntries)。差分 (computeRecordSaveDiff) の削除対象は
//     この範囲に限られ、他の種目の records には一切触れない
//   - リレーのチーム記録 (relay_records) は、この種目の既存レグから辿れる
//     relay_records.id だけを置き換える。個人種目の保存では relay_records に触れない
//
// 書き込みの手順 (UPDATE の列・対象0件の UPDATE を INSERT に切り替える・ゴール地点の
// split を保存しない・records が1件でも失敗したらリレー側を書かない) は、種目単位に
// する前の一括保存 (RecordClient.handleSubmit) から変えていない。

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  resolveRelayGenderCategory,
  type RelaySavePlan,
} from "@apps/shared/utils/relayRecordSave";
import type { TeamRelayRecordsAPI } from "@apps/shared/api/teams/relayRecords";
import { computeRecordSaveDiff } from "@apps/shared/utils/recordSaveDiff";
import { formatTimeBest } from "@/utils/formatters";
import {
  calcCumulativeTimes,
  getLegStartCumulative,
  getRelayLegBoundaries,
  toLegRelativeSplitTime,
} from "./relayEvents";
import type { SplitTimeEntry, StyleEntry, StyleLookup } from "./buildStyleEntries";

/** 保存範囲の判定に使う既存 records の列 */
export interface ScopedExistingRecord {
  id: string;
  is_relaying: boolean;
}

/**
 * 大会全体の既存 records から、`entries` (この種目の全ての組) に属するものだけを取り出す。
 * MemberRecord.id は既存記録由来なら records.id、エントリー由来なら entries.id、
 * 新規行なら生成値で、文字列からは区別できないため records.id への一致で判定する。
 */
export function scopeExistingRecordsForEntries<R extends ScopedExistingRecord>(
  existingRecords: readonly R[],
  entries: readonly StyleEntry[],
): R[] {
  const rowIds = new Set<string>();
  for (const entry of entries) {
    for (const mr of entry.memberRecords) rowIds.add(mr.id);
  }
  return existingRecords.filter((record) => rowIds.has(record.id));
}

export type SaveStyleRecordsValidationCode =
  | "relayFullTeam"
  | "relayAllTimes"
  | "cumulativeTimeInverted"
  | "relaySplitBeforeLegStart"
  | "atLeastOneRecord";

/** 書き込む前に弾いた入力の問題。画面が code に対応する文言を出す */
export class SaveStyleRecordsValidationError extends Error {
  constructor(
    public readonly code: SaveStyleRecordsValidationCode,
    public readonly params?: Record<string, number>,
  ) {
    super(code);
    this.name = "SaveStyleRecordsValidationError";
  }
}

export interface SaveStyleRecordsParams {
  supabase: SupabaseClient;
  relayRecordsApi: Pick<TeamRelayRecordsAPI, "replace" | "resolveRelayRecordIdsForRecords">;
  competitionId: string;
  teamId: string;
  poolType: number;
  /** 保存する1種目ぶんの全ての組 (個人種目は通常1件、リレーは組の数だけ) */
  entries: readonly StyleEntry[];
  /** `scopeExistingRecordsForEntries` で絞った、この種目の既存 records */
  existingRecords: readonly ScopedExistingRecord[];
  memberGenderByUserId: ReadonlyMap<string, number>;
  styles: readonly StyleLookup[];
}

export interface SaveStyleRecordsResult {
  /** records / split_times / relay_records のどこかで書き込みに失敗した */
  hasError: boolean;
  /**
   * フォーム行 id (MemberRecord.id) → 保存後の records.id。動画アップロードの対象解決に使う
   * (エントリー由来・新規行では MemberRecord.id と records.id が一致しないため)。
   */
  savedRecordIdByRowId: Map<string, string>;
}

interface ValidRecordRow {
  /** validRecords 内の位置。relay_record_legs.record_id を写す添字と揃える */
  index: number;
  id: string;
  styleId: number;
  memberUserId: string;
  memberName: string;
  time: number;
  isRelaying: boolean;
  note: string;
  reactionTime: string;
  splitTimes: SplitTimeEntry[];
}

const parseReactionTime = (value: string): number | null =>
  value && value.trim() !== "" ? parseFloat(value) : null;

/**
 * 「+」で足しただけで何も入力していないリレーの組 (泳者未選択かつ通算タイム未入力)。
 * 検証・保存の対象から外す (mobile の saveStyleRecords と同じ考え方)。外さないと、
 * 入力済みの1本目を保存しようとしただけで、触っていない2本目の relayFullTeam が出る。
 */
const isUntouchedRelayGroup = (entry: StyleEntry): boolean =>
  !!entry.relayEventId &&
  entry.memberRecords.every(
    (mr) => !mr.memberUserId && (mr.cumulativeTimeSeconds ?? 0) <= 0,
  );

/** 保存する行とリレーの計画を組み立てる。入力に問題があれば書き込む前に throw する */
function buildSavePlan(
  entries: readonly StyleEntry[],
  memberGenderByUserId: ReadonlyMap<string, number>,
): { validRecords: ValidRecordRow[]; relayPlans: RelaySavePlan[] } {
  const validRecords: ValidRecordRow[] = [];
  // リレーのチーム記録 (relay_records / relay_record_legs) を書くための計画。
  // ここでは1件も書き込まず、`records` への書き込みが全て成功した後にまとめて実行する。
  const relayPlans: RelaySavePlan[] = [];

  for (const entry of entries) {
    if (entry.styleId === "") continue;
    if (isUntouchedRelayGroup(entry)) continue;

    // リレー種目の各 leg 開始通算タイム (record.time ベース)。保存時の leg 相対変換と
    // split の事前バリデーションで共有する。
    const legCumulativeTimes = entry.relayEventId
      ? calcCumulativeTimes(entry.memberRecords.map((mr) => mr.time))
      : [];

    if (entry.relayEventId) {
      if (entry.memberRecords.some((mr) => !mr.memberUserId)) {
        throw new SaveStyleRecordsValidationError("relayFullTeam");
      }

      // 部分入力バリデーション: 全 leg 入力または全 leg 未入力のみ許容
      const cumulatives = entry.memberRecords.map((mr) => mr.cumulativeTimeSeconds ?? 0);
      const inputtedLegs = cumulatives.filter((c) => c > 0);
      if (inputtedLegs.length > 0 && inputtedLegs.length < 4) {
        throw new SaveStyleRecordsValidationError("relayAllTimes");
      }

      // 累計タイム逆転バリデーション (全 leg 入力済みの場合のみ実行)
      if (inputtedLegs.length === 4) {
        for (let i = 1; i < cumulatives.length; i++) {
          const prevCum = cumulatives[i - 1];
          const currCum = cumulatives[i];
          if (prevCum === undefined || currCum === undefined) continue; // i>=1 かつ
          // i<cumulatives.length のため理論上 undefined にならないが防御的に扱う
          if (currCum <= prevCum) {
            throw new SaveStyleRecordsValidationError("cumulativeTimeInverted", {
              current: i + 1,
              prev: i,
            });
          }
        }
      }

      // リレー split の事前バリデーション（書き込む前に弾く）:
      // 各 split (通算値) が、その split が属する leg の開始通算タイム以下だと
      // 物理的に成立しない (leg 開始前に split が発生することはない)。
      // 浮動小数点誤差を吸収するため 0.005 秒の許容を入れる。
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
    }

    // リレーのチーム記録の計画を1本ぶん用意する。レグを1件も保存しない場合
    // (全レグ未入力) はこの計画に legs が入らないので、後段で捨てられる。
    const relayPlanIndex = entry.relayEventId ? relayPlans.length : null;
    if (entry.relayEventId && relayPlanIndex !== null) {
      relayPlans.push({
        relayEventId: entry.relayEventId,
        // 総合タイムは通算タイムの最終要素。レグの和をここで再計算し直さない
        // (calcCumulativeTimes が小数第2位で丸めながら積み上げた値をそのまま使う)。
        // 全レグ未入力のときは 0 を入れ、legs が空の計画として後段で捨てる。
        totalTime: legCumulativeTimes.at(-1) ?? 0,
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
      if (!mr) continue; // entry.memberRecords.length に基づく for ループのため型上のみの防御
      // リレー種目: 累計タイムが > 0 なら保存対象（区間タイムは累計から逆算されるため0になりえない）
      // 個人種目: 区間タイムが > 0 なら保存対象
      const shouldSave = entry.relayEventId
        ? (mr.cumulativeTimeSeconds ?? 0) > 0
        : mr.time > 0;
      if (!shouldSave) continue;

      // リレー種目の場合は各 leg の styleId を使用、個人種目は entry の styleId
      const styleId = entry.relayEventId
        ? (mr.relayLegStyleId ?? (entry.styleId as number))
        : (entry.styleId as number);

      // リレー種目: relaySplitTimes を各 leg に分配して leg 内距離・leg 相対タイムに変換
      // (distance は leg 内相対に、splitTime は通算値から leg 開始通算タイムを引いた
      // leg 相対値に変換する。records.time と同じ変換)
      let splitTimes = mr.splitTimes;
      if (entry.relayEventId && entry.relaySplitTimes) {
        const legBoundaries = getRelayLegBoundaries(entry.relayEventId);
        const legLow = legIdx === 0 ? 0 : legBoundaries[legIdx - 1];
        if (legLow === undefined) continue; // legBoundaries は固定4要素配列で
        // 本来常に定義されるが、legLow=0 (leg0 の意味) と取り違えないよう ?? は使わない
        const legHigh = legBoundaries[legIdx];
        if (legHigh === undefined) continue; // 型上は保証されないため防御的に扱う
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

      validRecords.push({
        index: validRecords.length,
        id: mr.id,
        styleId,
        memberUserId: mr.memberUserId,
        memberName: mr.memberName,
        time: mr.time,
        isRelaying: mr.isRelaying,
        note: mr.note,
        reactionTime: mr.reactionTime || "",
        splitTimes,
      });

      // リレーのレグを計画に積む。`legTime` は区間タイム (`mr.time`)。通算タイムではない
      // (過去に通算値が混入して lap が崩れた前科があるため DB に入れない)。
      if (relayPlanIndex !== null) {
        const plan = relayPlans[relayPlanIndex];
        if (plan) {
          plan.legs.push({
            legIndex: legIdx,
            userId: mr.memberUserId,
            styleId,
            legTime: mr.time,
            reactionTime: parseReactionTime(mr.reactionTime),
            validRecordIndex: validRecords.length - 1,
          });
        }
      }
    }
  }

  return { validRecords, relayPlans };
}

/**
 * 1種目ぶんの記録を保存する。
 *
 * - 入力の問題は `SaveStyleRecordsValidationError` を throw する (何も書き込まない)
 * - 既存行の削除に失敗したときは Error を throw する (続けると残りの書き込みと食い違う)
 * - それ以外の書き込み失敗は `hasError: true` で返す (書けた行はそのまま)
 */
export async function saveStyleRecords(
  params: SaveStyleRecordsParams,
): Promise<SaveStyleRecordsResult> {
  const {
    supabase,
    relayRecordsApi,
    competitionId,
    teamId,
    poolType,
    entries,
    existingRecords,
    memberGenderByUserId,
    styles,
  } = params;

  const { validRecords, relayPlans } = buildSavePlan(entries, memberGenderByUserId);
  if (validRecords.length === 0) {
    throw new SaveStyleRecordsValidationError("atLeastOneRecord");
  }

  let hasError = false;

  // upsert: この種目の既存 records.id 集合と現在のフォーム行の差分を取り、
  // INSERT / UPDATE / DELETE に振り分ける (判定は shared 側の1箇所で持つ)。
  const existingRecordIds = new Set(existingRecords.map((r) => r.id));

  // リレーのチーム記録を書く必要があるのはリレー種目だけ。個人種目の保存では
  // relay_records に一切触れない。
  //
  // 置き換え対象の relay_records.id は、下の DELETE より前に確定させる。
  // `relay_record_legs.record_id` は ON DELETE SET NULL
  // (`supabase/migrations/20260908000000_add_relay_records.sql`) のため、先に DELETE を
  // 実行すると対象行の record_id が NULL 化され、古い relay_records を辿れなくなる。
  //
  // is_relaying でフィルタしない: レグの一部 (第2〜4泳者) が他の経路で既に削除されて
  // record_id が NULL 化され、第1泳者 (is_relaying=false) だけが手がかりとして残っている
  // 場合でも解決できるようにするため (絞って得るものは無い)。
  const isRelayEvent = entries.some((entry) => !!entry.relayEventId);
  const savableRelayPlans = relayPlans.filter((plan) => plan.legs.length > 0);
  const needsRelayWork =
    isRelayEvent &&
    (savableRelayPlans.length > 0 || existingRecords.some((record) => record.is_relaying));
  const relayRecordIds = needsRelayWork
    ? await relayRecordsApi.resolveRelayRecordIdsForRecords(Array.from(existingRecordIds))
    : new Set<string>();

  const { toInsert, toUpdate, toDeleteIds } = computeRecordSaveDiff(
    existingRecordIds,
    validRecords,
    (record) => record.id,
  );

  // フォームから削除された既存行を削除する (split_times を先に消してから records を消す)
  if (toDeleteIds.length > 0) {
    const { error: splitDeleteError } = await supabase
      .from("split_times")
      .delete()
      .in("record_id", toDeleteIds);
    if (splitDeleteError) {
      // 生の PostgrestError.message はテーブル名等を含みうるため文言に埋め込まない
      console.error("スプリットタイム削除エラー:", splitDeleteError);
      throw new Error("split_times の削除に失敗しました");
    }

    const { error: deleteError } = await supabase
      .from("records")
      .delete()
      .in("id", toDeleteIds);
    if (deleteError) {
      console.error("既存のレコード削除エラー:", deleteError);
      throw new Error("records の削除に失敗しました");
    }
  }

  // 保存後の records.id を validRecords と同じ添字で並べる (relay_record_legs.record_id
  // へ写すため)。UPDATE 行は既存 id のまま、INSERT 行は新規採番された id。
  // 失敗した位置は null のまま残す。
  const insertedRecordIds: Array<string | null> = validRecords.map(() => null);
  const savedRecordIdByRowId = new Map<string, string>();

  // UPDATE の SET句は INSERT と同じ列集合にする。style_id / user_id / pool_type を
  // SET句から漏らすと、リレー泳者の差し替え (mr.id を据え置いたまま memberUserId だけ
  // 変わる) や大会水路の事後修正が無言で反映されなくなる。video_path /
  // video_thumbnail_path は含めない (触れなければ保持される)。
  const buildRecordPayload = (record: ValidRecordRow) => ({
    competition_id: competitionId,
    user_id: record.memberUserId,
    team_id: teamId,
    style_id: record.styleId,
    time: record.time,
    note: record.note || null,
    is_relaying: record.isRelaying,
    pool_type: poolType,
    reaction_time: parseReactionTime(record.reactionTime),
  });

  const persistableSplitTimes = (record: ValidRecordRow) => {
    // 種目の距離と同じ距離の split_time は保存しない (ゴールタイム = split ではない)
    const raceDistance = styles.find((s) => s.id === record.styleId)?.distance;
    return record.splitTimes.filter(
      (st) =>
        st.distance > 0 && st.splitTime > 0 && !(raceDistance && st.distance === raceDistance),
    );
  };

  // 既存行の更新
  for (const record of toUpdate) {
    const { data: updatedRows, error: updateError } = await supabase
      .from("records")
      .update(buildRecordPayload(record))
      .eq("id", record.id)
      .select("id");

    if (updateError) {
      console.error(`Record更新エラー (${record.memberName}):`, updateError);
      hasError = true;
      continue;
    }

    // PostgREST は UPDATE の対象行が0件でもエラーを返さない。別セッションが保存の直前に
    // 同じ行を削除していた場合に入力が無言で消えないよう、INSERT に切り替える
    // (「データが消えるより重複が残る方を選ぶ」。TeamRelayRecordsAPI.replace() と同じ判断)。
    let recordId = record.id;
    if (updatedRows === null) {
      // error が無いのに data が null になるのは通常の挙動 (0行なら []) から外れた異常系
      console.error(
        `Record更新: updatedRows が null (0行なら本来 [] のはず, 異常系) (${record.memberName})`,
      );
    }
    if (!updatedRows || updatedRows.length === 0) {
      const { data: recreated, error: recreateError } = await supabase
        .from("records")
        .insert(buildRecordPayload(record))
        .select("id")
        .single();
      if (recreateError || !recreated) {
        console.error(`Record再作成エラー (${record.memberName}):`, recreateError);
        hasError = true;
        continue;
      }
      recordId = recreated.id;
    }

    insertedRecordIds[record.index] = recordId;
    savedRecordIdByRowId.set(record.id, recordId);

    // split_times は行単位で入れ替える (既存を削除してから新しいものを挿入)
    const { error: splitDeleteError } = await supabase
      .from("split_times")
      .delete()
      .eq("record_id", recordId);
    if (splitDeleteError) {
      console.error(`SplitTime削除エラー (${record.memberName}):`, splitDeleteError);
      hasError = true;
      continue;
    }

    const validSplitTimes = persistableSplitTimes(record);
    if (validSplitTimes.length > 0) {
      const { error: splitError } = await supabase.from("split_times").insert(
        validSplitTimes.map((st) => ({
          record_id: recordId,
          distance: st.distance,
          split_time: st.splitTime,
        })),
      );
      if (splitError) {
        console.error(`SplitTime作成エラー (${record.memberName}):`, splitError);
        hasError = true;
      }
    }
  }

  // 新規行の作成
  for (const record of toInsert) {
    const { data: newRecord, error: recordError } = await supabase
      .from("records")
      .insert(buildRecordPayload(record))
      .select("id")
      .single();

    if (recordError) {
      console.error(`Record作成エラー (${record.memberName}):`, recordError);
      hasError = true;
      continue;
    }
    if (!newRecord) continue;

    insertedRecordIds[record.index] = newRecord.id;
    savedRecordIdByRowId.set(record.id, newRecord.id);

    const validSplitTimes = persistableSplitTimes(record);
    if (validSplitTimes.length > 0) {
      const { error: splitError } = await supabase.from("split_times").insert(
        validSplitTimes.map((st) => ({
          record_id: newRecord.id,
          distance: st.distance,
          split_time: st.splitTime,
        })),
      );
      if (splitError) {
        console.error(`SplitTime作成エラー (${record.memberName}):`, splitError);
        hasError = true;
      }
    }
  }

  // リレーのチーム記録 (relay_records / relay_record_legs) を書く。
  // `records` への書き込みが1件でも失敗していたら書かない: relay_records.total_time は
  // ランキングの並び順そのものになる値で、一部のレグしか書けていない状態で書くと
  // 「実在しない記録に基づく順位」がエラーなしで出来上がる。書かなければ既存の行が
  // そのまま残る (過去に実際に泳がれた値なので嘘ではない)。
  if (needsRelayWork && !hasError) {
    const { failed: relayWriteFailed } = await relayRecordsApi.replace(
      {
        teamId,
        competitionId,
        poolType,
        // DB 列条件 (relay_kind + leg_distance) ではなく、この画面が読み込んだこの種目の
        // 既存レグから解決した relay_records.id だけを渡す (他の種目のリレー記録や、
        // 画面が読み込んでいない行を巻き込まない)。
        relayRecordIds: Array.from(relayRecordIds),
      },
      savableRelayPlans,
      insertedRecordIds,
    );
    if (relayWriteFailed) hasError = true;
  } else if (needsRelayWork && hasError) {
    console.error("records の書き込みに失敗したため relay_records の差し替えを中止しました");
  }

  return { hasError, savedRecordIdByRowId };
}
