import React, { useMemo, useCallback } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { Feather } from '@expo/vector-icons'
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
const PracticeItemComponent: React.FC<PracticeItemProps> = ({ practice, onPress }) => {
  // 日付をフォーマット（メモ化）
  const formattedDate = useMemo(
    () => format(new Date(practice.date), 'yyyy年M月d日(E)', { locale: ja }),
    [practice.date]
  )
  
  // タイトル（nullの場合は「練習」）
  const title = useMemo(() => practice.title || '練習', [practice.title])
  
  // 練習ログ数
  const logCount = useMemo(() => practice.practice_logs?.length || 0, [practice.practice_logs])
  
  const handlePress = useCallback(() => {
    onPress?.(practice)
  }, [onPress, practice])

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
          <View style={styles.placeContainer}>
            <Feather name="map-pin" size={14} color="#6B7280" />
            <Text style={styles.place} numberOfLines={1}>
              {practice.place}
            </Text>
          </View>
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
  placeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  place: {
    fontSize: 14,
    color: '#6B7280',
  },
  note: {
    fontSize: 14,
    color: '#374151',
    marginTop: 8,
    lineHeight: 20,
  },
})

// メモ化して再レンダリングを最適化
export const PracticeItem = React.memo(PracticeItemComponent, (prevProps, nextProps) => {
  // カスタム比較関数：practice.idが同じで、practiceの主要プロパティが変更されていない場合は再レンダリングしない
  const prev = prevProps.practice
  const next = nextProps.practice

  if (
    prev.id !== next.id ||
    prev.date !== next.date ||
    prev.title !== next.title ||
    prev.place !== next.place ||
    prev.note !== next.note
  ) {
    return false
  }

  const prevLogs = prev.practice_logs
  const nextLogs = next.practice_logs

  // 参照が同一なら変更なしとみなす
  if (prevLogs === nextLogs) {
    return true
  }

  // どちらかが未定義の場合の判定
  if (!prevLogs || !nextLogs) {
    return prevLogs === nextLogs
  }

  // 長さが異なれば変更あり
  if (prevLogs.length !== nextLogs.length) {
    return false
  }

  // シャロー比較（id または updated_at が変われば再レンダリング）
  for (let i = 0; i < prevLogs.length; i++) {
    const prevLog = prevLogs[i]
    const nextLog = nextLogs[i]
    if (prevLog.id !== nextLog.id || prevLog.updated_at !== nextLog.updated_at) {
      return false
    }
  }

  return true
})
