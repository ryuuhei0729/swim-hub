// =============================================================================
// チームフック - Swim Hub共通パッケージ
// Web/Mobile共通で使用するカスタムフック
// =============================================================================

import { SupabaseClient } from '@supabase/supabase-js'
import { useCallback, useEffect, useState } from 'react'
import { TeamAPI } from '../api/teams'
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

  const api = new TeamAPI(supabase)

  // データ取得関数
  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      // 自分のチーム一覧を取得
      const teamsData = await api.getMyTeams()
      setTeams(teamsData)

      // 特定のチームが指定されている場合
      if (teamId) {
        const [teamData, membersData, announcementsData] = await Promise.all([
          api.getTeam(teamId),
          api.getTeamMembers(teamId),
          api.getTeamAnnouncements(teamId)
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

  // リアルタイム購読
  useEffect(() => {
    if (!enableRealtime || !teamId) return

    const announcementsChannel = api.subscribeToAnnouncements(teamId, () => {
      loadData()
    })

    const membersChannel = api.subscribeToMembers(teamId, () => {
      loadData()
    })

    return () => {
      supabase.removeChannel(announcementsChannel)
      supabase.removeChannel(membersChannel)
    }
  }, [enableRealtime, teamId, loadData])

  // 操作関数
  const createTeam = useCallback(async (team: any) => {
    const newTeam = await api.createTeam(team)
    await loadData()
    return newTeam
  }, [loadData])

  const updateTeam = useCallback(async (id: string, updates: any) => {
    const updated = await api.updateTeam(id, updates)
    await loadData()
    return updated
  }, [loadData])

  const deleteTeam = useCallback(async (id: string) => {
    await api.deleteTeam(id)
    setTeams(prev => prev.filter((t: any) => t.team?.id !== id))
  }, [])

  const joinTeam = useCallback(async (inviteCode: string) => {
    const membership = await api.joinTeam(inviteCode)
    await loadData()
    return membership
  }, [loadData])

  const leaveTeam = useCallback(async (id: string) => {
    await api.leaveTeam(id)
    setTeams(prev => prev.filter((t: any) => t.team?.id !== id))
  }, [])

  const updateMemberRole = useCallback(async (
    teamId: string,
    userId: string,
    role: 'admin' | 'user'
  ) => {
    const updated = await api.updateMemberRole(teamId, userId, role)
    await loadData()
    return updated
  }, [loadData])

  const removeMember = useCallback(async (teamId: string, userId: string) => {
    await api.removeMember(teamId, userId)
    await loadData()
  }, [loadData])

  const createAnnouncement = useCallback(async (announcement: any) => {
    const newAnnouncement = await api.createAnnouncement(announcement)
    setAnnouncements(prev => [newAnnouncement, ...prev])
    return newAnnouncement
  }, [])

  const updateAnnouncement = useCallback(async (id: string, updates: any) => {
    const updated = await api.updateAnnouncement(id, updates)
    setAnnouncements(prev => prev.map(a => a.id === id ? updated : a))
    return updated
  }, [])

  const deleteAnnouncement = useCallback(async (id: string) => {
    await api.deleteAnnouncement(id)
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
    refetch: loadData
  }
}

