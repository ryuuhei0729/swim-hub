/** styles テーブルの必要フィールドのみ。Style 全体を要求しないことでテスト容易性を確保 */
export interface StyleLookup {
  id: number;
  name_jp: string;
}
import { formatTimeBest } from "@/utils/formatters";
import {
  RELAY_EVENTS,
  RelayEventId,
  calcCumulativeTimes,
  detectRelayEventId,
} from "./relayEvents";

export interface SplitTimeEntry {
  id: string;
  distance: number;
  splitTime: number;
  displayValue: string;
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
  videoFile?: File | null;
  videoThumbnailBlob?: Blob | null;
  relayLegStyleId?: number;
  relayLegLabel?: string;
  cumulativeTimeSeconds?: number;
}

export interface StyleEntry {
  id: string;
  styleId: number | "";
  styleName: string;
  memberRecords: MemberRecord[];
  relayEventId?: RelayEventId | null;
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
 * 既存レコード配列から StyleEntry 配列を構築する純粋関数。
 *
 * 4 フェーズで処理する:
 * - Phase 1: is_relaying パターンでリレーグループを検出
 * - Phase 2: リレーグループを 1 つの StyleEntry にまとめ、累計タイムを算出
 * - Phase 3: リレーグループ外のレコードを style_id 別にグループ化
 * - Phase 4: Phase 3 内でフリーリレーのパターンを二次検出
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
  const relayGroups: Array<{ records: ExistingRecord[] }> = [];

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

    relayGroups.push({ records: candidate });
    for (let j = i; j < i + 4; j++) {
      usedIndices.add(j);
    }
  }

  const resultEntries: StyleEntry[] = [];

  // Phase 2: リレーグループを1つの StyleEntry にまとめる
  for (const group of relayGroups) {
    const { records } = group;
    const legStyleIds = records.map((r) => r.style_id);
    const detectedRelayId = detectRelayEventId(legStyleIds)!;
    const relayDef = RELAY_EVENTS.find((r) => r.id === detectedRelayId)!;

    const legTimes = records.map((r) => r.time);
    const cumulatives = calcCumulativeTimes(legTimes);

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
        relayLegLabel: leg.legLabel,
        cumulativeTimeSeconds: cumulatives[idx] ?? 0,
      };
    });

    resultEntries.push({
      id: `relay-${records[0].id}`,
      styleId: relayDef.legs[0].styleId,
      styleName: relayDef.label,
      memberRecords,
      relayEventId: detectedRelayId,
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

    entry.relayEventId = detectedRelayId;
    entry.styleName = relayDef.label;
    entry.memberRecords = entry.memberRecords.map((mr, idx) => {
      const leg = relayDef.legs[idx];
      return {
        ...mr,
        relayLegStyleId: leg.styleId,
        relayLegLabel: leg.legLabel,
        cumulativeTimeSeconds: cumulatives[idx] ?? 0,
        timeDisplayValue: (cumulatives[idx] ?? 0) > 0 ? formatTimeBest(cumulatives[idx]) : "",
      };
    });
  }

  return [...resultEntries, ...Array.from(styleMap.values())];
}
