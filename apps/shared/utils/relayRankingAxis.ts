// =============================================================================
// リレーランキングの絞り込み軸 - Swim Hub共通パッケージ
// =============================================================================
//
// 第1弾の `./rankingStyleAxis.ts` (個人種目) と同じ役割。
// web (`apps/web/components/team/rankings/`) と
// mobile (`apps/mobile/components/teams/rankings/`) の**唯一の定義元**である。
//
// 個人種目の軸は `styles` マスターの実データから導出したが、リレーの軸は
// `./relayEvents.ts` の `RELAY_EVENTS` から導出する。ここに距離リストや
// 種類リストを独自に持たない (二重管理になる)。
// =============================================================================

import type {
  PoolType,
  RelayKind,
  RelayRankingGenderFilter,
  TeamRelayRankingFilters,
} from "../types";
import { RELAY_KIND_VALUES, getRelayLegDistances } from "./relayEvents";

/**
 * 距離の選択肢は `./relayEvents.ts` が定義元。UI は絞り込み軸の import 元を
 * このファイル1つに揃えたいので re-export する (ラッパー関数は挟まない)。
 * ラベルは `{legDistance}m × {legCount}` の形で組む — レグ数を UI に
 * ハードコードさせないために legCount を一緒に返している。
 */
export { getRelayDistanceOptions, type RelayDistanceOption } from "./relayEvents";

// -----------------------------------------------------------------------------
// 絞り込み軸の選択肢と並び順
//
// web のラジオボタンと mobile のボトムシートが**同じ配列を読む**。
// 並び順の方針は第1弾と揃える:
//   - 水路は 短水路(0) → 長水路(1)。既定値 (長水路) は選択状態で示されるので
//     リストの先頭である必要はない
//   - 性別区分は `RelayGenderCategory` の定義順 (male → female → mixed)。
//     「すべて」は選択肢に持たない (個人種目の性別と同じ方針。リレーは混合種目が
//     実在するので `mixed` が3つ目の区分として並ぶ)
//   - リレーの種類は `RELAY_KIND_VALUES` (free → medley) をそのまま使う
// -----------------------------------------------------------------------------

/** 水路の選択肢。`relay_records.pool_type` の canonical な数値順 (0=短水路, 1=長水路)。 */
export const RELAY_RANKING_POOL_TYPE_VALUES: readonly PoolType[] = [0, 1];

/**
 * 性別区分フィルタの選択肢。`RelayGenderCategory` (DB 値) の定義順そのまま。
 *
 * 「すべて」は含めない。区分をまたいで1つの順位表にすると競技上の意味が無く、
 * 混合は `mixed` という実在の区分で表現できる。
 */
export const RELAY_RANKING_GENDER_VALUES: readonly RelayRankingGenderFilter[] = [
  "male",
  "female",
  "mixed",
];

/** リレーの種類の選択肢。定義元は `./relayEvents.ts`。 */
export const RELAY_RANKING_KIND_VALUES = RELAY_KIND_VALUES;

/**
 * 既定で選ぶ種目。4x100m フリーリレーは高校・大学・一般のどの区分でも必ず実施され、
 * どのチームでも記録が存在しやすい。
 */
const DEFAULT_RELAY_KIND: RelayKind = "free";

/**
 * 既定の**1レグの距離**。100 = 4×100m (総距離 400m) のフリーリレー。
 *
 * 🚨 **`./rankingStyleAxis.ts` の `DEFAULT_DISTANCE` (= 50) と揃えようとしないこと。**
 * 両者は**別の量**であり、数値を一致させることに意味が無い:
 *
 * | 定数 | 意味 | その値が指すレース |
 * |---|---|---|
 * | `DEFAULT_DISTANCE = 50` | **レースの距離** | 50m 自由形 |
 * | `DEFAULT_LEG_DISTANCE = 100` | **1レグの距離** | 4×100m = 総距離 400m |
 *
 * ここを 50 にすると 4×50m (総距離 200m) になる。**距離が半分のレースに変わる**
 * のであって「個人と揃う」わけではない。100 はフリーリレーの標準種目、
 * 個人の 50 は短距離自由形の標準で、**どちらもその軸での canonical な既定**である。
 *
 * ⚠️ **この定数が実際に画面へ出るのは `styles` マスターが空のときの
 * フォールバック経路だけ** (`./rankingEventAxis.ts` の
 * `buildDefaultRankingFilterState` がリレーへ倒す枝)。通常フローでは個人から
 * リレーへ切り替えたときに `resolveRankingEventChange` が距離を引き継ぐので
 * 使われない — 個人 50m Fr → フリーリレーなら **50m × 4** になる。
 */
const DEFAULT_LEG_DISTANCE = 100;

/**
 * 既定の水路。長水路 (1) を初期表示にする。日本水泳連盟の公認記録・全国大会は
 * 長水路が基準で、第1弾の個人種目ランキングも長水路を既定にしている。
 */
const DEFAULT_POOL_TYPE: PoolType = 1;

/**
 * 既定の性別区分。男子を初期表示にする (個人種目と揃える)。
 */
const DEFAULT_GENDER_CATEGORY: RelayRankingGenderFilter = "male";

/**
 * リレーの種類を切り替えたときの距離の引き継ぎ。
 * 同じ距離が新しい種類にも存在すればそれを維持し、無ければその種類の最短距離にする。
 * (例: 200m フリー → メドレー に切り替えると 200m が無いので 25m 側に落ちる)
 *
 * 距離が1つも無い場合は null を返す (呼び出し側で切り替えを見送る)。
 */
export function resolveLegDistanceOnKindChange(
  nextKind: RelayKind,
  currentLegDistance: number,
): number | null {
  const options = getRelayLegDistances(nextKind);
  if (options.includes(currentLegDistance)) return currentLegDistance;
  return options.at(0) ?? null;
}

/**
 * 初期表示の絞り込み条件。
 *
 * `period` は通算固定 (年度セレクタは第1弾と同じく別スプリント)。
 * 集計モードは持たない (根拠は `types/teamRelayRanking.ts` の
 * `TeamRelayRankingFilters` の docstring)。
 *
 * ⚠️ 第1弾の `buildDefaultRankingFilters` は styles マスターの取得結果に依存する
 * ため null を返しうるが、リレーの軸は `RELAY_EVENTS` (静的定義) から決まるので
 * **必ず値を返す**。呼び出し側に「まだ確定していない」状態は存在しない。
 */
export function buildDefaultRelayRankingFilters(): TeamRelayRankingFilters {
  const distances = getRelayLegDistances(DEFAULT_RELAY_KIND);
  const legDistance = distances.includes(DEFAULT_LEG_DISTANCE)
    ? DEFAULT_LEG_DISTANCE
    : (distances.at(0) ?? DEFAULT_LEG_DISTANCE);

  return {
    relayKind: DEFAULT_RELAY_KIND,
    legDistance,
    poolType: DEFAULT_POOL_TYPE,
    genderCategory: DEFAULT_GENDER_CATEGORY,
    period: { kind: "allTime" },
  };
}
