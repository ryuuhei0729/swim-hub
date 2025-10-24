'use client'

import React, { useState, useMemo } from 'react'
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, isToday, addMonths, subMonths, getDay } from 'date-fns'
import { ja } from 'date-fns/locale'
import { useCalendar } from '@/contexts'
import { LoadingSpinner } from '@/components/ui'
import DayDetailModal from './DayDetailModal'
import CalendarHeader from './CalendarHeader'
import CalendarGrid from './CalendarGrid'
import CalendarSummary from './CalendarSummary'
import { CalendarItem, CalendarItemType, CalendarProps } from '@/types'

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

// カレンダー表示コンポーネント（表示ロジック）
export default function CalendarView({ 
  entries: propEntries, 
  onDateClick, 
  onAddItem,
  onEditItem,
  onDeleteItem,
  onAddPracticeLog,
  onEditPracticeLog,
  onDeletePracticeLog,
  onAddRecord,
  onEditRecord,
  onDeleteRecord,
  isLoading: propLoading = false,
  userId,
  openDayDetail
}: Omit<CalendarProps, 'currentDate' | 'onCurrentDateChange'>) {
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showMonthSelector, setShowMonthSelector] = useState(false)
  const [showDayDetail, setShowDayDetail] = useState(false)

  // カレンダーコンテキストからデータを取得
  const { 
    currentDate, 
    calendarItems, 
    monthlySummary, 
    loading: dataLoading, 
    error, 
    setCurrentDate,
    refetch 
  } = useCalendar()
  
  // openDayDetailが変更された時に記録モーダルを開く
  React.useEffect(() => {
    if (openDayDetail) {
      setSelectedDate(openDayDetail)
      setShowDayDetail(true)
    }
  }, [openDayDetail])
  
  // プロップスのentriesが指定されている場合はそれを優先、そうでなければカレンダーデータを使用
  const entries = propEntries && propEntries.length > 0 ? propEntries : calendarItems
  const isLoading = propLoading || dataLoading
  

  // 月の日付を取得
  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)
  const calendarStart = new Date(monthStart)
  calendarStart.setDate(calendarStart.getDate() - getDay(monthStart))
  const calendarEnd = new Date(monthEnd)
  calendarEnd.setDate(calendarEnd.getDate() + (6 - getDay(monthEnd)))

  const calendarDays = eachDayOfInterval({
    start: calendarStart,
    end: calendarEnd
  })

  // 日付別のエントリーをマッピング
  const entriesByDate = useMemo(() => {
    const map = new Map<string, CalendarItem[]>()
    entries.forEach(item => {
      const dateKey = item.date
      if (!map.has(dateKey)) {
        map.set(dateKey, [])
      }
      map.get(dateKey)!.push(item)
    })
    
    
    return map
  }, [entries])

  const handlePrevMonth = () => {
    const newDate = subMonths(currentDate, 1)
    setCurrentDate(newDate)
    setTimeout(() => refetch(), 100)
  }

  const handleNextMonth = () => {
    const newDate = addMonths(currentDate, 1)
    setCurrentDate(newDate)
    setTimeout(() => refetch(), 100)
  }

  const handleDateClick = (date: Date) => {
    setSelectedDate(date)
    setShowDayDetail(true)
    onDateClick?.(date)
  }

  const handleAddClick = (date: Date) => {
    setSelectedDate(date)
    setShowAddModal(true)
  }

  const handleAddItem = (type: 'practice' | 'record') => {
    if (selectedDate && onAddItem) {
      onAddItem(selectedDate, type)
    }
    setShowAddModal(false)
    setSelectedDate(null)
  }

  const getDateEntries = (date: Date) => {
    const dateKey = format(date, 'yyyy-MM-dd')
    return entriesByDate.get(dateKey) || []
  }

  const getItemColor = (type: CalendarItemType) => {
    switch (type) {
      case 'practice':
        return 'bg-green-100 text-green-800 border-green-200'
      case 'team_practice':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200'
      case 'practice_log':
        return 'bg-lime-100 text-lime-800 border-lime-200'
      case 'competition':
        return 'bg-purple-100 text-purple-800 border-purple-200'
      case 'team_competition':
        return 'bg-violet-100 text-violet-800 border-violet-200'
      case 'entry':
        return 'bg-orange-100 text-orange-800 border-orange-200'
      case 'record':
        return 'bg-blue-100 text-blue-800 border-blue-200'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getDayStatusIndicator = (entries: CalendarItem[]) => {
    if (entries.length === 0) return null
    
    const hasPractice = entries.some(e => e.type === 'practice' || e.type === 'team_practice' || e.type === 'practice_log')
    const hasRecord = entries.some(e => e.type === 'record')
    const hasCompetition = entries.some(e => e.type === 'competition' || e.type === 'team_competition')
    const hasEntry = entries.some(e => e.type === 'entry')
    
    if (hasPractice && (hasRecord || hasCompetition || hasEntry)) {
      return (
        <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-gradient-to-r from-green-400 to-blue-400 border border-white shadow-sm"></div>
      )
    } else if (hasPractice) {
      return (
        <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-green-400 border border-white shadow-sm"></div>
      )
    } else if (hasEntry) {
      return (
        <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-orange-400 border border-white shadow-sm"></div>
      )
    } else if (hasRecord || hasCompetition) {
      return (
        <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-blue-400 border border-white shadow-sm"></div>
      )
    }
    
    return null
  }

  const handleMonthYearSelect = (year: number, month: number) => {
    const newDate = new Date(year, month, 1)
    setCurrentDate(newDate)
    setShowMonthSelector(false)
    setTimeout(() => refetch(), 100)
  }

  const handleTodayClick = () => {
    const today = new Date()
    setCurrentDate(today)
    setTimeout(() => refetch(), 100)
  }

  // エラー表示
  if (error && !isLoading) {
    return (
      <div className="bg-white rounded-lg shadow">
        <div className="px-4 sm:px-6 py-4 border-b border-gray-200 bg-white">
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900">
            練習・記録カレンダー
          </h2>
        </div>
        <div className="p-6 sm:p-8">
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
              <ExclamationTriangleIcon className="h-8 w-8 text-red-500" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">データの読み込みに失敗しました</h3>
            <p className="text-gray-600 mb-6 max-w-md">
              カレンダーデータを取得できませんでした。ネットワーク接続を確認してから再試行してください。
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => refetch()}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                再試行
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
              >
                ページを更新
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white shadow">
      {/* ヘッダー */}
      <CalendarHeader
        currentDate={currentDate}
        isLoading={isLoading}
        onPrevMonth={handlePrevMonth}
        onNextMonth={handleNextMonth}
        onTodayClick={handleTodayClick}
        onMonthYearSelect={handleMonthYearSelect}
        showMonthSelector={showMonthSelector}
        setShowMonthSelector={setShowMonthSelector}
      />

      {/* カレンダー本体 */}
      <CalendarGrid
        calendarDays={calendarDays}
        currentDate={currentDate}
        entriesByDate={entriesByDate}
        isLoading={isLoading}
        onDateClick={handleDateClick}
        onAddClick={handleAddClick}
        getItemColor={getItemColor}
        getDayStatusIndicator={getDayStatusIndicator}
      />

      {/* 今月のサマリー */}
      <CalendarSummary
        currentDate={currentDate}
        monthlySummary={monthlySummary}
        entries={entries}
        isLoading={isLoading}
      />

      {/* 年月選択モーダル */}
      {showMonthSelector && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={() => setShowMonthSelector(false)}></div>

            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-md sm:w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <div className="sm:flex sm:items-start">
                  <div className="mt-3 text-center sm:mt-0 sm:text-left w-full">
                    <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                      年月を選択
                    </h3>
                    <div className="space-y-4">
                      {/* 年選択 */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">年</label>
                        <select
                          value={currentDate.getFullYear()}
                          onChange={(e) => handleMonthYearSelect(parseInt(e.target.value), currentDate.getMonth())}
                          className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 5 + i).map(year => (
                            <option key={year} value={year}>{year}年</option>
                          ))}
                        </select>
                      </div>
                      
                      {/* 月選択 */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">月</label>
                        <div className="grid grid-cols-3 gap-2">
                          {Array.from({ length: 12 }, (_, i) => i).map(month => (
                            <button
                              key={month}
                              onClick={() => handleMonthYearSelect(currentDate.getFullYear(), month)}
                              className={`
                                px-3 py-2 text-sm rounded-md border transition-colors
                                ${currentDate.getMonth() === month 
                                  ? 'bg-blue-600 text-white border-blue-600' 
                                  : 'bg-white text-gray-700 border-gray-300 hover:bg-blue-50 hover:border-blue-300'
                                }
                              `}
                            >
                              {month + 1}月
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                <button
                  type="button"
                  className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                  onClick={() => setShowMonthSelector(false)}
                >
                  キャンセル
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 記録追加モーダル */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={() => setShowAddModal(false)}></div>

            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <div className="sm:flex sm:items-start">
                  <div className="mt-3 text-center sm:mt-0 sm:text-left w-full">
                    <h3 className="text-lg leading-6 font-medium text-gray-900 mb-4">
                      記録を追加 - {selectedDate && format(selectedDate, 'M月d日', { locale: ja })}
                    </h3>
                    <div className="space-y-3">
                      <button
                        onClick={() => handleAddItem('practice')}
                        className="w-full flex items-center justify-center px-4 py-3 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-green-50 hover:border-green-300 focus:outline-none focus:ring-2 focus:ring-green-500"
                      >
                        <span className="mr-2">💪</span>
                        練習予定を追加
                      </button>
                      <button
                        onClick={() => handleAddItem('record')}
                        className="w-full flex items-center justify-center px-4 py-3 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-blue-50 hover:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <span className="mr-2">🏊‍♂️</span>
                        大会記録を追加
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                <button
                  type="button"
                  className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                  onClick={() => setShowAddModal(false)}
                >
                  キャンセル
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 日付詳細モーダル */}
      {showDayDetail && selectedDate && (
        <DayDetailModal
          isOpen={showDayDetail}
          onClose={() => {
            setShowDayDetail(false)
            setSelectedDate(null)
          }}
          date={selectedDate}
          entries={getDateEntries(selectedDate)}
          onEditItem={onEditItem}
          onDeleteItem={(itemId, itemType) => {
            onDeleteItem?.(itemId, itemType)
            refetch()
          }}
          onAddItem={(date, type) => {
            setShowDayDetail(false)
            setSelectedDate(null)
            onAddItem?.(date, type)
          }}
          onAddPracticeLog={onAddPracticeLog}
          onEditPracticeLog={onEditPracticeLog}
          onDeletePracticeLog={onDeletePracticeLog}
          onAddRecord={onAddRecord}
          onEditRecord={onEditRecord}
          onDeleteRecord={onDeleteRecord}
        />
      )}
    </div>
  )
}
