// =============================================================================
// チームAPI - attendances（出欠に関するCRUD）
// =============================================================================

import { SupabaseClient } from '@supabase/supabase-js'
import { TeamAttendance, TeamAttendanceInsert, TeamAttendanceUpdate, TeamAttendanceWithDetails } from '../../types/database'

export class TeamAttendancesAPI {
  constructor(private supabase: SupabaseClient) {}

  // 認証必須ガード
  private async requireAuth(): Promise<string> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')
    return user.id
  }

  // チームメンバーシップ必須ガード
  private async requireTeamMembership(teamId: string, userId?: string): Promise<void> {
    const uid = userId ?? (await this.requireAuth())
    const { data: membership } = await this.supabase
      .from('team_memberships')
      .select('id')
      .eq('team_id', teamId)
      .eq('user_id', uid)
      .eq('is_active', true)
      .single()
    if (!membership) throw new Error('チームへのアクセス権限がありません')
  }

  async listByTeam(teamId: string): Promise<TeamAttendanceWithDetails[]> {
    const userId = await this.requireAuth()
    await this.requireTeamMembership(teamId, userId)
    // 1) チームの練習ID一覧
    const { data: teamPractices, error: pErr } = await this.supabase
      .from('practices')
      .select('id')
      .eq('team_id', teamId)
    if (pErr) throw pErr

    const practiceIds = (teamPractices ?? []).map(p => p.id)

    // 2) チームの大会ID一覧
    const { data: teamCompetitions, error: cErr } = await this.supabase
      .from('competitions')
      .select('id')
      .eq('team_id', teamId)
    if (cErr) throw cErr

    const competitionIds = (teamCompetitions ?? []).map(c => c.id)

    // 3) 練習の出欠
    let practiceAttendance: TeamAttendanceWithDetails[] = []
    if (practiceIds.length > 0) {
      const { data, error } = await this.supabase
        .from('team_attendance')
        .select('*, user:users(*), practice:practices(*), competition:competitions(*)')
        .in('practice_id', practiceIds)
      if (error) throw error
      practiceAttendance = (data ?? []) as TeamAttendanceWithDetails[]
    }

    // 4) 大会の出欠
    let competitionAttendance: TeamAttendanceWithDetails[] = []
    if (competitionIds.length > 0) {
      const { data, error } = await this.supabase
        .from('team_attendance')
        .select('*, user:users(*), practice:practices(*), competition:competitions(*)')
        .in('competition_id', competitionIds)
      if (error) throw error
      competitionAttendance = (data ?? []) as TeamAttendanceWithDetails[]
    }

    const merged = [
      ...(practiceAttendance ?? []),
      ...(competitionAttendance ?? [])
    ] as unknown as TeamAttendanceWithDetails[]

    return merged
  }

  async listByPractice(practiceId: string): Promise<TeamAttendanceWithDetails[]> {
    const userId = await this.requireAuth()
    // practice から team_id を特定しメンバーシップを確認
    const { data: practice, error: pErr } = await this.supabase
      .from('practices')
      .select('team_id')
      .eq('id', practiceId)
      .single()
    if (pErr) throw pErr
    if (!practice?.team_id) throw new Error('チーム練習ではありません')
    await this.requireTeamMembership(practice.team_id, userId)

    const { data, error } = await this.supabase
      .from('team_attendance')
      .select('*, user:users(*), practice:practices(*), competition:competitions(*)')
      .eq('practice_id', practiceId)
    if (error) throw error
    return data as unknown as TeamAttendanceWithDetails[]
  }

  async listByCompetition(competitionId: string): Promise<TeamAttendanceWithDetails[]> {
    const userId = await this.requireAuth()
    // competition から team_id を特定しメンバーシップを確認
    const { data: competition, error: cErr } = await this.supabase
      .from('competitions')
      .select('team_id')
      .eq('id', competitionId)
      .single()
    if (cErr) throw cErr
    if (!competition?.team_id) throw new Error('チーム大会ではありません')
    await this.requireTeamMembership(competition.team_id, userId)

    const { data, error } = await this.supabase
      .from('team_attendance')
      .select('*, user:users(*), practice:practices(*), competition:competitions(*)')
      .eq('competition_id', competitionId)
    if (error) throw error
    return data as unknown as TeamAttendanceWithDetails[]
  }

  async upsert(input: TeamAttendanceInsert): Promise<TeamAttendance> {
    const userId = await this.requireAuth()
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
    await this.requireTeamMembership(teamId, userId)

    const { data, error } = await this.supabase
      .from('team_attendance')
      .upsert(input)
      .select('*')
      .single()
    if (error) throw error
    return data as TeamAttendance
  }

  async update(id: string, updates: TeamAttendanceUpdate): Promise<TeamAttendance> {
    const userId = await this.requireAuth()
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
    await this.requireTeamMembership(teamId, userId)

    const { data, error } = await this.supabase
      .from('team_attendance')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single()
    if (error) throw error
    return data as TeamAttendance
  }
}

export type { TeamAttendance, TeamAttendanceInsert, TeamAttendanceUpdate, TeamAttendanceWithDetails }


