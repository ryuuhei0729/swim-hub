import React from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
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
export const RecordItem: React.FC<RecordItemProps> = ({ record, onPress }) => {
  // 大会名（nullの場合は「大会」）
  const competitionName = record.competition?.title || '大会'
  
  // 日付をフォーマット（大会の日付を使用）
  const recordDate = record.competition?.date || record.created_at
  const formattedDate = format(new Date(recordDate), 'yyyy年M月d日(E)', { locale: ja })
  
  // 種目名
  const styleName = record.style?.name_jp || '不明'
  const styleDistance = record.style?.distance || 0
  const styleDisplay = `${styleName} ${styleDistance}m`
  
  // タイムをフォーマット
  const formattedTime = formatTime(record.time)
  
  // プールタイプ
  const poolType = record.competition?.pool_type === 0 ? '短水路' : '長水路'
  
  const handlePress = () => {
    onPress?.(record)
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
