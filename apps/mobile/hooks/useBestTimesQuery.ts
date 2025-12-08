// =============================================================================
// ベストタイム取得用React Queryフック（モバイル版）
// =============================================================================

import type { SupabaseClient } from '@supabase/supabase-js'
import { useQuery, type UseQueryResult } from '@tanstack/react-query'

export interface BestTime {
  id: string
  time: number
  created_at: string
  pool_type: number // 0: 短水路, 1: 長水路
  is_relaying: boolean
  style: {
    name_jp: string
    distance: number
  }
  competition?: {
    title: string
    date: string
  }
  // 引き継ぎありのタイム（オプショナル）
  relayingTime?: {
    id: string
    time: number
    created_at: string
    competition?: {
      title: string
      date: string
    }
  }
}

interface RecordWithRelations {
  id: string
  time: number
  created_at: string
  pool_type: number
  is_relaying: boolean
  styles?: { name_jp: string; distance: number } | null
  competitions?: { title: string; date: string } | null
}

export interface UseBestTimesQueryOptions {
  userId?: string
}

/**
 * ベストタイム取得クエリ
 * 種目・プール種別ごとの最速タイムを計算
 */
export function useBestTimesQuery(
  supabase: SupabaseClient,
  options: UseBestTimesQueryOptions = {}
): UseQueryResult<BestTime[], Error> {
  const { userId } = options

  return useQuery({
    queryKey: ['bestTimes', userId],
    queryFn: async () => {
      let targetUserId = userId
      if (!targetUserId) {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) throw new Error('認証が必要です')
        targetUserId = user.id
      }

      // recordsテーブルから記録を取得
      const { data, error } = await supabase
        .from('records')
        .select(`
          id,
          time,
          created_at,
          pool_type,
          is_relaying,
          styles!records_style_id_fkey (
            name_jp,
            distance
          ),
          competitions!records_competition_id_fkey (
            title,
            date
          )
        `)
        .eq('user_id', targetUserId)
        .order('time', { ascending: true })

      if (error) {
        console.error('ベストタイム取得エラー:', error)
        throw error
      }

      if (!data || !Array.isArray(data)) {
        return []
      }

      const records = data as RecordWithRelations[]

      // 引き継ぎなしのベストタイム（種目、プール種別ごと）
      const bestTimesByStyleAndPool = new Map<string, BestTime>()
      // 引き継ぎありのベストタイム（種目、プール種別ごと）
      const relayingBestTimesByStyleAndPool = new Map<
        string,
        {
          id: string
          time: number
          created_at: string
          competition?: {
            title: string
            date: string
          }
        }
      >()

      records.forEach((record) => {
        const styleKey = record.styles?.name_jp || 'Unknown'
        const poolType = record.pool_type ?? 0
        const key = `${styleKey}_${poolType}`

        if (record.is_relaying) {
          // 引き継ぎありのタイム
          if (
            !relayingBestTimesByStyleAndPool.has(key) ||
            record.time < relayingBestTimesByStyleAndPool.get(key)!.time
          ) {
            relayingBestTimesByStyleAndPool.set(key, {
              id: record.id,
              time: record.time,
              created_at: record.created_at,
              competition: record.competitions
                ? {
                    title: record.competitions.title,
                    date: record.competitions.date,
                  }
                : undefined,
            })
          }
        } else {
          // 引き継ぎなしのタイム
          if (
            !bestTimesByStyleAndPool.has(key) ||
            record.time < bestTimesByStyleAndPool.get(key)!.time
          ) {
            bestTimesByStyleAndPool.set(key, {
              id: record.id,
              time: record.time,
              created_at: record.created_at,
              pool_type: poolType,
              is_relaying: false,
              style: {
                name_jp: record.styles?.name_jp || 'Unknown',
                distance: record.styles?.distance || 0,
              },
              competition: record.competitions
                ? {
                    title: record.competitions.title,
                    date: record.competitions.date,
                  }
                : undefined,
            })
          }
        }
      })

      // 引き継ぎなしのタイムに、引き継ぎありのタイムを紐付ける
      const result: BestTime[] = []
      bestTimesByStyleAndPool.forEach((bestTime, key) => {
        const relayingTime = relayingBestTimesByStyleAndPool.get(key)
        result.push({
          ...bestTime,
          relayingTime: relayingTime,
        })
      })

      // 引き継ぎなしがなく、引き継ぎありのみの場合も追加
      relayingBestTimesByStyleAndPool.forEach((relayingTime, key) => {
        if (!bestTimesByStyleAndPool.has(key)) {
          // キーから種目名とプール種別を取得
          const [styleName, poolTypeStr] = key.split('_')
          const poolType = parseInt(poolTypeStr, 10)

          // 種目情報を取得（最初のレコードから）
          const record = records.find(
            (r) =>
              (r.styles?.name_jp || 'Unknown') === styleName &&
              (r.pool_type ?? 0) === poolType
          )

          if (record) {
            result.push({
              id: relayingTime.id,
              time: relayingTime.time,
              created_at: relayingTime.created_at,
              pool_type: poolType,
              is_relaying: true,
              style: {
                name_jp: record.styles?.name_jp || 'Unknown',
                distance: record.styles?.distance || 0,
              },
              competition: relayingTime.competition,
            })
          }
        }
      })

      return result
    },
    enabled: true,
    staleTime: 5 * 60 * 1000, // 5分
  })
}
