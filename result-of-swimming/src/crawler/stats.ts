// =============================================================================
// crawler/stats.ts - 取得コストの見積り
// =============================================================================
import type { HeatSelection } from "../parser/parseHeats";

/**
 * 集約 heat を使った場合に必要な結果リクエスト数と、
 * 使わなかった場合 (素朴に全組を叩く) の件数を返す。
 * 「静かに間引いていない」ことをログで示すために使う。
 */
export function aggregateRequestCount(selections: HeatSelection[], rawHeatCounts: number[]) {
  const withAggregate = selections.reduce((a, s) => a + s.heats.length, 0);
  const naive = rawHeatCounts.reduce((a, n) => a + n, 0);
  return { withAggregate, naive, saved: naive - withAggregate };
}
