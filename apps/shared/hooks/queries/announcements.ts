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
  viewOnly?: boolean
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
    api: providedApi,
    viewOnly = false
  } = options

  const api = useMemo(
    () => providedApi ?? new TeamAnnouncementsAPI(supabase),
    [supabase, providedApi]
  )

  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: announcementKeys.list(teamId, viewOnly),
    queryFn: async () => {
      return await api.list(teamId, viewOnly)
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
          // viewOnlyの違いに関わらず、同じteamIdのクエリを全て無効化
          queryClient.invalidateQueries({ 
            queryKey: announcementKeys.lists(),
            predicate: (query) => {
              const key = query.queryKey
              return key[1] === 'list' && key[2] === teamId
            }
          })
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
      // viewOnlyの違いに関わらず、同じteamIdのクエリを全て更新
      queryClient.setQueriesData<TeamAnnouncement[]>(
        { 
          queryKey: announcementKeys.lists(),
          predicate: (query) => {
            const key = query.queryKey
            return key[1] === 'list' && key[2] === newAnnouncement.team_id
          }
        },
        (old: unknown) => {
          // oldが配列でない場合は新しい配列を返す
          if (!Array.isArray(old)) return [newAnnouncement]
          return [newAnnouncement, ...old]
        }
      )
      // キャッシュにないクエリも含めて、全てのクエリを無効化して再取得させる
      queryClient.invalidateQueries({ 
        queryKey: announcementKeys.lists(),
        predicate: (query) => {
          const key = query.queryKey
          return key[1] === 'list' && key[2] === newAnnouncement.team_id
        }
      })
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
      // viewOnlyの違いに関わらず、同じteamIdのクエリを全て更新
      queryClient.setQueriesData<TeamAnnouncement[]>(
        { 
          queryKey: announcementKeys.lists(),
          predicate: (query) => {
            const key = query.queryKey
            return key[1] === 'list' && key[2] === updated.team_id
          }
        },
        (old: unknown) => {
          // oldが配列でない場合はそのまま返す（型が合わない場合など）
          if (!Array.isArray(old)) return old
          return old.map((a: TeamAnnouncement) => a.id === updated.id ? updated : a)
        }
      )
      queryClient.setQueryData(
        announcementKeys.detail(updated.team_id, updated.id),
        updated
      )
      // キャッシュにないクエリも含めて、全てのクエリを無効化して再取得させる
      queryClient.invalidateQueries({ 
        queryKey: announcementKeys.lists(),
        predicate: (query) => {
          const key = query.queryKey
          return key[1] === 'list' && key[2] === updated.team_id
        }
      })
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
      // viewOnlyの違いに関わらず、同じteamIdのクエリを全て更新
      queryClient.setQueriesData<TeamAnnouncement[]>(
        { 
          queryKey: announcementKeys.lists(),
          predicate: (query) => {
            const key = query.queryKey
            return key[1] === 'list' && key[2] === teamId
          }
        },
        (old: unknown) => {
          // oldが配列でない場合はそのまま返す
          if (!Array.isArray(old)) return old
          return old.filter((a: TeamAnnouncement) => a.id !== id)
        }
      )
      queryClient.removeQueries({ queryKey: announcementKeys.detail(teamId, id) })
      // キャッシュにないクエリも含めて、全てのクエリを無効化して再取得させる
      queryClient.invalidateQueries({ 
        queryKey: announcementKeys.lists(),
        predicate: (query) => {
          const key = query.queryKey
          return key[1] === 'list' && key[2] === teamId
        }
      })
    },
  })
}

