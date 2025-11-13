'use client'

import React, { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { useAuth } from '@/contexts'
import { DashboardAPI } from '@apps/shared/api/dashboard'
import { CalendarItem, MonthlySummary } from '@apps/shared/types/ui'
import { endOfMonth, format, startOfMonth, isSameMonth } from 'date-fns'

interface CalendarContextType {
  // 状態
  currentDate: Date
  calendarItems: CalendarItem[]
  monthlySummary: MonthlySummary
  loading: boolean
  error: Error | null
  
  // アクション
  setCurrentDate: (date: Date) => void
  refetch: (date?: Date) => Promise<void>
  addItem: (item: CalendarItem) => void
  updateItem: (id: string, item: Partial<CalendarItem>) => void
  removeItem: (id: string) => void
}

const CalendarContext = createContext<CalendarContextType | undefined>(undefined)

interface CalendarProviderProps {
  children: React.ReactNode
  initialCalendarItems?: CalendarItem[]
  initialMonthlySummary?: MonthlySummary
  initialDate?: Date // 初期データが取得された月の日付
  refreshKey?: number
}

export function CalendarProvider({ 
  children,
  initialCalendarItems = [],
  initialMonthlySummary = { practiceCount: 0, recordCount: 0 },
  initialDate = new Date(),
  refreshKey
}: CalendarProviderProps) {
  const { supabase } = useAuth()
  const [currentDate, setCurrentDateState] = useState(initialDate)
  const api = useMemo(() => new DashboardAPI(supabase), [supabase])
  const [calendarItems, setCalendarItems] = useState<CalendarItem[]>(initialCalendarItems)
  const [monthlySummary, setMonthlySummary] = useState<MonthlySummary>(initialMonthlySummary)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const isLoadingDataRef = useRef(false)
  const previousMonthRef = useRef<string | null>(null)
  const previousRefreshKeyRef = useRef<number | undefined>(refreshKey)
  
  // 現在の月を文字列で取得（比較用）
  const getCurrentMonthKey = useCallback((date: Date) => {
    return format(date, 'yyyy-MM')
  }, [])

  // 初期データの月をチェックして、現在の月と同じ場合のみ使用
  const isInitialDataForCurrentMonth = useMemo(() => {
    if (initialCalendarItems.length === 0) {
      return false
    }
    return isSameMonth(initialDate, currentDate)
  }, [initialCalendarItems.length, initialDate, currentDate])

  // 初期データが現在の月に対応している場合は使用
  useEffect(() => {
    if (isInitialDataForCurrentMonth) {
      setCalendarItems(initialCalendarItems)
      setMonthlySummary(initialMonthlySummary)
      setLoading(false)
      previousMonthRef.current = getCurrentMonthKey(currentDate)
    }
  }, [isInitialDataForCurrentMonth, initialCalendarItems, initialMonthlySummary, currentDate, getCurrentMonthKey])

  // データ取得関数（重複実行を防ぐ）
  const loadData = useCallback(async (targetDate: Date = currentDate, options?: { force?: boolean }) => {
    const force = options?.force ?? false
    // 既に実行中の場合はスキップ
    if (isLoadingDataRef.current) {
      return
    }

    const monthKey = getCurrentMonthKey(targetDate)
    
    // 同じ月のデータを既に取得済みの場合はスキップ
    if (!force && previousMonthRef.current === monthKey) {
      return
    }

    try {
      isLoadingDataRef.current = true
      setLoading(true)
      setError(null)

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
      const monthStart = startOfMonth(targetDate)
      const monthEnd = endOfMonth(targetDate)
      const startDate = format(monthStart, 'yyyy-MM-dd')
      const endDate = format(monthEnd, 'yyyy-MM-dd')

      // カレンダーエントリーと月間サマリーを並行取得
      const [entries, summary] = await Promise.all([
        api.getCalendarEntries(startDate, endDate),
        api.getMonthlySummary(targetDate.getFullYear(), targetDate.getMonth() + 1)
      ])
      
      setCalendarItems(entries)
      setMonthlySummary(summary)
      previousMonthRef.current = monthKey
      
    } catch (err) {
      console.error('Calendar data fetch error:', err)
      setError(err as Error)
      setCalendarItems([])
      setMonthlySummary({ practiceCount: 0, recordCount: 0 })
    } finally {
      setLoading(false)
      isLoadingDataRef.current = false
    }
  }, [currentDate, api, supabase, getCurrentMonthKey])

  // 月変更を検知してデータ再取得（楽観的更新）
  const setCurrentDate = useCallback((newDate: Date) => {
    const newMonthKey = getCurrentMonthKey(newDate)
    const currentMonthKey = getCurrentMonthKey(currentDate)
    
    // 月が変更された場合のみ更新
    if (newMonthKey !== currentMonthKey) {
      // 楽観的更新: すぐに日付を更新（UIを即座に反映）
      setCurrentDateState(newDate)
      // バックグラウンドでデータ取得
      void loadData(newDate)
    } else {
      // 同じ月の場合は日付のみ更新
      setCurrentDateState(newDate)
    }
  }, [currentDate, getCurrentMonthKey, loadData])

  // 初回データ取得（初期データがない場合、または月が異なる場合のみ）
  useEffect(() => {
    if (!isInitialDataForCurrentMonth) {
      // 初期データが現在の月に対応していない場合のみ取得
      void loadData()
    }
  }, [isInitialDataForCurrentMonth, loadData])

  // リフレッシュキーの変化を監視して強制的にデータを再取得
  useEffect(() => {
    if (refreshKey === undefined) {
      return
    }

    if (previousRefreshKeyRef.current === undefined) {
      previousRefreshKeyRef.current = refreshKey
      return
    }

    if (previousRefreshKeyRef.current !== refreshKey) {
      previousRefreshKeyRef.current = refreshKey
      void loadData(currentDate, { force: true })
    }
  }, [refreshKey, currentDate, loadData])

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
