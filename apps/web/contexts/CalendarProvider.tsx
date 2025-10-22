'use client'

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { DashboardAPI } from '@apps/shared/api/dashboard'
import { CalendarItem, MonthlySummary } from '@apps/shared/types/ui'
import { endOfMonth, format, startOfMonth } from 'date-fns'

interface CalendarContextType {
  // 状態
  currentDate: Date
  calendarItems: CalendarItem[]
  monthlySummary: MonthlySummary
  loading: boolean
  error: Error | null
  
  // アクション
  setCurrentDate: (date: Date) => void
  refetch: () => Promise<void>
  addItem: (item: CalendarItem) => void
  updateItem: (id: string, item: Partial<CalendarItem>) => void
  removeItem: (id: string) => void
}

const CalendarContext = createContext<CalendarContextType | undefined>(undefined)

export function CalendarProvider({ children }: { children: React.ReactNode }) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [calendarItems, setCalendarItems] = useState<CalendarItem[]>([])
  const [monthlySummary, setMonthlySummary] = useState<MonthlySummary>({
    practiceCount: 0,
    recordCount: 0
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const isLoadingDataRef = useRef(false)

  // データ取得関数（重複実行を防ぐ）
  const loadData = useCallback(async () => {
    // 既に実行中の場合はスキップ
    if (isLoadingDataRef.current) {
      return
    }

    try {
      isLoadingDataRef.current = true
      setLoading(true)
      setError(null)

      const supabase = createClient()
      const api = new DashboardAPI(supabase)

      // ユーザー認証チェック
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        // 認証されていない場合、全ての状態を初期値にリセット
        setCalendarItems([])
        setMonthlySummary({ practiceCount: 0, recordCount: 0 })
        setError(null)
        setLoading(false)
        isLoadingDataRef.current = false
        return
      }

      // 月の開始日と終了日を計算
      const monthStart = startOfMonth(currentDate)
      const monthEnd = endOfMonth(currentDate)
      const startDate = format(monthStart, 'yyyy-MM-dd')
      const endDate = format(monthEnd, 'yyyy-MM-dd')


      // カレンダーエントリーと月間サマリーを並行取得
            const [entries, summary] = await Promise.all([
              api.getCalendarEntries(startDate, endDate),
              api.getMonthlySummary(currentDate.getFullYear(), currentDate.getMonth() + 1)
            ])
            
            setCalendarItems(entries)
            setMonthlySummary(summary)
      
    } catch (err) {
      console.error('Calendar data fetch error:', err)
      setError(err as Error)
      setCalendarItems([])
      setMonthlySummary({ practiceCount: 0, recordCount: 0 })
    } finally {
      setLoading(false)
      isLoadingDataRef.current = false
    }
  }, [currentDate])

  // 初回データ取得
  useEffect(() => {
    loadData()
  }, [loadData])

  // アイテム操作
  const addItem = useCallback((item: CalendarItem) => {
    setCalendarItems(prev => [...prev, item])
  }, [])

  const updateItem = useCallback((id: string, updates: Partial<CalendarItem>) => {
    setCalendarItems(prev => 
      prev.map(item => 
        item.id === id ? { ...item, ...updates } : item
      )
    )
  }, [])

  const removeItem = useCallback((id: string) => {
    setCalendarItems(prev => prev.filter(item => item.id !== id))
  }, [])

  const value: CalendarContextType = {
    currentDate,
    calendarItems,
    monthlySummary,
    loading,
    error,
    setCurrentDate,
    refetch: loadData,
    addItem,
    updateItem,
    removeItem
  }

  return (
    <CalendarContext.Provider value={value}>
      {children}
    </CalendarContext.Provider>
  )
}

export function useCalendar() {
  const context = useContext(CalendarContext)
  if (context === undefined) {
    throw new Error('useCalendar must be used within a CalendarProvider')
  }
  return context
}
