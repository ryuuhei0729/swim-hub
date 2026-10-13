// =============================================================================
// マイルストーン概要文 (例: "100m × 1本: 1:23.45") の i18n 対応整形
// =============================================================================

import type { Milestone } from "../types";
import {
  isMilestoneRepsTimeParams,
  isMilestoneSetParams,
  isMilestoneTimeParams,
} from "../types/goals";
import { formatTimeBest } from "./time";

/**
 * goals 名前空間からの相対キー ("milestoneSummary.time" 等) を受け取る翻訳関数。
 * next-intl の useTranslations("goals") の t と、i18next の
 * (key, values) => t(`goals.${key}`, values) の両方から渡せる。補間は {var} 単一波括弧。
 */
export type MilestoneSummaryKey =
  | "milestoneSummary.time"
  | "milestoneSummary.repsTime"
  | "milestoneSummary.set";

export type SummaryTranslate = (key: MilestoneSummaryKey, values: Record<string, string>) => string;

export function formatMilestoneSummary(
  milestone: Pick<Milestone, "params" | "title">,
  t: SummaryTranslate,
): string {
  const params = milestone.params;
  // next-intl は数値引数をロケール書式 (1,500 等) にするため、文字列で渡す
  if (isMilestoneTimeParams(params)) {
    return t("milestoneSummary.time", {
      distance: String(params.distance),
      time: formatTimeBest(params.target_time),
    });
  }
  if (isMilestoneRepsTimeParams(params)) {
    return t("milestoneSummary.repsTime", {
      distance: String(params.distance),
      reps: String(params.reps),
      time: formatTimeBest(params.target_average_time),
    });
  }
  if (isMilestoneSetParams(params)) {
    return t("milestoneSummary.set", {
      distance: String(params.distance),
      reps: String(params.reps),
      sets: String(params.sets),
      circle: formatTimeBest(params.circle),
    });
  }
  return milestone.title;
}
