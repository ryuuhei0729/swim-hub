// =============================================================================
// 絞り込みチップ / 要約のラベル
// =============================================================================
//
// 距離と期間の表記は **絞り込みシートのチップと画面上部の要約で必ず一致させる**。
// 表記が違うと、ユーザーは要約を見て自分がどのチップを選んだのか照合できない
// (リレーだけチップが `100m × 4` / 要約は `100m` のような乖離が起きる)。
// 呼び出し元が2ファイル (`./RankingFilterSheet.tsx` と `./TeamRankings.tsx`) に
// 分かれるため、書式をここ1箇所に置く。
//
// 選択肢そのもの (集合と並び) は `@apps/shared/utils/rankingEventAxis` の
// `getRankingDistanceChoices` / `buildRankingPeriodChoices` が唯一の定義元。
// ここは受け取った1件を文字列に写すだけで、集合や並びには関与しない。
//
// 種目・水路・性別・集計・対象のラベルは i18n キーを1本引くだけ (`t(...)` の
// 呼び出しそのもの) なので、ここに関数を増やさない。

import type { TFunction } from "i18next";
import type { RankingPeriod } from "@apps/shared/types";
import type { RankingDistanceChoice } from "@apps/shared/utils/rankingEventAxis";

/**
 * 個人種目は `100m`、リレーは `100m × 4`。
 *
 * リレーかどうかは `legCount` の有無 (個人種目は null) で決まる。
 * `× 4` のレグ数を UI 側に書かず `RankingDistanceChoice` から受け取るのは、
 * リレーのレグ数が `RELAY_EVENTS` の定義元にしか無いため。
 */
export function rankingDistanceLabel(t: TFunction, choice: RankingDistanceChoice): string {
  if (choice.legCount === null) return `${choice.distance}m`;
  return t("teams.ranking.relay.legDistanceOption", {
    distance: choice.distance,
    legCount: choice.legCount,
  });
}

/**
 * 通算は「通算」、年度は「2026年度」、以前バケットは「2023年度以前」。
 *
 * 年度の表記 (`{year}年度` / `FY{year}` 等) はロケールごとに違うので
 * `period.fiscalYear` / `period.fiscalYearOrEarlier` の補間に任せ、
 * `${year}年度` のような文字列連結や「以前」の後付けをしない。
 *
 * ⚠️ `fiscalYearOrEarlier` の `year` は**以前バケットの上端**で、明示年度の
 * 最小値より1つ小さい (根拠は shared の `buildRankingPeriodChoices`)。
 * ここで ±1 して表示を合わせようとしないこと — バケットの境界が
 * RPC の絞り込みとずれる。
 */
export function rankingPeriodLabel(t: TFunction, period: RankingPeriod): string {
  if (period.kind === "allTime") return t("teams.ranking.period.allTime");
  if (period.kind === "fiscalYearOrEarlier") {
    return t("teams.ranking.period.fiscalYearOrEarlier", { year: period.year });
  }
  return t("teams.ranking.period.fiscalYear", { year: period.year });
}
