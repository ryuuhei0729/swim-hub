import React, { useMemo } from 'react'
import { View, Text, StyleSheet, ScrollView } from 'react-native'
import { formatTime, formatTimeAverage, formatCircleTime, getStyleLabel, getTextColorForBackground } from '@/utils/formatters'
import type { PracticeLogWithTags } from '@swim-hub/shared/types'

interface PracticeLogItemProps {
  log: PracticeLogWithTags
}

/**
 * 練習ログアイテムコンポーネント
 * Web版と同じデザイン: エメラルドグリーンカード + タイムテーブル
 */
export const PracticeLogItem: React.FC<PracticeLogItemProps> = React.memo(({ log }) => {
  const styleDisplay = getStyleLabel(log.style)
  const tags = log.practice_log_tags?.map((lt) => lt.practice_tags) || []
  const allTimes = useMemo(
    () => [...(log.practice_times || [])].sort((a, b) =>
      a.set_number !== b.set_number ? a.set_number - b.set_number : a.rep_number - b.rep_number
    ),
    [log.practice_times]
  )

  // 各セットの最速タイムを計算
  const setFastestMap = useMemo(() => {
    const map: Record<number, number> = {}
    for (let s = 1; s <= log.set_count; s++) {
      const setTimes = allTimes.filter((t) => t.set_number === s && t.time > 0)
      if (setTimes.length > 0) {
        map[s] = Math.min(...setTimes.map((t) => t.time))
      }
    }
    return map
  }, [allTimes, log.set_count])

  // 各セットの平均
  const setAverages = useMemo(() => {
    const map: Record<number, number> = {}
    for (let s = 1; s <= log.set_count; s++) {
      const setTimes = allTimes.filter((t) => t.set_number === s && t.time > 0)
      if (setTimes.length > 0) {
        map[s] = setTimes.reduce((sum, t) => sum + t.time, 0) / setTimes.length
      }
    }
    return map
  }, [allTimes, log.set_count])

  // 全体統計
  const overallStats = useMemo(() => {
    const validTimes = allTimes.filter((t) => t.time > 0)
    if (validTimes.length === 0) return { average: 0, fastest: 0 }
    return {
      average: validTimes.reduce((sum, t) => sum + t.time, 0) / validTimes.length,
      fastest: Math.min(...validTimes.map((t) => t.time)),
    }
  }, [allTimes])

  return (
    <View style={styles.container}>
      {/* タグ */}
      {tags.length > 0 && (
        <View style={styles.tagsContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {tags.map((tag) => (
              <View
                key={tag.id}
                style={[styles.tag, { backgroundColor: tag.color || '#E5E7EB' }]}
              >
                <Text style={[styles.tagText, { color: getTextColorForBackground(tag.color || '#E5E7EB') }]}>
                  {tag.name}
                </Text>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* 練習内容カード */}
      <View style={styles.contentCard}>
        <Text style={styles.contentLabel}>練習内容</Text>
        <View style={styles.contentRow}>
          <Text style={styles.contentValue}>{log.distance}</Text>
          <Text style={styles.contentUnit}>m × </Text>
          <Text style={styles.contentValue}>{log.rep_count}</Text>
          <Text style={styles.contentUnit}>本</Text>
          {log.set_count > 1 && (
            <>
              <Text style={styles.contentUnit}> × </Text>
              <Text style={styles.contentValue}>{log.set_count}</Text>
              <Text style={styles.contentUnit}>セット</Text>
            </>
          )}
          <Text style={styles.contentSpacer}>{'  '}</Text>
          <Text style={styles.contentValue}>{formatCircleTime(log.circle)}</Text>
          <Text style={styles.contentSpacer}>{'  '}</Text>
          <Text style={styles.contentValue}>{styleDisplay}</Text>
          {log.swim_category && log.swim_category !== 'Swim' && (
            <>
              <Text style={styles.contentSpacer}>{'  '}</Text>
              <Text style={styles.contentValue}>{log.swim_category}</Text>
            </>
          )}
        </View>
      </View>

      {/* メモ */}
      {log.note && (
        <View style={styles.memoCard}>
          <Text style={styles.memoLabel}>メモ</Text>
          <Text style={styles.memoText}>{log.note}</Text>
        </View>
      )}

      {/* タイムテーブル */}
      {allTimes.length > 0 && (
        <View style={styles.timeSection}>
          <View style={styles.timeHeader}>
            <View style={styles.timeAccent} />
            <Text style={styles.timeTitle}>タイム</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={true} style={styles.tableScroll}>
            <View style={styles.table}>
              {/* テーブルヘッダー */}
              <View style={[styles.tableRow, styles.tableHeaderRow]}>
                <View style={[styles.tableCell, styles.tableLabelCell]}>
                  <Text style={styles.tableHeaderText}> </Text>
                </View>
                {Array.from({ length: log.set_count }, (_, i) => (
                  <View key={i} style={[styles.tableCell, styles.tableDataCell]}>
                    <Text style={styles.tableHeaderText}>{i + 1}セット目</Text>
                  </View>
                ))}
              </View>

              {/* タイム行 */}
              {Array.from({ length: log.rep_count }, (_, repIdx) => {
                const repNumber = repIdx + 1
                return (
                  <View key={repNumber} style={[styles.tableRow, styles.tableBodyRow]}>
                    <View style={[styles.tableCell, styles.tableLabelCell]}>
                      <Text style={styles.tableLabelText}>{repNumber}本目</Text>
                    </View>
                    {Array.from({ length: log.set_count }, (_, setIdx) => {
                      const setNumber = setIdx + 1
                      const time = allTimes.find((t) => t.set_number === setNumber && t.rep_number === repNumber)
                      const isFastest = time && time.time > 0 && time.time === setFastestMap[setNumber]
                      return (
                        <View key={setNumber} style={[styles.tableCell, styles.tableDataCell]}>
                          <Text style={isFastest ? styles.fastestTimeText : styles.timeText}>
                            {time && time.time > 0 ? formatTime(time.time) : '-'}
                          </Text>
                        </View>
                      )
                    })}
                  </View>
                )
              })}

              {/* セット平均行 */}
              <View style={[styles.tableRow, styles.setAverageRow]}>
                <View style={[styles.tableCell, styles.tableLabelCell, styles.setAverageLabelCell]}>
                  <Text style={styles.setAverageLabel}>セット平均</Text>
                </View>
                {Array.from({ length: log.set_count }, (_, setIdx) => {
                  const setNumber = setIdx + 1
                  const avg = setAverages[setNumber]
                  return (
                    <View key={setNumber} style={[styles.tableCell, styles.tableDataCell, styles.setAverageDataCell]}>
                      <Text style={styles.setAverageText}>
                        {avg ? formatTimeAverage(avg) : '-'}
                      </Text>
                    </View>
                  )
                })}
              </View>

              {/* 全体平均行 */}
              <View style={[styles.tableRow, styles.overallRow, styles.overallRowTop]}>
                <View style={[styles.tableCell, styles.tableLabelCell, styles.overallLabelCell]}>
                  <Text style={styles.overallLabel}>全体平均</Text>
                </View>
                <View style={[styles.tableCell, styles.overallDataCell, { flex: log.set_count }]}>
                  <Text style={styles.overallValue}>
                    {overallStats.average > 0 ? formatTimeAverage(overallStats.average) : '-'}
                  </Text>
                </View>
              </View>

              {/* 全体最速行 */}
              <View style={[styles.tableRow, styles.overallRow]}>
                <View style={[styles.tableCell, styles.tableLabelCell, styles.overallLabelCell]}>
                  <Text style={styles.overallLabel}>全体最速</Text>
                </View>
                <View style={[styles.tableCell, styles.overallDataCell, { flex: log.set_count }]}>
                  <Text style={styles.overallValue}>
                    {overallStats.fastest > 0 ? formatTime(overallStats.fastest) : '-'}
                  </Text>
                </View>
              </View>
            </View>
          </ScrollView>
        </View>
      )}
    </View>
  )
})

const styles = StyleSheet.create({
  // コンテナ: エメラルドグリーン背景
  container: {
    backgroundColor: '#ECFDF5',
    borderRadius: 12,
    marginHorizontal: 16,
    marginVertical: 8,
    padding: 16,
  },

  // タグ
  tagsContainer: {
    flexDirection: 'row',
    marginBottom: 12,
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
  },

  // 練習内容カード
  contentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#86EFAC',
    marginBottom: 12,
  },
  contentLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: '#6B7280',
    marginBottom: 4,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
  },
  contentValue: {
    fontSize: 17,
    fontWeight: '600',
    color: '#15803D',
  },
  contentUnit: {
    fontSize: 13,
    color: '#1F2937',
  },
  contentSpacer: {
    fontSize: 13,
    color: '#1F2937',
  },

  // メモカード
  memoCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  memoLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: '#6B7280',
    marginBottom: 4,
  },
  memoText: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 18,
  },

  // タイムセクション
  timeSection: {
    marginTop: 4,
  },
  timeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  timeAccent: {
    width: 3,
    height: 16,
    backgroundColor: '#22C55E',
    borderRadius: 2,
  },
  timeTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#15803D',
  },

  // テーブル
  tableScroll: {
    borderRadius: 8,
    overflow: 'hidden',
  },
  table: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#86EFAC',
    overflow: 'hidden',
    minWidth: '100%',
  },
  tableRow: {
    flexDirection: 'row',
  },
  tableHeaderRow: {
    borderBottomWidth: 1,
    borderBottomColor: '#86EFAC',
  },
  tableBodyRow: {
    borderBottomWidth: 1,
    borderBottomColor: '#D1FAE5',
  },
  tableCell: {
    paddingVertical: 8,
    paddingHorizontal: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tableLabelCell: {
    minWidth: 72,
    flex: 0,
    alignItems: 'flex-start',
  },
  tableDataCell: {
    flex: 1,
    minWidth: 80,
  },
  tableHeaderText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#166534',
  },
  tableLabelText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#374151',
  },
  timeText: {
    fontSize: 14,
    color: '#1F2937',
  },
  fastestTimeText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2563EB',
  },

  // セット平均行
  setAverageRow: {
    borderBottomWidth: 1,
    borderBottomColor: '#D1FAE5',
  },
  setAverageLabelCell: {
    backgroundColor: '#F0FDF4',
  },
  setAverageDataCell: {
    backgroundColor: '#F0FDF4',
  },
  setAverageLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#166534',
  },
  setAverageText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#166534',
  },

  // 全体平均・最速行
  overallRow: {
    borderBottomWidth: 0,
  },
  overallRowTop: {
    borderTopWidth: 2,
    borderTopColor: '#86EFAC',
  },
  overallLabelCell: {
    backgroundColor: '#EFF6FF',
  },
  overallDataCell: {
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  overallLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1E40AF',
  },
  overallValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E40AF',
  },
})
