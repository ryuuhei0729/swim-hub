export * from './announcements'
export * from './attendances'
export * from './core'
export * from './members'
export * from './practices'
export * from './records'

// 将来的に以下を追加
// export * from './core'
// export * from './members'
// export * from './practices'
// export * from './records'
// export * from './attendances'

// 任意: 互換Facade（旧 TeamAPI 呼び出しを段階移行するため）
import { SupabaseClient } from '@supabase/supabase-js'
import { EntryAPI } from '../entries'
import { TeamAnnouncementsAPI } from './announcements'
import { TeamCoreAPI } from './core'
import { TeamMembersAPI } from './members'
import { TeamPracticesAPI } from './practices'
import { TeamRecordsAPI } from './records'

export class TeamAPI {
  private core: TeamCoreAPI
  private members: TeamMembersAPI
  private announcements: TeamAnnouncementsAPI
  private practices: TeamPracticesAPI
  private records: TeamRecordsAPI
  private entries: EntryAPI

  constructor(private supabase: SupabaseClient) {
    this.core = new TeamCoreAPI(supabase)
    this.members = new TeamMembersAPI(supabase)
    this.announcements = new TeamAnnouncementsAPI(supabase)
    this.practices = new TeamPracticesAPI(supabase)
    this.records = new TeamRecordsAPI(supabase)
    this.entries = new EntryAPI(supabase)
  }

  // --- core ---
  getMyTeams() { return this.core.getMyTeams() }
  getTeam(teamId: string) { return this.core.getTeam(teamId) }
  createTeam(input: any) { return this.core.createTeam(input) }
  updateTeam(id: string, updates: any) { return this.core.updateTeam(id, updates) }
  deleteTeam(id: string) { return this.core.deleteTeam(id) }

  // --- members ---
  getTeamMembers(teamId: string) { return this.members.list(teamId) as any }
  joinTeam(inviteCode: string) { return this.members.join(inviteCode) }
  leaveTeam(teamId: string) { return this.members.leave(teamId) }
  updateMemberRole(teamId: string, userId: string, role: 'admin'|'user') { return this.members.updateRole(teamId, userId, role) }
  removeMember(teamId: string, userId: string) { return this.members.remove(teamId, userId) }

  // --- announcements ---
  getTeamAnnouncements(teamId: string) { return this.announcements.list(teamId) }
  createAnnouncement(announcement: any) { return this.announcements.create(announcement) }
  updateAnnouncement(id: string, updates: any) { return this.announcements.update(id, updates) }
  deleteAnnouncement(id: string) { return this.announcements.remove(id) }

  // --- practices ---
  getTeamPractices(teamId: string) { return this.practices.list(teamId) }
  async createTeamPractice(teamId: string, practiceData: { date: string; place?: string | null; note?: string | null }) {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')
    return this.practices.create({
      user_id: user.id,
      team_id: teamId,
      date: practiceData.date,
      place: practiceData.place ?? null,
      note: practiceData.note ?? null
    } as any).then(p => p.id)
  }

  // --- records (competitions) ---
  getOpenCompetitions = async (teamId: string) => {
    const { data, error } = await this.supabase
      .from('competitions')
      .select('*')
      .eq('team_id', teamId)
      .eq('entry_status', 'open')
      .order('date', { ascending: true })
    if (error) throw error
    return { competitions: data || [] }
  }
  async createTeamCompetition(teamId: string, competitionData: { title: string; date: string; place?: string | null; note?: string | null }) {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')
    const created = await this.records.create({
      user_id: user.id,
      team_id: teamId,
      title: competitionData.title,
      date: competitionData.date,
      place: competitionData.place ?? null,
      note: competitionData.note ?? null,
      pool_type: 0
    } as any)
    return created.id
  }

  // --- entries helpers for components ---
  getUserEntriesForCompetition = async (competitionId: string) => {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')
    const entries = await this.entries.getEntriesByCompetition(competitionId)
    return entries.filter((e: any) => e.user?.id === user.id)
  }

  // --- admin helpers ---
  async getAdminCount(teamId: string): Promise<number> {
    const { data, error } = await this.supabase
      .from('team_memberships')
      .select('id')
      .eq('team_id', teamId)
      .eq('role', 'admin')
      .eq('is_active', true)
    if (error) throw error
    return data.length
  }

  async isCurrentUserAdmin(teamId: string): Promise<boolean> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) return false
    const { data, error } = await this.supabase
      .from('team_memberships')
      .select('role')
      .eq('team_id', teamId)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single()
    if (error) return false
    return (data as any).role === 'admin'
  }

  async getTotalMemberCount(teamId: string): Promise<number> {
    const { data, error } = await this.supabase
      .from('team_memberships')
      .select('id')
      .eq('team_id', teamId)
      .eq('is_active', true)
    if (error) throw error
    return data.length
  }

  // --- competition entries management ---
  async updateCompetitionEntryStatus(competitionId: string, entryStatus: 'before' | 'open' | 'closed'): Promise<void> {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')
    const { data: competition, error: competitionError } = await this.supabase
      .from('competitions')
      .select('team_id')
      .eq('id', competitionId)
      .single()
    if (competitionError) throw competitionError
    if (!competition?.team_id) throw new Error('チーム大会ではありません')
    const { data: membership, error: membershipError } = await this.supabase
      .from('team_memberships')
      .select('role')
      .eq('team_id', competition.team_id)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single()
    if (membershipError) throw membershipError
    if ((membership as any).role !== 'admin') throw new Error('管理者権限が必要です')
    const { error } = await this.supabase
      .from('competitions')
      .update({ entry_status: entryStatus })
      .eq('id', competitionId)
    if (error) throw error
  }

  async getCompetitionEntries(competitionId: string) {
    const { data: { user } } = await this.supabase.auth.getUser()
    if (!user) throw new Error('認証が必要です')
    const { data: competition, error: competitionError } = await this.supabase
      .from('competitions')
      .select('team_id, title, date, place, entry_status')
      .eq('id', competitionId)
      .single()
    if (competitionError) throw competitionError
    if (!competition?.team_id) throw new Error('チーム大会ではありません')
    const { data: membership, error: membershipError } = await this.supabase
      .from('team_memberships')
      .select('role')
      .eq('team_id', competition.team_id)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single()
    if (membershipError) throw membershipError
    const { data: entries, error: entriesError } = await this.supabase
      .from('entries')
      .select(`
        id,
        user_id,
        style_id,
        entry_time,
        note,
        created_at,
        users!entries_user_id_fkey ( id, name ),
        styles ( id, name_jp, distance )
      `)
      .eq('competition_id', competitionId)
      .eq('team_id', competition.team_id)
      .order('style_id', { ascending: true })
      .order('entry_time', { ascending: true, nullsFirst: false })
    if (entriesError) throw entriesError
    const entriesByStyle = (entries || []).reduce((acc: any, entry: any) => {
      const styleId = entry.style_id
      if (!acc[styleId]) acc[styleId] = { style: entry.styles[0], entries: [] }
      acc[styleId].entries.push({
        id: entry.id,
        user: entry.users[0],
        entry_time: entry.entry_time,
        note: entry.note,
        created_at: entry.created_at
      })
      return acc
    }, {} as Record<number, any>)
    const totalEntries = (entries || []).length
    return {
      competition,
      isAdmin: (membership as any).role === 'admin',
      entriesByStyle,
      totalEntries
    }
  }

  // --- realtime (簡易互換) ---
  subscribeToAnnouncements(teamId: string, callback: (a: any) => void) {
    return this.supabase
      .channel(`team-announcements-${teamId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'announcements', filter: `team_id=eq.${teamId}`
      }, (payload) => { if (payload.new) callback(payload.new) })
      .subscribe()
  }

  subscribeToMembers(teamId: string, callback: (m: any) => void) {
    return this.supabase
      .channel(`team-members-${teamId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'team_memberships', filter: `team_id=eq.${teamId}`
      }, (payload) => { if (payload.new) callback(payload.new) })
      .subscribe()
  }
}


