// =============================================================================
// チーム関連型定義 - Swim Hub
// チーム、チームメンバーシップ、チームお知らせの型
// =============================================================================

import type { UserProfile } from './user'

// =============================================================================
// 1. 基本型定義
// =============================================================================

// チーム
export interface Team {
  id: string
  name: string
  description: string | null
  invite_code: string
  created_at: string
  updated_at: string
}

export type TeamInsert = Omit<Team, 'id' | 'invite_code' | 'created_at' | 'updated_at'>
export type TeamUpdate = Partial<TeamInsert>

// チームメンバーシップ
export interface TeamMembership {
  id: string
  team_id: string
  user_id: string
  role: 'admin' | 'user'
  member_type: 'swimmer' | 'coach' | 'director' | 'manager' | null
  group_name: string | null
  status: 'pending' | 'approved' | 'rejected'
  is_active: boolean
  joined_at: string
  left_at: string | null
  created_at: string
  updated_at: string
}

export type TeamMembershipInsert = Omit<TeamMembership, 'id' | 'created_at' | 'updated_at'>
export type TeamMembershipUpdate = Partial<Omit<TeamMembershipInsert, 'team_id' | 'user_id'>>

// チームお知らせ
export interface TeamAnnouncement {
  id: string
  team_id: string
  title: string
  content: string
  created_by: string
  is_published: boolean
  start_at: string | null
  end_at: string | null
  created_at: string
  updated_at: string
}

export type TeamAnnouncementInsert = Omit<TeamAnnouncement, 'id' | 'created_at' | 'updated_at'>
export type TeamAnnouncementUpdate = Partial<Omit<TeamAnnouncementInsert, 'team_id' | 'created_by'>>

// フォーム用の型定義（camelCase）
export interface CreateTeamAnnouncementInput {
  teamId: string
  title: string
  content: string
  isPublished?: boolean
  publishedAt?: string | null
}

export interface UpdateTeamAnnouncementInput {
  id: string
  title?: string
  content?: string
  isPublished?: boolean
  publishedAt?: string | null
}

// =============================================================================
// 2. リレーション付き型定義（JOIN結果）
// =============================================================================

// チーム with メンバー
export interface TeamWithMembers extends Team {
  team_memberships: (TeamMembership & {
    user: UserProfile
  })[]
}

// チームメンバーシップ with ユーザー
export interface TeamMembershipWithUser extends TeamMembership {
  users: UserProfile
  teams: Team
}
