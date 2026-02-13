// =============================================================================
// 目標管理React Queryフック - Swim Hub共通パッケージ
// =============================================================================

'use client'

import { SupabaseClient } from '@supabase/supabase-js'
import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { useMemo } from 'react'
import { GoalAPI } from '../../api/goals'
import { RecordAPI } from '../../api/records'
import type { Goal, GoalWithMilestones, Style } from '../../types'

// クエリキー定義
export const goalKeys = {
  all: ['goals'] as const,
  lists: () => [...goalKeys.all, 'list'] as const,
  list: (filters?: { status?: string }) => [...goalKeys.lists(), filters] as const,
  detail: (id: string) => [...goalKeys.all, 'detail', id] as const,
} as const

type GoalWithDetails = Goal & { competition?: { title: string | null }; style?: { name_jp: string } }

type GoalsQueryData = {
  goals: Goal[]
  competitions: { id: string; title: string | null }[]
}

/**
 * 目標一覧取得クエリ（competition/style情報付き）
 */
export function useGoalsQuery(
  supabase: SupabaseClient,
  options: {
    styles?: Style[]
  } = {}
): UseQueryResult<GoalWithDetails[], Error> & {
  invalidate: () => Promise<void>
} {
  const goalAPI = useMemo(() => new GoalAPI(supabase), [supabase])
  const recordAPI = useMemo(() => new RecordAPI(supabase), [supabase])
  const queryClient = useQueryClient()

  const query = useQuery<GoalsQueryData, Error, GoalWithDetails[]>({
    queryKey: goalKeys.list(),
    queryFn: async () => {
      const [goals, competitions] = await Promise.all([
        goalAPI.getGoals(),
        recordAPI.getCompetitions()
      ])

      return { goals, competitions }
    },
    select: (data) =>
      data.goals.map(goal => {
        const competition = data.competitions.find(c => c.id === goal.competition_id)
        const style = options.styles?.find(s => s.id === goal.style_id)
        return {
          ...goal,
          competition: competition ? { title: competition.title } : undefined,
          style: style ? { name_jp: style.name_jp } : undefined
        }
      }),
    staleTime: 5 * 60 * 1000,
  })

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: goalKeys.all })
  }

  return { ...query, invalidate }
}

/**
 * 目標詳細取得クエリ（マイルストーン含む）
 */
export function useGoalDetailQuery(
  supabase: SupabaseClient,
  goalId: string | null
): UseQueryResult<GoalWithMilestones | null, Error> & {
  invalidate: () => Promise<void>
} {
  const goalAPI = useMemo(() => new GoalAPI(supabase), [supabase])
  const queryClient = useQueryClient()

  const query = useQuery<GoalWithMilestones | null, Error>({
    queryKey: goalKeys.detail(goalId || ''),
    queryFn: () => goalAPI.getGoalWithMilestones(goalId!),
    enabled: !!goalId,
    staleTime: 2 * 60 * 1000,
  })

  const invalidate = async () => {
    if (goalId) {
      await queryClient.invalidateQueries({ queryKey: goalKeys.detail(goalId) })
    }
  }

  return { ...query, invalidate }
}
