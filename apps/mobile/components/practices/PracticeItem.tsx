import React, { useMemo, useCallback } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { format } from 'date-fns'
import type { PracticeWithLogs } from '@swim-hub/shared/types/database'

interface PracticeItemProps {
  practice: PracticeWithLogs
  onPress?: (practice: PracticeWithLogs) => void
}

// 種目の略称を日本語に変換
const getStyleName = (style: string): string => {
  const styleMap: Record<string, string> = {
    fr: '自由形',
    ba: '背泳ぎ',
    br: '平泳ぎ',
    fly: 'バタフライ',
    im: '個人メドレー',
  }
  return styleMap[style.toLowerCase()] || style
}

// サークルタイムをフォーマット（秒数を分:秒形式に）
const formatCircleTime = (circle: number | null): string => {
  if (!circle) return ''
  const minutes = Math.floor(circle / 60)
  const seconds = Math.floor(circle % 60)
  return `${minutes}'${seconds.toString().padStart(2, '0')}"`
}

/**
 * 練習記録アイテムコンポーネント
 * 練習記録の1件を表示
 */
const PracticeItemComponent: React.FC<PracticeItemProps> = ({ practice, onPress }) => {
  // 日付をフォーマット（M/d形式、年と曜日なし）
  const formattedDate = useMemo(
    () => format(new Date(practice.date), 'M/d'),
    [practice.date]
  )
  
  // タイトル（nullの場合は「練習」）
  const title = useMemo(() => practice.title || '練習', [practice.title])
  
  // 最初のログの情報を取得（複数ログがある場合は最初のものを表示）
  const firstLog = useMemo(() => practice.practice_logs?.[0], [practice.practice_logs])
  
  // 2行目の情報を構築（タグ以外）
  const secondLineInfo = useMemo(() => {
    if (!firstLog) return ''
    
    const parts: string[] = []
    
    // 距離・本数・セット
    if (firstLog.distance && firstLog.rep_count && firstLog.set_count) {
      parts.push(`${firstLog.distance}m × ${firstLog.rep_count}本 × ${firstLog.set_count}セット`)
    }
    
    // サークル
    if (firstLog.circle) {
      const circleTime = formatCircleTime(firstLog.circle)
      if (circleTime) {
        parts.push(circleTime)
      }
    }
    
    // 種目
    if (firstLog.style) {
      parts.push(getStyleName(firstLog.style))
    }
    
    return parts.join(' / ')
  }, [firstLog])
  
  // タグ情報を取得
  const tags = useMemo(() => {
    return firstLog?.practice_log_tags
      ?.map((lt) => lt.practice_tags)
      .filter((tag): tag is NonNullable<typeof tag> => tag != null) || []
  }, [firstLog])
  
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
        {/* 1行目: 日付、練習タイトル、場所 */}
        <View style={styles.row}>
          <Text style={styles.date}>{formattedDate}</Text>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {practice.place && (
            <View style={styles.placeContainer}>
              <Feather name="map-pin" size={12} color="#6B7280" />
              <Text style={styles.place} numberOfLines={1}>
                {practice.place}
              </Text>
            </View>
          )}
        </View>
        
        {/* 2行目: 距離・本数・セット、サークル、種目、タグ */}
        {(secondLineInfo || tags.length > 0) && (
          <View style={styles.secondRow}>
            {secondLineInfo && (
              <Text style={styles.secondLine} numberOfLines={1}>
                {secondLineInfo}
              </Text>
            )}
            {tags.length > 0 && (
              <View style={styles.tagsContainer}>
                {tags.map((tag) => (
                  <View
                    key={tag.id}
                    style={[
                      styles.tag,
                      { backgroundColor: tag.color || '#6B7280' },
                    ]}
                  >
                    <Text style={styles.tagText}>{tag.name}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
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
    marginVertical: 3,
    paddingVertical: 10,
    paddingHorizontal: 12,
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
    gap: 5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 20,
    gap: 8,
  },
  date: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
    lineHeight: 18,
    minWidth: 35,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    flex: 1,
    lineHeight: 20,
  },
  placeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    flexShrink: 1,
  },
  place: {
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 16,
  },
  secondRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    minHeight: 20,
  },
  secondLine: {
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 18,
    flex: 1,
  },
  tagsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'wrap',
  },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    minHeight: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tagText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFFFFF',
    lineHeight: 16,
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
