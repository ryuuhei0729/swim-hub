// 既存レコード → StyleEntry 構築の純粋関数（Web 正準 buildStyleEntries.ts の移植）。
// 相違点: mobile では File/Blob を扱わず、動画は { uri, mimeType } の保留アセットで保持する。
import { formatTimeBest } from "@apps/shared/utils/time";
import { userStylePairKey, type EntryAdditionPlan } from "@apps/shared/utils/entryRecordMerge";
import {
  RELAY_EVENTS,
  RelayEventId,
  calcCumulativeTimes,
  detectRelayEventId,
  getRelayLegDistance,
  getRelayLegBoundaries,
  getLegStartCumulative,
  toCumulativeSplitTime,
} from "./relayEvents";

/** styles テーブルの必要フィールドのみ。Style 全体を要求しないことでテスト容易性を確保 */
export interface StyleLookup {
  id: number;
  name_jp: string;
  /** 種目距離 (m)。ゴール地点スプリットの復元に使う。未知種目では undefined */
  distance?: number;
}

export interface SplitTimeEntry {
  id: string;
  distance: number;
  splitTime: number;
  displayValue: string;
}

/** mobile の代理動画保留アセット（VideoUploader と同形式） */
export interface PendingVideoAsset {
  uri: string;
  mimeType?: string;
}

export interface MemberRecord {
  id: string;
  memberUserId: string;
  memberName: string;
  time: number;
  timeDisplayValue: string;
  reactionTime: string;
  isRelaying: boolean;
  note: string;
  splitTimes: SplitTimeEntry[];
  /** 代理動画の保留アセット（保存後 team-assign でアップロード） */
  videoAsset?: PendingVideoAsset | null;
  relayLegStyleId?: number;
  relayLegLabel?: string;
  cumulativeTimeSeconds?: number;
  /**
   * エントリー由来行の参考表示専用フィールド (entries.entry_time, 秒)。
   * 記録タイムの入力値 (time/timeDisplayValue) には絶対に使わないこと。
   * 表示にのみ使う (formatTimeBest でラベル化)。既存記録由来の行では常に undefined。
   */
  entryTimeReference?: number | null;
}

export interface StyleEntry {
  id: string;
  styleId: number | "";
  styleName: string;
  memberRecords: MemberRecord[];
  relayEventId?: RelayEventId | null;
  relaySplitTimes?: SplitTimeEntry[];
}

/** buildStyleEntriesFromExisting の入力レコード型 (RecordWithDetails の必要フィールドのみ) */
export interface ExistingRecord {
  id: string;
  user_id: string;
  style_id: number;
  time: number;
  is_relaying: boolean;
  reaction_time?: number | null;
  note: string | null;
  split_times: { id: string; distance: number; split_time: number }[];
  users: { id: string; name: string } | null;
}

/**
 * (R1-1) ある record の split_times が旧バグ由来の破損データ (D2 の leg 相対正規化より前に
 * 保存された、split_time が通算値のままの状態) かどうかを判定する純粋関数。
 * Web 正準 `isRecordSplitTimesCorrupted` の移植。
 *
 * 掃除スクリプト (`scripts/cleanup-relay-split-time-cumulative-bug.sql`) と**同一の不変条件**
 * を使う (二重管理を避けるため字面を一致させる): ある record の split_times に
 * `split_time >= record.time` を満たす行が1件以上あれば、その record の split_times は
 * 全件が旧形式 (通算値のまま) の破損データである。途中経過の split がゴールタイム
 * (record.time) 以上になることは正常データでは起こり得ない。
 * 許容誤差は入れない (`>=` をそのまま使い、掃除スクリプトの述語と字面を一致させる)。
 *
 * 呼び出し側は leg 内距離の途中経過 (distance < legDist、真に "leg 内" と呼べる範囲) として
 * 保存された split_time のみを渡すこと。
 * - distance === legDist (leg 自身のゴール地点) は、保存時フィルタ
 *   (RecordClient の `!(raceDistance && st.distance === raceDistance)`) により本来
 *   DB へ永続化されない値だが、テスト用の合成データ等では split_time が record.time と
 *   厳密に一致し得る (leg 自身の finish = record.time なので当然の一致であり破損ではない)。
 *   これを対象に含めると `>=` の等号側で誤検知するため、除外する。
 * - distance > legDist の split (「新UI保存」の全体距離形式: distance も splitTime も
 *   既に全体距離・通算値として保存された別形式のデータ。テスト名 `[V-05-new] 新UI保存データの
 *   復元` が示すとおり、D2 とは独立した仕様であり「旧」ではない) はそもそも D2 の変換を
 *   経由しない形式であり、この破損検知の対象外。
 *
 * @param recordTime - record.time (その leg のゴールタイム、秒)
 * @param splitTimeValues - その record の leg 内距離側 split_times の split_time 値の配列
 * @returns 破損している場合 true (呼び出し側はこの record の leg 内距離側 split を
 *   逆変換せず丸ごと捨てる。境界 split は `restoreRelayBoundarySplits` が record.time から
 *   再生成するためフォームは破綻しない)
 */
function isRecordSplitTimesCorrupted(recordTime: number, splitTimeValues: number[]): boolean {
  return splitTimeValues.some((splitTime) => splitTime >= recordTime);
}

/**
 * リレーの leg 境界スプリット (= 各 leg の累計タイム) を relaySplitTimes に復元する。
 * Web 正準 `restoreRelayBoundarySplits` の移植。
 *
 * 保存時、leg 境界スプリットは leg 内距離へ変換された結果その leg の種目距離と一致するため
 * 「ゴールタイム = split ではない」フィルタで必ず捨てられ、DB には残らない。値は各 leg の
 * `records.time` から算出した累計タイムと一致するのでここで再生成する。これをしないと、
 * 入力済みのリレーラップタイムが再オープン時に全て空欄になる。
 *
 * - 既に同じ距離のスプリットが保存されている場合は上書きしない (保存値を正とする)
 * - 最終境界 (合計距離) も含める。4 境界が揃って初めて leg タイムが再計算されるため
 * - id は純粋関数を保つため距離から決定的に生成する
 */
function restoreRelayBoundarySplits(
  relaySplitTimes: SplitTimeEntry[],
  legBoundaries: number[],
  cumulatives: number[],
): SplitTimeEntry[] {
  const existingDistances = new Set(relaySplitTimes.map((st) => st.distance));
  const restored: SplitTimeEntry[] = [];

  for (let idx = 0; idx < legBoundaries.length; idx++) {
    const distance = legBoundaries[idx];
    const cumulative = cumulatives[idx] ?? 0;
    if (cumulative <= 0 || existingDistances.has(distance)) continue;
    restored.push({
      id: `boundary-${distance}`,
      distance,
      splitTime: cumulative,
      displayValue: formatTimeBest(cumulative),
    });
  }

  if (restored.length === 0) return relaySplitTimes;
  return [...relaySplitTimes, ...restored].sort((a, b) => a.distance - b.distance);
}

/**
 * 個人種目のゴール地点スプリット (距離 = 種目距離、タイム = 記録タイム) を復元する。
 * Web 正準 `restoreGoalSplit` の移植。
 *
 * - ラップタイムを 1 件も持たない記録には追加しない
 * - 保存時に同じフィルタで再び捨てられるので DB へ二重登録されない
 */
function restoreGoalSplit(
  splitTimes: SplitTimeEntry[],
  raceDistance: number | undefined,
  recordTime: number,
): SplitTimeEntry[] {
  if (!raceDistance || recordTime <= 0) return splitTimes;
  if (splitTimes.length === 0) return splitTimes;
  if (splitTimes.some((st) => st.distance === raceDistance)) return splitTimes;

  return [
    ...splitTimes,
    {
      id: `goal-${raceDistance}`,
      distance: raceDistance,
      splitTime: recordTime,
      displayValue: formatTimeBest(recordTime),
    },
  ];
}

/**
 * 既存レコード配列から StyleEntry 配列を構築する純粋関数。
 * 4 フェーズ: リレー検出 → リレー集約 → style_id 別グループ化 → フリーリレー二次検出。
 * 最後に Phase 5 として、保存時に捨てられるラップタイム (リレー leg 境界 / 個人種目ゴール地点) を復元する。
 */
export function buildStyleEntriesFromExisting(
  existingRecords: ExistingRecord[],
  styles: StyleLookup[],
): StyleEntry[] {
  if (existingRecords.length === 0) {
    return [
      {
        id: "1",
        styleId: "",
        styleName: "",
        memberRecords: [],
      },
    ];
  }

  // Phase 1: リレーグループを先に識別する
  const usedIndices = new Set<number>();
  const relayGroups: Array<{ records: ExistingRecord[]; relayEventId: RelayEventId }> = [];

  for (let i = 0; i <= existingRecords.length - 4; i++) {
    if (usedIndices.has(i)) continue;

    const candidate = existingRecords.slice(i, i + 4);
    const isRelayPattern =
      !candidate[0].is_relaying &&
      candidate[1].is_relaying &&
      candidate[2].is_relaying &&
      candidate[3].is_relaying;

    if (!isRelayPattern) continue;

    const legStyleIds = candidate.map((r) => r.style_id);
    const detectedRelayId = detectRelayEventId(legStyleIds);
    if (!detectedRelayId) continue;

    relayGroups.push({ records: candidate, relayEventId: detectedRelayId });
    for (let j = i; j < i + 4; j++) {
      usedIndices.add(j);
    }
  }

  const resultEntries: StyleEntry[] = [];

  // Phase 2: リレーグループを1つの StyleEntry にまとめる
  for (const group of relayGroups) {
    const { records, relayEventId: detectedRelayId } = group;
    const relayDef = RELAY_EVENTS.find((r) => r.id === detectedRelayId)!;

    const legTimes = records.map((r) => r.time);
    const cumulatives = calcCumulativeTimes(legTimes);
    const legDist = getRelayLegDistance(detectedRelayId);
    const legBoundaries = getRelayLegBoundaries(detectedRelayId);

    // 各 leg の split_times を全体距離・通算タイムに変換して relaySplitTimes を構築
    const relaySplitTimes: SplitTimeEntry[] = [];
    for (let legIdx = 0; legIdx < records.length; legIdx++) {
      const record = records[legIdx];
      const legOffset = legIdx === 0 ? 0 : legBoundaries[legIdx - 1];
      const legStart = getLegStartCumulative(cumulatives, legIdx);
      const splitTimeRows = record.split_times || [];

      // R1-1: leg 内距離の途中経過 (distance < legDist) として保存された split_time のみを
      // 破損検知の対象にする (distance === legDist の leg 自身のゴールと、
      // distance > legDist の別形式はいずれも対象外。理由は isRecordSplitTimesCorrupted の JSDoc 参照)。
      const isCorrupted = isRecordSplitTimesCorrupted(
        record.time,
        splitTimeRows.filter((st) => st.distance < legDist).map((st) => st.split_time),
      );

      for (let stIdx = 0; stIdx < splitTimeRows.length; stIdx++) {
        const st = splitTimeRows[stIdx];
        // distance > legDist の場合は distance も splitTime も既に全体距離・通算値として
        // 保存された全体距離形式 (新UI保存) と解釈し、変換しない (D2 の変換を経由しない別形式のため)。
        // それ以外は leg 内距離・leg 相対タイムとして offset / legStart を加算する。
        const isAlreadyGlobal = st.distance > legDist;

        // R1-1: 旧バグ由来の破損レコードは leg 内距離側の split を丸ごと捨てる
        // (逆変換すると legStart が二重に乗った第三の誤値になるため)。
        if (!isAlreadyGlobal && isCorrupted) continue;

        const globalDistance = isAlreadyGlobal ? st.distance : legOffset + st.distance;
        // split_time は保存時に leg 相対値へ正規化されている (D2) ため、通算値に戻す (D4)
        const cumulativeSplitTime = isAlreadyGlobal
          ? st.split_time
          : toCumulativeSplitTime(st.split_time, legStart);
        relaySplitTimes.push({
          id: st.id || `${legIdx}-${stIdx + 1}`,
          distance: globalDistance,
          splitTime: cumulativeSplitTime,
          displayValue: formatTimeBest(cumulativeSplitTime),
        });
      }
    }

    const memberRecords: MemberRecord[] = records.map((record, idx) => {
      const leg = relayDef.legs[idx];
      return {
        id: record.id,
        memberUserId: record.user_id,
        memberName: record.users?.name || "Unknown",
        time: record.time,
        timeDisplayValue: (cumulatives[idx] ?? 0) > 0 ? formatTimeBest(cumulatives[idx]) : "",
        reactionTime: record.reaction_time?.toString() || "",
        isRelaying: record.is_relaying,
        note: record.note || "",
        splitTimes: (record.split_times || []).map((st, stIdx) => ({
          id: st.id || String(stIdx + 1),
          distance: st.distance,
          splitTime: st.split_time,
          displayValue: formatTimeBest(st.split_time),
        })),
        relayLegStyleId: leg.styleId,
        relayLegLabel: undefined,
        cumulativeTimeSeconds: cumulatives[idx] ?? 0,
      };
    });

    resultEntries.push({
      id: `relay-${records[0].id}`,
      styleId: relayDef.legs[0].styleId,
      styleName: "",
      memberRecords,
      relayEventId: detectedRelayId,
      relaySplitTimes: restoreRelayBoundarySplits(relaySplitTimes, legBoundaries, cumulatives),
    });
  }

  // Phase 3: リレーグループに使われなかったレコードを style_id 別にグループ化
  const styleMap = new Map<number, StyleEntry>();

  for (let i = 0; i < existingRecords.length; i++) {
    if (usedIndices.has(i)) continue;

    const record = existingRecords[i];
    const styleId = record.style_id;
    const style = styles.find((s) => s.id === styleId);

    if (!styleMap.has(styleId)) {
      styleMap.set(styleId, {
        id: String(styleId),
        styleId: styleId,
        styleName: style?.name_jp || "",
        memberRecords: [],
      });
    }

    const entry = styleMap.get(styleId)!;
    entry.memberRecords.push({
      id: record.id,
      memberUserId: record.user_id,
      memberName: record.users?.name || "Unknown",
      time: record.time,
      timeDisplayValue: formatTimeBest(record.time),
      reactionTime: record.reaction_time?.toString() || "",
      isRelaying: record.is_relaying,
      note: record.note || "",
      splitTimes: (record.split_times || []).map((st, idx) => ({
        id: st.id || String(idx + 1),
        distance: st.distance,
        splitTime: st.split_time,
        displayValue: formatTimeBest(st.split_time),
      })),
    });
  }

  // Phase 4: フリーリレーの復元
  for (const entry of styleMap.values()) {
    const isRelayPattern =
      entry.memberRecords.length === 4 &&
      !entry.memberRecords[0].isRelaying &&
      entry.memberRecords[1].isRelaying &&
      entry.memberRecords[2].isRelaying &&
      entry.memberRecords[3].isRelaying;

    if (!isRelayPattern) continue;

    const legStyleIds = Array(4).fill(entry.styleId as number) as number[];
    const detectedRelayId = detectRelayEventId(legStyleIds);
    if (!detectedRelayId) continue;

    const relayDef = RELAY_EVENTS.find((r) => r.id === detectedRelayId)!;
    const legTimes = entry.memberRecords.map((mr) => mr.time);
    const cumulatives = calcCumulativeTimes(legTimes);
    const legDist = getRelayLegDistance(detectedRelayId);
    const legBoundaries = getRelayLegBoundaries(detectedRelayId);

    // 各 leg の splitTimes を全体距離・通算タイムに変換して relaySplitTimes を構築
    const relaySplitTimes: SplitTimeEntry[] = [];
    for (let legIdx = 0; legIdx < entry.memberRecords.length; legIdx++) {
      const mr = entry.memberRecords[legIdx];
      const legOffset = legIdx === 0 ? 0 : legBoundaries[legIdx - 1];
      const legStart = getLegStartCumulative(cumulatives, legIdx);

      // R1-1: leg 内距離の途中経過 (distance < legDist) として保存された splitTime のみを
      // 破損検知の対象にする (distance === legDist の leg 自身のゴールと、
      // distance > legDist の別形式はいずれも対象外。理由は isRecordSplitTimesCorrupted の JSDoc 参照)。
      const isCorrupted = isRecordSplitTimesCorrupted(
        mr.time,
        mr.splitTimes.filter((st) => st.distance < legDist).map((st) => st.splitTime),
      );

      for (const st of mr.splitTimes) {
        // distance > legDist の場合は distance も splitTime も既に全体距離・通算値として
        // 保存された全体距離形式 (新UI保存) と解釈し、変換しない (D2 の変換を経由しない別形式のため)。
        // それ以外は leg 内距離・leg 相対タイムとして offset / legStart を加算する。
        const isAlreadyGlobal = st.distance > legDist;

        // R1-1: 旧バグ由来の破損レコードは leg 内距離側の split を丸ごと捨てる
        // (逆変換すると legStart が二重に乗った第三の誤値になるため)。
        if (!isAlreadyGlobal && isCorrupted) continue;

        const globalDistance = isAlreadyGlobal ? st.distance : legOffset + st.distance;
        const cumulativeSplitTime = isAlreadyGlobal
          ? st.splitTime
          : toCumulativeSplitTime(st.splitTime, legStart);
        relaySplitTimes.push({
          id: st.id,
          distance: globalDistance,
          splitTime: cumulativeSplitTime,
          displayValue: formatTimeBest(cumulativeSplitTime),
        });
      }
    }

    entry.relayEventId = detectedRelayId;
    entry.styleName = "";
    entry.relaySplitTimes = restoreRelayBoundarySplits(
      relaySplitTimes,
      legBoundaries,
      cumulatives,
    );
    entry.memberRecords = entry.memberRecords.map((mr, idx) => {
      const leg = relayDef.legs[idx];
      return {
        ...mr,
        relayLegStyleId: leg.styleId,
        relayLegLabel: undefined,
        cumulativeTimeSeconds: cumulatives[idx] ?? 0,
        timeDisplayValue: (cumulatives[idx] ?? 0) > 0 ? formatTimeBest(cumulatives[idx]) : "",
      };
    });
  }

  // Phase 5: 個人種目のゴール地点スプリットを復元する。
  // Phase 4 でリレーへ昇格した StyleEntry は除外する — リレーでは leg 内スプリットが
  // relaySplitTimes へ全体距離として畳み込まれており、ここで leg の記録タイムを
  // ゴール地点として足すと累計タイムと取り違えた値が混入する。
  const allEntries = [...resultEntries, ...Array.from(styleMap.values())];
  for (const entry of allEntries) {
    if (entry.relayEventId || entry.styleId === "") continue;
    const raceDistance = styles.find((s) => s.id === entry.styleId)?.distance;
    if (!raceDistance) continue;
    entry.memberRecords = entry.memberRecords.map((mr) => {
      const splitTimes = restoreGoalSplit(mr.splitTimes, raceDistance, mr.time);
      return splitTimes === mr.splitTimes ? mr : { ...mr, splitTimes };
    });
  }

  return allEntries;
}

/**
 * `planEntryAdditionsForRecords` (shared) が返した追加計画を、実際の StyleEntry[] に反映する。
 * Web 正準 `applyEntryAdditionsToStyleEntries` の移植（mobile の差分は videoAsset を
 * 新規行に設定しない点のみ。File/Blob 相当のフィールドを持たないため web の
 * videoFile/videoThumbnailBlob 初期化に相当する処理は不要）。
 *
 * - `plan.entry.id` (entries.id) をそのまま MemberRecord.id に使う。crypto.randomUUID 等の
 *   非決定的な値に頼らないため、この関数は純粋関数として書ける
 * - `entry_time` は `entryTimeReference` (参考表示専用) にのみ格納する。`time`/`timeDisplayValue`
 *   (記録タイムの入力値) には絶対に入れない — entries.entry_time (申告タイム) と
 *   records.time (結果タイム) を混同しないための仕様
 * - 追加先が見つからない場合は `entry-style-${styleId}` を id とする新規 StyleEntry を作る
 * - 種目未選択の初期プレースホルダー行 (`styleId === "" && memberRecords.length === 0`) は、
 *   エントリー由来行が1件でも追加された場合は取り除く (空の行が紛れて表示されるのを防ぐ)
 */
export function applyEntryAdditionsToStyleEntries(
  styleEntries: StyleEntry[],
  plans: EntryAdditionPlan[],
): StyleEntry[] {
  if (plans.length === 0) return styleEntries;

  const byId = new Map(styleEntries.map((entry) => [entry.id, entry]));
  const newStyleEntryIds: string[] = [];

  for (const plan of plans) {
    const newRecord: MemberRecord = {
      id: plan.entry.id,
      memberUserId: plan.entry.user_id,
      memberName: plan.entry.userName,
      time: 0,
      timeDisplayValue: "",
      reactionTime: "",
      isRelaying: false,
      note: "",
      splitTimes: [],
      entryTimeReference: plan.entry.entry_time,
    };

    const targetId = plan.targetStyleEntryId ?? `entry-style-${plan.styleId}`;
    const target = byId.get(targetId);
    if (target) {
      byId.set(targetId, { ...target, memberRecords: [...target.memberRecords, newRecord] });
    } else {
      byId.set(targetId, {
        id: targetId,
        styleId: plan.styleId,
        styleName: plan.styleName,
        memberRecords: [newRecord],
      });
      newStyleEntryIds.push(targetId);
    }
  }

  const orderedExistingIds = styleEntries
    .map((entry) => entry.id)
    .filter((id) => {
      const entry = byId.get(id)!;
      return !(entry.styleId === "" && entry.memberRecords.length === 0);
    });

  return [...orderedExistingIds, ...newStyleEntryIds].map((id) => byId.get(id)!);
}

/**
 * 既存記録由来の行を含む全 StyleEntry に、対応する entries.entry_time を参考表示専用の
 * `entryTimeReference` として "後付け" でスタンプする純粋関数。Web 正準
 * `stampExistingEntryTimeReferences` の移植（mobile 固有の差分は無し）。
 *
 * - 行を増減させない (`applyEntryAdditionsToStyleEntries` / 共有の
 *   `planEntryAdditionsForRecords` の重複排除ロジックとは独立した関心)
 * - リレーとして検出済みの StyleEntry (`relayEventId` が truthy) はスタンプ対象外。
 *   リレー StyleEntry の `styleId` は先頭レグの style_id であり、エントリー
 *   (常に個人種目, `entryDiff.ts` の `is_relaying: false` 固定) の style_id と
 *   意味が異なるため、ここで突合すると誤ったスタンプにつながる。加えて仕様上も
 *   リレー行に参考ラベルの表示スポットは無い (web/mobile とも)
 * - `entry_time` は `entryTimeReference` にのみ格納する。`time`/`timeDisplayValue`
 *   (記録タイムの入力値) には絶対に触れない
 */
export function stampExistingEntryTimeReferences(
  styleEntries: StyleEntry[],
  entryTimeByUserStyle: Map<string, number | null>,
): StyleEntry[] {
  return styleEntries.map((styleEntry) => {
    if (styleEntry.relayEventId || styleEntry.styleId === "") return styleEntry;

    const styleId = styleEntry.styleId;
    let changed = false;
    const memberRecords = styleEntry.memberRecords.map((memberRecord) => {
      const entryTime = entryTimeByUserStyle.get(
        userStylePairKey(memberRecord.memberUserId, styleId),
      );
      if (entryTime === undefined || memberRecord.entryTimeReference === entryTime) {
        return memberRecord;
      }
      changed = true;
      return { ...memberRecord, entryTimeReference: entryTime };
    });

    return changed ? { ...styleEntry, memberRecords } : styleEntry;
  });
}
