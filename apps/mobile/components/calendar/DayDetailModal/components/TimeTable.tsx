import React from 'react'
import { View, Text } from 'react-native'
import { formatTime } from '@/utils/formatters'
import { styles } from '../styles'
import type { TimeTableProps } from '../types'

/**
 * タイムテーブルコンポーネント
 */
export const TimeTable: React.FC<TimeTableProps> = ({ times, repCount, setCount }) => {
  // セットごとの平均を計算
  const getSetAverage = (setNumber: number): number => {
    const setTimes = times.filter((t) => t.setNumber === setNumber && t.time > 0)
    if (setTimes.length === 0) return 0
    return setTimes.reduce((sum, t) => sum + t.time, 0) / setTimes.length
  }

  // 全体平均を計算
  const getOverallAverage = (): number => {
    const validTimes = times.filter((t) => t.time > 0)
    if (validTimes.length === 0) return 0
    return validTimes.reduce((sum, t) => sum + t.time, 0) / validTimes.length
  }

  // 全体最速を計算
  const getOverallFastest = (): number => {
    const validTimes = times.filter((t) => t.time > 0).map((t) => t.time)
    if (validTimes.length === 0) return 0
    return Math.min(...validTimes)
  }

  // セットごとの最速を取得
  const getSetFastest = (setNumber: number): number => {
    const setTimes = times.filter((t) => t.setNumber === setNumber && t.time > 0).map((t) => t.time)
    if (setTimes.length === 0) return 0
    return Math.min(...setTimes)
  }

  // 全体平均と全体最速を一度だけ計算
  const overallAverage = getOverallAverage()
  const overallFastest = getOverallFastest()

  return (
    <View style={styles.timeTable}>
      {/* ヘッダー */}
      <View style={styles.timeTableRow}>
        <View style={styles.timeTableHeaderCell} />
        {Array.from({ length: setCount }, (_, i) => (
          <View key={i + 1} style={styles.timeTableHeaderCell}>
            <Text style={styles.timeTableHeaderText}>{i + 1}セット目</Text>
          </View>
        ))}
      </View>

      {/* 本ごとのタイム */}
      {Array.from({ length: repCount }, (_, repIndex) => {
        const repNumber = repIndex + 1
        return (
          <View key={repNumber} style={styles.timeTableRow}>
            <View style={styles.timeTableLabelCell}>
              <Text style={styles.timeTableLabelText}>{repNumber}本目</Text>
            </View>
            {Array.from({ length: setCount }, (_, setIndex) => {
              const setNumber = setIndex + 1
              const time = times.find((t) => t.setNumber === setNumber && t.repNumber === repNumber)
              const setFastest = getSetFastest(setNumber)
              const isFastest = time && time.time > 0 && time.time === setFastest

              return (
                <View key={setNumber} style={styles.timeTableCell}>
                  <Text style={[styles.timeTableValue, isFastest && styles.timeTableFastest]}>
                    {time && time.time > 0 ? formatTime(time.time) : '-'}
                  </Text>
                </View>
              )
            })}
          </View>
        )
      })}

      {/* セット平均 */}
      <View style={[styles.timeTableRow, styles.timeTableAverageRow]}>
        <View style={styles.timeTableLabelCell}>
          <Text style={styles.timeTableAverageLabel}>セット平均</Text>
        </View>
        {Array.from({ length: setCount }, (_, setIndex) => {
          const setNumber = setIndex + 1
          const average = getSetAverage(setNumber)
          return (
            <View key={setNumber} style={styles.timeTableCell}>
              <Text style={styles.timeTableAverageValue}>
                {average > 0 ? formatTime(average) : '-'}
              </Text>
            </View>
          )
        })}
      </View>

      {/* 全体平均 */}
      <View style={[styles.timeTableRow, styles.timeTableOverallRow]}>
        <View style={styles.timeTableLabelCell}>
          <Text style={styles.timeTableOverallLabel}>全体平均</Text>
        </View>
        <View style={[styles.timeTableCell, { flex: setCount }]}>
          <Text style={styles.timeTableOverallValue}>
            {overallAverage > 0 ? formatTime(overallAverage) : '-'}
          </Text>
        </View>
      </View>

      {/* 全体最速 */}
      <View style={[styles.timeTableRow, styles.timeTableOverallRow]}>
        <View style={styles.timeTableLabelCell}>
          <Text style={styles.timeTableOverallLabel}>全体最速</Text>
        </View>
        <View style={[styles.timeTableCell, { flex: setCount }]}>
          <Text style={styles.timeTableOverallValue}>
            {overallFastest > 0 ? formatTime(overallFastest) : '-'}
          </Text>
        </View>
      </View>
    </View>
  )
}

// TimeTableをメモ化して不要な再レンダリングを防ぐ
export const MemoizedTimeTable = React.memo(TimeTable)
