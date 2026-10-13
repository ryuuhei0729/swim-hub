import type { StatusTone } from "@apps/shared/utils/goalStatusDisplay";

/** GOAL_STATUS_DISPLAY / MILESTONE_STATUS_DISPLAY の tone → 配色 (本人画面の既存配色に合わせる) */
export const TONE_COLORS: Record<StatusTone, { fg: string; bg: string }> = {
  success: { fg: "#16A34A", bg: "#DCFCE7" },
  info: { fg: "#2563EB", bg: "#DBEAFE" },
  warning: { fg: "#CA8A04", bg: "#FEF9C3" },
  neutral: { fg: "#6B7280", bg: "#F3F4F6" },
};
