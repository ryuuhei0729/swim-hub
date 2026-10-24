// =============================================================================
// ベストタイム参照バッジのフォールバック階層 — 唯一の定義元
// =============================================================================
//
// 以前は同じ優先順位表が3箇所 (web `utils/bestTimeForEntry.ts` /
// mobile `components/records/bestTimeForEntry.ts` /
// web `RecordLogEntry.tsx` の currentBestTime useMemo) にハードコードされていた。
// 片方だけ更新されて静かに壊れるため shared に集約した。
// web/mobile の同名ファイルは import 経路を保つための re-export バリアに落としてある。
// =============================================================================

/**
 * `getBestTimeForEntry` が必要とする最小構造。
 *
 * web の `types/member-detail.ts` の `BestTime` と shared の `types/ui.ts` の
 * `BestTime` は `style_id` の有無が違う (web には無い) ため、どちらでも渡せるよう
 * 構造的に必要なフィールドだけを要求する。
 */
export interface BestTimeCandidate {
  time: number;
  /** 0: 短水路 / 1: 長水路 */
  pool_type: number;
  is_relaying: boolean;
  style: { name_jp: string };
  /** 引き継ぎありのベスト。非リレーのベストに紐付いて入る */
  relayingTime?: { time: number };
}

/** forms.recordLog 名前空間のベストタイム関連キー（6種）。名前空間は付けない */
export type BestTimeLabelKey =
  | "bestTimeLabel"
  | "bestTimeRelay"
  | "bestTimeLong"
  | "bestTimeLongRelay"
  | "bestTimeShort"
  | "bestTimeShortRelay";

/** mobile の i18n は名前空間付きフルキーで引くため、接頭辞をここに持たせる */
export const BEST_TIME_LABEL_NAMESPACE = "forms.recordLog" as const;

export interface BestTimeResult {
  time: number;
  labelKey: BestTimeLabelKey;
}

/**
 * 純粋関数: 種目名・水路・リレーフラグを元に、表示すべきベストタイムを1件返す。
 *
 * - リレーOFF: 同じ水路・非リレー → 同じ水路・リレー → 異なる水路・非リレー → 異なる水路・リレー
 * - リレーON:  同じ水路・リレー → 同じ水路・非リレー → 異なる水路・リレー → 異なる水路・非リレー
 *
 * `styleName` は `styles.name_jp` (DB 識別子)。翻訳済みラベルを渡してはいけない。
 * labelKey は名前空間を含まないので、呼び出し側で `useTranslations("forms.recordLog")`
 * を使うか `BEST_TIME_LABEL_NAMESPACE` を前置すること。
 */
export function getBestTimeForEntry(
  styleName: string,
  poolType: number,
  isRelaying: boolean,
  bestTimes: readonly BestTimeCandidate[],
): BestTimeResult | null {
  if (!styleName || !bestTimes.length) return null;

  const otherPoolType = poolType === 0 ? 1 : 0;
  const otherPoolLabelKey: BestTimeLabelKey = poolType === 0 ? "bestTimeLong" : "bestTimeShort";
  const otherPoolRelayLabelKey: BestTimeLabelKey =
    poolType === 0 ? "bestTimeLongRelay" : "bestTimeShortRelay";

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
