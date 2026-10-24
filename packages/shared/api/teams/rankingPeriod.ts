// =============================================================================
// ランキングの期間 → RPC 引数の変換 (Swim Hub共通パッケージ)
// =============================================================================
//
// `RankingPeriod` は3 variant あるが、両 RPC はそれを **2つの引数**
// (`p_fiscal_year integer` + `p_fiscal_year_or_earlier boolean`) で受け取る。
// その対応表をここ1箇所に置く。
//
// ⚠️ **`rankings.ts` / `relayRankings.ts` に三項演算子を書き戻さないこと。**
// 期間の軸は個人種目とリレーで完全に同一 (どちらの RPC も同じ2引数を同じ意味で
// 受ける) なので、対応表が2箇所にあると片方だけ更新されて静かに乖離する
// (CLAUDE.md「同一のドメイン対応表を2箇所にハードコードするな」)。
// =============================================================================

import type { RankingPeriod } from "../../types";

/** RPC の期間引数。キー名は両 RPC で共通。 */
export interface RankingPeriodRpcArgs {
  p_fiscal_year: number | null;
  p_fiscal_year_or_earlier: boolean;
}

/**
 * 期間を RPC の2引数に写す。
 *
 * | `RankingPeriod` | `p_fiscal_year` | `p_fiscal_year_or_earlier` |
 * |---|---|---|
 * | `allTime` | `null` | `false` |
 * | `fiscalYear` (Y) | `Y` | `false` |
 * | `fiscalYearOrEarlier` (Y) | `Y` | `true` |
 *
 * ⚠️ **`allTime` でも `false` を明示的に送る。** RPC 側の DEFAULT は false だが、
 * 送らないと「アプリが false を意図した」のか「引数を渡し忘れた」のかが
 * ログから区別できない。RPC 側は `p_fiscal_year IS NULL` なら boolean を無視する。
 *
 * ⚠️ **`allTime` + `true` は RPC が例外にする** (通算と意味が二重になるため)。
 * この関数は `allTime` に必ず false を付けるので、その組み合わせは作れない。
 */
export function periodToRpcArgs(period: RankingPeriod): RankingPeriodRpcArgs {
  if (period.kind === "allTime") {
    return { p_fiscal_year: null, p_fiscal_year_or_earlier: false };
  }
  return {
    p_fiscal_year: period.year,
    p_fiscal_year_or_earlier: period.kind === "fiscalYearOrEarlier",
  };
}
