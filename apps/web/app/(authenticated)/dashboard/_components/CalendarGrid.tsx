'use client'

import React from 'react'
import { PlusIcon } from '@heroicons/react/24/outline'
import { format, isSameMonth, isToday, getDay } from 'date-fns'
import { isHoliday } from '@apps/shared/utils/holiday'
import { CalendarItem, CalendarItemType } from '@/types'

interface CalendarGridProps {
  calendarDays: Date[]
  currentDate: Date
  entriesByDate: Map<string, CalendarItem[]>
  isLoading: boolean
  onDateClick: (date: Date) => void
  onAddClick: (date: Date) => void
  getItemColor: (type: CalendarItemType) => string
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

export default function CalendarGrid({
  calendarDays,
  currentDate,
  entriesByDate,
  isLoading,
  onDateClick,
  onAddClick,
  getItemColor
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
            const dayOfWeek = getDay(day) // 0 = 日曜日, 6 = 土曜日
            const isSunday = dayOfWeek === 0
            const isSaturday = dayOfWeek === 6
            const isHolidayDate = isHoliday(day)

            const dateKey = format(day, 'yyyy-MM-dd')
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
                data-testid="calendar-day"
                data-date={dateKey}
              >
                {/* 日付 */}
                <div className="flex items-center justify-between mb-1">
                  <span className={`
                    text-sm font-medium
                    ${isTodayDate ? 'text-blue-600 font-bold' : ''}
                    ${!isCurrentMonth ? 'text-gray-400' : ''}
                    ${isCurrentMonth && !isTodayDate && (isSunday || isHolidayDate) ? 'text-red-600' : ''}
                    ${isCurrentMonth && !isTodayDate && isSaturday && !isHolidayDate ? 'text-blue-600' : ''}
                    ${isCurrentMonth && !isTodayDate && !isSunday && !isSaturday && !isHolidayDate ? 'text-gray-900' : ''}
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
                      data-testid="day-add-button"
                    >
                      <PlusIcon className="h-3 w-3 sm:h-4 sm:w-4" />
                    </button>
                  )}
                </div>

                {/* エントリー表示 */}
                <div className="space-y-1">
                  {dayEntries.slice(0, 2).map((item) => {
                    const testId =
                      item.type === 'practice' || item.type === 'team_practice' || item.type === 'practice_log'
                        ? 'practice-mark'
                        : item.type === 'competition' || item.type === 'team_competition'
                        ? 'competition-mark'
                        : item.type === 'record'
                        ? 'record-mark'
                        : item.type === 'entry'
                        ? 'entry-mark'
                        : undefined

                    // タイトルを生成
                    // calendar_viewで既にCOALESCEでデフォルト値（「練習」「大会」）が設定されているため、
                    // item.titleをそのまま使用する
                    let displayTitle = item.title
                    
                    if (item.type === 'team_practice') {
                      // TeamPractice: チーム名 - タイトル（metadataから動的に取得）
                      const teamName = item.metadata?.team?.name || 'チーム'
                      displayTitle = `${teamName} - ${item.title}`
                    } else if (item.type === 'entry') {
                      // Entry: 大会の名前（metadataから取得、なければtitleを使用、それもなければ「大会」）
                      displayTitle = item.metadata?.competition?.title || item.title || '大会'
                    } else if (item.type === 'record') {
                      // Record: 大会の名前（metadataから取得、なければtitleを使用、それもなければ「大会」）
                      displayTitle = item.metadata?.competition?.title || item.title || '大会'
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
                          onDateClick(day)
                        }}
                        data-testid={testId}
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
