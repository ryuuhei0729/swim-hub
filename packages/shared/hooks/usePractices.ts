// =============================================================================
// 練習記録フック - Swim Hub共通パッケージ
// Web/Mobile共通で使用するカスタムフック
// =============================================================================

import { SupabaseClient } from '@supabase/supabase-js'
import { useCallback, useEffect, useState } from 'react'
import { PracticeAPI } from '../api/practices'
import { Practice, PracticeWithLogs } from '../types/database'

export interface UsePracticesOptions {
  startDate?: string
  endDate?: string
  enableRealtime?: boolean
}

export function usePractices(
  supabase: SupabaseClient,
  options: UsePracticesOptions = {}
) {
  const { startDate, endDate, enableRealtime = true } = options
  
  const [practices, setPractices] = useState<PracticeWithLogs[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const api = new PracticeAPI(supabase)

  // データ取得関数
  const loadPractices = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      let data: PracticeWithLogs[]
      
      if (startDate && endDate) {
        data = await api.getPractices(startDate, endDate)
      } else {
        // デフォルト: 過去1年分
        const end = new Date().toISOString().split('T')[0]
        const start = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        data = await api.getPractices(start, end)
      }

      setPractices(data)
    } catch (err) {
      console.error('練習記録の取得に失敗しました:', err)
      setError(err as Error)
    } finally {
      setLoading(false)
    }
  }, [startDate, endDate])

  // 初回データ取得
  useEffect(() => {
    loadPractices()
  }, [loadPractices])

  // リアルタイム購読
  useEffect(() => {
    if (!enableRealtime) return

    const channel = api.subscribeToPractices((newPractice) => {
      setPractices(prev => {
        // 既存のものを更新、なければ追加
        const index = prev.findIndex(p => p.id === newPractice.id)
        if (index >= 0) {
          const updated = [...prev]
          updated[index] = { ...updated[index], ...newPractice }
          return updated
        }
        // 日付範囲内なら追加
        if (startDate && endDate) {
          if (newPractice.date >= startDate && newPractice.date <= endDate) {
            return [newPractice as PracticeWithLogs, ...prev]
          }
        } else {
          return [newPractice as PracticeWithLogs, ...prev]
        }
        return prev
      })
    })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [enableRealtime, startDate, endDate])

  // 操作関数
  const createPractice = useCallback(async (
    practice: Omit<Practice, 'id' | 'user_id' | 'created_at' | 'updated_at'>
  ) => {
    const newPractice = await api.createPractice(practice)
    await loadPractices() // 再取得
    return newPractice
  }, [loadPractices])

  const updatePractice = useCallback(async (
    id: string,
    updates: Partial<Practice>
  ) => {
    const updated = await api.updatePractice(id, updates)
    setPractices(prev => prev.map(p => p.id === id ? { ...p, ...updated } : p))
    return updated
  }, [])

  const deletePractice = useCallback(async (id: string) => {
    await api.deletePractice(id)
    setPractices(prev => prev.filter(p => p.id !== id))
  }, [])

  const createPracticeLog = useCallback(async (log: any) => {
    const newLog = await api.createPracticeLog(log)
    await loadPractices() // 再取得してリレーションデータも含める
    return newLog
  }, [loadPractices])

  const updatePracticeLog = useCallback(async (id: string, updates: any) => {
    const updated = await api.updatePracticeLog(id, updates)
    await loadPractices() // 再取得
    return updated
  }, [loadPractices])

  const deletePracticeLog = useCallback(async (id: string) => {
    await api.deletePracticeLog(id)
    await loadPractices() // 再取得
  }, [loadPractices])

  const createPracticeTimes = useCallback(async (times: any[]) => {
    const created = await api.createPracticeTimes(times)
    await loadPractices() // 再取得
    return created
  }, [loadPractices])

  const replacePracticeTimes = useCallback(async (practiceLogId: string, times: any[]) => {
    const replaced = await api.replacePracticeTimes(practiceLogId, times)
    await loadPractices() // 再取得
    return replaced
  }, [loadPractices])

  return {
    practices,
    loading,
    error,
    createPractice,
    updatePractice,
    deletePractice,
    createPracticeLog,
    updatePracticeLog,
    deletePracticeLog,
    createPracticeTimes,
    replacePracticeTimes,
    createPracticeTime: api.createPracticeTime.bind(api),
    deletePracticeTime: api.deletePracticeTime.bind(api),
    refetch: loadPractices,
    refresh: loadPractices
  }
}

