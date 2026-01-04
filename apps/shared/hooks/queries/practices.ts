// =============================================================================
// 練習記録React Queryフック - Swim Hub共通パッケージ
// =============================================================================

'use client'

import { SupabaseClient } from '@supabase/supabase-js'
import { useMutation, useQuery, useQueryClient, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import { PracticeAPI } from '../../api/practices'
import type {
    Practice,
    PracticeInsert,
    PracticeLog,
    PracticeLogInsert,
    PracticeLogUpdate,
    PracticeTag,
    PracticeTime,
    PracticeTimeInsert,
    PracticeUpdate,
    PracticeWithLogs
} from '../../types/database'
import { practiceKeys } from './keys'

export interface UsePracticesQueryOptions {
  startDate?: string
  endDate?: string
  page?: number
  pageSize?: number
  enableRealtime?: boolean
  initialData?: PracticeWithLogs[]
  api?: PracticeAPI
}

/**
 * 練習記録一覧取得クエリ
 */
export function usePracticesQuery(
  supabase: SupabaseClient,
  options: UsePracticesQueryOptions = {}
): UseQueryResult<PracticeWithLogs[], Error> {
  const {
    startDate,
    endDate,
    page = 1,
    pageSize = 20,
    enableRealtime = true,
    initialData,
    api: providedApi
  } = options

  const api = useMemo(
    () => providedApi ?? new PracticeAPI(supabase),
    [supabase, providedApi]
  )

  const queryClient = useQueryClient()

  // デフォルトの日付範囲を計算
  const defaultStartDate = useMemo(() => {
    if (startDate) return startDate
    const date = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
    return date.toISOString().split('T')[0]
  }, [startDate])

  const defaultEndDate = useMemo(() => {
    if (endDate) return endDate
    return new Date().toISOString().split('T')[0]
  }, [endDate])

  // ページング計算
  const offset = useMemo(() => (page - 1) * pageSize, [page, pageSize])

  // クエリ実行
  const query = useQuery({
    queryKey: practiceKeys.list({ startDate: defaultStartDate, endDate: defaultEndDate, page, pageSize }),
    queryFn: async () => {
      return await api.getPractices(defaultStartDate, defaultEndDate, pageSize, offset)
    },
    initialData,
    staleTime: 5 * 60 * 1000, // 5分
  })

  // リアルタイム購読
  useEffect(() => {
    if (!enableRealtime || !query.data) return

    const channel = api.subscribeToPractices((newPractice) => {
      queryClient.setQueriesData<PracticeWithLogs[]>(
        { queryKey: practiceKeys.lists() },
        (old: PracticeWithLogs[] | undefined) => {
          if (!old) return old

          const index = old.findIndex((p: PracticeWithLogs) => p.id === newPractice.id)
          if (index >= 0) {
            // 既存のものを更新
            const updated = [...old]
            updated[index] = {
              ...updated[index],
              ...newPractice,
              practice_logs: updated[index].practice_logs // 既存のpractice_logsを保持
            } as PracticeWithLogs
            return updated
          }

          // 日付範囲内なら追加
          if (newPractice.date >= defaultStartDate && newPractice.date <= defaultEndDate) {
            return [newPractice as PracticeWithLogs, ...old]
          }

          return old
        }
      )
    })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [api, enableRealtime, queryClient, defaultStartDate, defaultEndDate, query.data, supabase])

  return query
}

/**
 * 練習記録の総件数を取得するクエリ
 */
export function usePracticesCountQuery(
  supabase: SupabaseClient,
  options: { startDate?: string; endDate?: string; api?: PracticeAPI } = {}
): UseQueryResult<number, Error> {
  const { startDate, endDate, api: providedApi } = options

  const api = useMemo(
    () => providedApi ?? new PracticeAPI(supabase),
    [supabase, providedApi]
  )

  // デフォルトの日付範囲を計算
  const defaultStartDate = useMemo(() => {
    if (startDate) return startDate
    const date = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
    return date.toISOString().split('T')[0]
  }, [startDate])

  const defaultEndDate = useMemo(() => {
    if (endDate) return endDate
    return new Date().toISOString().split('T')[0]
  }, [endDate])

  return useQuery({
    queryKey: practiceKeys.count({ startDate: defaultStartDate, endDate: defaultEndDate }),
    queryFn: async () => {
      return await api.countPractices(defaultStartDate, defaultEndDate)
    },
    staleTime: 5 * 60 * 1000, // 5分
  })
}

export interface UsePracticeByIdQueryOptions {
  enableRealtime?: boolean
  initialData?: PracticeWithLogs | null
  api?: PracticeAPI
}

/**
 * IDで練習記録を取得するクエリ
 */
export function usePracticeByIdQuery(
  supabase: SupabaseClient,
  practiceId: string,
  options: UsePracticeByIdQueryOptions = {}
): UseQueryResult<PracticeWithLogs | null, Error> {
  const {
    enableRealtime = true,
    initialData,
    api: providedApi
  } = options

  const api = useMemo(
    () => providedApi ?? new PracticeAPI(supabase),
    [supabase, providedApi]
  )

  const queryClient = useQueryClient()

  // クエリ実行
  const query = useQuery({
    queryKey: practiceKeys.detail(practiceId),
    queryFn: async () => {
      return await api.getPracticeById(practiceId)
    },
    enabled: !!practiceId,
    initialData,
    staleTime: 5 * 60 * 1000, // 5分
  })

  // リアルタイム購読（練習記録の変更）
  useEffect(() => {
    if (!enableRealtime || !practiceId || !query.data) return

    const channel = supabase
      .channel(`practice-detail-${practiceId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'practices',
          filter: `id=eq.${practiceId}`
        },
        () => {
          queryClient.invalidateQueries({ queryKey: practiceKeys.detail(practiceId) })
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'practice_logs',
          filter: `practice_id=eq.${practiceId}`
        },
        () => {
          queryClient.invalidateQueries({ queryKey: practiceKeys.detail(practiceId) })
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'practice_times'
        },
        () => {
          // practice_log_id でフィルタリングできないため、practice_logs の変更を監視
          // より正確には practice_log_id を含む practice_logs を確認する必要があるが、
          // 簡易的に practice_logs の変更を監視することで対応
          queryClient.invalidateQueries({ queryKey: practiceKeys.detail(practiceId) })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [api, enableRealtime, practiceId, queryClient, query.data, supabase])

  return query
}

/**
 * 練習記録作成ミューテーション
 */
export function useCreatePracticeMutation(supabase: SupabaseClient, api?: PracticeAPI): UseMutationResult<Practice, Error, Omit<PracticeInsert, 'user_id'>> {
  const queryClient = useQueryClient()
  const practiceApi = useMemo(() => api ?? new PracticeAPI(supabase), [supabase, api])

  return useMutation({
    mutationFn: async (practice: Omit<PracticeInsert, 'user_id'>) => {
      const created = await practiceApi.createPractice(practice)
      
      // Google Calendar同期（バックグラウンドで実行、エラーは無視）
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const { data: profile } = await supabase
            .from('users')
            .select('google_calendar_enabled, google_calendar_sync_practices')
            .eq('id', user.id)
            .single()
          
          if (profile?.google_calendar_enabled && profile?.google_calendar_sync_practices) {
            const { syncPracticeToGoogleCalendar } = await import('../../api/google-calendar')
            syncPracticeToGoogleCalendar(created, 'create').catch((err: unknown) => {
              console.error('Google Calendar同期エラー:', err)
            })
          }
        }
      } catch (err) {
        // エラーは無視（メイン処理に影響しない）
        console.error('Google Calendar同期チェックエラー:', err)
      }
      
      return created
    },
    onSuccess: () => {
      // 関連するクエリを無効化して再取得
      queryClient.invalidateQueries({ queryKey: practiceKeys.lists() })
    },
  })
}

/**
 * 練習記録更新ミューテーション
 */
export function useUpdatePracticeMutation(supabase: SupabaseClient, api?: PracticeAPI): UseMutationResult<Practice, Error, { id: string; updates: PracticeUpdate }> {
  const queryClient = useQueryClient()
  const practiceApi = useMemo(() => api ?? new PracticeAPI(supabase), [supabase, api])

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: PracticeUpdate }) => {
      const updated = await practiceApi.updatePractice(id, updates)
      
      // Google Calendar同期（バックグラウンドで実行、エラーは無視）
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const { data: profile } = await supabase
            .from('users')
            .select('google_calendar_enabled, google_calendar_sync_practices')
            .eq('id', user.id)
            .single()
          
          if (profile?.google_calendar_enabled && profile?.google_calendar_sync_practices) {
            const { syncPracticeToGoogleCalendar } = await import('../../api/google-calendar')
            // TODO: googleEventIdを取得して渡す必要がある（現時点では新規作成として扱う）
            syncPracticeToGoogleCalendar(updated, 'update').catch((err: unknown) => {
              console.error('Google Calendar同期エラー:', err)
            })
          }
        }
      } catch (err) {
        console.error('Google Calendar同期チェックエラー:', err)
      }
      
      return updated
    },
    onSuccess: (updated: Practice, variables: { id: string; updates: PracticeUpdate }) => {
      // 関連するクエリを更新
      queryClient.setQueriesData<PracticeWithLogs[]>(
        { queryKey: practiceKeys.lists() },
        (old: PracticeWithLogs[] | undefined) => {
          if (!old) return old
          return old.map((p: PracticeWithLogs) =>
            p.id === variables.id
              ? { ...p, ...updated, practice_logs: p.practice_logs } as PracticeWithLogs
              : p
          )
        }
      )
    },
  })
}

/**
 * 練習記録削除ミューテーション
 */
export function useDeletePracticeMutation(supabase: SupabaseClient, api?: PracticeAPI): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient()
  const practiceApi = useMemo(() => api ?? new PracticeAPI(supabase), [supabase, api])

  return useMutation({
    mutationFn: async (id: string) => {
      // 削除前にPracticeデータを取得（Google Calendar同期用）
      let practiceData: Practice | null = null
      try {
        practiceData = await practiceApi.getPracticeById(id)
      } catch (err) {
        console.error('Practice取得エラー:', err)
      }
      
      await practiceApi.deletePractice(id)
      
      // Google Calendar同期（バックグラウンドで実行、エラーは無視）
      if (practiceData) {
        try {
          const { data: { user } } = await supabase.auth.getUser()
          if (user) {
            const { data: profile } = await supabase
              .from('users')
              .select('google_calendar_enabled, google_calendar_sync_practices')
              .eq('id', user.id)
              .single()
            
            if (profile?.google_calendar_enabled && profile?.google_calendar_sync_practices) {
              const { syncPracticeToGoogleCalendar } = await import('../../api/google-calendar')
              // TODO: googleEventIdを取得して渡す必要がある
              syncPracticeToGoogleCalendar(practiceData, 'delete').catch((err: unknown) => {
                console.error('Google Calendar同期エラー:', err)
              })
            }
          }
        } catch (err) {
          console.error('Google Calendar同期チェックエラー:', err)
        }
      }
    },
    onSuccess: () => {
      // 関連するクエリを無効化して再取得
      queryClient.invalidateQueries({ queryKey: practiceKeys.lists() })
    },
  })
}

/**
 * 練習ログ作成ミューテーション
 */
export function useCreatePracticeLogMutation(supabase: SupabaseClient, api?: PracticeAPI): UseMutationResult<PracticeLog, Error, Omit<PracticeLogInsert, 'user_id'>> {
  const queryClient = useQueryClient()
  const practiceApi = useMemo(() => api ?? new PracticeAPI(supabase), [supabase, api])

  return useMutation({
    mutationFn: async (log: Omit<PracticeLogInsert, 'user_id'>) => {
      return await practiceApi.createPracticeLog(log)
    },
    onSuccess: () => {
      // 関連するクエリを無効化して再取得（リレーションデータも含める）
      queryClient.invalidateQueries({ queryKey: practiceKeys.lists() })
    },
  })
}

/**
 * 練習ログ更新ミューテーション
 */
export function useUpdatePracticeLogMutation(supabase: SupabaseClient, api?: PracticeAPI): UseMutationResult<PracticeLog, Error, { id: string; updates: PracticeLogUpdate }> {
  const queryClient = useQueryClient()
  const practiceApi = useMemo(() => api ?? new PracticeAPI(supabase), [supabase, api])

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: PracticeLogUpdate }) => {
      return await practiceApi.updatePracticeLog(id, updates)
    },
    onSuccess: () => {
      // 関連するクエリを無効化して再取得
      queryClient.invalidateQueries({ queryKey: practiceKeys.lists() })
    },
  })
}

/**
 * 練習ログ削除ミューテーション
 */
export function useDeletePracticeLogMutation(supabase: SupabaseClient, api?: PracticeAPI): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient()
  const practiceApi = useMemo(() => api ?? new PracticeAPI(supabase), [supabase, api])

  return useMutation({
    mutationFn: async (id: string) => {
      await practiceApi.deletePracticeLog(id)
    },
    onSuccess: () => {
      // 関連するクエリを無効化して再取得
      queryClient.invalidateQueries({ queryKey: practiceKeys.lists() })
    },
  })
}

/**
 * 練習タイム一括作成ミューテーション
 */
export function useCreatePracticeTimesMutation(supabase: SupabaseClient, api?: PracticeAPI): UseMutationResult<PracticeTime[], Error, Omit<PracticeTimeInsert, 'user_id'>[]> {
  const queryClient = useQueryClient()
  const practiceApi = useMemo(() => api ?? new PracticeAPI(supabase), [supabase, api])

  return useMutation({
    mutationFn: async (times: Omit<PracticeTimeInsert, 'user_id'>[]) => {
      return await practiceApi.createPracticeTimes(times as PracticeTimeInsert[])
    },
    onSuccess: () => {
      // 関連するクエリを無効化して再取得
      queryClient.invalidateQueries({ queryKey: practiceKeys.lists() })
    },
  })
}

/**
 * 練習タイム置き換えミューテーション
 */
export function useReplacePracticeTimesMutation(supabase: SupabaseClient, api?: PracticeAPI): UseMutationResult<PracticeTime[], Error, { practiceLogId: string; times: Omit<PracticeTimeInsert, 'practice_log_id' | 'user_id'>[] }> {
  const queryClient = useQueryClient()
  const practiceApi = useMemo(() => api ?? new PracticeAPI(supabase), [supabase, api])

  return useMutation({
    mutationFn: async ({
      practiceLogId,
      times
    }: {
      practiceLogId: string
      times: Omit<PracticeTimeInsert, 'practice_log_id' | 'user_id'>[]
    }) => {
      return await practiceApi.replacePracticeTimes(practiceLogId, times)
    },
    onSuccess: () => {
      // 関連するクエリを無効化して再取得
      queryClient.invalidateQueries({ queryKey: practiceKeys.lists() })
    },
  })
}

/**
 * 練習タイム作成ミューテーション
 */
export function useCreatePracticeTimeMutation(supabase: SupabaseClient, api?: PracticeAPI): UseMutationResult<PracticeTime, Error, PracticeTimeInsert> {
  const queryClient = useQueryClient()
  const practiceApi = useMemo(() => api ?? new PracticeAPI(supabase), [supabase, api])

  return useMutation({
    mutationFn: async (time: PracticeTimeInsert) => {
      return await practiceApi.createPracticeTime(time)
    },
    onSuccess: () => {
      // 関連するクエリを無効化して再取得
      queryClient.invalidateQueries({ queryKey: practiceKeys.lists() })
    },
  })
}

/**
 * 練習タイム削除ミューテーション
 */
export function useDeletePracticeTimeMutation(supabase: SupabaseClient, api?: PracticeAPI): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient()
  const practiceApi = useMemo(() => api ?? new PracticeAPI(supabase), [supabase, api])

  return useMutation({
    mutationFn: async (id: string) => {
      await practiceApi.deletePracticeTime(id)
    },
    onSuccess: () => {
      // 関連するクエリを無効化して再取得
      queryClient.invalidateQueries({ queryKey: practiceKeys.lists() })
    },
  })
}

/**
 * 練習タグ一覧取得クエリ
 */
export function usePracticeTagsQuery(supabase: SupabaseClient, api?: PracticeAPI): UseQueryResult<PracticeTag[], Error> {
  const practiceApi = useMemo(() => api ?? new PracticeAPI(supabase), [supabase, api])

  return useQuery({
    queryKey: practiceKeys.tags(),
    queryFn: async () => {
      return await practiceApi.getPracticeTags()
    },
    staleTime: 10 * 60 * 1000, // 10分（マスターデータなので長め）
  })
}

/**
 * 練習タグ作成ミューテーション
 */
export function useCreatePracticeTagMutation(supabase: SupabaseClient, api?: PracticeAPI): UseMutationResult<PracticeTag, Error, { name: string; color: string }> {
  const queryClient = useQueryClient()
  const practiceApi = useMemo(() => api ?? new PracticeAPI(supabase), [supabase, api])

  return useMutation({
    mutationFn: async ({ name, color }: { name: string; color: string }) => {
      return await practiceApi.createPracticeTag(name, color)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: practiceKeys.tags() })
    },
  })
}

/**
 * 練習タグ更新ミューテーション
 */
export function useUpdatePracticeTagMutation(supabase: SupabaseClient, api?: PracticeAPI): UseMutationResult<void, Error, { id: string; name: string; color: string }> {
  const queryClient = useQueryClient()
  const practiceApi = useMemo(() => api ?? new PracticeAPI(supabase), [supabase, api])

  return useMutation({
    mutationFn: async ({ id, name, color }: { id: string; name: string; color: string }) => {
      await practiceApi.updatePracticeTag(id, name, color)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: practiceKeys.tags() })
    },
  })
}

/**
 * 練習タグ削除ミューテーション
 */
export function useDeletePracticeTagMutation(supabase: SupabaseClient, api?: PracticeAPI): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient()
  const practiceApi = useMemo(() => api ?? new PracticeAPI(supabase), [supabase, api])

  return useMutation({
    mutationFn: async (id: string) => {
      await practiceApi.deletePracticeTag(id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: practiceKeys.tags() })
    },
  })
}

