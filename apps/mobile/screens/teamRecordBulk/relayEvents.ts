// リレー種目定義 — DB の styles テーブルと紐づく型と定数
// （Web 正準 app/.../records/_client/relayEvents.ts の移植。フレームワーク非依存）
// styles テーブル (migration: 20251201014342_initial_schema.sql) から確認した id 値:
//   fr: 25m=1, 50m=2, 100m=3, 200m=4
//   br: 25m=8, 50m=9, 100m=10
//   ba: 25m=12, 50m=13, 100m=14
//   fly: 25m=16, 50m=17, 100m=18

export type RelayEventId =
  | "relay_4x25_free"
  | "relay_4x50_free"
  | "relay_4x100_free"
  | "relay_4x200_free"
  | "relay_4x25_medley"
  | "relay_4x50_medley"
  | "relay_4x100_medley";

export type SwimStyleKey = "fr" | "ba" | "br" | "fly";

export interface RelayLeg {
  legIndex: 0 | 1 | 2 | 3;
  styleId: number; // 個人種目 styles.id
  styleKey: SwimStyleKey;
}

export interface LabelledRelayLeg extends RelayLeg {
  styleLabel: string;
  legLabel: string;
}

export interface RelayEventDef {
  id: RelayEventId;
  legs: RelayLeg[]; // 4 legs (ラベルなし)
}

export interface LabelledRelayEventDef {
  id: RelayEventId;
  label: string;
  legs: LabelledRelayLeg[]; // 4 legs (ラベルあり)
}

/** ラベル生成に必要なコールバック群 */
export interface RelayLabels {
  ba: string;
  br: string;
  fly: string;
  fr: string;
  legLabel: (num: number, style: string) => string;
  freeRelaySuffix: string;
  medleyRelaySuffix: string;
}

// フリーリレー: 全泳者が自由形 (ラベルなし静的定義)
function freeLegsDef(styleId: number): RelayLeg[] {
  return [0, 1, 2, 3].map((i) => ({
    legIndex: i as 0 | 1 | 2 | 3,
    styleId,
    styleKey: "fr" as SwimStyleKey,
  }));
}

// メドレーリレー: 背・平・バタ・自の順 (ラベルなし静的定義)
function medleyLegsDef(baId: number, brId: number, flyId: number, frId: number): RelayLeg[] {
  const defs: Array<{ styleId: number; styleKey: SwimStyleKey }> = [
    { styleId: baId, styleKey: "ba" },
    { styleId: brId, styleKey: "br" },
    { styleId: flyId, styleKey: "fly" },
    { styleId: frId, styleKey: "fr" },
  ];
  return defs.map((d, i) => ({
    legIndex: i as 0 | 1 | 2 | 3,
    styleId: d.styleId,
    styleKey: d.styleKey,
  }));
}

/** ラベルなし静的定義 (styleId のみ) — detectRelayEventId 等で使用 */
export const RELAY_EVENTS: RelayEventDef[] = [
  { id: "relay_4x25_free", legs: freeLegsDef(1) },
  { id: "relay_4x50_free", legs: freeLegsDef(2) },
  { id: "relay_4x100_free", legs: freeLegsDef(3) },
  { id: "relay_4x200_free", legs: freeLegsDef(4) },
  { id: "relay_4x25_medley", legs: medleyLegsDef(12, 8, 16, 1) },
  { id: "relay_4x50_medley", legs: medleyLegsDef(13, 9, 17, 2) },
  { id: "relay_4x100_medley", legs: medleyLegsDef(14, 10, 18, 3) },
];

/** 翻訳ラベルを付与したリレー種目定義を生成する */
export function buildRelayEvents(labels: RelayLabels): LabelledRelayEventDef[] {
  const { ba, br, fly, fr, legLabel, freeRelaySuffix, medleyRelaySuffix } = labels;

  const styleLabelMap: Record<SwimStyleKey, string> = { fr, ba, br, fly };

  const labelLegs = (legs: RelayLeg[]): LabelledRelayLeg[] =>
    legs.map((leg) => {
      const styleLabel = styleLabelMap[leg.styleKey];
      return {
        ...leg,
        styleLabel,
        legLabel: legLabel(leg.legIndex + 1, styleLabel),
      };
    });

  const freeLabel = (dist: number) => `${dist}m×4 ${freeRelaySuffix}`;
  const medleyLabel = (dist: number) => `${dist}m×4 ${medleyRelaySuffix}`;

  // 距離は getRelayLegDistance を唯一の定義元とし、二重管理を避ける
  // (RELAY_EVENTS を固定インデックスで参照しないので定義順が変わっても対応は崩れない)。
  const isMedley = (id: RelayEventId) => id.endsWith("_medley");

  return RELAY_EVENTS.map((event) => {
    const dist = getRelayLegDistance(event.id);
    return {
      id: event.id,
      label: isMedley(event.id) ? medleyLabel(dist) : freeLabel(dist),
      legs: labelLegs(event.legs),
    };
  });
}

/**
 * legIndex に基づいて is_relaying を導出する純粋関数。
 * 第1泳者はスタート台から飛び込むため false、第2〜4泳者は前泳者のタッチを待つため true。
 */
export function isRelayingForLeg(legIndex: 0 | 1 | 2 | 3): boolean {
  return legIndex !== 0;
}

/** 区間タイム配列から累計タイム配列を計算する純粋関数。 */
export function calcCumulativeTimes(legTimes: number[]): number[] {
  const result: number[] = [];
  let cumulative = 0;
  for (const t of legTimes) {
    cumulative = Math.round((cumulative + t) * 100) / 100;
    result.push(cumulative);
  }
  return result;
}

/** 累計タイム配列から区間タイム配列を計算する純粋関数。 */
export function calcLegTimesFromCumulative(cumulativeTimes: number[]): number[] {
  if (cumulativeTimes.length === 0) return [];
  return cumulativeTimes.map((cum, i) => {
    if (i === 0) return cum;
    // i>=1 かつ Array.prototype.map の i は 0<=i<length を満たすため i-1 は必ず有効な添字
    return Math.round((cum - cumulativeTimes[i - 1]!) * 100) / 100;
  });
}

/**
 * leg 開始時点の通算タイム (秒) を返す純粋関数。legIdx=0 は 0。
 * web 正準 `relayEvents.ts` の挙動を複製 (この 2 ファイルは shared 化されておらず複製運用)。
 */
export function getLegStartCumulative(cumulativeTimes: number[], legIdx: number): number {
  if (legIdx <= 0) return 0;
  return cumulativeTimes[legIdx - 1] ?? 0;
}

/**
 * 通算 split 値 → leg 相対 split 値。
 * web 正準 `relayEvents.ts` の挙動を複製。
 */
export function toLegRelativeSplitTime(
  cumulativeSplitTime: number,
  legStartCumulative: number,
): number {
  return Math.round((cumulativeSplitTime - legStartCumulative) * 100) / 100;
}

/**
 * leg 相対 split 値 → 通算 split 値 (編集フォーム復元用の逆変換)。
 * web 正準 `relayEvents.ts` の挙動を複製。
 */
export function toCumulativeSplitTime(
  legRelativeSplitTime: number,
  legStartCumulative: number,
): number {
  return Math.round((legRelativeSplitTime + legStartCumulative) * 100) / 100;
}

/** リレー種目の 1 leg あたりの距離を返す純粋関数。 */
export function getRelayLegDistance(relayEventId: RelayEventId): number {
  const legDistMap: Record<RelayEventId, number> = {
    relay_4x25_free: 25,
    relay_4x50_free: 50,
    relay_4x100_free: 100,
    relay_4x200_free: 200,
    relay_4x25_medley: 25,
    relay_4x50_medley: 50,
    relay_4x100_medley: 100,
  };
  const dist = legDistMap[relayEventId];
  if (dist === undefined) {
    throw new Error(`Unknown relayEventId: ${relayEventId}`);
  }
  return dist;
}

/** リレー種目の累計距離境界配列 [legDist, *2, *3, *4] を返す純粋関数。 */
export function getRelayLegBoundaries(relayEventId: RelayEventId): number[] {
  const legDist = getRelayLegDistance(relayEventId);
  return [legDist, legDist * 2, legDist * 3, legDist * 4];
}

/** styleId 配列からリレー種目 ID を逆引きする純粋関数。 */
export function detectRelayEventId(legStyleIds: number[]): RelayEventId | null {
  if (legStyleIds.length !== 4) return null;
  for (const event of RELAY_EVENTS) {
    const match = event.legs.every((leg) => leg.styleId === legStyleIds[leg.legIndex]);
    if (match) return event.id;
  }
  return null;
}
