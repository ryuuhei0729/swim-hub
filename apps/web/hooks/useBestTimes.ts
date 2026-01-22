import { useState, useCallback } from 'react'
import { SupabaseClient } from '@supabase/supabase-js'
import type { BestTime, RelayingTimeRecord } from '@/types/member-detail'

export function useBestTimes(supabase: SupabaseClient) {
  const [bestTimes, setBestTimes] = useState<BestTime[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadBestTimes = useCallback(async (userId: string) => {
    try {
      setLoading(true)
      setError(null)

      const { data, error: fetchError } = await supabase
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
        .eq('user_id', userId)
        .order('time', { ascending: true })

      if (fetchError) throw fetchError

      // 引き継ぎなしのベストタイム（種目、プール種別ごと）
      const bestTimesByStyleAndPool = new Map<string, BestTime>()
      // 引き継ぎありのベストタイム（種目、プール種別ごと）
      const relayingBestTimesByStyleAndPool = new Map<string, RelayingTimeRecord>()

      if (data && Array.isArray(data)) {
        data.forEach((record: {
          id: string
          time: number
          created_at: string
          pool_type: number
          is_relaying: boolean
          styles?: { name_jp: string; distance: number } | null | { name_jp: string; distance: number }[]
          competitions?: { title: string; date: string } | null | { title: string; date: string }[]
        }) => {
          const style = Array.isArray(record.styles) ? record.styles[0] : record.styles
          const competition = Array.isArray(record.competitions) ? record.competitions[0] : record.competitions
          const styleKey = style?.name_jp || 'Unknown'
          const poolType = record.pool_type ?? 0
          const key = `${styleKey}_${poolType}`

          if (record.is_relaying) {
            // 引き継ぎありのタイム
            if (!relayingBestTimesByStyleAndPool.has(key) ||
                record.time < relayingBestTimesByStyleAndPool.get(key)!.time) {
              relayingBestTimesByStyleAndPool.set(key, {
                id: record.id,
                time: record.time,
                created_at: record.created_at,
                competition: competition ? {
                  title: competition.title,
                  date: competition.date
                } : undefined
              })
            }
          } else {
            // 引き継ぎなしのタイム
            if (!bestTimesByStyleAndPool.has(key) ||
                record.time < bestTimesByStyleAndPool.get(key)!.time) {
              bestTimesByStyleAndPool.set(key, {
                id: record.id,
                time: record.time,
                created_at: record.created_at,
                pool_type: poolType,
                is_relaying: false,
                style: {
                  name_jp: style?.name_jp || 'Unknown',
                  distance: style?.distance || 0
                },
                competition: competition ? {
                  title: competition.title,
                  date: competition.date
                } : undefined
              })
            }
          }
        })
      }

      // 引き継ぎなしのタイムに、引き継ぎありのタイムを紐付ける
      const result: BestTime[] = []
      bestTimesByStyleAndPool.forEach((bestTime, key) => {
        const relayingTime = relayingBestTimesByStyleAndPool.get(key)
        result.push({
          ...bestTime,
          relayingTime: relayingTime
        })
      })

      // 引き継ぎありのみのタイム（引き継ぎなしがない場合）も追加
      relayingBestTimesByStyleAndPool.forEach((relayingTime, key) => {
        if (!bestTimesByStyleAndPool.has(key)) {
          const [styleName, poolTypeStr] = key.split('_')
          const poolType = parseInt(poolTypeStr, 10)

          const record = data?.find((r: {
            id: string
            pool_type: number
            is_relaying: boolean
            styles?: { name_jp: string; distance: number } | null | { name_jp: string; distance: number }[]
          }) => {
            const style = Array.isArray(r.styles) ? r.styles[0] : r.styles
            return (style?.name_jp || 'Unknown') === styleName &&
              (r.pool_type ?? 0) === poolType &&
              r.is_relaying &&
              r.id === relayingTime.id
          })

          if (record) {
            const style = Array.isArray(record.styles) ? record.styles[0] : record.styles
            result.push({
              id: relayingTime.id,
              time: relayingTime.time,
              created_at: relayingTime.created_at,
              pool_type: poolType,
              is_relaying: true,
              style: {
                name_jp: styleName,
                distance: style?.distance || 0
              },
              competition: relayingTime.competition
            })
          }
        }
      })

      setBestTimes(result)
    } catch (err) {
      console.error('ベストタイム取得エラー:', err)
      setError('ベストタイムの取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [supabase])

  return {
    bestTimes,
    loading,
    error,
    loadBestTimes
  }
}
