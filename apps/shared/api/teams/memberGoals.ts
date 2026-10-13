// =============================================================================
// チームAPI - memberGoals (管理者によるメンバー目標の閲覧)
// =============================================================================
// SECURITY DEFINER RPC `get_team_member_goals` (20261004000000) を呼ぶ薄い境界層。
// 認可 (承認済みアクティブな管理者か / 対象が同チームの承認済みメンバーか) と
// 返す列の限定は RPC 側が担保する。書き込み系 API・達成判定は一切呼ばない。
// =============================================================================

import { SupabaseClient } from "@supabase/supabase-js";
import type { TeamMemberGoal } from "../../types/teamMemberGoals";

export class TeamMemberGoalsAPI {
  constructor(private supabase: SupabaseClient) {}

  /**
   * メンバーの全目標 (マイルストーン付き) を取得する。並び替えはしない
   * (`sortTeamMemberGoals` で行う)。
   *
   * @throws 生の `PostgrestError` をそのまま re-throw する。表示側は
   *   `toUserFacingMessage(error, fallback)` で汎用文言にフォールバックする。
   */
  async list(teamId: string, memberId: string): Promise<TeamMemberGoal[]> {
    const { data, error } = await this.supabase.rpc("get_team_member_goals", {
      p_team_id: teamId,
      p_member_id: memberId,
    });

    if (error) throw error;

    return (data ?? []) as TeamMemberGoal[];
  }
}
