// =============================================================================
// 出欠管理API - Swim Hub共通パッケージ
// Web/Mobile共通で使用するSupabase API関数
// =============================================================================

import { SupabaseClient } from '@supabase/supabase-js'
import {
  AttendanceStatus,
  TeamAttendance,
  TeamAttendanceInsert,
  TeamAttendanceUpdate,
  TeamAttendanceWithDetails
} from '../types/database'

export class AttendanceAPI {
  constructor(private supabase: SupabaseClient) {}

  // =========================================================================
  // 出欠管理の操作
  // =========================================================================

  /**
   * 練習の出欠一覧取得
   */
  async getAttendanceByPractice(practiceId: string): Promise<TeamAttendanceWithDetails[]> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    // practiceに紐づくteam_idを取得
    const { data: practiceData } = await this.supabase
      .from('practices')
      .select('team_id')
      .eq('id', practiceId)
      .single()

    if (!practiceData || !practiceData.team_id) {
      throw new Error('チーム練習ではありません')
    }

    // チームメンバーシップ確認
    const { data: membership } = await this.supabase
      .from('team_memberships')
      .select('id')
      .eq('team_id', practiceData.team_id)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single()

    if (!membership) {
      throw new Error('チームへのアクセス権限がありません')
    }

    const { data, error } = await this.supabase
      .from('team_attendance')
      .select(`
        *,
        user:users(*),
        practice:practices(*)
      `)
      .eq('practice_id', practiceId)
      .order('created_at', { ascending: true })

    if (error) throw error

    // team_idを追加
    return (data as TeamAttendanceWithDetails[]).map(item => ({
      ...item,
      team_id: practiceData.team_id
    }))
  }

  /**
   * 大会の出欠一覧取得
   */
  async getAttendanceByCompetition(competitionId: string): Promise<TeamAttendanceWithDetails[]> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    // competitionに紐づくteam_idを取得
    const { data: competitionData } = await this.supabase
      .from('competitions')
      .select('team_id')
      .eq('id', competitionId)
      .single()

    if (!competitionData || !competitionData.team_id) {
      throw new Error('チーム大会ではありません')
    }

    // チームメンバーシップ確認
    const { data: membership } = await this.supabase
      .from('team_memberships')
      .select('id')
      .eq('team_id', competitionData.team_id)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single()

    if (!membership) {
      throw new Error('チームへのアクセス権限がありません')
    }

    const { data, error } = await this.supabase
      .from('team_attendance')
      .select(`
        *,
        user:users(*),
        competition:competitions(*)
      `)
      .eq('competition_id', competitionId)
      .order('created_at', { ascending: true })

    if (error) throw error

    // team_idを追加
    return (data as TeamAttendanceWithDetails[]).map(item => ({
      ...item,
      team_id: competitionData.team_id
    }))
  }

  /**
   * 自分の出欠情報を更新
   */
  async updateMyAttendance(
    attendanceId: string, 
    updates: TeamAttendanceUpdate
  ): Promise<TeamAttendance> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    // 自分の出欠情報か確認
    const { data: existingAttendance } = await this.supabase
      .from('team_attendance')
      .select('user_id, practice_id, competition_id')
      .eq('id', attendanceId)
      .single()

    if (!existingAttendance || existingAttendance.user_id !== user.id) {
      throw new Error('自分の出欠情報のみ更新可能です')
    }

    // 出欠提出期間かチェック
    const canSubmit = await this.canSubmitAttendance(
      existingAttendance.practice_id,
      existingAttendance.competition_id
    )

    if (!canSubmit) {
      throw new Error('出欠提出期間外です')
    }

    const { data, error } = await this.supabase
      .from('team_attendance')
      .update(updates)
      .eq('id', attendanceId)
      .select()
      .single()

    if (error) throw error
    return data as TeamAttendance
  }

  /**
   * 出欠情報を作成（管理者用）
   */
  async createAttendance(attendance: TeamAttendanceInsert): Promise<TeamAttendance> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    // team_idを取得して管理者権限確認
    const teamId = await this.getTeamIdForAttendance(attendance)
    
    if (!teamId) {
      throw new Error('チーム情報が見つかりません')
    }

    // 管理者権限確認
    const { data: membership } = await this.supabase
      .from('team_memberships')
      .select('role')
      .eq('team_id', teamId)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .eq('role', 'admin')
      .single()

    if (!membership) {
      throw new Error('管理者権限が必要です')
    }

    const { data, error } = await this.supabase
      .from('team_attendance')
      .insert(attendance)
      .select()
      .single()

    if (error) throw error
    return data as TeamAttendance
  }

  /**
   * 出欠情報を更新（管理者用）
   */
  async updateAttendance(
    attendanceId: string, 
    updates: TeamAttendanceUpdate
  ): Promise<TeamAttendance> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    // 出欠情報に紐づくteam_idを取得
    const { data: attendance } = await this.supabase
      .from('team_attendance')
      .select('practice_id, competition_id')
      .eq('id', attendanceId)
      .single()

    if (!attendance) {
      throw new Error('出欠情報が見つかりません')
    }

    const teamId = attendance.practice_id
      ? await this.getTeamIdFromPractice(attendance.practice_id)
      : await this.getTeamIdFromCompetition(attendance.competition_id!)

    if (!teamId) {
      throw new Error('チーム情報が見つかりません')
    }

    // 管理者権限確認
    const { data: membership } = await this.supabase
      .from('team_memberships')
      .select('role')
      .eq('team_id', teamId)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .eq('role', 'admin')
      .single()

    if (!membership) {
      throw new Error('管理者権限が必要です')
    }

    const { data, error } = await this.supabase
      .from('team_attendance')
      .update(updates)
      .eq('id', attendanceId)
      .select()
      .single()

    if (error) throw error
    return data as TeamAttendance
  }

  // =========================================================================
  // ヘルパー関数
  // =========================================================================

  /**
   * 出欠情報からteam_idを取得
   */
  private async getTeamIdForAttendance(
    attendance: TeamAttendanceInsert
  ): Promise<string | null> {
    if (attendance.practice_id) {
      return this.getTeamIdFromPractice(attendance.practice_id)
    } else if (attendance.competition_id) {
      return this.getTeamIdFromCompetition(attendance.competition_id)
    }
    return null
  }

  /**
   * practiceからteam_idを取得
   */
  private async getTeamIdFromPractice(practiceId: string): Promise<string | null> {
    const { data } = await this.supabase
      .from('practices')
      .select('team_id')
      .eq('id', practiceId)
      .single()

    return data?.team_id || null
  }

  /**
   * competitionからteam_idを取得
   */
  private async getTeamIdFromCompetition(competitionId: string): Promise<string | null> {
    const { data } = await this.supabase
      .from('competitions')
      .select('team_id')
      .eq('id', competitionId)
      .single()

    return data?.team_id || null
  }

  /**
   * 出欠ステータスの日本語ラベル取得
   */
  getStatusLabel(status: AttendanceStatus | null): string {
    switch (status) {
      case 'present':
        return '出席'
      case 'absent':
        return '欠席'
      case 'other':
        return 'その他'
      case null:
      default:
        return '未回答'
    }
  }

  /**
   * 出欠ステータスの選択肢
   */
  getStatusOptions() {
    return [
      { value: null, label: '未回答' },
      { value: 'present', label: '出席' },
      { value: 'absent', label: '欠席' },
      { value: 'other', label: 'その他' }
    ] as const
  }

  /**
   * 出欠提出可能かチェック
   * attendance_statusが'open'かつ未来の日付の場合のみtrueを返す
   */
  async canSubmitAttendance(
    practiceId: string | null,
    competitionId: string | null
  ): Promise<boolean> {
    let eventDate: string | null = null
    let attendanceStatus: 'open' | 'closed' | null = null

    if (practiceId) {
      const { data } = await this.supabase
        .from('practices')
        .select('attendance_status, date')
        .eq('id', practiceId)
        .single()

      eventDate = data?.date || null
      attendanceStatus = data?.attendance_status || null
    } else if (competitionId) {
      const { data } = await this.supabase
        .from('competitions')
        .select('attendance_status, date')
        .eq('id', competitionId)
        .single()

      eventDate = data?.date || null
      attendanceStatus = data?.attendance_status || null
    }

    // attendance_statusが'open'でない場合は提出不可
    if (attendanceStatus !== 'open') {
      return false
    }

    // 過去の日付の場合は提出不可（自動的に締切扱い）
    if (eventDate) {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const eventDateObj = new Date(eventDate)
      eventDateObj.setHours(0, 0, 0, 0)

      // 過去の日付の場合は自動的に締切扱い
      if (eventDateObj < today) {
        return false
      }
    }

    return true
  }

  /**
   * 出欠提出ステータスのラベル取得
   */
  getAttendanceStatusLabel(status: 'open' | 'closed' | null): string {
    switch (status) {
      case 'open':
        return '提出受付中'
      case 'closed':
        return '提出締切'
      default:
        return '未設定'
    }
  }
}
