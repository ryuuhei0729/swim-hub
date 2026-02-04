import React from 'react'
import { View, Text, StyleSheet, ScrollView } from 'react-native'
import { formatTime, getStyleLabel } from '@/utils/formatters'
import type { PracticeLogWithTags } from '@swim-hub/shared/types'

interface PracticeLogItemProps {
  log: PracticeLogWithTags
}

/**
 * 練習ログアイテムコンポーネント
 * 練習ログの1件を表示（種目、距離、セット数、レップ数、タイム、タグ）
 */
export const PracticeLogItem: React.FC<PracticeLogItemProps> = ({ log }) => {
  // 種目の表示（"Fr" → "自由形" に変換）
  const styleDisplay = getStyleLabel(log.style)
  
  // タイム一覧をソート（セット番号、レップ番号順）
  const sortedTimes = [...(log.practice_times || [])].sort((a, b) => {
    if (a.set_number !== b.set_number) {
      return a.set_number - b.set_number
    }
    return a.rep_number - b.rep_number
  })

  // タグ情報を取得
  const tags = log.practice_log_tags?.map((lt) => lt.practice_tags) || []

  return (
    <View style={styles.container}>
      {/* ヘッダー情報 */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.style}>{styleDisplay}</Text>
          <Text style={styles.distance}>{log.distance}m</Text>
        </View>
        <View style={styles.headerRight}>
          <Text style={styles.setRep}>
            {log.set_count}×{log.rep_count}
          </Text>
        </View>
      </View>

      {/* タイム一覧 */}
      {sortedTimes.length > 0 && (
        <View style={styles.timesContainer}>
          <Text style={styles.timesLabel}>タイム:</Text>
          <View style={styles.timesList}>
            {sortedTimes.map((time) => (
              <View key={time.id} style={styles.timeItem}>
                <Text style={styles.timeLabel}>
                  {time.set_number}-{time.rep_number}:
                </Text>
                <Text style={styles.timeValue}>
                  {formatTime(time.time)}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* タグ */}
      {tags.length > 0 && (
        <View style={styles.tagsContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {tags.map((tag) => (
              <View
                key={tag.id}
                style={[
                  styles.tag,
                  { backgroundColor: tag.color || '#E5E7EB' },
                ]}
              >
                <Text style={styles.tagText}>{tag.name}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* メモ */}
      {log.note && (
        <View style={styles.noteContainer}>
          <Text style={styles.note}>{log.note}</Text>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    marginHorizontal: 16,
    marginVertical: 8,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  style: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  distance: {
    fontSize: 14,
    color: '#6B7280',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  setRep: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  timesContainer: {
    marginTop: 8,
    marginBottom: 8,
  },
  timesLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 6,
  },
  timesList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  timeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    gap: 4,
  },
  timeLabel: {
    fontSize: 12,
    color: '#6B7280',
  },
  timeValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  tagsContainer: {
    marginTop: 8,
    marginBottom: 8,
  },
  tag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 6,
  },
  tagText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#FFFFFF',
  },
  noteContainer: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  note: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
  },
})
