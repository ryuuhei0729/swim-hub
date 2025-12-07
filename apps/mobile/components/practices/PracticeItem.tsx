import React from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import type { PracticeWithLogs } from '@swim-hub/shared/types/database'

interface PracticeItemProps {
  practice: PracticeWithLogs
  onPress?: (practice: PracticeWithLogs) => void
}

/**
 * 練習記録アイテムコンポーネント
 * 練習記録の1件を表示
 */
export const PracticeItem: React.FC<PracticeItemProps> = ({ practice, onPress }) => {
  // 日付をフォーマット
  const formattedDate = format(new Date(practice.date), 'yyyy年M月d日(E)', { locale: ja })
  
  // タイトル（nullの場合は「練習」）
  const title = practice.title || '練習'
  
  // 練習ログ数
  const logCount = practice.practice_logs?.length || 0
  
  const handlePress = () => {
    onPress?.(practice)
  }

  return (
    <Pressable
      style={({ pressed }) => [
        styles.container,
        pressed && styles.pressed
      ]}
      onPress={handlePress}
    >
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.date}>{formattedDate}</Text>
          {logCount > 0 && (
            <Text style={styles.logCount}>{logCount}セット</Text>
          )}
        </View>
        
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        
        {practice.place && (
          <Text style={styles.place} numberOfLines={1}>
            📍 {practice.place}
          </Text>
        )}
        
        {practice.note && (
          <Text style={styles.note} numberOfLines={2}>
            {practice.note}
          </Text>
        )}
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    marginHorizontal: 16,
    marginVertical: 6,
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
  pressed: {
    opacity: 0.7,
  },
  content: {
    gap: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  date: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  logCount: {
    fontSize: 12,
    color: '#6B7280',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginTop: 4,
  },
  place: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
  note: {
    fontSize: 14,
    color: '#374151',
    marginTop: 8,
    lineHeight: 20,
  },
})
