// =============================================================================
// チーム管理者向け: メンバーの目標閲覧 (RPC get_team_member_goals の戻り型)
// =============================================================================

import type { Goal, Milestone } from "./goals";

/**
 * マイルストーン (閲覧専用)。reflection_note / reflection_done は本人専用のため含めない。
 * RPC が jsonb のキーを厳密にこの7つに限定している。
 */
export type TeamMemberMilestone = Pick<
  Milestone,
  "id" | "title" | "type" | "params" | "deadline" | "status" | "achieved_at"
>;

/**
 * RPC `get_team_member_goals` の1行。
 * 大会 NULL の目標では competition_* と current_best_time がすべて null。
 * current_best_time は生の MIN(time) で、0 の扱いは computeGoalProgress が決める。
 */
export interface TeamMemberGoal {
  id: string;
  style_id: number;
  target_time: number;
  start_time: number | null;
  status: Goal["status"];
  achieved_at: string | null;
  created_at: string;
  competition_id: string | null;
  competition_title: string | null;
  competition_date: string | null;
  competition_pool_type: number | null;
  current_best_time: number | null;
  milestones: TeamMemberMilestone[];
}
