import type { BestTime } from "../types";

/**
 * 目標の初期タイムに入れる「種目 × 水路」の自己ベストを返す。
 * リレー引き継ぎ (`is_relaying`) と 0 以下のタイムは採らない。該当が無ければ null。
 */
export function pickGoalStartTime(
  bestTimes: readonly BestTime[],
  styleId: number,
  poolType: number,
): number | null {
  const best = bestTimes.find(
    (bt) => bt.style_id === styleId && bt.pool_type === poolType && !bt.is_relaying && bt.time > 0,
  );
  return best ? best.time : null;
}
