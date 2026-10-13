import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { Milestone } from "@apps/shared/types";
import { formatMilestoneSummary } from "@apps/shared/utils/milestoneSummary";

/** マイルストーン概要文 (例: "100m × 1本: 1:23.45") をロケールに合わせて返す整形関数 */
export function useMilestoneSummary(): (milestone: Pick<Milestone, "params" | "title">) => string {
  const { t } = useTranslation();
  return useCallback(
    (milestone) => formatMilestoneSummary(milestone, (key, values) => t(`goals.${key}`, values)),
    [t],
  );
}
