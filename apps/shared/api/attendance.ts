// =============================================================================
// 出欠管理API - Swim Hub共通パッケージ
// Web/Mobile共通で使用するSupabase API関数
// =============================================================================

import { SupabaseClient } from '@supabase/supabase-js'
import { format } from 'date-fns'
import {
  AttendanceStatus,
  TeamAttendance,
  TeamAttendanceInsert,
  TeamAttendanceUpdate,
  TeamAttendanceWithDetails
} from '../types/database'
import { getMonthDateRange } from '../utils/date'

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
   * 自分の月別出欠情報を取得
   */
  async getMyAttendancesByMonth(
    teamId: string,
    year: number,
    month: number
  ): Promise<TeamAttendanceWithDetails[]> {
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

    if (!membership) {
      throw new Error('チームへのアクセス権限がありません')
    }

    // 月の開始日と終了日を計算
    const [startDateStr, endDateStr] = getMonthDateRange(year, month)

    // 指定月の練習IDを取得
    const { data: practices, error: practicesError } = await this.supabase
      .from('practices')
      .select('id')
      .eq('team_id', teamId)
      .gte('date', startDateStr)
      .lte('date', endDateStr)

    if (practicesError) throw practicesError

    // 指定月の大会IDを取得
    const { data: competitions, error: competitionsError } = await this.supabase
      .from('competitions')
      .select('id')
      .eq('team_id', teamId)
      .gte('date', startDateStr)
      .lte('date', endDateStr)

    if (competitionsError) throw competitionsError

    const practiceIds = (practices || []).map(p => p.id)
    const competitionIds = (competitions || []).map(c => c.id)

    // 練習の出欠情報を取得
    const { data: practiceAttendances, error: practiceError } = practiceIds.length > 0
      ? await this.supabase
          .from('team_attendance')
          .select(`
            *,
            user:users(*),
            practice:practices(*)
          `)
          .eq('user_id', user.id)
          .in('practice_id', practiceIds)
      : { data: [], error: null }

    if (practiceError) throw practiceError

    // 大会の出欠情報を取得
    const { data: competitionAttendances, error: competitionError } = competitionIds.length > 0
      ? await this.supabase
          .from('team_attendance')
          .select(`
            *,
            user:users(*),
            competition:competitions(*)
          `)
          .eq('user_id', user.id)
          .in('competition_id', competitionIds)
      : { data: [], error: null }

    if (competitionError) throw competitionError

    // 練習と大会の出欠情報を統合
    const allAttendances = [
      ...(practiceAttendances || []),
      ...(competitionAttendances || [])
    ] as TeamAttendanceWithDetails[]

    // team_idを追加して返す
    return allAttendances.map(item => ({
      ...item,
      team_id: teamId
    }))
  }

  /**
   * 自分の出欠情報を一括更新
   */
  async bulkUpdateMyAttendances(
    updates: Array<{
      attendanceId: string
      status: AttendanceStatus | null
      note: string | null
    }>
  ): Promise<TeamAttendance[]> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')

    if (updates.length === 0) {
      return []
    }

    // 重複したattendanceIdを除去し、最後の更新を使用するマップを作成
    const updateMap = new Map<string, { status: AttendanceStatus | null; note: string | null }>()
    for (const update of updates) {
      updateMap.set(update.attendanceId, {
        status: update.status,
        note: update.note
      })
    }

    // 重複除去したattendanceIdsを取得
    const attendanceIds = Array.from(new Set(updates.map(u => u.attendanceId)))

    // 全ての出欠情報が自分のものか確認
    const { data: existingAttendances, error: checkError } = await this.supabase
      .from('team_attendance')
      .select('id, user_id, practice_id, competition_id')
      .in('id', attendanceIds)

    if (checkError) throw checkError

    if (!existingAttendances || existingAttendances.length !== attendanceIds.length) {
      throw new Error('一部の出欠情報が見つかりません')
    }

    // 全て自分の出欠情報か確認
    const allOwned = existingAttendances.every(a => a.user_id === user.id)
    if (!allOwned) {
      throw new Error('自分の出欠情報のみ更新可能です')
    }

    // 各出欠情報について、提出期限チェックとclose後の編集日時追加処理を行う
    const updatePromises = Array.from(updateMap.entries()).map(async ([attendanceId, update]) => {
      const existing = existingAttendances.find(a => a.id === attendanceId)
      if (!existing) {
        throw new Error(`出欠情報 ${attendanceId} が見つかりません`)
      }

      // 提出期限チェック
      const canSubmit = await this.canSubmitAttendance(
        existing.practice_id,
        existing.competition_id
      )

      if (!canSubmit) {
        throw new Error('出欠提出期間外です')
      }

      // イベントがclosedかチェック
      const isClosed = await this.isEventClosed(
        existing.practice_id,
        existing.competition_id
      )

      let finalNote = update.note
      if (isClosed && update.note) {
        // close後の編集の場合、編集日時を追加
        finalNote = this.addEditMark(update.note)
      }

      const { data, error } = await this.supabase
        .from('team_attendance')
        .update({
          status: update.status,
          note: finalNote
        })
        .eq('id', attendanceId)
        .select()
        .single()

      if (error) throw error
      return data as TeamAttendance
    })

    return Promise.all(updatePromises)
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

    // 提出期間外の場合は更新不可
    if (!canSubmit) {
      throw new Error('出欠提出期間外です')
    }

    // close後の編集かチェック
    const isClosed = await this.isEventClosed(
      existingAttendance.practice_id,
      existingAttendance.competition_id
    )

    let finalUpdates = { ...updates }
    
    // close後の編集の場合、noteに編集日時を追加
    if (isClosed && updates.note) {
      finalUpdates.note = this.addEditMark(updates.note)
    }
    const { data, error } = await this.supabase
      .from('team_attendance')
      .update(finalUpdates)
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
   * 編集済みマークを追加
   */
  private addEditMark(note: string): string {
    const now = new Date()
    const editMark = ` (${format(now, 'yyyy/MM/dd HH:mm')} 編集済)`
    const cleanedNote = note.replace(/\s*\(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}\s+編集済\)\s*$/, '')
    return cleanedNote + editMark
  }

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
   * イベントがclosed状態かチェック
   */
  private async isEventClosed(
    practiceId: string | null,
    competitionId: string | null
  ): Promise<boolean> {
    let attendanceStatus: 'open' | 'closed' | null = null

    if (practiceId) {
      const { data, error } = await this.supabase
        .from('practices')
        .select('attendance_status')
        .eq('id', practiceId)
        .single()

      if (error) throw error
      attendanceStatus = data?.attendance_status ?? null
    } else if (competitionId) {
      const { data, error } = await this.supabase
        .from('competitions')
        .select('attendance_status')
        .eq('id', competitionId)
        .single()

      if (error) throw error
      attendanceStatus = data?.attendance_status ?? null
    }

    return attendanceStatus === 'closed'
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
      const { data, error } = await this.supabase
        .from('practices')
        .select('attendance_status, date')
        .eq('id', practiceId)
        .single()

      if (error) throw error
      eventDate = data?.date ?? null
      attendanceStatus = data?.attendance_status ?? null
    } else if (competitionId) {
      const { data, error } = await this.supabase
        .from('competitions')
        .select('attendance_status, date')
        .eq('id', competitionId)
        .single()

      if (error) throw error
      eventDate = data?.date ?? null
      attendanceStatus = data?.attendance_status ?? null
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
