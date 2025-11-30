// =============================================================================
// チームお知らせAPI - announcements
// =============================================================================

import { SupabaseClient } from '@supabase/supabase-js'
import { TeamAnnouncement, TeamAnnouncementInsert, TeamAnnouncementUpdate } from '../../types/database'

export class TeamAnnouncementsAPI {
  constructor(private supabase: SupabaseClient) {}

  /**
   * start_at と end_at のバリデーション
   */
  private validateStartEndAt(startAt: string | null | undefined, endAt: string | null | undefined): void {
    const now = new Date()

    // end_at が現在時刻より前の場合はエラー
    if (endAt) {
      const endDate = new Date(endAt)
      if (endDate < now) {
        throw new Error('表示終了日時は現在時刻より後の日時を指定してください')
      }
    }

    // start_at と end_at の両方が設定されている場合、end_at >= start_at をチェック
    if (startAt && endAt) {
      const startDate = new Date(startAt)
      const endDate = new Date(endAt)
      if (endDate < startDate) {
        throw new Error('表示終了日時は表示開始日時より後の日時を指定してください')
      }
    }
  }

  async list(teamId: string, viewOnly: boolean = false): Promise<TeamAnnouncement[]> {
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

    let query = this.supabase
      .from('announcements')
      .select('*')
      .eq('team_id', teamId)

    // viewOnlyの場合は公開済み（is_published = true）のみを取得し、表示期間でフィルタリング
    // ダッシュボードなどでは下書き（is_published = false）は表示しない
    if (viewOnly) {
      query = query.eq('is_published', true)
    }

    const { data, error } = await query.order('created_at', { ascending: false })

    if (error) throw error

    // viewOnlyの場合は表示期間でフィルタリング（サーバー側で処理）
    if (viewOnly && data) {
      const now = new Date()
      return data.filter((announcement: TeamAnnouncement) => {
        // is_published = true は既にフィルタリング済み
        // start_at が NULL または start_at <= now
        const startAt = announcement.start_at ? new Date(announcement.start_at) : null
        const startValid = !startAt || startAt <= now

        // end_at が NULL または end_at >= now
        const endAt = announcement.end_at ? new Date(announcement.end_at) : null
        const endValid = !endAt || endAt >= now

        return startValid && endValid
      }) as TeamAnnouncement[]
    }

    return data as TeamAnnouncement[]
  }

  async create(input: TeamAnnouncementInsert): Promise<TeamAnnouncement> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    // バリデーション
    this.validateStartEndAt(input.start_at, input.end_at)

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

    // バリデーション（start_atまたはend_atが更新される場合）
    if (input.start_at !== undefined || input.end_at !== undefined) {
      // 既存データを取得してバリデーション用の値を確定
      const { data: existing } = await this.supabase
        .from('announcements')
        .select('start_at, end_at')
        .eq('id', id)
        .single()

      const startAt = input.start_at !== undefined ? input.start_at : existing?.start_at ?? null
      const endAt = input.end_at !== undefined ? input.end_at : existing?.end_at ?? null

      this.validateStartEndAt(startAt, endAt)
    }

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


