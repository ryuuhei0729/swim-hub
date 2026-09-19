import {
  BEST_TIME_LABEL_NAMESPACE,
  getBestTimeForEntry as getBestTimeForEntryShared,
  type BestTimeCandidate,
} from "@apps/shared/utils/bestTimeForEntry";

/**
 * ベストタイム参照バッジ (mobile 版ラッパー)。
 *
 * 優先順位表そのものは `@apps/shared/utils/bestTimeForEntry` が唯一の定義元。
 * ここは mobile の i18n が名前空間付きフルキーで引く (`t("forms.recordLog.xxx")`)
 * ため、shared が返す素のキーに接頭辞を付けるだけの層。
 */

export type BestTimeLabelKey =
  | "forms.recordLog.bestTimeLabel"
  | "forms.recordLog.bestTimeRelay"
  | "forms.recordLog.bestTimeLong"
  | "forms.recordLog.bestTimeLongRelay"
  | "forms.recordLog.bestTimeShort"
  | "forms.recordLog.bestTimeShortRelay";

export interface BestTimeResult {
  time: number;
  labelKey: BestTimeLabelKey;
}

export function getBestTimeForEntry(
  styleName: string,
  poolType: number,
  isRelaying: boolean,
  bestTimes: readonly BestTimeCandidate[],
): BestTimeResult | null {
  const result = getBestTimeForEntryShared(styleName, poolType, isRelaying, bestTimes);
  if (!result) return null;
  return {
    time: result.time,
    labelKey: `${BEST_TIME_LABEL_NAMESPACE}.${result.labelKey}` as BestTimeLabelKey,
  };
}
