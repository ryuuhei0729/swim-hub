// =============================================================================
// チームAPI - goalTargets (代理入力画面の目標タイム参照)
// =============================================================================
// SECURITY DEFINER RPC `get_team_competition_goal_targets` (20261005000000) を呼ぶ薄い境界層。
// 認可 (管理者か / 大会が自チームのものか) は RPC 側が担保する。読み取りのみ。
// =============================================================================

import { SupabaseClient } from "@supabase/supabase-js";
import type { TeamGoalTarget } from "../../types/goalTargets";

export class TeamGoalTargetsAPI {
  constructor(private supabase: SupabaseClient) {}

  /**
   * 大会内のチームメンバー全員の目標を1回の RPC で取得する (status は絞らない)。
   *
   * @throws 生の `PostgrestError` をそのまま re-throw する。呼び出し側は目標を出さないだけに
   *   して、入力・保存は止めないこと (エラー文は画面に出さない)。
   */
  async listForCompetition(teamId: string, competitionId: string): Promise<TeamGoalTarget[]> {
    const { data, error } = await this.supabase.rpc("get_team_competition_goal_targets", {
      p_team_id: teamId,
      p_competition_id: competitionId,
    });

    if (error) throw error;

    // RPC は competition_id を返さない (引数の大会で絞り済み)。照合を型で強制するため、
    // 引数の大会 id を各行に付与する
    const rows = (data ?? []) as Omit<TeamGoalTarget, "competition_id">[];
    return rows.map((row) => ({ ...row, competition_id: competitionId }));
  }
}
