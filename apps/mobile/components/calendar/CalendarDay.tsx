import React from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { format, isSameMonth, isToday, getDay } from 'date-fns'
import { isHoliday } from '@apps/shared/utils/holiday'
import type { CalendarItem } from '@apps/shared/types/ui'

interface CalendarDayProps {
  date: Date
  currentDate: Date
  entries: CalendarItem[]
  onPress: (date: Date) => void
  isFirstColumn?: boolean
  isLastColumn?: boolean
}

/**
 * カレンダーの1日を表示するコンポーネント
 */
export const CalendarDay: React.FC<CalendarDayProps> = ({
  date,
  currentDate,
  entries,
  onPress,
  isFirstColumn = false,
  isLastColumn = false,
}) => {
  const isCurrentMonth = isSameMonth(date, currentDate)
  const isTodayDate = isToday(date)
  const dayNumber = format(date, 'd')
  const displayDateKey = format(date, 'yyyy-MM-dd')
  const dayOfWeek = getDay(date) // 0 = 日曜日, 6 = 土曜日
  const isSunday = dayOfWeek === 0
  const isSaturday = dayOfWeek === 6
  const isHolidayDate = isHoliday(date)

  // 同じ日付にPractice_LogやRecordがあるかチェック
  const hasPracticeLog = entries.some((e) => e.type === 'practice_log')
  const hasRecord = entries.some((e) => e.type === 'record')

  // エントリーの色とスタイルを取得
  const getItemStyle = (item: CalendarItem) => {
    const isPracticeType = item.type === 'practice' || item.type === 'team_practice' || item.type === 'practice_log'
    const isCompetitionType = item.type === 'competition' || item.type === 'team_competition' || item.type === 'entry' || item.type === 'record'

    if (isPracticeType) {
      // Practice系
      if (item.type === 'practice_log' || hasPracticeLog) {
        // Practice_Logがある場合: 緑色の枠線 + 黄緑色の背景
        return {
          backgroundColor: '#D1FAE5', // 黄緑色 (green-100)
          borderWidth: 1,
          borderColor: '#10B981', // 緑色 (green-500)
          textColor: '#065F46', // 濃い緑色のテキスト (green-800)
        }
      } else {
        // Practiceのみ: 黄緑色の背景のみ
        return {
          backgroundColor: '#D1FAE5', // 黄緑色 (green-100)
          borderWidth: 0,
          borderColor: 'transparent',
          textColor: '#065F46', // 濃い緑色のテキスト (green-800)
        }
      }
    } else if (isCompetitionType) {
      // Competition/Entry/Record系
      if (item.type === 'record' || hasRecord) {
        // Recordがある場合: 青色の枠線 + 水色の背景
        return {
          backgroundColor: '#DBEAFE', // 水色 (blue-100)
          borderWidth: 1,
          borderColor: '#2563EB', // 青色 (blue-600)
          textColor: '#1E40AF', // 濃い青色のテキスト (blue-800)
        }
      } else {
        // Competition/Entryのみ: 水色の背景のみ
        return {
          backgroundColor: '#DBEAFE', // 水色 (blue-100)
          borderWidth: 0,
          borderColor: 'transparent',
          textColor: '#1E40AF', // 濃い青色のテキスト (blue-800)
        }
      }
    } else {
      // その他
      return {
        backgroundColor: '#F3F4F6', // グレー
        borderWidth: 0,
        borderColor: 'transparent',
        textColor: '#374151', // グレーのテキスト
      }
    }
  }

  // エントリーのタイトルを生成
  const getEntryTitle = (item: CalendarItem): string => {
    let displayTitle = item.title

    if (item.type === 'team_practice') {
      const teamName = item.metadata?.team?.name || 'チーム'
      displayTitle = `${teamName} - ${item.title}`
    } else if (item.type === 'entry' || item.type === 'record') {
      displayTitle = item.metadata?.competition?.title || item.title || '大会'
    }

    return displayTitle
  }

  // 表示するエントリー（最大2件）
  const displayEntries = entries.slice(0, 2)
  const remainingCount = entries.length - 2

  return (
    <Pressable
      style={[
        styles.dayContainer,
        !isCurrentMonth && styles.dayContainerOtherMonth,
        isTodayDate && styles.dayContainerToday,
        isTodayDate && isFirstColumn && styles.dayContainerTodayFirstColumn,
        isTodayDate && isLastColumn && styles.dayContainerTodayLastColumn,
        isTodayDate && !isFirstColumn && !isLastColumn && styles.dayContainerTodayMiddle,
        entries.length > 0 && isCurrentMonth && styles.dayContainerWithEntries,
        isFirstColumn && styles.dayContainerFirstColumn,
        isLastColumn && styles.dayContainerLastColumn,
      ]}
      onPress={() => onPress(date)}
      disabled={!isCurrentMonth}
    >
      {/* 日付 */}
      <View style={styles.dayHeader}>
        <Text
          style={[
            styles.dayNumber,
            isTodayDate && styles.dayNumberToday,
            !isCurrentMonth && styles.dayNumberOtherMonth,
            (isSunday || isHolidayDate) && isCurrentMonth && styles.dayNumberSunday,
            isSaturday && isCurrentMonth && !isHolidayDate && styles.dayNumberSaturday,
          ]}
        >
          {dayNumber}
        </Text>
      </View>

      {/* エントリー表示 */}
      {isCurrentMonth && (
        <View style={styles.entriesContainer}>
          {displayEntries.map((item) => {
            const itemStyle = getItemStyle(item)
            const title = getEntryTitle(item)
            const isRelay = item.type === 'record' && item.metadata?.record?.is_relaying

            return (
              <View
                key={`${item.id}-${displayDateKey}`}
                style={[
                  styles.entryItem,
                  {
                    backgroundColor: itemStyle.backgroundColor,
                    borderWidth: itemStyle.borderWidth,
                    borderColor: itemStyle.borderColor,
                  },
                ]}
              >
                <Text style={[styles.entryText, { color: itemStyle.textColor }]} numberOfLines={1}>
                  {title}
                  {isRelay && <Text style={styles.relayMark}> R</Text>}
                </Text>
              </View>
            )
          })}
          {remainingCount > 0 && (
            <Text style={styles.moreEntriesText}>+{remainingCount}件</Text>
          )}
        </View>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  dayContainer: {
    width: '100%',
    minHeight: 80,
    padding: 4,
    borderRightWidth: 0.5,
    borderBottomWidth: 0.5,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  dayContainerFirstColumn: {
    borderLeftWidth: 0,
  },
  dayContainerLastColumn: {
    borderRightWidth: 0,
  },
  dayContainerOtherMonth: {
    backgroundColor: '#F3F4F6',
  },
  dayContainerToday: {
    borderTopWidth: 2,
    borderBottomWidth: 2,
    borderColor: '#2563EB',
    backgroundColor: '#EFF6FF',
  },
  dayContainerTodayFirstColumn: {
    borderLeftWidth: 2,
    borderRightWidth: 0.5,
  },
  dayContainerTodayLastColumn: {
    borderLeftWidth: 0.5,
    borderRightWidth: 2,
  },
  dayContainerTodayMiddle: {
    borderLeftWidth: 0.5,
    borderRightWidth: 0.5,
  },
  dayContainerWithEntries: {
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  dayNumber: {
    fontSize: 10,
    fontWeight: '500',
    color: '#111827',
  },
  dayNumberToday: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#2563EB',
  },
  dayNumberOtherMonth: {
    color: '#D1D5DB',
  },
  dayNumberSunday: {
    color: '#DC2626', // 赤色
  },
  dayNumberSaturday: {
    color: '#2563EB', // 青色
  },
  entriesContainer: {
    gap: 2,
  },
  entryItem: {
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },
  entryText: {
    fontSize: 8,
    fontWeight: '500',
  },
  relayMark: {
    fontWeight: 'bold',
    color: '#DC2626',
  },
  moreEntriesText: {
    fontSize: 8,
    color: '#6B7280',
    marginTop: 2,
  },
})
