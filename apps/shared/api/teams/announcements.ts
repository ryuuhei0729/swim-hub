// =============================================================================
// チームお知らせAPI - announcements
// =============================================================================

import { SupabaseClient } from '@supabase/supabase-js'
import { TeamAnnouncement, TeamAnnouncementInsert, TeamAnnouncementUpdate } from '../../types/database'

export class TeamAnnouncementsAPI {
  constructor(private supabase: SupabaseClient) {}

  async list(teamId: string): Promise<TeamAnnouncement[]> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    // チームメンバーシップ確認
    const { data: membership } = await this.supabase
      .from('team_memberships')
      .select('id')
      .eq('team_id', teamId)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single()

    if (!membership) throw new Error('チームへのアクセス権限がありません')

    const { data, error } = await this.supabase
      .from('announcements')
      .select('*')
      .eq('team_id', teamId)
      .order('created_at', { ascending: false })

    if (error) throw error
    return data as TeamAnnouncement[]
  }

  async create(input: TeamAnnouncementInsert): Promise<TeamAnnouncement> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    // 作成は管理者のみ（ポリシーで縛っている前提だが明示チェック）
    const { data: membership } = await this.supabase
      .from('team_memberships')
      .select('role')
      .eq('team_id', input.team_id)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single()

    if (!membership || membership.role !== 'admin') {
      throw new Error('お知らせの作成権限がありません')
    }

    const { data, error } = await this.supabase
      .from('announcements')
      .insert({ ...input, created_by: user.id })
      .select('*')
      .single()

    if (error) throw error
    return data as TeamAnnouncement
  }

  async update(id: string, input: TeamAnnouncementUpdate): Promise<TeamAnnouncement> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    // 更新は管理者のみ
    // 対象のannouncementからteam_idを取得してロール確認
    const { data: target } = await this.supabase
      .from('announcements')
      .select('team_id')
      .eq('id', id)
      .single()

    if (!target) throw new Error('お知らせが見つかりません')

    const { data: membership } = await this.supabase
      .from('team_memberships')
      .select('role')
      .eq('team_id', target.team_id)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single()

    if (!membership || membership.role !== 'admin') {
      throw new Error('お知らせの更新権限がありません')
    }

    const { data, error } = await this.supabase
      .from('announcements')
      .update(input)
      .eq('id', id)
      .select('*')
      .single()

    if (error) throw error
    return data as TeamAnnouncement
  }

  async remove(id: string): Promise<void> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    const { data: target } = await this.supabase
      .from('announcements')
      .select('team_id')
      .eq('id', id)
      .single()

    if (!target) throw new Error('お知らせが見つかりません')

    const { data: membership } = await this.supabase
      .from('team_memberships')
      .select('role')
      .eq('team_id', target.team_id)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single()

    if (!membership || membership.role !== 'admin') {
      throw new Error('お知らせの削除権限がありません')
    }

    const { error } = await this.supabase
      .from('announcements')
      .delete()
      .eq('id', id)

    if (error) throw error
  }
}

export type { TeamAnnouncement, TeamAnnouncementInsert, TeamAnnouncementUpdate }


