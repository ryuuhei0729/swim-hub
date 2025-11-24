// =============================================================================
// 大会記録React Queryフック - Swim Hub共通パッケージ
// =============================================================================

'use client'

import { SupabaseClient } from '@supabase/supabase-js'
import { useMutation, useQuery, useQueryClient, type UseMutationResult } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import { RecordAPI } from '../../api/records'
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
import { recordKeys } from './keys'

export interface UseRecordsQueryOptions {
  startDate?: string
  endDate?: string
  styleId?: number
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

  // 記録取得クエリ
  const recordsQuery = useQuery({
    queryKey: recordKeys.list({ startDate, endDate, styleId }),
    queryFn: async () => {
      return await api.getRecords(startDate, endDate, styleId)
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
      queryClient.invalidateQueries({ queryKey: recordKeys.list({ startDate, endDate, styleId }) })
    })

    return () => {
      supabase.removeChannel(recordsChannel)
    }
  }, [api, enableRealtime, queryClient, startDate, endDate, styleId, recordsQuery.data, supabase])

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: recordKeys.lists() })
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: recordKeys.lists() })
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
      return await recordApi.createCompetition(competition)
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
      return await recordApi.updateCompetition(id, updates)
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
      await recordApi.deleteCompetition(id)
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

