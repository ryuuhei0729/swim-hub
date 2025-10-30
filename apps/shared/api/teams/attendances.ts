// =============================================================================
// チームAPI - attendances（出欠に関するCRUD）
// =============================================================================

import { SupabaseClient } from '@supabase/supabase-js'
import { TeamAttendance, TeamAttendanceInsert, TeamAttendanceUpdate, TeamAttendanceWithDetails } from '../../types/database'

export class TeamAttendancesAPI {
  constructor(private supabase: SupabaseClient) {}

  async listByTeam(teamId: string): Promise<TeamAttendanceWithDetails[]> {
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
    const { data: practiceAttendance, error: aErr1 } = await this.supabase
      .from('team_attendance')
      .select('*, user:users(*), practice:practices(*), competition:competitions(*)')
      .in('practice_id', practiceIds.length ? practiceIds : [''])
    if (aErr1) throw aErr1

    // 4) 大会の出欠
    const { data: competitionAttendance, error: aErr2 } = await this.supabase
      .from('team_attendance')
      .select('*, user:users(*), practice:practices(*), competition:competitions(*)')
      .in('competition_id', competitionIds.length ? competitionIds : [''])
    if (aErr2) throw aErr2

    const merged = [
      ...(practiceAttendance ?? []),
      ...(competitionAttendance ?? [])
    ] as unknown as TeamAttendanceWithDetails[]

    return merged
  }

  async listByPractice(practiceId: string): Promise<TeamAttendanceWithDetails[]> {
    const { data, error } = await this.supabase
      .from('team_attendance')
      .select('*, user:users(*), practice:practices(*), competition:competitions(*)')
      .eq('practice_id', practiceId)
    if (error) throw error
    return data as unknown as TeamAttendanceWithDetails[]
  }

  async listByCompetition(competitionId: string): Promise<TeamAttendanceWithDetails[]> {
    const { data, error } = await this.supabase
      .from('team_attendance')
      .select('*, user:users(*), practice:practices(*), competition:competitions(*)')
      .eq('competition_id', competitionId)
    if (error) throw error
    return data as unknown as TeamAttendanceWithDetails[]
  }

  async upsert(input: TeamAttendanceInsert): Promise<TeamAttendance> {
    const { data, error } = await this.supabase
      .from('team_attendance')
      .upsert(input as any)
      .select('*')
      .single()
    if (error) throw error
    return data as TeamAttendance
  }

  async update(id: string, updates: TeamAttendanceUpdate): Promise<TeamAttendance> {
    const { data, error } = await this.supabase
      .from('team_attendance')
      .update(updates as any)
      .eq('id', id)
      .select('*')
      .single()
    if (error) throw error
    return data as TeamAttendance
  }
}

export type { TeamAttendance, TeamAttendanceInsert, TeamAttendanceUpdate, TeamAttendanceWithDetails }


