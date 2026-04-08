// =============================================================================
// チーム関連型定義 - Swim Hub
// チーム、チームメンバーシップ、チームお知らせの型
// =============================================================================

import type { UserProfile } from "./user";

// =============================================================================
// 1. 基本型定義
// =============================================================================

// チーム
export interface Team {
  id: string;
  name: string;
  description: string | null;
  invite_code: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export type TeamInsert = Omit<Team, "id" | "invite_code" | "created_at" | "updated_at">;
export type TeamUpdate = Partial<TeamInsert>;

// チームメンバーシップ
export interface TeamMembership {
  id: string;
  team_id: string;
  user_id: string;
  role: string;
  status: "pending" | "approved" | "rejected";
  is_active: boolean | null;
  joined_at: string | null;
  left_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export type TeamMembershipInsert = Omit<TeamMembership, "id" | "created_at" | "updated_at">;
export type TeamMembershipUpdate = Partial<Omit<TeamMembershipInsert, "team_id" | "user_id">>;

// チームグループ
export interface TeamGroup {
  id: string;
  team_id: string;
  category?: string | null;
  description: string | null;
  name: string;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export type TeamGroupInsert = Omit<TeamGroup, "id" | "created_at" | "updated_at">;
export type TeamGroupUpdate = Partial<Omit<TeamGroupInsert, "team_id" | "created_by">>;

// チームグループメンバーシップ（グループ↔ユーザーの多対多）
export interface TeamGroupMembership {
  id: string;
  team_group_id: string;
  user_id: string;
  assigned_by: string;
  assigned_at: string;
  created_at: string;
}

export type TeamGroupMembershipInsert = Omit<TeamGroupMembership, "id" | "created_at">;

// チームお知らせ
export interface TeamAnnouncement {
  id: string;
  team_id: string;
  title: string;
  content: string;
  created_by: string | null;
  is_published: boolean | null;
  start_at: string | null;
  end_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export type TeamAnnouncementInsert = Omit<TeamAnnouncement, "id" | "created_at" | "updated_at">;
export type TeamAnnouncementUpdate = Partial<
  Omit<TeamAnnouncementInsert, "team_id" | "created_by">
>;

// フォーム用の型定義（camelCase）
export interface CreateTeamAnnouncementInput {
  teamId: string;
  title: string;
  content: string;
  isPublished?: boolean;
  publishedAt?: string | null;
}

export interface UpdateTeamAnnouncementInput {
  id: string;
  title?: string;
  content?: string;
  isPublished?: boolean;
  publishedAt?: string | null;
}

// =============================================================================
// 2. リレーション付き型定義（JOIN結果）
// =============================================================================

// チーム with メンバー
export interface TeamWithMembers extends Team {
  team_memberships: (TeamMembership & {
    user: UserProfile;
  })[];
}

// チームメンバーシップ with ユーザー
export interface TeamMembershipWithUser extends TeamMembership {
  users: UserProfile;
  teams: Team;
}
