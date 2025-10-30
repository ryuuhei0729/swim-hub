// =============================================================================
// チームフック - Swim Hub共通パッケージ
// Web/Mobile共通で使用するカスタムフック
// =============================================================================

import { SupabaseClient } from '@supabase/supabase-js'
import { useCallback, useEffect, useState } from 'react'
import { TeamAnnouncementsAPI, TeamCoreAPI, TeamMembersAPI } from '../api/teams'
import {
  TeamAnnouncement,
  TeamMembershipWithUser,
  TeamWithMembers
} from '../types/database'

export interface UseTeamsOptions {
  teamId?: string
  enableRealtime?: boolean
}

export function useTeams(
  supabase: SupabaseClient,
  options: UseTeamsOptions = {}
) {
  const { teamId, enableRealtime = true } = options
  
  const [teams, setTeams] = useState<TeamMembershipWithUser[]>([])
  const [currentTeam, setCurrentTeam] = useState<TeamWithMembers | null>(null)
  const [members, setMembers] = useState<TeamMembershipWithUser[]>([])
  const [announcements, setAnnouncements] = useState<TeamAnnouncement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const core = new TeamCoreAPI(supabase)
  const membersApi = new TeamMembersAPI(supabase)
  const announcementsApi = new TeamAnnouncementsAPI(supabase)

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
  }, [teamId])

  // 初回データ取得
  useEffect(() => {
    loadData()
  }, [loadData])

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
  const createTeam = useCallback(async (team: any) => {
    const newTeam = await core.createTeam(team)
    await loadData()
    return newTeam
  }, [loadData])

  const updateTeam = useCallback(async (id: string, updates: any) => {
    const updated = await core.updateTeam(id, updates)
    await loadData()
    return updated
  }, [loadData])

  const deleteTeam = useCallback(async (id: string) => {
    await core.deleteTeam(id)
    setTeams(prev => prev.filter((t: any) => t.team?.id !== id))
  }, [])

  const joinTeam = useCallback(async (inviteCode: string) => {
    const membership = await membersApi.join(inviteCode)
    await loadData()
    return membership
  }, [loadData])

  const leaveTeam = useCallback(async (id: string) => {
    await membersApi.leave(id)
    setTeams(prev => prev.filter((t: any) => t.team?.id !== id))
  }, [])

  const updateMemberRole = useCallback(async (
    teamId: string,
    userId: string,
    role: 'admin' | 'user'
  ) => {
    const updated = await membersApi.updateRole(teamId, userId, role)
    await loadData()
    return updated
  }, [loadData])

  const removeMember = useCallback(async (teamId: string, userId: string) => {
    await membersApi.remove(teamId, userId)
    await loadData()
  }, [loadData])

  const createAnnouncement = useCallback(async (announcement: any) => {
    const newAnnouncement = await announcementsApi.create({
      team_id: announcement.team_id ?? announcement.teamId,
      title: announcement.title,
      content: announcement.content,
      is_published: announcement.is_published ?? announcement.isPublished ?? false,
      published_at: announcement.published_at ?? announcement.publishedAt ?? null,
      created_by: '' // サーバー側で user を付与
    } as any)
    setAnnouncements(prev => [newAnnouncement, ...prev])
    return newAnnouncement
  }, [])

  const updateAnnouncement = useCallback(async (id: string, updates: any) => {
    const updated = await announcementsApi.update(id, {
      title: updates.title,
      content: updates.content,
      is_published: updates.is_published ?? updates.isPublished,
      published_at: updates.published_at ?? updates.publishedAt
    } as any)
    setAnnouncements(prev => prev.map(a => a.id === id ? updated : a))
    return updated
  }, [])

  const deleteAnnouncement = useCallback(async (id: string) => {
    await announcementsApi.remove(id)
    setAnnouncements(prev => prev.filter(a => a.id !== id))
  }, [])

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

