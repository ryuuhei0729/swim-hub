// =============================================================================
// チームAPI - groups（グループCRUD/メンバー割り当て管理）
// =============================================================================

import { SupabaseClient } from "@supabase/supabase-js";
import { TeamGroup, TeamGroupInsert, TeamGroupUpdate, TeamGroupMembership } from "../../types";
import { requireAuth, requireTeamAdmin, requireTeamMembership } from "../auth-utils";

export class TeamGroupsAPI {
  constructor(private supabase: SupabaseClient) {}

  /**
   * グループ一覧取得（カテゴリ絞り込み可）
   */
  async list(teamId: string, category?: string): Promise<TeamGroup[]> {
    await requireTeamMembership(this.supabase, teamId);
    let query = this.supabase
      .from("team_groups")
      .select("*")
      .eq("team_id", teamId)
      .order("category")
      .order("name");
    if (category) {
      query = query.eq("category", category);
    }
    const { data, error } = await query;
    if (error) throw error;
    return data as TeamGroup[];
  }

  /**
   * グループ一覧＋メンバー数取得
   */
  async listWithMemberCount(teamId: string): Promise<(TeamGroup & { member_count: number })[]> {
    await requireTeamMembership(this.supabase, teamId);
    const { data, error } = await this.supabase
      .from("team_groups")
      .select("*, team_group_memberships(count)")
      .eq("team_id", teamId)
      .order("category")
      .order("name");
    if (error) throw error;
    return (data ?? []).map((g: Record<string, unknown>) => ({
      ...g,
      member_count: (g.team_group_memberships as { count: number }[])?.[0]?.count ?? 0,
    })) as (TeamGroup & { member_count: number })[];
  }

  /**
   * グループ作成
   */
  async create(input: TeamGroupInsert): Promise<TeamGroup> {
    const userId = await requireAuth(this.supabase);
    await requireTeamAdmin(this.supabase, input.team_id);
    const { data, error } = await this.supabase
      .from("team_groups")
      .insert({ ...input, created_by: userId })
      .select("*")
      .single();
    if (error) throw error;
    return data as TeamGroup;
  }

  /**
   * グループ編集
   */
  async update(id: string, input: TeamGroupUpdate): Promise<TeamGroup> {
    const { data: target, error: fetchError } = await this.supabase
      .from("team_groups")
      .select("team_id")
      .eq("id", id)
      .single();
    if (fetchError) throw fetchError;
    if (!target) throw new Error("グループが見つかりません");
    await requireTeamAdmin(this.supabase, target.team_id);

    const { data, error } = await this.supabase
      .from("team_groups")
      .update(input)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
    return data as TeamGroup;
  }

  /**
   * グループ削除（CASCADEでmembershipsも消える）
   */
  async remove(id: string): Promise<void> {
    const { data: target, error: fetchError } = await this.supabase
      .from("team_groups")
      .select("team_id")
      .eq("id", id)
      .single();
    if (fetchError) throw fetchError;
    if (!target) throw new Error("グループが見つかりません");
    await requireTeamAdmin(this.supabase, target.team_id);

    const { error } = await this.supabase.from("team_groups").delete().eq("id", id);
    if (error) throw error;
  }

  /**
   * グループのメンバー一覧取得（user情報付き）
   */
  async listGroupMembers(groupId: string): Promise<
    (TeamGroupMembership & {
      users: { id: string; name: string; profile_image_path: string | null };
    })[]
  > {
    const { data: target, error: fetchError } = await this.supabase
      .from("team_groups")
      .select("team_id")
      .eq("id", groupId)
      .single();
    if (fetchError) throw fetchError;
    if (!target) throw new Error("グループが見つかりません");
    await requireTeamMembership(this.supabase, target.team_id);

    const { data, error } = await this.supabase
      .from("team_group_memberships")
      .select("*, users:users!team_group_memberships_user_id_fkey(id, name, profile_image_path)")
      .eq("team_group_id", groupId)
      .order("assigned_at", { ascending: false });
    if (error) throw error;
    return data as unknown as (TeamGroupMembership & {
      users: { id: string; name: string; profile_image_path: string | null };
    })[];
  }

  /**
   * チーム全体のグループ割り当て一覧取得（フィルタ用）
   */
  async listAllMemberships(teamId: string): Promise<TeamGroupMembership[]> {
    await requireTeamMembership(this.supabase, teamId);
    const { data, error } = await this.supabase
      .from("team_group_memberships")
      .select("*, team_groups!inner(team_id)")
      .eq("team_groups.team_id", teamId);
    if (error) throw error;
    return (data ?? []).map((d: Record<string, unknown>) => {
      const { team_groups: _, ...rest } = d;
      return rest;
    }) as unknown as TeamGroupMembership[];
  }

  /**
   * グループのメンバーを一括設定（既存を全削除→新規挿入）
   */
  async setGroupMembers(groupId: string, userIds: string[]): Promise<void> {
    const userId = await requireAuth(this.supabase);

    const { data: target, error: fetchError } = await this.supabase
      .from("team_groups")
      .select("team_id")
      .eq("id", groupId)
      .single();
    if (fetchError) throw fetchError;
    if (!target) throw new Error("グループが見つかりません");
    await requireTeamAdmin(this.supabase, target.team_id, userId);

    // 既存メンバーを全削除
    const { error: delError } = await this.supabase
      .from("team_group_memberships")
      .delete()
      .eq("team_group_id", groupId);
    if (delError) throw delError;

    // 新規メンバーを挿入
    if (userIds.length > 0) {
      const inserts = userIds.map((uid) => ({
        team_group_id: groupId,
        user_id: uid,
        assigned_by: userId,
        assigned_at: new Date().toISOString().split("T")[0],
      }));
      const { error: insError } = await this.supabase
        .from("team_group_memberships")
        .insert(inserts);
      if (insError) throw insError;
    }
  }
}
