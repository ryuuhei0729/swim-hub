// =============================================================================
// 大会記録React Queryフック - Swim Hub共通パッケージ
// =============================================================================

'use client'

import { SupabaseClient } from '@supabase/supabase-js'
import { useMutation, useQuery, useQueryClient, type UseMutationResult, type UseQueryResult } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import { RecordAPI } from '../../api/records'
import { GoalAPI } from '../../api/goals'
import type {
  Competition,
  CompetitionInsert,
  CompetitionUpdate,
  Record,
  RecordInsert,
  RecordUpdate,
  RecordWithDetails,
  SplitTime,
  SplitTimeInsert
} from '../../types/database'
import type { BestTime } from '../../types/ui'
import { recordKeys } from './keys'

export interface UseRecordsQueryOptions {
  startDate?: string
  endDate?: string
  styleId?: number
  page?: number
  pageSize?: number
  enableRealtime?: boolean
  initialRecords?: RecordWithDetails[]
  initialCompetitions?: Competition[]
  api?: RecordAPI
}

/**
 * 大会記録一覧取得クエリ
 */
export function useRecordsQuery(
  supabase: SupabaseClient,
  options: UseRecordsQueryOptions = {}
) {
  const {
    startDate,
    endDate,
    styleId,
    page = 1,
    pageSize = 20,
    enableRealtime = true,
    initialRecords,
    initialCompetitions,
    api: providedApi
  } = options

  const api = useMemo(
    () => providedApi ?? new RecordAPI(supabase),
    [supabase, providedApi]
  )

  const queryClient = useQueryClient()

  // ページング計算
  const offset = useMemo(() => (page - 1) * pageSize, [page, pageSize])

  // 記録取得クエリ
  const recordsQuery = useQuery({
    queryKey: recordKeys.list({ startDate, endDate, styleId, page, pageSize }),
    queryFn: async () => {
      return await api.getRecords(startDate, endDate, styleId, pageSize, offset)
    },
    initialData: initialRecords,
    staleTime: 5 * 60 * 1000, // 5分
  })

  // 大会一覧取得クエリ
  const competitionsQuery = useQuery({
    queryKey: recordKeys.competitionsList({ startDate, endDate }),
    queryFn: async () => {
      return await api.getCompetitions(startDate, endDate)
    },
    initialData: initialCompetitions,
    staleTime: 5 * 60 * 1000, // 5分
  })

  // リアルタイム購読（記録）
  useEffect(() => {
    if (!enableRealtime || !recordsQuery.data) return

    const recordsChannel = api.subscribeToRecords(() => {
      // 関連するクエリを無効化して再取得（リレーションデータも含める）
      queryClient.invalidateQueries({ queryKey: recordKeys.lists() })
    })

    return () => {
      supabase.removeChannel(recordsChannel)
    }
  }, [api, enableRealtime, queryClient, recordsQuery.data, supabase])

  // リアルタイム購読（大会）
  useEffect(() => {
    if (!enableRealtime || !competitionsQuery.data) return

    const competitionsChannel = api.subscribeToCompetitions((newCompetition) => {
      queryClient.setQueryData<Competition[]>(
        recordKeys.competitionsList({ startDate, endDate }),
        (old: Competition[] | undefined) => {
          if (!old) return old

          const index = old.findIndex((c: Competition) => c.id === newCompetition.id)
          if (index >= 0) {
            const updated = [...old]
            updated[index] = newCompetition
            return updated
          }
          return [newCompetition, ...old]
        }
      )
    })

    return () => {
      supabase.removeChannel(competitionsChannel)
    }
  }, [api, enableRealtime, queryClient, startDate, endDate, competitionsQuery.data, supabase])

  return {
    records: recordsQuery.data ?? [],
    competitions: competitionsQuery.data ?? [],
    isLoading: recordsQuery.isLoading || competitionsQuery.isLoading,
    isError: recordsQuery.isError || competitionsQuery.isError,
    error: recordsQuery.error || competitionsQuery.error,
    refetch: () => {
      recordsQuery.refetch()
      competitionsQuery.refetch()
    },
  }
}

/**
 * 大会記録作成ミューテーション
 */
export function useCreateRecordMutation(supabase: SupabaseClient, api?: RecordAPI): UseMutationResult<Record, Error, Omit<RecordInsert, 'user_id'>> {
  const queryClient = useQueryClient()
  const recordApi = useMemo(() => api ?? new RecordAPI(supabase), [supabase, api])

  return useMutation({
    mutationFn: async (record: Omit<RecordInsert, 'user_id'>) => {
      return await recordApi.createRecord(record)
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: recordKeys.lists() })
      
      // マイルストーンのステータスを自動更新
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const goalAPI = new GoalAPI(supabase)
          await goalAPI.updateAllMilestoneStatuses(user.id)
        }
      } catch (error) {
        console.error('マイルストーンステータス更新エラー:', error)
      }
    },
  })
}

/**
 * 大会記録更新ミューテーション
 */
export function useUpdateRecordMutation(supabase: SupabaseClient, api?: RecordAPI): UseMutationResult<Record, Error, { id: string; updates: RecordUpdate }> {
  const queryClient = useQueryClient()
  const recordApi = useMemo(() => api ?? new RecordAPI(supabase), [supabase, api])

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: RecordUpdate }) => {
      return await recordApi.updateRecord(id, updates)
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: recordKeys.lists() })
      
      // マイルストーンのステータスを自動更新
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const goalAPI = new GoalAPI(supabase)
          await goalAPI.updateAllMilestoneStatuses(user.id)
        }
      } catch (error) {
        console.error('マイルストーンステータス更新エラー:', error)
      }
    },
  })
}

/**
 * 大会記録削除ミューテーション
 */
export function useDeleteRecordMutation(supabase: SupabaseClient, api?: RecordAPI): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient()
  const recordApi = useMemo(() => api ?? new RecordAPI(supabase), [supabase, api])

  return useMutation({
    mutationFn: async (id: string) => {
      await recordApi.deleteRecord(id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: recordKeys.lists() })
    },
  })
}

/**
 * 大会作成ミューテーション
 */
export function useCreateCompetitionMutation(supabase: SupabaseClient, api?: RecordAPI): UseMutationResult<Competition, Error, Omit<CompetitionInsert, 'user_id'>> {
  const queryClient = useQueryClient()
  const recordApi = useMemo(() => api ?? new RecordAPI(supabase), [supabase, api])

  return useMutation({
    mutationFn: async (competition: Omit<CompetitionInsert, 'user_id'>) => {
      const created = await recordApi.createCompetition(competition)
      
      // Google Calendar同期（バックグラウンドで実行、エラーは無視）
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const { data: profile } = await supabase
            .from('users')
            .select('google_calendar_enabled, google_calendar_sync_competitions')
            .eq('id', user.id)
            .single()
          
          if (profile?.google_calendar_enabled && profile?.google_calendar_sync_competitions) {
            const { syncCompetitionToGoogleCalendar } = await import('../../api/google-calendar')
            const syncResult = await syncCompetitionToGoogleCalendar(created, 'create')
            
            // 同期成功時にgoogle_event_idを保存
            if (syncResult.success && syncResult.googleEventId) {
              await supabase
                .from('competitions')
                .update({ google_event_id: syncResult.googleEventId })
                .eq('id', created.id)
            }
          }
        }
      } catch (err) {
        console.error('Google Calendar同期チェックエラー:', err)
      }
      
      return created
    },
    onSuccess: (newCompetition: Competition) => {
      queryClient.setQueriesData<Competition[]>(
        { queryKey: recordKeys.competitions() },
        (old: Competition[] | undefined) => {
          if (!old) return [newCompetition]
          return [newCompetition, ...old]
        }
      )
      queryClient.invalidateQueries({ queryKey: recordKeys.competitions() })
    },
  })
}

/**
 * 大会更新ミューテーション
 */
export function useUpdateCompetitionMutation(supabase: SupabaseClient, api?: RecordAPI): UseMutationResult<Competition, Error, { id: string; updates: CompetitionUpdate }> {
  const queryClient = useQueryClient()
  const recordApi = useMemo(() => api ?? new RecordAPI(supabase), [supabase, api])

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: CompetitionUpdate }) => {
      // 更新前にgoogle_event_idを取得
      let googleEventId: string | null = null
      try {
        const { data: existing } = await supabase
          .from('competitions')
          .select('google_event_id')
          .eq('id', id)
          .single()
        googleEventId = existing?.google_event_id || null
      } catch (err) {
        console.error('google_event_id取得エラー:', err)
      }
      
      const updated = await recordApi.updateCompetition(id, updates)
      
      // Google Calendar同期（バックグラウンドで実行、エラーは無視）
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const { data: profile } = await supabase
            .from('users')
            .select('google_calendar_enabled, google_calendar_sync_competitions')
            .eq('id', user.id)
            .single()
          
          if (profile?.google_calendar_enabled && profile?.google_calendar_sync_competitions) {
            const { syncCompetitionToGoogleCalendar } = await import('../../api/google-calendar')
            const syncResult = await syncCompetitionToGoogleCalendar(updated, 'update', googleEventId || undefined)
            
            // 同期成功時にgoogle_event_idを更新（新規作成された場合は新しいID）
            if (syncResult.success && syncResult.googleEventId) {
              await supabase
                .from('competitions')
                .update({ google_event_id: syncResult.googleEventId })
                .eq('id', id)
            }
          }
        }
      } catch (err) {
        console.error('Google Calendar同期チェックエラー:', err)
      }
      
      return updated
    },
    onSuccess: (updated: Competition, variables: { id: string; updates: CompetitionUpdate }) => {
      queryClient.setQueriesData<Competition[]>(
        { queryKey: recordKeys.competitions() },
        (old: Competition[] | undefined) => {
          if (!old) return old
          return old.map((c: Competition) => c.id === variables.id ? updated : c)
        }
      )
    },
  })
}

/**
 * 大会削除ミューテーション
 */
export function useDeleteCompetitionMutation(supabase: SupabaseClient, api?: RecordAPI): UseMutationResult<void, Error, string> {
  const queryClient = useQueryClient()
  const recordApi = useMemo(() => api ?? new RecordAPI(supabase), [supabase, api])

  return useMutation({
    mutationFn: async (id: string) => {
      // 削除前にCompetitionデータとgoogle_event_idを取得（Google Calendar同期用）
      let competitionData: Competition | null = null
      let googleEventId: string | null = null
      try {
        const { data } = await supabase
          .from('competitions')
          .select('*')
          .eq('id', id)
          .single()
        competitionData = data as Competition | null
        googleEventId = competitionData?.google_event_id || null
        console.log('Competition削除 - google_event_id:', googleEventId)
      } catch (err) {
        console.error('Competition取得エラー:', err)
      }
      
      await recordApi.deleteCompetition(id)
      
      // Google Calendar同期（バックグラウンドで実行、エラーは無視）
      if (competitionData) {
        try {
          const { data: { user } } = await supabase.auth.getUser()
          if (user) {
            const { data: profile } = await supabase
              .from('users')
              .select('google_calendar_enabled, google_calendar_sync_competitions')
              .eq('id', user.id)
              .single()
            
            console.log('Competition削除 - プロフィール:', {
              google_calendar_enabled: profile?.google_calendar_enabled,
              google_calendar_sync_competitions: profile?.google_calendar_sync_competitions,
              googleEventId
            })
            
            if (profile?.google_calendar_enabled && profile?.google_calendar_sync_competitions) {
              if (googleEventId) {
                const { syncCompetitionToGoogleCalendar } = await import('../../api/google-calendar')
                const result = await syncCompetitionToGoogleCalendar(competitionData, 'delete', googleEventId)
                console.log('Competition削除 - 同期結果:', result)
                if (!result.success) {
                  console.error('Google Calendar削除エラー:', result.error)
                }
              } else {
                console.warn('Competition削除 - google_event_idが存在しないため、Google Calendar削除をスキップ')
              }
            }
          }
        } catch (err) {
          console.error('Google Calendar同期チェックエラー:', err)
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: recordKeys.competitions() })
    },
  })
}

/**
 * スプリットタイム作成ミューテーション
 */
export function useCreateSplitTimesMutation(supabase: SupabaseClient, api?: RecordAPI): UseMutationResult<SplitTime[], Error, { recordId: string; splitTimes: Array<{ distance: number; split_time?: number; splitTime?: number }> }> {
  const queryClient = useQueryClient()
  const recordApi = useMemo(() => api ?? new RecordAPI(supabase), [supabase, api])

  return useMutation({
    mutationFn: async ({
      recordId,
      splitTimes
    }: {
      recordId: string
      splitTimes: Array<{ distance: number; split_time?: number; splitTime?: number }>
    }) => {
      if (!splitTimes || splitTimes.length === 0) return []

      const splitTimeInserts: SplitTimeInsert[] = splitTimes.map(st => {
        const splitTime = st.split_time ?? st.splitTime ?? 0
        return {
          record_id: recordId,
          distance: st.distance,
          split_time: splitTime
        }
      })

      return await recordApi.createSplitTimes(splitTimeInserts)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: recordKeys.lists() })
    },
  })
}

/**
 * スプリットタイム置き換えミューテーション
 */
export function useReplaceSplitTimesMutation(supabase: SupabaseClient, api?: RecordAPI): UseMutationResult<SplitTime[], Error, { recordId: string; splitTimes: Omit<SplitTimeInsert, 'record_id'>[] }> {
  const queryClient = useQueryClient()
  const recordApi = useMemo(() => api ?? new RecordAPI(supabase), [supabase, api])

  return useMutation({
    mutationFn: async ({
      recordId,
      splitTimes
    }: {
      recordId: string
      splitTimes: Omit<SplitTimeInsert, 'record_id'>[]
    }) => {
      return await recordApi.replaceSplitTimes(recordId, splitTimes)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: recordKeys.lists() })
    },
  })
}

/**
 * 大会記録の総件数を取得するクエリ
 */
export function useRecordsCountQuery(
  supabase: SupabaseClient,
  options: { startDate?: string; endDate?: string; styleId?: number; api?: RecordAPI } = {}
): ReturnType<typeof useQuery<number, Error>> {
  const { startDate, endDate, styleId, api: providedApi } = options

  const api = useMemo(
    () => providedApi ?? new RecordAPI(supabase),
    [supabase, providedApi]
  )

  return useQuery({
    queryKey: recordKeys.count({ startDate, endDate, styleId }),
    queryFn: async () => {
      return await api.countRecords(startDate, endDate, styleId)
    },
    staleTime: 5 * 60 * 1000, // 5分
  })
}

export interface UseBestTimesQueryOptions {
  userId?: string
  api?: RecordAPI
}

/**
 * ベストタイム取得クエリ
 * 種目・プール種別ごとの最速タイムを計算
 */
export function useBestTimesQuery(
  supabase: SupabaseClient,
  options: UseBestTimesQueryOptions = {}
): UseQueryResult<BestTime[], Error> {
  const { userId, api: providedApi } = options

  const api = useMemo(
    () => providedApi ?? new RecordAPI(supabase),
    [supabase, providedApi]
  )

  return useQuery({
    queryKey: recordKeys.bestTimes(userId),
    queryFn: async () => {
      return await api.getBestTimes(userId)
    },
    enabled: true,
    staleTime: 5 * 60 * 1000, // 5分
  })
}

