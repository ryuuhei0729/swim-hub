// =============================================================================
// チームReact Queryフック - Swim Hub共通パッケージ
// =============================================================================

'use client'

import { SupabaseClient } from '@supabase/supabase-js'
import { useMutation, useQuery, useQueryClient, type UseMutationResult } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import { TeamAnnouncementsAPI, TeamCoreAPI, TeamMembersAPI } from '../../api/teams'
import type {
  Team,
  TeamAnnouncement,
  TeamAnnouncementInsert,
  TeamAnnouncementUpdate,
  TeamInsert,
  TeamMembership,
  TeamMembershipWithUser,
  TeamUpdate,
  TeamWithMembers
} from '../../types/database'
import { teamKeys } from './keys'

export interface UseTeamsQueryOptions {
  teamId?: string
  enableRealtime?: boolean
  initialTeams?: TeamMembershipWithUser[]
  initialTeam?: TeamWithMembers | null
  initialMembers?: TeamMembershipWithUser[]
  initialAnnouncements?: TeamAnnouncement[]
  coreApi?: TeamCoreAPI
  membersApi?: TeamMembersAPI
  announcementsApi?: TeamAnnouncementsAPI
}

/**
 * チーム一覧取得クエリ
 */
export function useTeamsQuery(
  supabase: SupabaseClient,
  options: UseTeamsQueryOptions = {}
) {
  const {
    teamId,
    enableRealtime = true,
    initialTeams,
    initialTeam,
    initialMembers,
    initialAnnouncements,
    coreApi: providedCoreApi,
    membersApi: providedMembersApi,
    announcementsApi: providedAnnouncementsApi,
  } = options

  const coreApi = useMemo(
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

  const queryClient = useQueryClient()

  // チーム一覧取得クエリ
  const teamsQuery = useQuery({
    queryKey: teamKeys.list(),
    queryFn: async () => {
      return await coreApi.getMyTeams()
    },
    initialData: initialTeams,
    staleTime: 5 * 60 * 1000, // 5分
  })

  // チーム詳細取得クエリ（teamIdが指定されている場合のみ）
  const teamDetailQuery = useQuery({
    queryKey: teamKeys.detail(teamId!),
    queryFn: async () => {
      if (!teamId) throw new Error('teamId is required')
      return await coreApi.getTeam(teamId)
    },
    enabled: !!teamId,
    initialData: initialTeam,
    staleTime: 5 * 60 * 1000, // 5分
  })

  // メンバー一覧取得クエリ（teamIdが指定されている場合のみ）
  const membersQuery = useQuery({
    queryKey: teamKeys.members(teamId!),
    queryFn: async () => {
      if (!teamId) throw new Error('teamId is required')
      return await membersApi.list(teamId)
    },
    enabled: !!teamId,
    initialData: initialMembers,
    staleTime: 5 * 60 * 1000, // 5分
  })

  // お知らせ一覧取得クエリ（teamIdが指定されている場合のみ）
  const announcementsQuery = useQuery({
    queryKey: teamKeys.announcements(teamId!),
    queryFn: async () => {
      if (!teamId) throw new Error('teamId is required')
      return await announcementsApi.list(teamId)
    },
    enabled: !!teamId,
    initialData: initialAnnouncements,
    staleTime: 5 * 60 * 1000, // 5分
  })

  // リアルタイム購読（お知らせ・メンバー）
  useEffect(() => {
    if (!enableRealtime || !teamId) return

    const annCh = supabase
      .channel(`team-announcements-${teamId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'announcements',
        filter: `team_id=eq.${teamId}`
      }, () => {
        queryClient.invalidateQueries({ queryKey: teamKeys.announcements(teamId) })
      })
      .subscribe()

    const memCh = supabase
      .channel(`team-members-${teamId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'team_memberships',
        filter: `team_id=eq.${teamId}`
      }, () => {
        queryClient.invalidateQueries({ queryKey: teamKeys.members(teamId) })
        queryClient.invalidateQueries({ queryKey: teamKeys.detail(teamId) })
      })
      .subscribe()

    return () => {
      supabase.removeChannel(annCh)
      supabase.removeChannel(memCh)
    }
  }, [enableRealtime, teamId, queryClient, supabase])

  return {
    teams: teamsQuery.data ?? [],
    currentTeam: teamDetailQuery.data ?? null,
    members: membersQuery.data ?? [],
    announcements: announcementsQuery.data ?? [],
    isLoading: teamsQuery.isLoading || (teamId ? (teamDetailQuery.isLoading || membersQuery.isLoading || announcementsQuery.isLoading) : false),
    isError: teamsQuery.isError || (teamId ? (teamDetailQuery.isError || membersQuery.isError || announcementsQuery.isError) : false),
    error: teamsQuery.error || (teamId ? (teamDetailQuery.error || membersQuery.error || announcementsQuery.error) : undefined),
    refetch: () => {
      teamsQuery.refetch()
      if (teamId) {
        teamDetailQuery.refetch()
        membersQuery.refetch()
        announcementsQuery.refetch()
      }
    },
  }
}

/**
 * チーム作成ミューテーション
 */
export function useCreateTeamMutation(supabase: SupabaseClient, api?: TeamCoreAPI): UseMutationResult<Team, Error, TeamInsert> {
  const queryClient = useQueryClient()
  const coreApi = useMemo(() => api ?? new TeamCoreAPI(supabase), [supabase, api])

  return useMutation({
    mutationFn: async (team: TeamInsert) => {
      return await coreApi.createTeam(team)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: teamKeys.lists() })
    },
  })
}

/**
 * チーム更新ミューテーション
 */
export function useUpdateTeamMutation(supabase: SupabaseClient, api?: TeamCoreAPI): UseMutationResult<Team, Error, { id: string; updates: TeamUpdate }> {
  const queryClient = useQueryClient()
  const coreApi = useMemo(() => api ?? new TeamCoreAPI(supabase), [supabase, api])

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: TeamUpdate }) => {
      return await coreApi.updateTeam(id, updates)
    },
    onSuccess: (updated: Team, variables: { id: string; updates: TeamUpdate }) => {
      queryClient.setQueryData(teamKeys.detail(variables.id), updated)
      queryClient.invalidateQueries({ queryKey: teamKeys.lists() })
    },
  })
}

/**
 * チーム削除ミューテーション
 */
export function useDeleteTeamMutation(supabase: SupabaseClient, api?: TeamCoreAPI): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient()
  const coreApi = useMemo(() => api ?? new TeamCoreAPI(supabase), [supabase, api])

  return useMutation({
    mutationFn: async (id: string) => {
      await coreApi.deleteTeam(id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: teamKeys.lists() })
    },
  })
}

/**
 * チーム参加ミューテーション
 */
export function useJoinTeamMutation(supabase: SupabaseClient, api?: TeamMembersAPI): UseMutationResult<TeamMembership, Error, string> {
  const queryClient = useQueryClient()
  const membersApi = useMemo(() => api ?? new TeamMembersAPI(supabase), [supabase, api])

  return useMutation({
    mutationFn: async (inviteCode: string) => {
      return await membersApi.join(inviteCode)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: teamKeys.lists() })
    },
  })
}

/**
 * チーム退出ミューテーション
 */
export function useLeaveTeamMutation(supabase: SupabaseClient, api?: TeamMembersAPI): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient()
  const membersApi = useMemo(() => api ?? new TeamMembersAPI(supabase), [supabase, api])

  return useMutation({
    mutationFn: async (teamId: string) => {
      await membersApi.leave(teamId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: teamKeys.lists() })
    },
  })
}

/**
 * メンバーロール更新ミューテーション
 */
export function useUpdateMemberRoleMutation(supabase: SupabaseClient, api?: TeamMembersAPI): UseMutationResult<TeamMembership, Error, { teamId: string; userId: string; role: 'admin' | 'user' }> {
  const queryClient = useQueryClient()
  const membersApi = useMemo(() => api ?? new TeamMembersAPI(supabase), [supabase, api])

  return useMutation({
    mutationFn: async ({
      teamId,
      userId,
      role
    }: {
      teamId: string
      userId: string
      role: 'admin' | 'user'
    }) => {
      return await membersApi.updateRole(teamId, userId, role)
    },
    onSuccess: (_, variables: { teamId: string; userId: string; role: 'admin' | 'user' }) => {
      queryClient.invalidateQueries({ queryKey: teamKeys.members(variables.teamId) })
      queryClient.invalidateQueries({ queryKey: teamKeys.detail(variables.teamId) })
    },
  })
}

/**
 * メンバー削除ミューテーション
 */
export function useRemoveMemberMutation(supabase: SupabaseClient, api?: TeamMembersAPI): UseMutationResult<void, Error, { teamId: string; userId: string }> {
  const queryClient = useQueryClient()
  const membersApi = useMemo(() => api ?? new TeamMembersAPI(supabase), [supabase, api])

  return useMutation({
    mutationFn: async ({ teamId, userId }: { teamId: string; userId: string }) => {
      await membersApi.remove(teamId, userId)
    },
    onSuccess: (_, variables: { teamId: string; userId: string }) => {
      queryClient.invalidateQueries({ queryKey: teamKeys.members(variables.teamId) })
      queryClient.invalidateQueries({ queryKey: teamKeys.detail(variables.teamId) })
    },
  })
}

/**
 * お知らせ作成ミューテーション
 */
export function useCreateAnnouncementMutation(supabase: SupabaseClient, api?: TeamAnnouncementsAPI): UseMutationResult<TeamAnnouncement, Error, TeamAnnouncementInsert> {
  const queryClient = useQueryClient()
  const announcementsApi = useMemo(() => api ?? new TeamAnnouncementsAPI(supabase), [supabase, api])

  return useMutation({
    mutationFn: async (input: TeamAnnouncementInsert) => {
      return await announcementsApi.create(input)
    },
    onSuccess: (newAnnouncement: TeamAnnouncement) => {
      queryClient.setQueriesData<TeamAnnouncement[]>(
        { queryKey: teamKeys.announcements(newAnnouncement.team_id) },
        (old: TeamAnnouncement[] | undefined) => {
          if (!old) return [newAnnouncement]
          return [newAnnouncement, ...old]
        }
      )
    },
  })
}

/**
 * お知らせ更新ミューテーション
 */
export function useUpdateAnnouncementMutation(supabase: SupabaseClient, api?: TeamAnnouncementsAPI): UseMutationResult<TeamAnnouncement, Error, { id: string; input: TeamAnnouncementUpdate }> {
  const queryClient = useQueryClient()
  const announcementsApi = useMemo(() => api ?? new TeamAnnouncementsAPI(supabase), [supabase, api])

  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: TeamAnnouncementUpdate }) => {
      return await announcementsApi.update(id, input)
    },
    onSuccess: (updated: TeamAnnouncement) => {
      // team_idを取得するために一度クエリを確認
      queryClient.setQueriesData<TeamAnnouncement[]>(
        { queryKey: teamKeys.announcements('') },
        (old: TeamAnnouncement[] | undefined) => {
          if (!old) return old
          return old.map((a: TeamAnnouncement) => a.id === updated.id ? updated : a)
        }
      )
      // より正確に更新するため、無効化も実行
      queryClient.invalidateQueries({ queryKey: teamKeys.all })
    },
  })
}

/**
 * お知らせ削除ミューテーション
 */
export function useDeleteAnnouncementMutation(supabase: SupabaseClient, api?: TeamAnnouncementsAPI): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient()
  const announcementsApi = useMemo(() => api ?? new TeamAnnouncementsAPI(supabase), [supabase, api])

  return useMutation({
    mutationFn: async (id: string) => {
      await announcementsApi.remove(id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: teamKeys.all })
    },
  })
}

