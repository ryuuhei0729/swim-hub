// =============================================================================
// リレー種目定義 - Swim Hub共通パッケージ (唯一の定義元)
// =============================================================================
//
// このファイルは以下2ファイルの**完全な複製**を統合したものである:
//   - apps/web/app/[locale]/(authenticated)/teams/[teamId]/competitions/
//     [competitionId]/records/_client/relayEvents.ts (263行, web 正準)
//   - apps/mobile/screens/teamRecordBulk/relayEvents.ts (214行, 複製)
// 両者はコメントを除くと完全に同一の実装だった (実測: コメント行を除去した diff が
// 1行のみ = 末尾コメントの位置違い)。よって挙動の食い違いは無く、寄せる判断は不要。
// 移設後、上記2ファイルは本ファイルへの re-export バリアに置き換える。
//
// styles テーブル (migration: 20251201014342_initial_schema.sql) から確認した id 値:
//   fr: 25m=1, 50m=2, 100m=3, 200m=4
//   br: 25m=8, 50m=9, 100m=10
//   ba: 25m=12, 50m=13, 100m=14
//   fly: 25m=16, 50m=17, 100m=18
//
// ⚠️ `SwimStyleKey` ("fr"|"ba"|"br"|"fly") は canonical な `SwimStyle`
//    ("Fr"|"Br"|"Ba"|"Fly"|"IM") とは**別語彙**である。リレーのレグ専用で IM が無く、
//    i18n ラベルのオブジェクトキーとしてのみ使い DB 文字列には触れない。
//    `toStyleCode()` で正規化する対象でもないので、統一しようとしないこと
//    (CLAUDE.md「canonical と紛らわしいが別物の語彙がある。統一しようとするな」)。
// =============================================================================

import type { RelayKind } from "../types/relayRecord";

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
  /**
   * フリーリレーイベントラベルのサフィックス (例: "フリーリレー")。
   * "{legDistance}m×{legCount} {suffix}" として使用する。
   * legCount は `RELAY_EVENTS` の `legs.length` から導出するので固定値ではない。
   */
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

  const freeLabel = (dist: number, legCount: number) =>
    `${dist}m×${legCount} ${freeRelaySuffix}`;
  const medleyLabel = (dist: number, legCount: number) =>
    `${dist}m×${legCount} ${medleyRelaySuffix}`;

  // 距離は getRelayLegDistance を唯一の定義元とし、二重管理を避ける
  // (RELAY_EVENTS を固定インデックスで参照しないので定義順が変わっても対応は崩れない)。
  //
  // レグ数も同じ理由で `event.legs.length` から導出する。**`×4` と書かないこと。**
  // 現在の7種目はすべて4レグなので出力は変わらないが、`relay_records.leg_count` は
  // `CHECK (leg_count BETWEEN 2 AND 8)` なので 2x / 8x の余地がある。ここに 4 を
  // 焼くと、ランキングの距離選択肢 (`getRelayDistanceOptions`) が 8 と出るのに
  // 記録入力画面の種目ラベルだけ ×4 と出る形で静かに食い違う。
  return RELAY_EVENTS.map((event) => {
    const dist = getRelayLegDistance(event.id);
    const legCount = event.legs.length;
    return {
      id: event.id,
      label:
        getRelayKind(event.id) === "medley"
          ? medleyLabel(dist, legCount)
          : freeLabel(dist, legCount),
      legs: labelLegs(event.legs),
    };
  });
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
    // i===0 を直上で return 済みなので i>=1、かつ Array.prototype.map の i は
    // 常に 0<=i<length を満たすため i-1 は必ず有効な添字
    return Math.round((cum - cumulativeTimes[i - 1]!) * 100) / 100;
  });
}

/**
 * leg 開始時点の通算タイム (秒) を返す純粋関数。legIdx=0 は必ず 0 (オフセットなし)。
 *
 * @param cumulativeTimes - `calcCumulativeTimes` が返す累計タイム配列
 * @param legIdx - leg インデックス (0-3)
 * @returns leg 開始時点の通算タイム (秒)
 */
export function getLegStartCumulative(cumulativeTimes: number[], legIdx: number): number {
  if (legIdx <= 0) return 0;
  return cumulativeTimes[legIdx - 1] ?? 0;
}

/**
 * 通算 split タイム (リレー開始からの通算値) を leg 相対の split タイムに変換する純粋関数。
 * 浮動小数点誤差を避けるため必ず小数第2位で丸める。
 *
 * @param cumulativeSplitTime - 通算 split タイム (秒)
 * @param legStartCumulative - `getLegStartCumulative` で得た leg 開始時点の通算タイム (秒)
 * @returns leg 相対の split タイム (秒)
 */
export function toLegRelativeSplitTime(
  cumulativeSplitTime: number,
  legStartCumulative: number,
): number {
  return Math.round((cumulativeSplitTime - legStartCumulative) * 100) / 100;
}

/**
 * leg 相対の split タイムを通算 split タイムに変換する純粋関数 (`toLegRelativeSplitTime` の逆変換)。
 * 編集フォームの再読込時に DB の leg 相対値から通算値を復元するために使う。
 * 浮動小数点誤差を避けるため必ず小数第2位で丸める。
 *
 * @param legRelativeSplitTime - leg 相対の split タイム (秒)
 * @param legStartCumulative - `getLegStartCumulative` で得た leg 開始時点の通算タイム (秒)
 * @returns 通算 split タイム (秒)
 */
export function toCumulativeSplitTime(
  legRelativeSplitTime: number,
  legStartCumulative: number,
): number {
  return Math.round((legRelativeSplitTime + legStartCumulative) * 100) / 100;
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

// -----------------------------------------------------------------------------
// RelayEventId → (kind, legDistance) の分解
//
// `relay_records` テーブルは **`relay_event_id` を列として持たない**。
// `relayEvents.ts` の RelayEventId 列挙を DB の CHECK 制約に写すと
// 「shared の型 / DB CHECK」の二重管理になり、片方だけ更新されて静かに壊れる
// (CLAUDE.md「同一のドメイン対応表を2箇所にハードコードするな」)。
// 代わりに DB は分解済みの事実 (`relay_kind` text + `leg_distance` integer) を
// 持ち、書き込み時に `fromRelayEventId()` で分解する。
//
// 逆方向 (`(kind, legDistance)` → `RelayEventId`) は現時点で呼び出し元が無いので
// 用意しない。ランキング表示は `relay_kind` / `leg_distance` をそのまま
// i18n の `teams.ranking.relay.eventLabel` に流し込んでおり、`RelayEventId` を
// 経由する必要が無い。**必要になった時点で追加すること** (未使用の export を
// 「設計の要」と称して置いておくと、実際には誰も通らない経路の docstring が
// 設計判断として読まれてしまう)。
// -----------------------------------------------------------------------------

/** RelayEventId のサフィックスから種類を導出する。 */
export function getRelayKind(relayEventId: RelayEventId): RelayKind {
  return relayEventId.endsWith("_medley") ? "medley" : "free";
}

/**
 * `RelayEventId` を DB に保存する分解済みの事実へ変換する。
 *
 * `getRelayLegDistance` / `getRelayKind` を経由するので、対応表を新たに持たない。
 */
export function fromRelayEventId(relayEventId: RelayEventId): {
  kind: RelayKind;
  legDistance: number;
} {
  return { kind: getRelayKind(relayEventId), legDistance: getRelayLegDistance(relayEventId) };
}

/** リレーの種類の並び順 (フリー → メドレー)。UI の選択肢はこれを読む。 */
export const RELAY_KIND_VALUES: readonly RelayKind[] = ["free", "medley"];

/** ある種類のリレーで選べる1つの距離。UI のラベルは「{legDistance}m × {legCount}」で組む。 */
export interface RelayDistanceOption {
  /** 1レグの距離 (m)。合計距離ではない。 */
  legDistance: number;
  /** レグ数。`RELAY_EVENTS` の `legs.length` から導出する。 */
  legCount: number;
}

/**
 * ある種類のリレーで選べる (1レグの距離, レグ数) の組を距離の昇順で返す。
 *
 * **レグ数を呼び出し側でハードコードさせないために legCount を一緒に返す。**
 * 現在の7種目はすべて4レグだが、`relay_records.leg_count` は DB 上
 * `DEFAULT 4 CHECK (leg_count BETWEEN 2 AND 8)` なので 2x / 8x の余地がある。
 * UI ラベルに `× 4` と書くと `RELAY_EVENTS` と2箇所で同じ事実を持つことになり、
 * 片方だけ更新されて静かに壊れる (CLAUDE.md「同一のドメイン対応表を2箇所に
 * ハードコードするな」)。
 *
 * 同一の (距離, レグ数) が複数種目に現れても1件に畳む。距離が同じでレグ数が
 * 違う種目が将来入った場合は別の選択肢として残す (`25m × 4` と `25m × 8` は
 * 別種目なので、距離だけで畳むと片方が黙って消える)。
 */
export function getRelayDistanceOptions(kind: RelayKind): RelayDistanceOption[] {
  const seen = new Map<string, RelayDistanceOption>();
  for (const event of RELAY_EVENTS) {
    if (getRelayKind(event.id) !== kind) continue;
    const option: RelayDistanceOption = {
      legDistance: getRelayLegDistance(event.id),
      legCount: event.legs.length,
    };
    const key = `${option.legDistance}x${option.legCount}`;
    if (!seen.has(key)) seen.set(key, option);
  }
  return [...seen.values()].sort(
    (a, b) => a.legDistance - b.legDistance || a.legCount - b.legCount,
  );
}

/**
 * ある種類のリレーで選べる 1 leg 距離を昇順で返す。
 * `getRelayDistanceOptions` からの射影なので距離リストを別に持たない。
 */
export function getRelayLegDistances(kind: RelayKind): number[] {
  return [...new Set(getRelayDistanceOptions(kind).map((option) => option.legDistance))];
}
