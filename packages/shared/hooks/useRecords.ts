// =============================================================================
// 大会記録フック - Swim Hub共通パッケージ
// Web/Mobile共通で使用するカスタムフック
// =============================================================================

import { SupabaseClient } from '@supabase/supabase-js'
import { useCallback, useEffect, useState } from 'react'
import { RecordAPI } from '../api/records'
import { Competition, RecordWithDetails } from '../types/database'

export interface UseRecordsOptions {
  startDate?: string
  endDate?: string
  styleId?: number
  enableRealtime?: boolean
}

export function useRecords(
  supabase: SupabaseClient,
  options: UseRecordsOptions = {}
) {
  const { startDate, endDate, styleId, enableRealtime = true } = options
  
  const [records, setRecords] = useState<RecordWithDetails[]>([])
  const [competitions, setCompetitions] = useState<Competition[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const api = new RecordAPI(supabase)

  // データ取得関数
  const loadRecords = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const [recordsData, competitionsData] = await Promise.all([
        api.getRecords(startDate, endDate, styleId),
        api.getCompetitions(startDate, endDate)
      ])

      setRecords(recordsData)
      setCompetitions(competitionsData)
    } catch (err) {
      console.error('記録の取得に失敗しました:', err)
      setError(err as Error)
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate, styleId])

  // 初回データ取得
  useEffect(() => {
    loadRecords()
  }, [loadRecords])

  // リアルタイム購読
  useEffect(() => {
    if (!enableRealtime) return

    const recordsChannel = api.subscribeToRecords((newRecord) => {
      loadRecords() // 再取得してリレーションデータも含める
    })

    const competitionsChannel = api.subscribeToCompetitions((newCompetition) => {
      setCompetitions(prev => {
        const index = prev.findIndex(c => c.id === newCompetition.id)
        if (index >= 0) {
          const updated = [...prev]
          updated[index] = newCompetition
          return updated
        }
        return [newCompetition, ...prev]
      })
    })

    return () => {
      supabase.removeChannel(recordsChannel)
      supabase.removeChannel(competitionsChannel)
    }
  }, [enableRealtime])

  // 操作関数
  const createRecord = useCallback(async (record: any) => {
    const newRecord = await api.createRecord(record)
    await loadRecords() // 再取得
    return newRecord
  }, [loadRecords])

  const updateRecord = useCallback(async (id: string, updates: any) => {
    const updated = await api.updateRecord(id, updates)
    await loadRecords() // 再取得
    return updated
  }, [loadRecords])

  const deleteRecord = useCallback(async (id: string) => {
    await api.deleteRecord(id)
    setRecords(prev => prev.filter(r => r.id !== id))
  }, [])

  const createCompetition = useCallback(async (competition: any) => {
    const newCompetition = await api.createCompetition(competition)
    setCompetitions(prev => [newCompetition, ...prev])
    return newCompetition
  }, [])

  const updateCompetition = useCallback(async (id: string, updates: any) => {
    const updated = await api.updateCompetition(id, updates)
    setCompetitions(prev => prev.map(c => c.id === id ? updated : c))
    return updated
  }, [])

  const deleteCompetition = useCallback(async (id: string) => {
    await api.deleteCompetition(id)
    setCompetitions(prev => prev.filter(c => c.id !== id))
  }, [])

  const createSplitTimes = useCallback(async (recordId: string, splitTimes: any[]) => {
    // 空の配列の場合は早期リターン
    if (!splitTimes || splitTimes.length === 0) return []
    
    console.log('useRecords.createSplitTimes - 受信データ:', splitTimes)
    
    const created = await api.createSplitTimes(splitTimes.map(st => {
      // snake_case と camelCase の両方に対応
      const splitTime = st.split_time ?? st.splitTime
      const data = {
        record_id: recordId,
        distance: st.distance,
        split_time: splitTime
      }
      console.log('useRecords.createSplitTimes - マッピング結果:', data)
      return data
    }))
    await loadRecords() // 再取得
    return created
  }, [loadRecords])

  const replaceSplitTimes = useCallback(async (recordId: string, splitTimes: any[]) => {
    const replaced = await api.replaceSplitTimes(recordId, splitTimes)
    await loadRecords() // 再取得
    return replaced
  }, [loadRecords])

  return {
    records,
    competitions,
    loading,
    error,
    createRecord,
    updateRecord,
    deleteRecord,
    createCompetition,
    updateCompetition,
    deleteCompetition,
    createSplitTimes,
    replaceSplitTimes,
    refetch: loadRecords
  }
}

