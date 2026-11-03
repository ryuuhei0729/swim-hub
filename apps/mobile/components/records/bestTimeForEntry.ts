import {
  BEST_TIME_LABEL_NAMESPACE,
  getBestTimeForEntry as getBestTimeForEntryShared,
  type BestTimeCandidate,
  type BestTimeLabelKey as SharedBestTimeLabelKey,
} from "@apps/shared/utils/bestTimeForEntry";
import { formatTimeBest } from "@apps/shared/utils/time";

/**
 * ベストタイム参照バッジ (mobile 版ラッパー)。
 *
 * 優先順位表そのものは `@apps/shared/utils/bestTimeForEntry` が唯一の定義元。
 * ここでは mobile の入力画面向けの表示形式に変換する:
 *   - ラベルには水路の情報だけを載せる (「ベストタイム」「ベストタイム(長水路)」「ベストタイム(短水路)」)
 *   - 引き継ぎ (リレー第2泳者以降) のタイムは、ラベルではなくタイム末尾に " R" を付けて表す
 *     (閲覧画面のベストタイム表の R 表記と同じ記号)
 *   例: 「ベストタイム(長水路): 55.00 R」
 * mobile の i18n は名前空間付きフルキーで引く (`t("forms.recordLog.xxx")`) ため、
 * shared が返す素のキーに接頭辞を付ける。
 */

export type BestTimeLabelKey =
  | "forms.recordLog.bestTimeLabel"
  | "forms.recordLog.bestTimeLong"
  | "forms.recordLog.bestTimeShort";

export interface BestTimeResult {
  time: number;
  /** 水路の情報だけを持つラベルキー (引継の有無は含まない) */
  labelKey: BestTimeLabelKey;
  /** 引き継ぎのタイムなら true。表示時はタイム末尾に " R" を付ける */
  isRelaying: boolean;
}

/** 引継込みの shared キー → 水路情報だけのキー */
const POOL_ONLY_LABEL_KEY: Record<SharedBestTimeLabelKey, BestTimeLabelKey> = {
  bestTimeLabel: `${BEST_TIME_LABEL_NAMESPACE}.bestTimeLabel`,
  bestTimeRelay: `${BEST_TIME_LABEL_NAMESPACE}.bestTimeLabel`,
  bestTimeLong: `${BEST_TIME_LABEL_NAMESPACE}.bestTimeLong`,
  bestTimeLongRelay: `${BEST_TIME_LABEL_NAMESPACE}.bestTimeLong`,
  bestTimeShort: `${BEST_TIME_LABEL_NAMESPACE}.bestTimeShort`,
  bestTimeShortRelay: `${BEST_TIME_LABEL_NAMESPACE}.bestTimeShort`,
};

/** 引き継ぎタイムに付ける接尾辞 (閲覧画面のベストタイム表と同じ記号。i18n しない) */
export const RELAY_TIME_SUFFIX = " R";

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
    labelKey: POOL_ONLY_LABEL_KEY[result.labelKey],
    isRelaying: result.isRelaying,
  };
}

/** タイム部分の文字列。引き継ぎなら末尾に " R" (例: "55.00 R") */
export function formatBestTimeValue(result: Pick<BestTimeResult, "time" | "isRelaying">): string {
  return `${formatTimeBest(result.time)}${result.isRelaying ? RELAY_TIME_SUFFIX : ""}`;
}

/**
 * バッジ全文 (例: 「ベストタイム(長水路): 55.00 R」)。
 * 入力画面のベストタイムバッジはすべてこの関数で文言を組み立てる (画面ごとに形式が
 * ずれないようにするため)。
 */
export function formatBestTimeBadgeText(
  result: BestTimeResult,
  t: (key: BestTimeLabelKey) => string,
): string {
  return `${t(result.labelKey)}: ${formatBestTimeValue(result)}`;
}
