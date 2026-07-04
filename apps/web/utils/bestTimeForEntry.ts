import type { BestTime } from "@/types/member-detail";

/**
 * 純粋関数: 種目・水路・リレーフラグを元にベストタイムを返す。
 *
 * RecordLogEntry.tsx の currentBestTime useMemo と同一のフォールバック階層を再現。
 * - リレーOFF: 同じ水路・非リレー → 同じ水路・リレー → 異なる水路・非リレー → 異なる水路・リレー
 * - リレーON:  同じ水路・リレー → 同じ水路・非リレー → 異なる水路・リレー → 異なる水路・非リレー
 *
 * labelKey は "forms.recordLog" 名前空間のキーをそのまま返す。
 * 呼び出し側で `t(labelKey)` を使って翻訳すること。
 */

/** forms.recordLog 名前空間のベストタイム関連キー（6種） */
export type BestTimeLabelKey =
  | "bestTimeLabel"
  | "bestTimeRelay"
  | "bestTimeLong"
  | "bestTimeLongRelay"
  | "bestTimeShort"
  | "bestTimeShortRelay";

export interface BestTimeResult {
  time: number;
  labelKey: BestTimeLabelKey;
}

export function getBestTimeForEntry(
  styleName: string,
  poolType: number,
  isRelaying: boolean,
  bestTimes: BestTime[],
): BestTimeResult | null {
  if (!styleName || !bestTimes.length) return null;

  const otherPoolType = poolType === 0 ? 1 : 0;
  const otherPoolLabelKey: BestTimeLabelKey = poolType === 0 ? "bestTimeLong" : "bestTimeShort";
  const otherPoolRelayLabelKey: BestTimeLabelKey = poolType === 0 ? "bestTimeLongRelay" : "bestTimeShortRelay";

  const samePool = bestTimes.find(
    (bt) => bt.style.name_jp === styleName && bt.pool_type === poolType,
  );
  const otherPool = bestTimes.find(
    (bt) => bt.style.name_jp === styleName && bt.pool_type === otherPoolType,
  );

  if (isRelaying) {
    // 1. 同じ水路・リレー
    if (samePool?.relayingTime) {
      return { time: samePool.relayingTime.time, labelKey: "bestTimeRelay" };
    }
    // 2. 同じ水路・非リレー
    if (samePool && !samePool.is_relaying) {
      return { time: samePool.time, labelKey: "bestTimeLabel" };
    }
    // 3. 異なる水路・リレー
    if (otherPool?.relayingTime) {
      return { time: otherPool.relayingTime.time, labelKey: otherPoolRelayLabelKey };
    }
    // 4. 異なる水路・非リレー
    if (otherPool && !otherPool.is_relaying) {
      return { time: otherPool.time, labelKey: otherPoolLabelKey };
    }
  } else {
    // 1. 同じ水路・非リレー
    if (samePool && !samePool.is_relaying) {
      return { time: samePool.time, labelKey: "bestTimeLabel" };
    }
    // 2. 同じ水路・リレー
    if (samePool?.relayingTime) {
      return { time: samePool.relayingTime.time, labelKey: "bestTimeRelay" };
    }
    // 3. 異なる水路・非リレー
    if (otherPool && !otherPool.is_relaying) {
      return { time: otherPool.time, labelKey: otherPoolLabelKey };
    }
    // 4. 異なる水路・リレー
    if (otherPool?.relayingTime) {
      return { time: otherPool.relayingTime.time, labelKey: otherPoolRelayLabelKey };
    }
  }

  return null;
}
