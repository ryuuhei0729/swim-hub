import React, { useMemo, useState } from 'react'
import { View, Text, StyleSheet, PanResponder } from 'react-native'
import { startOfMonth, endOfMonth, eachDayOfInterval, getDay, format } from 'date-fns'
import { CalendarHeader } from './CalendarHeader'
import { CalendarDay } from './CalendarDay'
import type { CalendarItem } from '@apps/shared/types/ui'

interface CalendarViewProps {
  currentDate: Date
  entries: CalendarItem[]
  isLoading: boolean
  onDateClick: (date: Date) => void
  onPrevMonth: () => void
  onNextMonth: () => void
  onTodayClick: () => void
  onMonthYearSelect: (year: number, month: number) => void
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土']

/**
 * カレンダービューコンポーネント
 * 月間カレンダーを表示
 */
export const CalendarView: React.FC<CalendarViewProps> = ({
  currentDate,
  entries,
  isLoading,
  onDateClick,
  onPrevMonth,
  onNextMonth,
  onTodayClick,
  onMonthYearSelect,
}) => {
  // 月の日付を取得
  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)
  const calendarStart = new Date(monthStart)
  calendarStart.setDate(calendarStart.getDate() - getDay(monthStart))
  const calendarEnd = new Date(monthEnd)
  calendarEnd.setDate(calendarEnd.getDate() + (6 - getDay(monthEnd)))

  const calendarDays = eachDayOfInterval({
    start: calendarStart,
    end: calendarEnd,
  })

  // 日付別のエントリーをマッピング
  const entriesByDate = useMemo(() => {
    const map = new Map<string, CalendarItem[]>()
    entries.forEach((item) => {
      const dateKey = item.date
      if (!map.has(dateKey)) {
        map.set(dateKey, [])
      }
      map.get(dateKey)!.push(item)
    })
    return map
  }, [entries])

  const getDateEntries = (date: Date): CalendarItem[] => {
    const dateKey = format(date, 'yyyy-MM-dd')
    return entriesByDate.get(dateKey) || []
  }

  // スワイプジェスチャーの検出（useStateで初期化し、refを使わない）
  const [panResponder] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // 水平方向の移動が垂直方向の移動より大きい場合のみ反応
        return Math.abs(gestureState.dx) > Math.abs(gestureState.dy) && Math.abs(gestureState.dx) > 10
      },
      onPanResponderRelease: (_, gestureState) => {
        const swipeThreshold = 50 // スワイプと判定する最小距離
        const { dx } = gestureState

        if (Math.abs(dx) > swipeThreshold) {
          if (dx > 0) {
            // 右スワイプ → 前の月
            onPrevMonth()
          } else {
            // 左スワイプ → 次の月
            onNextMonth()
          }
        }
      },
    })
  )

  return (
    <View style={styles.container} {...panResponder.panHandlers}>
      {/* ヘッダー */}
      <CalendarHeader
        currentDate={currentDate}
        isLoading={isLoading}
        onPrevMonth={onPrevMonth}
        onNextMonth={onNextMonth}
        onTodayClick={onTodayClick}
        onMonthYearSelect={onMonthYearSelect}
      />

      {/* 曜日ヘッダー */}
      <View style={styles.weekdayHeader}>
        {WEEKDAYS.map((day) => (
          <View key={day} style={styles.weekdayCell}>
            <Text style={styles.weekdayText}>{day}</Text>
          </View>
        ))}
      </View>

      {/* カレンダーグリッド */}
      <View style={styles.calendarGrid}>
        {calendarDays.map((day) => {
          const dayEntries = getDateEntries(day)
          const dayOfWeek = getDay(day) // 0 = 日曜日, 6 = 土曜日
          const isFirstColumn = dayOfWeek === 0 // 日曜日（左端）
          const isLastColumn = dayOfWeek === 6 // 土曜日（右端）
          return (
            <View key={day.toISOString()} style={styles.dayWrapper}>
              <CalendarDay
                date={day}
                currentDate={currentDate}
                entries={dayEntries}
                onPress={onDateClick}
                isFirstColumn={isFirstColumn}
                isLastColumn={isLastColumn}
              />
            </View>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
  },
  weekdayHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
  },
  weekdayCell: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
  },
  weekdayText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayWrapper: {
    width: '14.285714%', // 7列のグリッド（100% / 7）を正確に
  },
})
