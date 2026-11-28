// =============================================================================
// 大会記録の代理入力 - 種目一覧カード (個人22種目 + リレー7種目) の純粋関数群
// =============================================================================
//
// mobile の apps/mobile/screens/teamRecordBulk/styleListCards.ts と同じ規則で
// カードの表示要否・入力済み件数を求める (buildStyleEntries.ts と同様に web 側へ移植)。
// 29カードの定義元は styles マスターと shared の RELAY_EVENTS で、ここでは複製しない。
//
// web の styles は id / name_jp / distance しか取得していない (styles.style 列は無い)
// ため、泳法のグループ分けには styleIdToCodeKey を使う。

import {
  RELAY_EVENTS,
  getRelayKind,
  getRelayLegDistance,
  type RelayEventId,
} from "./relayEvents";
import type { RelayKind } from "@apps/shared/types/relayRecord";
import { styleIdToCodeKey } from "@/utils/swimStyle";
import type { StyleEntry, StyleLookup } from "./buildStyleEntries";

/**
 * 長水路大会で既定非表示にする個人種目 (25m種目4つ)。
 * 100m個人メドレー (id 20) はここに含めない (mobile と同じ)。
 */
export const DEFAULT_HIDDEN_LONG_COURSE_STYLE_IDS: readonly number[] = [1, 8, 12, 16];

/** 長水路大会で既定非表示にするリレー種目 (4x25m の2種目) */
export const DEFAULT_HIDDEN_LONG_COURSE_RELAY_EVENT_IDS: readonly RelayEventId[] = [
  "relay_4x25_free",
  "relay_4x25_medley",
];

export interface IndividualStyleCard<S extends StyleLookup = StyleLookup> {
  kind: "individual";
  styleId: number;
  style: S;
  /** 泳法のグループ (Fr/Br/Ba/Fly/IM)。未知の種目は "other" */
  groupKey: string;
  /** タイムが入力済みの人数 (同一種目に複数の組があれば合算) */
  filledCount: number;
  /** この種目にエントリーしている人数 (タイム未入力の人も含む) */
  entryCount: number;
  visible: boolean;
}

export interface RelayStyleCard {
  kind: "relay";
  relayEventId: RelayEventId;
  relayKind: RelayKind;
  /** 1レグの距離 (m)。総距離は legDistance * legCount */
  legDistance: number;
  legCount: number;
  /** タイムが1つ以上入力済みの組 (チーム) の数 */
  groupCount: number;
  visible: boolean;
}

function isCardVisible(params: {
  hidden: boolean;
  poolType: number;
  hasExistingData: boolean;
}): boolean {
  // 既存の記録・エントリーが1件でもあれば水路に関わらず必ず表示する
  // (隠すと誤登録された記録が編集も削除もできなくなるため)
  if (params.hasExistingData) return true;
  if (params.poolType !== 1) return true;
  return !params.hidden;
}

/** entries の生データから style_id ごとのエントリー人数 (distinct user_id) を数える */
export function countEntryUsersByStyleId(
  entries: readonly { user_id: string; style_id: number }[],
): Map<number, number> {
  const userIdsByStyleId = new Map<number, Set<string>>();
  for (const entry of entries) {
    const set = userIdsByStyleId.get(entry.style_id) ?? new Set<string>();
    set.add(entry.user_id);
    userIdsByStyleId.set(entry.style_id, set);
  }
  return new Map([...userIdsByStyleId].map(([styleId, userIds]) => [styleId, userIds.size]));
}

/**
 * styles マスター (個人22種目) から一覧カードを作る。
 * `styleEntries` は既存記録 + エントリー由来行をマージ済みのものを渡すこと。
 */
export function buildIndividualStyleCards<S extends StyleLookup>(
  styles: readonly S[],
  styleEntries: readonly StyleEntry[],
  poolType: number,
  entryUserCountByStyleId: ReadonlyMap<number, number>,
): IndividualStyleCard<S>[] {
  return [...styles]
    .sort((a, b) => a.id - b.id)
    .map((style) => {
      const matchingEntries = styleEntries.filter(
        (e) => !e.relayEventId && e.styleId === style.id,
      );
      const filledCount = matchingEntries.reduce(
        (sum, e) => sum + e.memberRecords.filter((mr) => mr.time > 0).length,
        0,
      );
      const hasExistingData = matchingEntries.some((e) => e.memberRecords.length > 0);
      return {
        kind: "individual" as const,
        styleId: style.id,
        style,
        groupKey: styleIdToCodeKey(style.id) ?? "other",
        filledCount,
        entryCount: entryUserCountByStyleId.get(style.id) ?? 0,
        visible: isCardVisible({
          hidden: DEFAULT_HIDDEN_LONG_COURSE_STYLE_IDS.includes(style.id),
          poolType,
          hasExistingData,
        }),
      };
    });
}

/** RELAY_EVENTS (フリー→メドレー、距離昇順) から一覧カードを作る */
export function buildRelayStyleCards(
  styleEntries: readonly StyleEntry[],
  poolType: number,
): RelayStyleCard[] {
  return RELAY_EVENTS.map((relayDef) => {
    const matchingEntries = styleEntries.filter((e) => e.relayEventId === relayDef.id);
    const groupCount = matchingEntries.filter((e) =>
      e.memberRecords.some((mr) => mr.time > 0),
    ).length;
    const hasExistingData = matchingEntries.some((e) => e.memberRecords.length > 0);
    return {
      kind: "relay" as const,
      relayEventId: relayDef.id,
      relayKind: getRelayKind(relayDef.id),
      legDistance: getRelayLegDistance(relayDef.id),
      legCount: relayDef.legs.length,
      groupCount,
      visible: isCardVisible({
        hidden: DEFAULT_HIDDEN_LONG_COURSE_RELAY_EVENT_IDS.includes(relayDef.id),
        poolType,
        hasExistingData,
      }),
    };
  });
}

/**
 * 隣り合う要素を `groupKeyOf` の値でまとめる (泳法・リレー種類が変わったら改行するため)。
 * 並び順は入力配列のまま使う (styles.id 昇順 / RELAY_EVENTS 定義順)。
 */
export function groupConsecutive<T>(
  items: readonly T[],
  groupKeyOf: (item: T) => string,
): T[][] {
  const groups: T[][] = [];
  let currentKey: string | null = null;
  for (const item of items) {
    const key = groupKeyOf(item);
    const last = groups.at(-1);
    if (last && key === currentKey) {
      last.push(item);
    } else {
      groups.push([item]);
    }
    currentKey = key;
  }
  return groups;
}
