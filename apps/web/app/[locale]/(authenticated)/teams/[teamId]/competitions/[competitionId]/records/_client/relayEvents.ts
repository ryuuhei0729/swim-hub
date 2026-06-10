// リレー種目定義 — DB の styles テーブルと紐づく型と定数
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
  /** 背泳ぎの表示名 */
  ba: string;
  /** 平泳ぎの表示名 */
  br: string;
  /** バタフライの表示名 */
  fly: string;
  /** 自由形の表示名 */
  fr: string;
  /** リレー leg ラベル生成関数 (例: "第1泳者 (自由形)") */
  legLabel: (num: number, style: string) => string;
  /** フリーリレーイベントラベルのサフィックス (例: "フリーリレー") — "{dist}m×4 {suffix}" として使用 */
  freeRelaySuffix: string;
  /** メドレーリレーイベントラベルのサフィックス (例: "メドレーリレー") */
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

  return [
    { id: "relay_4x25_free", label: freeLabel(25), legs: labelLegs(RELAY_EVENTS[0].legs) },
    { id: "relay_4x50_free", label: freeLabel(50), legs: labelLegs(RELAY_EVENTS[1].legs) },
    { id: "relay_4x100_free", label: freeLabel(100), legs: labelLegs(RELAY_EVENTS[2].legs) },
    { id: "relay_4x200_free", label: freeLabel(200), legs: labelLegs(RELAY_EVENTS[3].legs) },
    { id: "relay_4x25_medley", label: medleyLabel(25), legs: labelLegs(RELAY_EVENTS[4].legs) },
    { id: "relay_4x50_medley", label: medleyLabel(50), legs: labelLegs(RELAY_EVENTS[5].legs) },
    { id: "relay_4x100_medley", label: medleyLabel(100), legs: labelLegs(RELAY_EVENTS[6].legs) },
  ];
}

/**
 * legIndex に基づいて is_relaying を導出する純粋関数。
 *
 * 水泳競技のリレーでは、第1泳者はスタート台から飛び込むため is_relaying=false となる。
 * 第2〜4泳者は前泳者のタッチを待って入水するため is_relaying=true となる。
 * この区分は日本水泳連盟のリレー規則におけるタイム計測起点の違いに対応する。
 */
export function isRelayingForLeg(legIndex: 0 | 1 | 2 | 3): boolean {
  return legIndex !== 0;
}

/**
 * 区間タイム配列から累計タイム配列を計算する純粋関数。
 *
 * @param legTimes - 各 leg の区間タイム (秒)
 * @returns 累計タイム配列 (インデックス i の値 = leg 0 〜 i の区間タイム合計)
 */
export function calcCumulativeTimes(legTimes: number[]): number[] {
  const result: number[] = [];
  let cumulative = 0;
  for (const t of legTimes) {
    cumulative = Math.round((cumulative + t) * 100) / 100;
    result.push(cumulative);
  }
  return result;
}

/**
 * 累計タイム配列から区間タイム配列を計算する純粋関数。
 * 浮動小数点誤差を避けるため必ず小数第2位で丸める。
 *
 * @param cumulativeTimes - 累計タイム配列 (秒)
 * @returns 各 leg の区間タイム配列
 */
export function calcLegTimesFromCumulative(cumulativeTimes: number[]): number[] {
  if (cumulativeTimes.length === 0) return [];
  return cumulativeTimes.map((cum, i) => {
    if (i === 0) return cum;
    return Math.round((cum - cumulativeTimes[i - 1]) * 100) / 100;
  });
}

/**
 * リレー種目の 1 leg あたりの距離を返す純粋関数。
 *
 * @param relayEventId - リレー種目 ID
 * @returns 1 leg あたりの距離 (m)
 * @throws 不正な relayEventId が渡された場合
 */
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

/**
 * リレー種目の累計距離境界配列を返す純粋関数。
 * 配列の各要素は leg0〜leg3 の終端累計距離 (m) を表す。
 *
 * @param relayEventId - リレー種目 ID
 * @returns [legDist, legDist*2, legDist*3, legDist*4]
 */
export function getRelayLegBoundaries(relayEventId: RelayEventId): number[] {
  const legDist = getRelayLegDistance(relayEventId);
  return [legDist, legDist * 2, legDist * 3, legDist * 4];
}

/**
 * styleId 配列からリレー種目 ID を逆引きする純粋関数。
 *
 * @param legStyleIds - 各 leg の styleId (順序あり: leg0, leg1, leg2, leg3)
 * @returns 一致する RelayEventId、一致しない場合は null
 */
export function detectRelayEventId(legStyleIds: number[]): RelayEventId | null {
  if (legStyleIds.length !== 4) return null;
  for (const event of RELAY_EVENTS) {
    const match = event.legs.every((leg) => leg.styleId === legStyleIds[leg.legIndex]);
    if (match) return event.id;
  }
  return null;
}
