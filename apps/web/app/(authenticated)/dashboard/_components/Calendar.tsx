'use client'

import React, { useState, useMemo } from 'react'
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, isToday, addMonths, subMonths, getDay } from 'date-fns'
import { ja } from 'date-fns/locale'
import { useCalendarData } from '../_hooks/useCalendarData'
import { LoadingSpinner } from '@/components/ui'
import DayDetailModal from './DayDetailModal'
import { CalendarItem, CalendarItemType, CalendarProps } from '@/types'

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

export default function Calendar({ 
  entries: propEntries, 
  onDateClick, 
  onAddItem,
  onEditItem,
  onDeleteItem,
  onAddPracticeLog,
  onEditPracticeLog,
  onDeletePracticeLog,
  isLoading: propLoading = false,
  userId,
  openDayDetail
}: CalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showMonthSelector, setShowMonthSelector] = useState(false)
  const [showDayDetail, setShowDayDetail] = useState(false)

  // GraphQLデータを取得
  const { calendarItems, monthlySummary, loading: dataLoading, error, refetch } = useCalendarData(currentDate, userId)
  
  // openDayDetailが変更された時に記録モーダルを開く
  React.useEffect(() => {
    if (openDayDetail) {
      setSelectedDate(openDayDetail)
      setShowDayDetail(true)
    }
  }, [openDayDetail])
  
  // プロップスのentriesが指定されている場合はそれを優先、そうでなければGraphQLデータを使用
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
      const dateKey = item.item_date
      if (!map.has(dateKey)) {
        map.set(dateKey, [])
      }
      map.get(dateKey)!.push(item)
    })
    return map
  }, [entries])

  const handlePrevMonth = () => {
    setCurrentDate(subMonths(currentDate, 1))
    // データを再取得
    setTimeout(() => refetch(), 100)
  }

  const handleNextMonth = () => {
    setCurrentDate(addMonths(currentDate, 1))
    // データを再取得
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

  const getItemIcon = (_type: CalendarItemType) => {
    return ''
  }

  const getItemColor = (type: CalendarItemType) => {
    switch (type) {
      case 'practice':
        return 'bg-green-100 text-green-800 border-green-200'
      case 'record':
        return 'bg-blue-100 text-blue-800 border-blue-200'
      case 'competition':
        return 'bg-purple-100 text-purple-800 border-purple-200'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getDayStatusIndicator = (entries: CalendarItem[]) => {
    if (entries.length === 0) return null
    
    const hasPractice = entries.some(e => e.item_type === 'practice')
    const hasRecord = entries.some(e => e.item_type === 'record')
    
    if (hasPractice && hasRecord) {
      return (
        <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-gradient-to-r from-green-400 to-blue-400 border border-white shadow-sm"></div>
      )
    } else if (hasPractice) {
      return (
        <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-green-400 border border-white shadow-sm"></div>
      )
    } else if (hasRecord) {
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
    // データを再取得
    setTimeout(() => refetch(), 100)
  }

  const handleTodayClick = () => {
    const today = new Date()
    setCurrentDate(today)
    // データを再取得
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
      <div className="px-4 sm:px-6 py-4 border-b border-gray-200 bg-white">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-2 sm:space-y-0">
          <div className="flex items-center space-x-2">
            <h2 className="hidden sm:block text-xl font-semibold text-gray-900">
              練習・記録カレンダー
            </h2>
            {isLoading && <LoadingSpinner size="sm" />}
          </div>
          <div className="flex items-center justify-center sm:justify-end space-x-1">
            <button
              onClick={handleTodayClick}
              className="px-3 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition-colors border border-blue-200 hover:border-blue-300"
              disabled={isLoading}
              title="今月に戻る"
            >
              今日
            </button>
            <button
              onClick={handlePrevMonth}
              className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 disabled:opacity-50 transition-colors"
              disabled={isLoading}
              aria-label="前の月"
            >
              <ChevronLeftIcon className="h-5 w-5" />
            </button>
            <button
              onClick={() => setShowMonthSelector(true)}
              className="text-base sm:text-lg font-medium text-gray-900 min-w-[100px] sm:min-w-[120px] text-center hover:bg-gray-100 rounded-lg px-3 py-2 transition-colors"
              disabled={isLoading}
            >
              {format(currentDate, 'yyyy年M月', { locale: ja })}
            </button>
            <button
              onClick={handleNextMonth}
              className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100 disabled:opacity-50 transition-colors"
              disabled={isLoading}
              aria-label="次の月"
            >
              <ChevronRightIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      {/* カレンダー本体 */}
      <div className="p-3 sm:p-6">
        {/* 曜日ヘッダー */}
        <div className="grid grid-cols-7 gap-0 sm:gap-1 mb-2">
          {WEEKDAYS.map((day) => (
            <div key={day} className="p-1 sm:p-2 text-center text-sm font-medium text-gray-500">
              {day}
            </div>
          ))}
        </div>

        {/* 日付グリッド */}
        <div className="grid grid-cols-7 gap-0 sm:gap-1">
          {isLoading ? (
            // ローディング中のスケルトン
            Array.from({ length: 42 }, (_, index) => (
              <div
                key={`skeleton-${index}`}
                className="min-h-[80px] sm:min-h-[100px] p-1 sm:p-2 border border-gray-200 rounded-lg bg-gray-50 animate-pulse"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="w-4 h-4 bg-gray-300 rounded"></div>
                  <div className="w-3 h-3 bg-gray-300 rounded"></div>
                </div>
                <div className="space-y-1">
                  <div className="w-full h-4 bg-gray-300 rounded"></div>
                  <div className="w-3/4 h-4 bg-gray-300 rounded"></div>
                </div>
              </div>
            ))
          ) : (
            calendarDays.map((day) => {
              const dayEntries = getDateEntries(day)
              const isCurrentMonth = isSameMonth(day, currentDate)
              const isSelected = selectedDate && isSameDay(day, selectedDate)
              const isTodayDate = isToday(day)

            return (
              <div
                key={day.toISOString()}
                className={`
                  relative min-h-[80px] sm:min-h-[100px] p-1 sm:p-2 border border-gray-200 rounded-none sm:rounded-lg cursor-pointer transition-all duration-200
                  ${isCurrentMonth ? 'bg-white hover:bg-gray-50' : 'bg-gray-50 text-gray-400'}
                  ${isSelected ? 'ring-2 ring-blue-500 bg-blue-50 z-10' : ''}
                  ${isTodayDate ? 'ring-2 ring-blue-400 bg-blue-50/30 z-10' : ''}
                  ${dayEntries.length > 0 && isCurrentMonth ? 'shadow-sm hover:shadow-md' : ''}
                `}
                onClick={() => handleDateClick(day)}
              >
                {/* 記録状態インジケーター */}
                {isCurrentMonth && getDayStatusIndicator(dayEntries)}
                {/* 日付 */}
                <div className="flex items-center justify-between mb-1">
                  <span className={`
                    text-sm font-medium
                    ${isTodayDate ? 'text-blue-600 font-bold' : ''}
                    ${!isCurrentMonth ? 'text-gray-400' : 'text-gray-900'}
                  `}>
                    {format(day, 'd')}
                  </span>
                  {isCurrentMonth && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleAddClick(day)
                      }}
                      className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                      title="記録を追加"
                    >
                      <PlusIcon className="h-3 w-3 sm:h-4 sm:w-4" />
                    </button>
                  )}
                </div>

                {/* エントリー表示 */}
                <div className="space-y-1">
                  {dayEntries.slice(0, 2).map((item) => (
                    <div
                      key={item.id}
                      className={`
                        text-[10px] px-0.5 sm:px-1 py-0.5 rounded-md truncate transition-all duration-200 border
                        ${getItemColor(item.item_type)}
                        hover:opacity-80 hover:scale-105 cursor-pointer
                      `}
                      title={item.title}
                      onClick={(e) => {
                        e.stopPropagation()
                        // 詳細表示のためのクリック処理
                      }}
                    >
                      <span className="mr-1">{getItemIcon(item.item_type)}</span>
                      <span className="hidden sm:inline font-medium">
                        {item.item_type === 'record' && item.is_relaying ? (
                          <>
                            {item.title.replace(/R$/, '')}
                            <span className="font-bold text-red-600 ml-1">R</span>
                          </>
                        ) : (
                          item.title
                        )}
                      </span>
                      <span className="sm:hidden font-medium">
                        {item.item_type === 'record' && item.is_relaying ? (
                          <>
                            {(item.title.split(':')[0] || item.title).replace(/R$/, '')}
                            <span className="font-bold text-red-600 ml-1">R</span>
                          </>
                        ) : (
                          item.title.split(':')[0] || item.title
                        )}
                      </span>
                    </div>
                  ))}
                  {dayEntries.length > 2 && (
                    <div className="text-[10px] text-gray-500 px-0.5 sm:px-1">
                      +{dayEntries.length - 2}件
                    </div>
                  )}
                </div>
              </div>
            )
          })
          )}
        </div>
      </div>

      {/* 今月のサマリー */}
      <div className="px-4 sm:px-6 py-4 border-t border-gray-200 bg-gradient-to-r from-blue-50 to-green-50">
        <div className="mb-3">
          <h3 className="text-sm font-medium text-gray-700 flex items-center">
            <span className="mr-2">📊</span>
            {format(currentDate, 'M月', { locale: ja })}のサマリー
          </h3>
        </div>
        {isLoading ? (
          // サマリーローディング状態
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-lg p-3 shadow-sm border border-gray-200 animate-pulse">
              <div className="flex items-center">
                <div className="w-8 h-8 bg-gray-300 rounded-full"></div>
                <div className="ml-3 flex-1">
                  <div className="w-8 h-6 bg-gray-300 rounded mb-1"></div>
                  <div className="w-12 h-4 bg-gray-300 rounded"></div>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg p-3 shadow-sm border border-gray-200 animate-pulse">
              <div className="flex items-center">
                <div className="w-8 h-8 bg-gray-300 rounded-full"></div>
                <div className="ml-3 flex-1">
                  <div className="w-8 h-6 bg-gray-300 rounded mb-1"></div>
                  <div className="w-12 h-4 bg-gray-300 rounded"></div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-lg p-3 shadow-sm border border-green-100">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                    <span className="text-sm">💪</span>
                  </div>
                </div>
                <div className="ml-3 flex-1">
                  <div className="text-xl font-bold text-green-600">
                    {monthlySummary?.practiceCount || 
                      entries.filter(e => e.item_type === 'practice' && 
                      format(new Date(e.item_date), 'yyyy-MM') === format(currentDate, 'yyyy-MM')).length}
                  </div>
                  <div className="text-sm text-gray-600">練習回数</div>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg p-3 shadow-sm border border-blue-100">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                    <span className="text-sm">🏊‍♂️</span>
                  </div>
                </div>
                <div className="ml-3 flex-1">
                  <div className="text-xl font-bold text-blue-600">
                    {monthlySummary?.recordCount || 
                      entries.filter(e => e.item_type === 'record' && 
                      format(new Date(e.item_date), 'yyyy-MM') === format(currentDate, 'yyyy-MM')).length}
                  </div>
                  <div className="text-sm text-gray-600">大会回数</div>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* 追加の統計情報 */}
        {(monthlySummary?.totalDistance || monthlySummary?.averageTime) && (
          <div className="mt-4 pt-4 border-t border-white/50">
            <div className="grid grid-cols-2 gap-4">
              {monthlySummary.totalDistance && (
                <div className="bg-white rounded-lg p-3 shadow-sm border border-gray-100">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <div className="w-6 h-6 bg-purple-100 rounded-full flex items-center justify-center">
                        <span className="text-xs">📏</span>
                      </div>
                    </div>
                    <div className="ml-2 flex-1">
                      <div className="text-lg font-semibold text-purple-600">
                        {(monthlySummary.totalDistance / 1000).toFixed(1)}km
                      </div>
                      <div className="text-xs text-gray-600">総距離</div>
                    </div>
                  </div>
                </div>
              )}
              {monthlySummary.averageTime && (
                <div className="bg-white rounded-lg p-3 shadow-sm border border-gray-100">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <div className="w-6 h-6 bg-orange-100 rounded-full flex items-center justify-center">
                        <span className="text-xs">⏱️</span>
                      </div>
                    </div>
                    <div className="ml-2 flex-1">
                      <div className="text-lg font-semibold text-orange-600">
                        {(monthlySummary.averageTime / 100).toFixed(2)}s
                      </div>
                      <div className="text-xs text-gray-600">平均タイム</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

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
                        練習記録を追加
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
            // データを再取得
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
        />
      )}
    </div>
  )
}
