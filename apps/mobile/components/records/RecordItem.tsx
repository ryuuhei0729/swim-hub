import React, { useMemo, useCallback } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { format, parseISO } from 'date-fns'
import { ja } from 'date-fns/locale'
import { toZonedTime } from 'date-fns-tz'
import { formatTime } from '@/utils/formatters'
import type { RecordWithDetails } from '@swim-hub/shared/types/database'

interface RecordItemProps {
  record: RecordWithDetails
  onPress?: (record: RecordWithDetails) => void
}

/**
 * 大会記録アイテムコンポーネント
 * 大会記録の1件を表示
 */
const RecordItemComponent: React.FC<RecordItemProps> = ({ record, onPress }) => {
  // 大会名（nullの場合は「大会」）
  const competitionName = useMemo(() => record.competition?.title || '大会', [record.competition?.title])
  
  // 日付をフォーマット（大会の日付を使用）
  const recordDate = useMemo(
    () => record.competition?.date || record.created_at,
    [record.competition?.date, record.created_at]
  )
  const formattedDate = useMemo(() => {
    try {
      const parsed = typeof recordDate === 'string' ? parseISO(recordDate) : new Date(recordDate)
      const zoned = toZonedTime(parsed, Intl.DateTimeFormat().resolvedOptions().timeZone)
      return format(zoned, 'yyyy年M月d日(E)', { locale: ja })
    } catch {
      return '日付不明'
    }
  }, [recordDate])
  
  // 種目名
  const styleName = useMemo(() => record.style?.name_jp || '不明', [record.style?.name_jp])
  const styleDistance = useMemo(() => record.style?.distance || 0, [record.style?.distance])
  const styleDisplay = useMemo(
    () => `${styleName} ${styleDistance}m`,
    [styleName, styleDistance]
  )
  
  // タイムをフォーマット
  const formattedTime = useMemo(() => formatTime(record.time), [record.time])
  
  // プールタイプ
  const poolType = useMemo(
    () => (record.competition?.pool_type === 0 ? '短水路' : '長水路'),
    [record.competition?.pool_type]
  )
  
  const handlePress = useCallback(() => {
    onPress?.(record)
  }, [onPress, record])

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
          <Text style={styles.poolType}>{poolType}</Text>
        </View>
        
        <Text style={styles.competitionName} numberOfLines={1}>
          {competitionName}
        </Text>
        
        <View style={styles.recordInfo}>
          <Text style={styles.style}>{styleDisplay}</Text>
          <Text style={styles.time}>{formattedTime}</Text>
        </View>
        
        {record.competition?.place && (
          <Text style={styles.place} numberOfLines={1}>
            📍 {record.competition.place}
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
  poolType: {
    fontSize: 12,
    color: '#6B7280',
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  competitionName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginTop: 4,
  },
  recordInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  style: {
    fontSize: 14,
    color: '#6B7280',
  },
  time: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2563EB',
  },
  place: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
})

// メモ化して再レンダリングを最適化
export const RecordItem = React.memo(RecordItemComponent, (prevProps, nextProps) => {
  // カスタム比較関数：record.idが同じで、recordの主要プロパティが変更されていない場合は再レンダリングしない
  const prevCompetition = prevProps.record.competition
  const nextCompetition = nextProps.record.competition
  const prevStyle = prevProps.record.style
  const nextStyle = nextProps.record.style

  return (
    prevProps.record.id === nextProps.record.id &&
    prevProps.record.time === nextProps.record.time &&
    prevCompetition?.id === nextCompetition?.id &&
    prevCompetition?.date === nextCompetition?.date &&
    prevCompetition?.title === nextCompetition?.title &&
    prevCompetition?.place === nextCompetition?.place &&
    prevCompetition?.pool_type === nextCompetition?.pool_type &&
    prevStyle?.id === nextStyle?.id &&
    prevStyle?.name_jp === nextStyle?.name_jp &&
    prevStyle?.distance === nextStyle?.distance &&
    prevProps.onPress === nextProps.onPress
  )
})
