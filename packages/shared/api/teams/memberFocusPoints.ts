// =============================================================================
// チームAPI - memberFocusPoints (管理者によるメンバーのフォーカスポイントの閲覧)
// =============================================================================
// SECURITY DEFINER RPC `get_team_member_focus_points` を呼ぶ薄い境界層。
// 認可 (承認済みアクティブな管理者か / 対象が同チームの承認済みメンバーか) と
// 返す列の限定は RPC 側が担保する。書き込みはしない (memberGoals.ts と同じ方針)。
// =============================================================================

import { SupabaseClient } from "@supabase/supabase-js";
import type { TeamMemberFocusPoint } from "../../types/focusPoint";

export class TeamMemberFocusPointsAPI {
  constructor(private supabase: SupabaseClient) {}

  /**
   * メンバーのフォーカスポイントを取得する。並びは RPC のまま
   * (取り組み中は追加した順、身についたものは新しく身についた順)。
   *
   * @throws 生の `PostgrestError` をそのまま re-throw する。表示側は
   *   `toUserFacingMessage(error, fallback)` で汎用文言にフォールバックする。
   */
  async list(teamId: string, memberId: string): Promise<TeamMemberFocusPoint[]> {
    const { data, error } = await this.supabase.rpc("get_team_member_focus_points", {
      p_team_id: teamId,
      p_member_id: memberId,
    });

    if (error) throw error;

    return (data ?? []) as TeamMemberFocusPoint[];
  }
}
