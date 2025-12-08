import React from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { format, isSameMonth, isToday } from 'date-fns'
import type { CalendarItem, CalendarItemType } from '@apps/shared/types/ui'

interface CalendarDayProps {
  date: Date
  currentDate: Date
  entries: CalendarItem[]
  onPress: (date: Date) => void
  onAddPress?: (date: Date) => void
}

/**
 * カレンダーの1日を表示するコンポーネント
 */
export const CalendarDay: React.FC<CalendarDayProps> = ({
  date,
  currentDate,
  entries,
  onPress,
  onAddPress,
}) => {
  const isCurrentMonth = isSameMonth(date, currentDate)
  const isTodayDate = isToday(date)
  const dayNumber = format(date, 'd')

  // エントリーの色を取得
  const getItemColor = (type: CalendarItemType): string => {
    switch (type) {
      case 'practice':
      case 'team_practice':
      case 'practice_log':
        return '#10B981' // 緑色
      case 'competition':
      case 'team_competition':
      case 'entry':
      case 'record':
        return '#2563EB' // 青色
      default:
        return '#6B7280' // グレー
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
        entries.length > 0 && isCurrentMonth && styles.dayContainerWithEntries,
      ]}
      onPress={() => onPress(date)}
      disabled={!isCurrentMonth}
    >
      {/* 日付と追加ボタン */}
      <View style={styles.dayHeader}>
        <Text
          style={[
            styles.dayNumber,
            isTodayDate && styles.dayNumberToday,
            !isCurrentMonth && styles.dayNumberOtherMonth,
          ]}
        >
          {dayNumber}
        </Text>
        {isCurrentMonth && onAddPress && (
          <Pressable
            style={styles.addButton}
            onPress={(e) => {
              e.stopPropagation()
              onAddPress(date)
            }}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.addButtonText}>+</Text>
          </Pressable>
        )}
      </View>

      {/* エントリー表示 */}
      {isCurrentMonth && (
        <View style={styles.entriesContainer}>
          {displayEntries.map((item) => {
            const color = getItemColor(item.type)
            const title = getEntryTitle(item)
            const isRelay = item.type === 'record' && item.metadata?.record?.is_relaying

            return (
              <View
                key={`${item.type}-${item.id}`}
                style={[styles.entryItem, { backgroundColor: color }]}
              >
                <Text style={styles.entryText} numberOfLines={1}>
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
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
  },
  dayContainerOtherMonth: {
    backgroundColor: '#F9FAFB',
  },
  dayContainerToday: {
    borderWidth: 2,
    borderColor: '#2563EB',
    backgroundColor: '#EFF6FF',
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
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
  },
  dayNumberToday: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2563EB',
  },
  dayNumberOtherMonth: {
    color: '#9CA3AF',
  },
  addButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
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
    fontSize: 10,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  relayMark: {
    fontWeight: 'bold',
    color: '#DC2626',
  },
  moreEntriesText: {
    fontSize: 10,
    color: '#6B7280',
    marginTop: 2,
  },
})
