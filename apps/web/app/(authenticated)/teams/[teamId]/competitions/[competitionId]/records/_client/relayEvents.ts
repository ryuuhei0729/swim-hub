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
  styleLabel: string; // "自由形" 等
  legLabel: string; // "第1泳者 (背泳ぎ)" 等
}

export interface RelayEventDef {
  id: RelayEventId;
  label: string; // "50m×4 フリーリレー"
  legs: RelayLeg[]; // 4 legs
}

// フリーリレー: 全泳者が自由形
function freeLegs(styleId: number, styleLabel: string): RelayLeg[] {
  return [0, 1, 2, 3].map((i) => ({
    legIndex: i as 0 | 1 | 2 | 3,
    styleId,
    styleKey: "fr" as SwimStyleKey,
    styleLabel,
    legLabel: `第${i + 1}泳者 (${styleLabel})`,
  }));
}

// メドレーリレー: 背・平・バタ・自の順
function medleyLegs(baId: number, brId: number, flyId: number, frId: number): RelayLeg[] {
  const legs: Array<{ styleId: number; styleKey: SwimStyleKey; styleLabel: string }> = [
    { styleId: baId, styleKey: "ba", styleLabel: "背泳ぎ" },
    { styleId: brId, styleKey: "br", styleLabel: "平泳ぎ" },
    { styleId: flyId, styleKey: "fly", styleLabel: "バタフライ" },
    { styleId: frId, styleKey: "fr", styleLabel: "自由形" },
  ];
  return legs.map((l, i) => ({
    legIndex: i as 0 | 1 | 2 | 3,
    styleId: l.styleId,
    styleKey: l.styleKey,
    styleLabel: l.styleLabel,
    legLabel: `第${i + 1}泳者 (${l.styleLabel})`,
  }));
}

export const RELAY_EVENTS: RelayEventDef[] = [
  {
    id: "relay_4x25_free",
    label: "25m×4 フリーリレー",
    legs: freeLegs(1, "自由形"),
  },
  {
    id: "relay_4x50_free",
    label: "50m×4 フリーリレー",
    legs: freeLegs(2, "自由形"),
  },
  {
    id: "relay_4x100_free",
    label: "100m×4 フリーリレー",
    legs: freeLegs(3, "自由形"),
  },
  {
    id: "relay_4x200_free",
    label: "200m×4 フリーリレー",
    legs: freeLegs(4, "自由形"),
  },
  {
    id: "relay_4x25_medley",
    label: "25m×4 メドレーリレー",
    // ba=12, br=8, fly=16, fr=1
    legs: medleyLegs(12, 8, 16, 1),
  },
  {
    id: "relay_4x50_medley",
    label: "50m×4 メドレーリレー",
    // ba=13, br=9, fly=17, fr=2
    legs: medleyLegs(13, 9, 17, 2),
  },
  {
    id: "relay_4x100_medley",
    label: "100m×4 メドレーリレー",
    // ba=14, br=10, fly=18, fr=3
    legs: medleyLegs(14, 10, 18, 3),
  },
];

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
