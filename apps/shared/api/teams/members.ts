// =============================================================================
// チームAPI - members（メンバーシップCRUD/ロール/アクティブ管理）
// =============================================================================

import { SupabaseClient } from "@supabase/supabase-js";
import { TeamMembership, TeamMembershipWithUser } from "../../types";
import { requireAuth, requireTeamAdmin } from "../auth-utils";

export class TeamMembersAPI {
  constructor(private supabase: SupabaseClient) {}

  async list(teamId: string): Promise<TeamMembershipWithUser[]> {
    await requireAuth(this.supabase);
    const { data, error } = await this.supabase
      .from("team_memberships")
      .select("*, users:users(*), teams:teams(*)")
      .eq("team_id", teamId)
      .eq("status", "approved")
      .eq("is_active", true);
    if (error) throw error;
    return data as unknown as TeamMembershipWithUser[];
  }

  async join(inviteCode: string): Promise<TeamMembership> {
    await requireAuth(this.supabase);

    // 招待コードの検証・既存メンバーシップの状態判定・INSERT/UPDATE を
    // すべて SECURITY DEFINER RPC 内で完結させる（招待コード無しでの
    // pending 行乱造 (#42) を RLS 層で防止するため、自己 INSERT は不可）。
    const { data, error } = await this.supabase.rpc("request_join_team", {
      p_invite_code: inviteCode,
    });

    if (error) throw error;

    const result = data as {
      success: boolean;
      error?: string;
      membership?: TeamMembership;
    };

    if (!result.success) {
      throw new Error(result.error || "参加申請に失敗しました");
    }

    return result.membership as TeamMembership;
  }

  /**
   * 指定ユーザーの当該チームのカレンダー記録色カスタマイズ設定を削除する(孤児データ防止)。
   *
   * leave()（自己脱退）/ remove()（管理者除名）の両方から呼ぶ共通処理。
   * RLS の DELETE ポリシーは `(SELECT auth.uid()) = user_id OR is_team_admin(team_id, auth.uid())`
   * を許可する (20260806000001_calendar_colors_team_membership.sql)。
   * leave() (userId = 呼び出し本人) は本人分岐で削除され、remove() (userId = 除名対象の
   * 別ユーザー、呼び出し元は管理者) は管理者分岐で削除される。いずれも実際にクリーンアップが効く。
   * 失敗しても脱退/除名自体は成立させたいノンブロッキングなクリーンアップだが、
   * 空catchで握りつぶさずログには残す。
   */
  private async deleteTeamCalendarColors(teamId: string, userId: string): Promise<void> {
    const { error: colorError } = await this.supabase
      .from("user_team_calendar_colors")
      .delete()
      .eq("team_id", teamId)
      .eq("user_id", userId);
    if (colorError) {
      console.error("チーム脱退時のカレンダー記録色設定削除に失敗しました:", colorError);
    }
  }

  async leave(teamId: string): Promise<void> {
    const userId = await requireAuth(this.supabase);
    const { error } = await this.supabase
      .from("team_memberships")
      .update({ is_active: false, left_at: new Date().toISOString() })
      .eq("team_id", teamId)
      .eq("user_id", userId);
    if (error) throw error;

    // 脱退したチームのカレンダー記録色カスタマイズ設定を削除する(自分の行のみ、RLSで安全)。
    await this.deleteTeamCalendarColors(teamId, userId);
  }

  async updateRole(
    teamId: string,
    userId: string,
    role: "admin" | "user",
  ): Promise<TeamMembership> {
    await requireTeamAdmin(this.supabase, teamId);

    const { data, error } = await this.supabase
      .from("team_memberships")
      .update({ role })
      .eq("team_id", teamId)
      .eq("user_id", userId)
      .select("*")
      .single();
    if (error) throw error;
    return data as TeamMembership;
  }

  /**
   * メンバーを退会させる（管理者による除名）
   *
   * 自己退会は leave() が別経路で担うため、remove() は管理者権限を要求する。
   * .select().single() を付けることで、RLS 拒否や対象メンバー不在による
   * 0行更新をサイレント成功にせず、エラー (PGRST116) として throw させる。
   */
  async remove(teamId: string, userId: string): Promise<void> {
    await requireTeamAdmin(this.supabase, teamId);

    const { error } = await this.supabase
      .from("team_memberships")
      .update({ is_active: false, left_at: new Date().toISOString() })
      .eq("team_id", teamId)
      .eq("user_id", userId)
      .select("*")
      .single();
    if (error) throw error;

    // 除名されたユーザーのカレンダー記録色カスタマイズ設定を削除する。
    // RLS の DELETE ポリシーに管理者分岐 (is_team_admin) があるため、呼び出し元が
    // 管理者 (requireTeamAdmin で確認済み) であれば除名対象者本人の行も削除できる。
    await this.deleteTeamCalendarColors(teamId, userId);
  }

  /**
   * 退会済み（approved かつ is_active=false）メンバーシップを再アクティブ化
   *
   * SECURITY DEFINER RPC (reactivate_own_membership) 経由。
   * 「approved かつ is_active=false かつ left_at が記録済み（= leave()/remove()
   * を経由して実際に退会した）」行のみ再アクティブ化できる。left_at が NULL の
   * pending 行はこのガードで弾かれるため、自己承認スキップ（#38 A2b）は起きない。
   */
  async reactivateMembership(teamId: string): Promise<TeamMembership> {
    await requireAuth(this.supabase);

    const { data, error } = await this.supabase.rpc("reactivate_own_membership", {
      p_team_id: teamId,
    });

    if (error) throw error;

    const result = data as {
      success: boolean;
      error?: string;
      membership?: TeamMembership;
    };

    if (!result.success) {
      throw new Error(result.error || "再アクティブ化に失敗しました");
    }

    return result.membership as TeamMembership;
  }

  /**
   * 承認待ちのメンバーシップ一覧を取得（管理者のみ）
   */
  async listPending(teamId: string): Promise<TeamMembershipWithUser[]> {
    await requireTeamAdmin(this.supabase, teamId);

    const { data, error } = await this.supabase
      .from("team_memberships")
      .select("*, users:users(*), teams:teams(*)")
      .eq("team_id", teamId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return data as unknown as TeamMembershipWithUser[];
  }

  /**
   * 承認待ちのメンバーシップ数を取得（管理者のみ）
   */
  async countPending(teamId: string): Promise<number> {
    await requireTeamAdmin(this.supabase, teamId);

    const { count, error } = await this.supabase
      .from("team_memberships")
      .select("*", { count: "exact", head: true })
      .eq("team_id", teamId)
      .eq("status", "pending");

    if (error) throw error;
    return count || 0;
  }

  /**
   * メンバーシップを承認
   */
  async approve(membershipId: string): Promise<TeamMembership> {
    // メンバーシップを取得してチームIDを確認
    const { data: membership, error: fetchError } = await this.supabase
      .from("team_memberships")
      .select("id, team_id, status")
      .eq("id", membershipId)
      .single();

    if (fetchError) throw fetchError;
    if (!membership) throw new Error("メンバーシップが見つかりません");
    if (membership.status !== "pending") {
      throw new Error("承認待ちのメンバーシップのみ承認できます");
    }

    // 管理者権限チェック
    await requireTeamAdmin(this.supabase, membership.team_id);

    // 承認
    const { data: updated, error } = await this.supabase
      .from("team_memberships")
      .update({
        status: "approved",
        is_active: true,
        joined_at: new Date().toISOString(),
        left_at: null,
      })
      .eq("id", membershipId)
      .select("*")
      .single();

    if (error) throw error;
    return updated as TeamMembership;
  }

  /**
   * メンバーシップを拒否
   */
  async reject(membershipId: string): Promise<TeamMembership> {
    // メンバーシップを取得してチームIDを確認
    const { data: membership, error: fetchError } = await this.supabase
      .from("team_memberships")
      .select("id, team_id, status")
      .eq("id", membershipId)
      .single();

    if (fetchError) throw fetchError;
    if (!membership) throw new Error("メンバーシップが見つかりません");
    if (membership.status !== "pending") {
      throw new Error("承認待ちのメンバーシップのみ拒否できます");
    }

    // 管理者権限チェック
    await requireTeamAdmin(this.supabase, membership.team_id);

    // 拒否
    const { data: updated, error } = await this.supabase
      .from("team_memberships")
      .update({
        status: "rejected",
        is_active: false,
      })
      .eq("id", membershipId)
      .select("*")
      .single();

    if (error) throw error;
    return updated as TeamMembership;
  }
}

export type { TeamMembership };
