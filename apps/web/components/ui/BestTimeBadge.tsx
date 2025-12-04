'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/contexts'

interface BestTimeBadgeProps {
  recordId: string
  styleId?: number
  currentTime: number
  recordDate?: string | null
  poolType?: number | null
  isRelaying?: boolean
}

/**
 * ベストタイム更新チェックバッジ
 * 記録が過去のベストタイムを更新した場合に表示される
 */
export default function BestTimeBadge({
  recordId,
  styleId,
  currentTime,
  recordDate,
  poolType,
  isRelaying
}: BestTimeBadgeProps) {
  const { supabase } = useAuth()
  const [isBestTime, setIsBestTime] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const checkBestTime = async () => {
      // ガード条件: styleIdまたはrecordDateがfalsyな値（undefined, null, ''）の場合は早期リターン
      if (!styleId || !recordDate) {
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          setLoading(false)
          return
        }

        // その大会実施日より前の同じ条件（種目・プール種別・引き継ぎ有無）の記録を取得
        // competitionsテーブルとJOINして、大会実施日で比較
        let query = supabase
          .from('records')
          .select(`
            id, 
            time,
            competitions!inner(date)
          `)
          .eq('user_id', user.id)
          .eq('style_id', styleId)
          .eq('is_relaying', isRelaying || false)
          .neq('id', recordId) // 現在の記録を除外
          .lt('competitions.date', recordDate) // その大会実施日より前
          .order('time', { ascending: true })
          .limit(1)

        // pool_typeが指定されている場合は条件に追加
        if (poolType !== null && poolType !== undefined) {
          query = query.eq('pool_type', poolType)
        }

        const { data: previousRecords, error } = await query

        if (error) throw error

        // 以前の記録がない、または現在のタイムが以前のベストより速い場合
        const isBest = !previousRecords || previousRecords.length === 0 || currentTime < previousRecords[0].time
        setIsBestTime(isBest)
      } catch (err) {
        console.error('ベストタイムチェックエラー:', err)
        setIsBestTime(null)
      } finally {
        setLoading(false)
      }
    }

    checkBestTime()
  }, [recordId, styleId, currentTime, recordDate, poolType, isRelaying, supabase])

  if (loading || isBestTime === null || !isBestTime) {
    return null
  }

  return (
    <div className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-100 border border-yellow-400 rounded-md">
      <span className="text-xs font-bold text-yellow-800">🏆 Best time！</span>
    </div>
  )
}

