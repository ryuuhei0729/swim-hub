'use client'

import React, { useState, useEffect } from 'react'
import { useAuth } from '@/contexts'
import { LapTimeDisplay } from '@/components/forms/LapTimeDisplay'
import type { SplitTime } from '@apps/shared/types'
import type { RecordSplitTimesProps } from '../../types'

export function RecordSplitTimes({ recordId, raceDistance, recordTime }: RecordSplitTimesProps) {
  const { supabase } = useAuth()
  const [splits, setSplits] = useState<SplitTime[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    const loadSplits = async () => {
      try {
        setLoading(true)
        const { data, error } = await supabase
          .from('split_times')
          .select('*')
          .eq('record_id', recordId)
          .order('distance', { ascending: true })

        if (error) throw error

        setSplits(data || [])
      } catch (err) {
        console.error('スプリットタイムの取得エラー:', err)
        setError(err as Error)
      } finally {
        setLoading(false)
      }
    }

    loadSplits()
  }, [recordId, supabase])

  if (loading) {
    return (
      <div className="mt-3 text-sm text-gray-500">スプリットを読み込み中...</div>
    )
  }
  if (error) {
    return (
      <div className="mt-3 text-sm text-red-600">スプリットの取得に失敗しました</div>
    )
  }

  // DBにsplit_timeがない場合は表示しない
  if (!splits.length) {
    return null
  }

  // DBから取得したsplit_timesに、ゴールタイム（種目の距離）を追加して表示用データを作成
  const displaySplitTimes = (() => {
    const baseSplits = splits.map(st => ({
      distance: st.distance,
      splitTime: st.split_time
    }))

    // ゴールタイムを最終splitとして追加（種目の距離と同じ距離のsplitがない場合）
    if (raceDistance && recordTime && recordTime > 0) {
      const hasGoalSplit = baseSplits.some(st => st.distance === raceDistance)
      if (!hasGoalSplit) {
        return [...baseSplits, { distance: raceDistance, splitTime: recordTime }]
      }
    }

    return baseSplits
  })()

  return (
    <div className="mt-3">
      {/* 距離別Lap表示 */}
      {displaySplitTimes.length > 0 && (
        <LapTimeDisplay
          splitTimes={displaySplitTimes}
          raceDistance={raceDistance}
        />
      )}
    </div>
  )
}
