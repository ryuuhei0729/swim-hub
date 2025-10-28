'use client'

import React from 'react'
import { PlusIcon } from '@heroicons/react/24/outline'
import { format, isSameMonth, isSameDay, isToday } from 'date-fns'
import { CalendarItem, CalendarItemType } from '@/types'

interface CalendarGridProps {
  calendarDays: Date[]
  currentDate: Date
  entriesByDate: Map<string, CalendarItem[]>
  isLoading: boolean
  onDateClick: (date: Date) => void
  onAddClick: (date: Date) => void
  getItemColor: (type: CalendarItemType) => string
  getDayStatusIndicator: (entries: CalendarItem[]) => React.ReactNode
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

export default function CalendarGrid({
  calendarDays,
  currentDate,
  entriesByDate,
  isLoading,
  onDateClick,
  onAddClick,
  getItemColor,
  getDayStatusIndicator
}: CalendarGridProps) {
  const getDateEntries = (date: Date) => {
    const dateKey = format(date, 'yyyy-MM-dd')
    return entriesByDate.get(dateKey) || []
  }

  return (
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
            const isTodayDate = isToday(day)

            return (
              <div
                key={day.toISOString()}
                className={`
                  relative min-h-[80px] sm:min-h-[100px] p-1 sm:p-2 border border-gray-200 rounded-none sm:rounded-lg cursor-pointer transition-all duration-200
                  ${isCurrentMonth ? 'bg-white hover:bg-gray-50' : 'bg-gray-50 text-gray-400'}
                  ${isTodayDate ? 'ring-2 ring-blue-400 bg-blue-50/30 z-10' : ''}
                  ${dayEntries.length > 0 && isCurrentMonth ? 'shadow-sm hover:shadow-md' : ''}
                `}
                onClick={() => onDateClick(day)}
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
                        onAddClick(day)
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
                  {dayEntries.slice(0, 2).map((item) => {
                    // タイトルを生成
                    let displayTitle = item.title
                    
                    if (item.type === 'practice') {
                      // Practice: 練習場所
                      displayTitle = item.location || '練習'
                    } else if (item.type === 'team_practice') {
                      // TeamPractice: チーム名 - 練習場所（metadataから動的に取得）
                      const teamName = (item.metadata as any)?.team?.name || 'チーム'
                      displayTitle = `${teamName} - ${item.location || '練習'}`
                    } else if (item.type === 'practice_log') {
                      // PracticeLog: 距離×本数×セット数
                      displayTitle = item.title
                    } else if (item.type === 'competition' || item.type === 'team_competition') {
                      // Competition/TeamCompetition: 大会の名前
                      displayTitle = item.title
                    } else if (item.type === 'entry') {
                      // Entry: 大会の名前
                      displayTitle = item.metadata?.competition?.title || item.title
                    } else if (item.type === 'record') {
                      // Record: 大会の名前
                      displayTitle = item.metadata?.competition?.title || item.title
                    }
                    
                    return (
                      <div
                        key={`${item.type}-${item.id}`}
                        className={`
                          text-[10px] px-0.5 sm:px-1 py-0.5 rounded-md truncate transition-all duration-200
                          ${getItemColor(item.type)}
                          ${item.type === 'record' ? 'border-2 border-blue-400' : item.type === 'practice_log' ? 'border-2 border-green-400' : 'border'}
                          hover:opacity-80 hover:scale-105 cursor-pointer
                        `}
                        title={displayTitle}
                        onClick={(e) => {
                          e.stopPropagation()
                          // 詳細表示のためのクリック処理
                        }}
                      >
                        <span className="mr-1"></span>
                        <span className="hidden sm:inline font-medium">
                          {item.type === 'record' && item.metadata?.record?.is_relaying ? (
                            <>
                              {displayTitle}
                              <span className="font-bold text-red-600 ml-1">R</span>
                            </>
                          ) : (
                            displayTitle
                          )}
                        </span>
                        <span className="sm:hidden font-medium">
                          {item.type === 'record' && item.metadata?.record?.is_relaying ? (
                            <>
                              {(displayTitle.split(':')[0] || displayTitle)}
                              <span className="font-bold text-red-600 ml-1">R</span>
                            </>
                          ) : (
                            displayTitle.split(':')[0] || displayTitle
                          )}
                        </span>
                      </div>
                    )
                  })}
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
  )
}
