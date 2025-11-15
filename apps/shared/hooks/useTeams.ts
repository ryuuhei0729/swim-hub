// =============================================================================
// チームフック - Swim Hub共通パッケージ
// Web/Mobile共通で使用するカスタムフック
// =============================================================================

import { SupabaseClient } from '@supabase/supabase-js'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { TeamAnnouncementsAPI, TeamCoreAPI, TeamMembersAPI } from '../api/teams'
import {
  Team,
  TeamAnnouncement,
  TeamAnnouncementInsert,
  TeamAnnouncementUpdate,
  TeamInsert,
  TeamMembershipWithUser,
  TeamUpdate,
  TeamWithMembers
} from '../types/database'

export interface UseTeamsOptions {
  teamId?: string
  enableRealtime?: boolean
  coreApi?: TeamCoreAPI
  membersApi?: TeamMembersAPI
  announcementsApi?: TeamAnnouncementsAPI
}

export function useTeams(
  supabase: SupabaseClient,
  options: UseTeamsOptions = {}
) {
  const {
    teamId,
    enableRealtime = true,
    coreApi: providedCoreApi,
    membersApi: providedMembersApi,
    announcementsApi: providedAnnouncementsApi,
  } = options
  
  const [teams, setTeams] = useState<TeamMembershipWithUser[]>([])
  const [currentTeam, setCurrentTeam] = useState<TeamWithMembers | null>(null)
  const [members, setMembers] = useState<TeamMembershipWithUser[]>([])
  const [announcements, setAnnouncements] = useState<TeamAnnouncement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const core = useMemo(
    () => providedCoreApi ?? new TeamCoreAPI(supabase),
    [providedCoreApi, supabase]
  )
  const membersApi = useMemo(
    () => providedMembersApi ?? new TeamMembersAPI(supabase),
    [providedMembersApi, supabase]
  )
  const announcementsApi = useMemo(
    () => providedAnnouncementsApi ?? new TeamAnnouncementsAPI(supabase),
    [providedAnnouncementsApi, supabase]
  )

  // データ取得関数
  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      // 自分のチーム一覧を取得
      const teamsData = await core.getMyTeams()
      setTeams(teamsData)

      // 特定のチームが指定されている場合
      if (teamId) {
        const [teamData, membersData, announcementsData] = await Promise.all([
          core.getTeam(teamId),
          membersApi.list(teamId),
          announcementsApi.list(teamId)
        ])

        setCurrentTeam(teamData)
        setMembers(membersData)
        setAnnouncements(announcementsData)
      }
    } catch (err) {
      console.error('チームデータの取得に失敗しました:', err)
      setError(err as Error)
    } finally {
      setLoading(false)
    }
  }, [teamId, core, membersApi, announcementsApi])

  // 初回データ取得
  useEffect(() => {
    loadData()
  }, [core, loadData])

  // リアルタイム購読（アナウンス/メンバー）
  useEffect(() => {
    if (!enableRealtime || !teamId) return

    const annCh = supabase
      .channel(`team-announcements-${teamId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'announcements', filter: `team_id=eq.${teamId}`
      }, () => { loadData() })
      .subscribe()

    const memCh = supabase
      .channel(`team-members-${teamId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'team_memberships', filter: `team_id=eq.${teamId}`
      }, () => { loadData() })
      .subscribe()

    return () => {
      supabase.removeChannel(annCh)
      supabase.removeChannel(memCh)
    }
  }, [enableRealtime, teamId, loadData, supabase])

  // 操作関数
  const createTeam = useCallback(async (team: TeamInsert) => {
    const newTeam: Team = await core.createTeam(team)
    await loadData()
    return newTeam
  }, [core, loadData])

  const updateTeam = useCallback(async (id: string, updates: TeamUpdate) => {
    const updated: Team = await core.updateTeam(id, updates)
    await loadData()
    return updated
  }, [core, loadData])

  const deleteTeam = useCallback(async (id: string) => {
    await core.deleteTeam(id)
    setTeams(prev => prev.filter((t) => t.teams.id !== id))
  }, [core])

  const joinTeam = useCallback(async (inviteCode: string) => {
    const membership = await membersApi.join(inviteCode)
    await loadData()
    return membership
  }, [membersApi, loadData])

  const leaveTeam = useCallback(async (id: string) => {
    await membersApi.leave(id)
    setTeams(prev => prev.filter((t) => t.teams.id !== id))
  }, [membersApi])

  const updateMemberRole = useCallback(async (
    teamId: string,
    userId: string,
    role: 'admin' | 'user'
  ) => {
    const updated = await membersApi.updateRole(teamId, userId, role)
    await loadData()
    return updated
  }, [membersApi, loadData])

  const removeMember = useCallback(async (teamId: string, userId: string) => {
    await membersApi.remove(teamId, userId)
    await loadData()
  }, [membersApi, loadData])

  const createAnnouncement = useCallback(async (input: TeamAnnouncementInsert) => {
    const newAnnouncement: TeamAnnouncement = await announcementsApi.create(input)
    setAnnouncements(prev => [newAnnouncement, ...prev])
    return newAnnouncement
  }, [announcementsApi])

  const updateAnnouncement = useCallback(async (id: string, input: TeamAnnouncementUpdate) => {
    const updated: TeamAnnouncement = await announcementsApi.update(id, input)
    setAnnouncements(prev => prev.map(a => a.id === id ? updated : a))
    return updated
  }, [announcementsApi])

  const deleteAnnouncement = useCallback(async (id: string) => {
    await announcementsApi.remove(id)
    setAnnouncements(prev => prev.filter(a => a.id !== id))
  }, [announcementsApi])

  return {
    teams,
    currentTeam,
    members,
    announcements,
    loading,
    error,
    createTeam,
    updateTeam,
    deleteTeam,
    joinTeam,
    leaveTeam,
    updateMemberRole,
    removeMember,
    createAnnouncement,
    updateAnnouncement,
    deleteAnnouncement,
    refetch: loadData,
    refresh: loadData
  }
}

