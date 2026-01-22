import { useState, useCallback } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * ベストタイムの型定義
 */
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

/**
 * メンバーのベストタイムを管理するカスタムフック
 *
 * TeamMemberManagementとMemberDetailModalで共有
 */
export const useMemberBestTimes = (supabase: SupabaseClient) => {
  const [memberBestTimes, setMemberBestTimes] = useState<Map<string, BestTime[]>>(new Map())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * 個別メンバーのベストタイムを取得
   */
  const loadBestTimesForMember = useCallback(async (userId: string): Promise<BestTime[]> => {
    try {
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
      const relayingBestTimesByStyleAndPool = new Map<string, {
        id: string
        time: number
        created_at: string
        competition?: {
          title: string
          date: string
        }
      }>()

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

      return result
    } catch (err) {
      console.error(`メンバー ${userId} のベストタイム取得エラー:`, err)
      return []
    }
  }, [supabase])

  /**
   * 複数メンバーのベストタイムを並列取得
   */
  const loadAllBestTimes = useCallback(async (members: Array<{ id: string; user_id: string }>) => {
    try {
      setLoading(true)
      setError(null)
      const bestTimesMap = new Map<string, BestTime[]>()

      // 並列で全メンバーのベストタイムを取得
      const promises = members.map(async (member) => {
        const bestTimes = await loadBestTimesForMember(member.user_id)
        return { memberId: member.id, bestTimes }
      })

      const results = await Promise.all(promises)
      results.forEach(({ memberId, bestTimes }) => {
        bestTimesMap.set(memberId, bestTimes)
      })

      setMemberBestTimes(bestTimesMap)
    } catch (err) {
      console.error('ベストタイム取得エラー:', err)
      setError('ベストタイムの取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [loadBestTimesForMember])

  /**
   * 特定のメンバー、スタイル、距離でベストタイムを取得
   * includeRelaying: 引き継ぎタイムを含めるかどうか
   */
  const getBestTimeForMember = useCallback((
    memberId: string,
    style: string,
    distance: number,
    includeRelaying: boolean = false
  ): BestTime | null => {
    const bestTimes = memberBestTimes.get(memberId) || []
    const dbStyleName = `${distance}m${style}`

    // ALLタブ: 短水路と長水路の速い方を選択
    const candidates: BestTime[] = []

    // 短水路のタイムを取得
    const shortCourseTimes = bestTimes.filter(bt =>
      bt.style.name_jp === dbStyleName &&
      bt.pool_type === 0
    )

    shortCourseTimes.forEach(bt => {
      if (!bt.is_relaying) {
        candidates.push(bt)
        if (includeRelaying && bt.relayingTime) {
          candidates.push({
            ...bt,
            id: bt.relayingTime.id,
            time: bt.relayingTime.time,
            created_at: bt.relayingTime.created_at,
            is_relaying: true,
            competition: bt.relayingTime.competition
          })
        }
      } else {
        if (includeRelaying) {
          candidates.push(bt)
        }
      }
    })

    // 長水路のタイムを取得
    const longCourseTimes = bestTimes.filter(bt =>
      bt.style.name_jp === dbStyleName &&
      bt.pool_type === 1
    )

    longCourseTimes.forEach(bt => {
      if (!bt.is_relaying) {
        candidates.push(bt)
        if (includeRelaying && bt.relayingTime) {
          candidates.push({
            ...bt,
            id: bt.relayingTime.id,
            time: bt.relayingTime.time,
            created_at: bt.relayingTime.created_at,
            is_relaying: true,
            competition: bt.relayingTime.competition
          })
        }
      } else {
        if (includeRelaying) {
          candidates.push(bt)
        }
      }
    })

    if (candidates.length === 0) return null

    // 最速のタイムを選択
    return candidates.reduce((best, current) =>
      current.time < best.time ? current : best
    )
  }, [memberBestTimes])

  return {
    memberBestTimes,
    loading,
    error,
    loadBestTimesForMember,
    loadAllBestTimes,
    getBestTimeForMember
  }
}
