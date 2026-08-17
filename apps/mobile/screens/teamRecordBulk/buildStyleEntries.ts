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

    const relaySplitTimes: SplitTimeEntry[] = [];
    for (let legIdx = 0; legIdx < records.length; legIdx++) {
      const record = records[legIdx];
      const legOffset = legIdx === 0 ? 0 : legBoundaries[legIdx - 1];
      for (let stIdx = 0; stIdx < (record.split_times || []).length; stIdx++) {
        const st = record.split_times[stIdx];
        const globalDistance = st.distance > legDist ? st.distance : legOffset + st.distance;
        relaySplitTimes.push({
          id: st.id || `${legIdx}-${stIdx + 1}`,
          distance: globalDistance,
          splitTime: st.split_time,
          displayValue: formatTimeBest(st.split_time),
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

    const relaySplitTimes: SplitTimeEntry[] = [];
    for (let legIdx = 0; legIdx < entry.memberRecords.length; legIdx++) {
      const mr = entry.memberRecords[legIdx];
      const legOffset = legIdx === 0 ? 0 : legBoundaries[legIdx - 1];
      for (const st of mr.splitTimes) {
        const globalDistance = st.distance > legDist ? st.distance : legOffset + st.distance;
        relaySplitTimes.push({
          id: st.id,
          distance: globalDistance,
          splitTime: st.splitTime,
          displayValue: st.displayValue,
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
