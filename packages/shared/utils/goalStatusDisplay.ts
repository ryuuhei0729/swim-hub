// =============================================================================
// 目標 / マイルストーンのステータス表示対応表 (新 UI 用の唯一の定義元)
// =============================================================================
// labelKey は `teamMemberGoals.status.*` (共有 i18n) の相対キー。
// tone は配色の意味だけを持ち、色の実値は各プラットフォームの UI が引く。
// 色味は本人画面の既存表示に合わせる:
//   achieved    = green  (bg-green-100 / text-green-800, mobile #16A34A)
//   in_progress = blue   (mobile #2563EB)
//   expired     = yellow (mobile #CA8A04)
//   not_started / active / cancelled = gray (mobile #9CA3AF)
// 本人画面の既存インライン定義の移行は対象外。

import type { Goal, MilestoneStatus } from "../types/goals";

export type StatusTone = "success" | "info" | "warning" | "neutral";

export interface StatusDisplay {
  /** `teamMemberGoals.` 配下の翻訳キー */
  labelKey: `status.goal.${Goal["status"]}` | `status.milestone.${MilestoneStatus}`;
  tone: StatusTone;
}

export const GOAL_STATUS_DISPLAY: Record<Goal["status"], StatusDisplay> = {
  active: { labelKey: "status.goal.active", tone: "info" },
  achieved: { labelKey: "status.goal.achieved", tone: "success" },
  cancelled: { labelKey: "status.goal.cancelled", tone: "neutral" },
};

export const MILESTONE_STATUS_DISPLAY: Record<MilestoneStatus, StatusDisplay> = {
  not_started: { labelKey: "status.milestone.not_started", tone: "neutral" },
  in_progress: { labelKey: "status.milestone.in_progress", tone: "info" },
  achieved: { labelKey: "status.milestone.achieved", tone: "success" },
  expired: { labelKey: "status.milestone.expired", tone: "warning" },
};
