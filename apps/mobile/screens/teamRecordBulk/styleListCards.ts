// =============================================================================
// チーム大会記録一覧 - 29カード (個人22種目 + リレー7種目) の純粋関数群
// =============================================================================
//
// カードの表示要否・入力済み人数の算出はここに集約する (画面コンポーネントには
// JSX の組み立てのみを残す)。29カードの canonical な定義元は既存の styles
// マスター + apps/shared/utils/relayEvents.ts の RELAY_EVENTS であり、ここでは
// 複製しない (複製すると「片方だけ更新されて静かに壊れる」既知の罠を再生産する)。

import {
  RELAY_EVENTS,
  getRelayLegDistance,
  getRelayKind,
  type RelayEventId,
} from "@apps/shared/utils/relayEvents";
import type { RelayKind } from "@apps/shared/types/relayRecord";
import type { PoolType, Style } from "@apps/shared/types";
import type { StyleEntry } from "./buildStyleEntries";

/**
 * 長水路大会で既定非表示にする個人種目 (25m種目4つ)。
 * 100m個人メドレー (id 20) はここに含めない (PM確定の例外)。
 */
export const DEFAULT_HIDDEN_LONG_COURSE_STYLE_IDS: readonly number[] = [1, 8, 12, 16];

/** 長水路大会で既定非表示にするリレー種目 (4x25m の2種目) */
export const DEFAULT_HIDDEN_LONG_COURSE_RELAY_EVENT_IDS: readonly RelayEventId[] = [
  "relay_4x25_free",
  "relay_4x25_medley",
];

export interface IndividualStyleCard {
  kind: "individual";
  styleId: number;
  style: Style;
  /**
   * 実際にタイムが入力済みの人数 (records.time > 0 を持つ行)。同一種目に複数の
   * 「組」(事実4: 予選・決勝等) がある場合は全ての組を合算する。
   */
  filledCount: number;
  /**
   * この種目にエントリーしている人数 (entries の distinct user_id 数)。
   * filledCount とは独立 (エントリーだけでタイム未入力の人も含む)。
   */
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
  /**
   * この種目に登録されている「組」(Aチーム/Bチーム等) のうち、タイムが
   * 1つ以上入力済みのものの数 (事実4)。人数ではなくチーム数を表示するための値。
   */
  groupCount: number;
  visible: boolean;
}

function isIndividualStyleVisible(params: {
  styleId: number;
  poolType: PoolType;
  hasExistingData: boolean;
}): boolean {
  const { styleId, poolType, hasExistingData } = params;
  // 例外: 既存記録・エントリーが1件でもあれば水路に関わらず必ず表示する
  // (隠すと誤登録されたレコードが編集も削除もできなくなるため)
  if (hasExistingData) return true;
  if (poolType !== 1) return true;
  return !DEFAULT_HIDDEN_LONG_COURSE_STYLE_IDS.includes(styleId);
}

function isRelayVisible(params: {
  relayEventId: RelayEventId;
  poolType: PoolType;
  hasExistingData: boolean;
}): boolean {
  const { relayEventId, poolType, hasExistingData } = params;
  if (hasExistingData) return true;
  if (poolType !== 1) return true;
  return !DEFAULT_HIDDEN_LONG_COURSE_RELAY_EVENT_IDS.includes(relayEventId);
}

/**
 * styles マスター (個人22種目) から一覧カードのデータを構築する。
 * `styleEntries` はマージ済み (既存記録 + エントリー由来行) を渡すこと。
 */
export function buildIndividualStyleCards(
  styles: readonly Style[],
  styleEntries: readonly StyleEntry[],
  poolType: PoolType,
  entryUserCountByStyleId: ReadonlyMap<number, number>,
): IndividualStyleCard[] {
  return [...styles]
    .sort((a, b) => a.id - b.id)
    .map((style) => {
      // 事実4: 同一種目に複数の「組」がありうる (予選・決勝等)。組は全て合算する。
      const matchingEntries = styleEntries.filter((e) => !e.relayEventId && e.styleId === style.id);
      const filledCount = matchingEntries.reduce(
        (sum, e) => sum + e.memberRecords.filter((mr) => mr.time > 0).length,
        0,
      );
      const hasExistingData = matchingEntries.some((e) => e.memberRecords.length > 0);
      return {
        kind: "individual" as const,
        styleId: style.id,
        style,
        filledCount,
        entryCount: entryUserCountByStyleId.get(style.id) ?? 0,
        visible: isIndividualStyleVisible({
          styleId: style.id,
          poolType,
          hasExistingData,
        }),
      };
    });
}

/**
 * RELAY_EVENTS (フリー→メドレー、距離昇順で定義済み) から一覧カードのデータを構築する。
 */
export function buildRelayStyleCards(
  styleEntries: readonly StyleEntry[],
  poolType: PoolType,
): RelayStyleCard[] {
  return RELAY_EVENTS.map((relayDef) => {
    // 事実4: 同一種目に複数の「組」(Aチーム/Bチーム等) がありうる。
    const matchingEntries = styleEntries.filter((e) => e.relayEventId === relayDef.id);
    const groupCount = matchingEntries.filter((e) => e.memberRecords.some((mr) => mr.time > 0)).length;
    const hasExistingData = matchingEntries.some((e) => e.memberRecords.length > 0);
    return {
      kind: "relay" as const,
      relayEventId: relayDef.id,
      relayKind: getRelayKind(relayDef.id),
      legDistance: getRelayLegDistance(relayDef.id),
      legCount: relayDef.legs.length,
      groupCount,
      visible: isRelayVisible({
        relayEventId: relayDef.id,
        poolType,
        hasExistingData,
      }),
    };
  });
}

/**
 * 隣接する要素を `groupKeyOf` の値でグループ化しつつ、各グループを
 * `rowSize` 個ずつの行 (チャンク) に分割する。
 *
 * グループの境界では残り枠数に関わらず必ず新しい行を開始する (単純な
 * flex-wrap では実現できない「種目が変わったら改行する」要件のための実装)。
 * 呼び出し元が渡す配列は既にグループ単位で連続している前提
 * (`buildIndividualStyleCards` は styles.id 昇順、`buildRelayStyleCards` は
 * `RELAY_EVENTS` 定義順で返すため、同じ種目/リレー種類は連続している)。
 * グループの並び順そのものはここでは持たず、入力配列の並びをそのまま使う
 * (CLAUDE.md「同一のドメイン対応表を2箇所にハードコードするな」)。
 */
export function chunkIntoGroupedRows<T>(
  items: readonly T[],
  groupKeyOf: (item: T) => string,
  rowSize: number,
): T[][] {
  const rows: T[][] = [];
  let currentRow: T[] = [];
  let currentGroupKey: string | null = null;

  for (const item of items) {
    const groupKey = groupKeyOf(item);
    const isNewGroup = currentGroupKey !== null && groupKey !== currentGroupKey;
    const isRowFull = currentRow.length >= rowSize;
    if ((isNewGroup || isRowFull) && currentRow.length > 0) {
      rows.push(currentRow);
      currentRow = [];
    }
    currentRow.push(item);
    currentGroupKey = groupKey;
  }
  if (currentRow.length > 0) rows.push(currentRow);

  return rows;
}
