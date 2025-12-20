import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { formatTime } from '@/utils/formatters'
import type { SplitTime } from '@swim-hub/shared/types/database'

interface SplitTimeItemProps {
  splitTime: SplitTime
  index: number
}

/**
 * スプリットタイムアイテムコンポーネント
 * スプリットタイムの1件を表示
 */
export const SplitTimeItem: React.FC<SplitTimeItemProps> = ({ splitTime, index: _index }) => {
  const formattedTime = formatTime(splitTime.split_time)

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.leftSection}>
          <Text style={styles.distance}>{splitTime.distance}m</Text>
        </View>
        <View style={styles.rightSection}>
          <Text style={styles.time}>{formattedTime}</Text>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    marginHorizontal: 16,
    marginVertical: 4,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  content: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  leftSection: {
    flex: 1,
  },
  distance: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  rightSection: {
    flex: 1,
    alignItems: 'flex-end',
  },
  time: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2563EB',
  },
})
