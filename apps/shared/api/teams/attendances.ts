// =============================================================================
// チームAPI - attendances（出欠に関するCRUD）
// =============================================================================

import { SupabaseClient } from '@supabase/supabase-js'
import { TeamAttendance, TeamAttendanceInsert, TeamAttendanceUpdate, TeamAttendanceWithDetails, AttendanceStatusType } from '../../types'
import { requireAuth, requireTeamMembership, requireTeamAdmin } from '../auth-utils'

export class TeamAttendancesAPI {
  constructor(private supabase: SupabaseClient) {}

  async listByTeam(teamId: string): Promise<TeamAttendanceWithDetails[]> {
    const userId = await requireAuth(this.supabase)
    await requireTeamMembership(this.supabase, teamId, userId)

    // 練習と大会の出欠を並列取得
    const [practiceResult, competitionResult] = await Promise.all([
      this.supabase
        .from('team_attendance')
        .select('*, user:users(*), practice:practices!inner(*), competition:competitions(*)')
        .eq('practice.team_id', teamId),
      this.supabase
        .from('team_attendance')
        .select('*, user:users(*), practice:practices(*), competition:competitions!inner(*)')
        .eq('competition.team_id', teamId),
    ])
    if (practiceResult.error) throw practiceResult.error
    if (competitionResult.error) throw competitionResult.error

    // マージして返す
    return [
      ...((practiceResult.data ?? []) as TeamAttendanceWithDetails[]),
      ...((competitionResult.data ?? []) as TeamAttendanceWithDetails[])
    ]
  }

  async listByPractice(practiceId: string): Promise<TeamAttendanceWithDetails[]> {
    const userId = await requireAuth(this.supabase)
    // practice から team_id を特定しメンバーシップを確認
    const { data: practice, error: pErr } = await this.supabase
      .from('practices')
      .select('team_id')
      .eq('id', practiceId)
      .single()
    if (pErr) throw pErr
    if (!practice?.team_id) throw new Error('チーム練習ではありません')
    await requireTeamMembership(this.supabase, practice.team_id, userId)

    const { data, error } = await this.supabase
      .from('team_attendance')
      .select('*, user:users(*), practice:practices(*), competition:competitions(*)')
      .eq('practice_id', practiceId)
    if (error) throw error
    return data as unknown as TeamAttendanceWithDetails[]
  }

  async listByCompetition(competitionId: string): Promise<TeamAttendanceWithDetails[]> {
    const userId = await requireAuth(this.supabase)
    // competition から team_id を特定しメンバーシップを確認
    const { data: competition, error: cErr } = await this.supabase
      .from('competitions')
      .select('team_id')
      .eq('id', competitionId)
      .single()
    if (cErr) throw cErr
    if (!competition?.team_id) throw new Error('チーム大会ではありません')
    await requireTeamMembership(this.supabase, competition.team_id, userId)

    const { data, error } = await this.supabase
      .from('team_attendance')
      .select('*, user:users(*), practice:practices(*), competition:competitions(*)')
      .eq('competition_id', competitionId)
    if (error) throw error
    return data as unknown as TeamAttendanceWithDetails[]
  }

  async upsert(input: TeamAttendanceInsert): Promise<TeamAttendance> {
    const userId = await requireAuth(this.supabase)
    // 対象team_idを特定してメンバーシップ確認
    let teamId: string | null = null
    if (input.practice_id) {
      const { data: practice, error: pErr } = await this.supabase
        .from('practices')
        .select('team_id')
        .eq('id', input.practice_id)
        .single()
      if (pErr) throw pErr
      teamId = practice?.team_id ?? null
    } else if (input.competition_id) {
      const { data: competition, error: cErr } = await this.supabase
        .from('competitions')
        .select('team_id')
        .eq('id', input.competition_id)
        .single()
      if (cErr) throw cErr
      teamId = competition?.team_id ?? null
    }
    if (!teamId) throw new Error('チーム対象が特定できません')
    await requireTeamMembership(this.supabase, teamId, userId)

    const { data, error } = await this.supabase
      .from('team_attendance')
      .upsert(input)
      .select('*')
      .single()
    if (error) throw error
    return data as TeamAttendance
  }

  async update(id: string, updates: TeamAttendanceUpdate): Promise<TeamAttendance> {
    const userId = await requireAuth(this.supabase)
    // 既存行から対象team_idを特定
    const { data: current, error: gErr } = await this.supabase
      .from('team_attendance')
      .select('practice_id, competition_id')
      .eq('id', id)
      .single()
    if (gErr) throw gErr

    let teamId: string | null = null
    if (current?.practice_id) {
      const { data: practice, error: pErr } = await this.supabase
        .from('practices')
        .select('team_id')
        .eq('id', current.practice_id)
        .single()
      if (pErr) throw pErr
      teamId = practice?.team_id ?? null
    } else if (current?.competition_id) {
      const { data: competition, error: cErr } = await this.supabase
        .from('competitions')
        .select('team_id')
        .eq('id', current.competition_id)
        .single()
      if (cErr) throw cErr
      teamId = competition?.team_id ?? null
    }
    if (!teamId) throw new Error('チーム対象が特定できません')
    await requireTeamMembership(this.supabase, teamId, userId)

    const { data, error } = await this.supabase
      .from('team_attendance')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single()
    if (error) throw error
    return data as TeamAttendance
  }

  /**
   * 練習の出欠提出ステータスを更新（管理者用）
   */
  async updatePracticeAttendanceStatus(
    practiceId: string,
    status: AttendanceStatusType | null
  ): Promise<void> {
    const userId = await requireAuth(this.supabase)
    
    // practiceからteam_idを取得
    const { data: practice, error: pErr } = await this.supabase
      .from('practices')
      .select('team_id')
      .eq('id', practiceId)
      .single()
    
    if (pErr) throw pErr
    if (!practice?.team_id) {
      throw new Error('チーム練習ではありません')
    }
    
    // 管理者権限確認
    await requireTeamAdmin(this.supabase, practice.team_id, userId)

    // attendance_statusを更新
    const { error } = await this.supabase
      .from('practices')
      .update({ attendance_status: status })
      .eq('id', practiceId)
    
    if (error) throw error
  }

  /**
   * 大会の出欠提出ステータスを更新（管理者用）
   */
  async updateCompetitionAttendanceStatus(
    competitionId: string,
    status: AttendanceStatusType | null
  ): Promise<void> {
    const userId = await requireAuth(this.supabase)
    
    // competitionからteam_idを取得
    const { data: competition, error: cErr } = await this.supabase
      .from('competitions')
      .select('team_id')
      .eq('id', competitionId)
      .single()
    
    if (cErr) throw cErr
    if (!competition?.team_id) {
      throw new Error('チーム大会ではありません')
    }
    
    // 管理者権限確認
    await requireTeamAdmin(this.supabase, competition.team_id, userId)

    // attendance_statusを更新
    const { error } = await this.supabase
      .from('competitions')
      .update({ attendance_status: status })
      .eq('id', competitionId)
    
    if (error) throw error
  }
}

export type { TeamAttendance, TeamAttendanceInsert, TeamAttendanceUpdate, TeamAttendanceWithDetails }


