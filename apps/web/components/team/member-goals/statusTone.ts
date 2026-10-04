import type { StatusTone } from "@apps/shared/utils/goalStatusDisplay";

/** `goalStatusDisplay` の tone → バッジの Tailwind クラス (本人画面の既存配色に合わせる) */
export const STATUS_BADGE_CLASS: Record<StatusTone, string> = {
  success: "bg-green-100 text-green-800",
  info: "bg-blue-100 text-blue-800",
  warning: "bg-yellow-100 text-yellow-800",
  neutral: "bg-gray-100 text-gray-700",
};
