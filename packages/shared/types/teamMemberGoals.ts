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
 * current_best_time は time > 0 の行の MIN(time) (GoalAPI.getBestTimeForStyle と同一定義)。
 */
export interface TeamMemberGoal {
  id: string;
  style_id: number;
  target_time: number;
  status: Goal["status"];
  achieved_at: string | null;
  created_at: string;
  competition_id: string | null;
  competition_title: string | null;
  competition_date: string | null;
  /** 大会終了日。単日開催・大会 NULL では null */
  competition_end_date: string | null;
  competition_pool_type: number | null;
  current_best_time: number | null;
  milestones: TeamMemberMilestone[];
}
