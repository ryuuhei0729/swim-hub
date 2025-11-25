// =============================================================================
// チームお知らせReact Queryフック - Swim Hub共通パッケージ
// =============================================================================

'use client'

import { SupabaseClient } from '@supabase/supabase-js'
import { useMutation, useQuery, useQueryClient, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import { TeamAnnouncementsAPI } from '../../api/teams'
import type {
  TeamAnnouncement,
  TeamAnnouncementInsert,
  TeamAnnouncementUpdate
} from '../../types/database'
import { announcementKeys } from './keys'

export interface UseTeamAnnouncementsQueryOptions {
  teamId: string
  enableRealtime?: boolean
  initialData?: TeamAnnouncement[]
  api?: TeamAnnouncementsAPI
}

/**
 * チームお知らせ一覧取得クエリ
 */
export function useTeamAnnouncementsQuery(
  supabase: SupabaseClient,
  options: UseTeamAnnouncementsQueryOptions
): UseQueryResult<TeamAnnouncement[], Error> {
  const {
    teamId,
    enableRealtime = true,
    initialData,
    api: providedApi
  } = options

  const api = useMemo(
    () => providedApi ?? new TeamAnnouncementsAPI(supabase),
    [supabase, providedApi]
  )

  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: announcementKeys.list(teamId),
    queryFn: async () => {
      return await api.list(teamId)
    },
    enabled: !!teamId,
    initialData,
    staleTime: 5 * 60 * 1000, // 5分
  })

  // リアルタイム購読
  useEffect(() => {
    if (!enableRealtime || !teamId || !query.data) return

    const channel = supabase
      .channel(`team-announcements-${teamId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'announcements',
          filter: `team_id=eq.${teamId}`
        },
        () => {
          queryClient.invalidateQueries({ queryKey: announcementKeys.list(teamId) })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [enableRealtime, teamId, queryClient, query.data, supabase])

  return query
}

/**
 * チームお知らせ詳細取得クエリ
 */
export function useTeamAnnouncementQuery(
  supabase: SupabaseClient,
  teamId: string,
  id: string,
  options?: { initialData?: TeamAnnouncement; api?: TeamAnnouncementsAPI }
): UseQueryResult<TeamAnnouncement, Error> {
  const api = useMemo(
    () => options?.api ?? new TeamAnnouncementsAPI(supabase),
    [supabase, options?.api]
  )

  return useQuery({
    queryKey: announcementKeys.detail(teamId, id),
    queryFn: async () => {
      // TeamAnnouncementsAPIにはgetメソッドがないため、listから取得
      const announcements = await api.list(teamId)
      const announcement = announcements.find(a => a.id === id)
      if (!announcement) throw new Error('お知らせが見つかりません')
      return announcement
    },
    enabled: !!teamId && !!id,
    initialData: options?.initialData,
    staleTime: 5 * 60 * 1000, // 5分
  })
}

/**
 * チームお知らせ作成ミューテーション
 */
export function useCreateTeamAnnouncementMutation(
  supabase: SupabaseClient,
  api?: TeamAnnouncementsAPI
): UseMutationResult<TeamAnnouncement, Error, TeamAnnouncementInsert> {
  const queryClient = useQueryClient()
  const announcementsApi = useMemo(
    () => api ?? new TeamAnnouncementsAPI(supabase),
    [supabase, api]
  )

  return useMutation({
    mutationFn: async (input: TeamAnnouncementInsert) => {
      return await announcementsApi.create(input)
    },
    onSuccess: (newAnnouncement: TeamAnnouncement) => {
      queryClient.setQueriesData<TeamAnnouncement[]>(
        { queryKey: announcementKeys.list(newAnnouncement.team_id) },
        (old: TeamAnnouncement[] | undefined) => {
          if (!old) return [newAnnouncement]
          return [newAnnouncement, ...old]
        }
      )
    },
  })
}

/**
 * チームお知らせ更新ミューテーション
 */
export function useUpdateTeamAnnouncementMutation(
  supabase: SupabaseClient,
  api?: TeamAnnouncementsAPI
): UseMutationResult<TeamAnnouncement, Error, { id: string; input: TeamAnnouncementUpdate }> {
  const queryClient = useQueryClient()
  const announcementsApi = useMemo(
    () => api ?? new TeamAnnouncementsAPI(supabase),
    [supabase, api]
  )

  return useMutation({
    mutationFn: async ({ id, input }: { id: string; input: TeamAnnouncementUpdate }) => {
      return await announcementsApi.update(id, input)
    },
    onSuccess: (updated: TeamAnnouncement) => {
      queryClient.setQueriesData<TeamAnnouncement[]>(
        { queryKey: announcementKeys.list(updated.team_id) },
        (old: TeamAnnouncement[] | undefined) => {
          if (!old) return old
          return old.map((a: TeamAnnouncement) => a.id === updated.id ? updated : a)
        }
      )
      queryClient.setQueryData(
        announcementKeys.detail(updated.team_id, updated.id),
        updated
      )
    },
  })
}

/**
 * チームお知らせ削除ミューテーション
 */
export function useDeleteTeamAnnouncementMutation(
  supabase: SupabaseClient,
  api?: TeamAnnouncementsAPI
): UseMutationResult<{ id: string; teamId: string }, Error, { id: string; teamId: string }> {
  const queryClient = useQueryClient()
  const announcementsApi = useMemo(
    () => api ?? new TeamAnnouncementsAPI(supabase),
    [supabase, api]
  )

  return useMutation({
    mutationFn: async ({ id, teamId }: { id: string; teamId: string }) => {
      await announcementsApi.remove(id)
      return { id, teamId }
    },
    onSuccess: ({ id, teamId }: { id: string; teamId: string }) => {
      queryClient.setQueriesData<TeamAnnouncement[]>(
        { queryKey: announcementKeys.list(teamId) },
        (old: TeamAnnouncement[] | undefined) => {
          if (!old) return old
          return old.filter((a: TeamAnnouncement) => a.id !== id)
        }
      )
      queryClient.removeQueries({ queryKey: announcementKeys.detail(teamId, id) })
    },
  })
}

