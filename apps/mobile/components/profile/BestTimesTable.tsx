import React, { useState, useMemo } from 'react'
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native'
import { differenceInDays, parseISO } from 'date-fns'
import { formatTime } from '@/utils/formatters'
import type { BestTime } from '@/hooks/useBestTimesQuery'

interface BestTimesTableProps {
  bestTimes: BestTime[]
}

type TabType = 'all' | 'short' | 'long'

// 静的距離リスト（50m, 100m, 200m, 400m, 800m）
const DISTANCES = [50, 100, 200, 400, 800]

// 静的種目リスト
const STYLES = ['自由形', '平泳ぎ', '背泳ぎ', 'バタフライ', '個人メドレー']

// 種目ごとの色
const styleColors: Record<string, { bg: string; text: string }> = {
  自由形: { bg: '#FEF3C7', text: '#92400E' },
  平泳ぎ: { bg: '#D1FAE5', text: '#065F46' },
  背泳ぎ: { bg: '#FEE2E2', text: '#991B1B' },
  バタフライ: { bg: '#DBEAFE', text: '#1E40AF' },
  個人メドレー: { bg: '#FCE7F3', text: '#9F1239' },
}

/**
 * ベストタイム表コンポーネント
 */
export const BestTimesTable: React.FC<BestTimesTableProps> = ({ bestTimes }) => {
  const [activeTab, setActiveTab] = useState<TabType>('all')
  const [includeRelaying, setIncludeRelaying] = useState<boolean>(false)

  // タブごとにフィルタリングされたベストタイムを取得
  const filteredBestTimes = useMemo(() => {
    if (activeTab === 'short') {
      return bestTimes.filter((bt) => bt.pool_type === 0)
    } else if (activeTab === 'long') {
      return bestTimes.filter((bt) => bt.pool_type === 1)
    } else {
      return bestTimes
    }
  }, [bestTimes, activeTab])

  const isInvalidCombination = (style: string, distance: number): boolean => {
    // ありえない種目/距離の組み合わせ
    if (style === '個人メドレー' && (distance === 50 || distance === 800)) return true
    if (
      (style === '平泳ぎ' || style === '背泳ぎ' || style === 'バタフライ') &&
      (distance === 400 || distance === 800)
    )
      return true
    return false
  }

  const getBestTime = (style: string, distance: number): BestTime | null => {
    // データベースの種目名形式（例：50m自由形）で検索
    const dbStyleName = `${distance}m${style}`

    if (activeTab === 'all') {
      // ALLタブ: 短水路と長水路の速い方を選択
      const candidates: BestTime[] = []

      // 短水路のタイムを取得
      const shortCourseTimes = bestTimes.filter(
        (bt) => bt.style.name_jp === dbStyleName && bt.pool_type === 0
      )

      shortCourseTimes.forEach((bt) => {
        // 引き継ぎなしのタイムは常に候補に追加
        if (!bt.is_relaying) {
          candidates.push(bt)
          // チェックボックスがONの場合、引き継ぎありのタイムも追加
          if (includeRelaying && bt.relayingTime) {
            candidates.push({
              ...bt,
              id: bt.relayingTime.id,
              time: bt.relayingTime.time,
              created_at: bt.relayingTime.created_at,
              is_relaying: true,
              competition: bt.relayingTime.competition,
            })
          }
        } else {
          // 引き継ぎありのみのタイム（チェックボックスがONの場合のみ追加）
          if (includeRelaying) {
            candidates.push(bt)
          }
        }
      })

      // 長水路のタイムを取得
      const longCourseTimes = bestTimes.filter(
        (bt) => bt.style.name_jp === dbStyleName && bt.pool_type === 1
      )

      longCourseTimes.forEach((bt) => {
        // 引き継ぎなしのタイムは常に候補に追加
        if (!bt.is_relaying) {
          candidates.push(bt)
          // チェックボックスがONの場合、引き継ぎありのタイムも追加
          if (includeRelaying && bt.relayingTime) {
            candidates.push({
              ...bt,
              id: bt.relayingTime.id,
              time: bt.relayingTime.time,
              created_at: bt.relayingTime.created_at,
              is_relaying: true,
              competition: bt.relayingTime.competition,
            })
          }
        } else {
          // 引き継ぎありのみのタイム（チェックボックスがONの場合のみ追加）
          if (includeRelaying) {
            candidates.push(bt)
          }
        }
      })

      if (candidates.length === 0) return null

      // 最速のタイムを選択
      return candidates.reduce((best, current) => (current.time < best.time ? current : best))
    } else {
      // 短水路/長水路タブ: フィルタリング済みのデータから取得
      const candidates: BestTime[] = []

      const matchingTimes = filteredBestTimes.filter((bt) => bt.style.name_jp === dbStyleName)

      matchingTimes.forEach((bt) => {
        // 引き継ぎなしのタイムは常に候補に追加
        if (!bt.is_relaying) {
          candidates.push(bt)
          // チェックボックスがONの場合、引き継ぎありのタイムも追加
          if (includeRelaying && bt.relayingTime) {
            candidates.push({
              ...bt,
              id: bt.relayingTime.id,
              time: bt.relayingTime.time,
              created_at: bt.relayingTime.created_at,
              is_relaying: true,
              competition: bt.relayingTime.competition,
            })
          }
        } else {
          // 引き継ぎありのみのタイム（チェックボックスがONの場合のみ追加）
          if (includeRelaying) {
            candidates.push(bt)
          }
        }
      })

      if (candidates.length === 0) return null

      // 最速のタイムを選択
      return candidates.reduce((best, current) => (current.time < best.time ? current : best))
    }
  }

  const getTimeDisplay = (bestTime: BestTime): { main: string; suffix: string } => {
    const timeStr = formatTime(bestTime.time)
    const suffixes: string[] = []

    // ALLタブの場合、長水路ならLを追加
    if (activeTab === 'all' && bestTime.pool_type === 1) {
      suffixes.push('L')
    }

    // 引き継ぎありのタイムの場合、Rを追加
    if (bestTime.is_relaying) {
      suffixes.push('R')
    }

    return {
      main: timeStr,
      suffix: suffixes.join(''),
    }
  }

  if (bestTimes.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>記録がありません</Text>
        <Text style={styles.emptySubtext}>まだ記録を登録していません</Text>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      {/* タブとチェックボックス */}
      <View style={styles.controls}>
        <View style={styles.tabs}>
          {[
            { id: 'all' as TabType, label: 'ALL' },
            { id: 'short' as TabType, label: '短水路' },
            { id: 'long' as TabType, label: '長水路' },
          ].map((tab) => (
            <Pressable
              key={tab.id}
              style={[styles.tab, activeTab === tab.id && styles.tabActive]}
              onPress={() => setActiveTab(tab.id)}
            >
              <Text style={[styles.tabText, activeTab === tab.id && styles.tabTextActive]}>
                {tab.label}
              </Text>
            </Pressable>
          ))}
        </View>
        <Pressable
          style={styles.checkboxContainer}
          onPress={() => setIncludeRelaying(!includeRelaying)}
        >
          <View style={[styles.checkbox, includeRelaying && styles.checkboxChecked]}>
            {includeRelaying && <Text style={styles.checkboxMark}>✓</Text>}
          </View>
          <Text style={styles.checkboxLabel}>引き継ぎタイムも含めて表示</Text>
        </Pressable>
      </View>

      {/* テーブル */}
      <ScrollView horizontal style={styles.tableContainer}>
        <View style={styles.table}>
          {/* ヘッダー */}
          <View style={styles.tableHeader}>
            <View style={[styles.headerCell, styles.distanceCell]}>
              <Text style={styles.headerText}>距離</Text>
            </View>
            {STYLES.map((style) => (
              <View
                key={style}
                style={[
                  styles.headerCell,
                  styles.styleCell,
                  { backgroundColor: styleColors[style]?.bg || '#F3F4F6' },
                ]}
              >
                <Text
                  style={[
                    styles.headerText,
                    { color: styleColors[style]?.text || '#111827' },
                  ]}
                >
                  {style}
                </Text>
              </View>
            ))}
          </View>

          {/* ボディ */}
          {DISTANCES.map((distance) => (
            <View key={distance} style={styles.tableRow}>
              <View style={[styles.cell, styles.distanceCell]}>
                <Text style={styles.distanceText}>{distance}m</Text>
              </View>
              {STYLES.map((style) => {
                const bestTime = getBestTime(style, distance)
                const isInvalid = isInvalidCombination(style, distance)
                const styleColor = styleColors[style] || { bg: '#F3F4F6', text: '#111827' }

                return (
                  <View
                    key={style}
                    style={[
                      styles.cell,
                      styles.styleCell,
                      {
                        backgroundColor: isInvalid ? '#E5E7EB' : styleColor.bg,
                      },
                    ]}
                  >
                    {bestTime ? (
                      <View style={styles.timeContainer}>
                        {(() => {
                          const createdAt = parseISO(bestTime.created_at)
                          const isNew = differenceInDays(new Date(), createdAt) <= 30
                          const display = getTimeDisplay(bestTime)

                          return (
                            <>
                              {isNew && (
                                <View style={styles.newBadge}>
                                  <Text style={styles.newBadgeText}>New</Text>
                                </View>
                              )}
                              <Text
                                style={[
                                  styles.timeText,
                                  isNew && styles.timeTextNew,
                                  { color: styleColor.text },
                                ]}
                              >
                                {display.main}
                                {display.suffix && (
                                  <Text style={styles.timeSuffix}>{display.suffix}</Text>
                                )}
                              </Text>
                            </>
                          )
                        })()}
                      </View>
                    ) : (
                      <Text style={styles.emptyCellText}>—</Text>
                    )}
                  </View>
                )
              })}
            </View>
          ))}
        </View>
      </ScrollView>

      {/* 注釈 */}
      <View style={styles.annotation}>
        <Text style={styles.annotationText}>※ L: 長水路, R: 引き継ぎあり</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#6B7280',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 12,
  },
  tabs: {
    flexDirection: 'row',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
  },
  tab: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
  },
  tabActive: {
    backgroundColor: '#2563EB',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
  },
  tabTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  checkboxChecked: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  checkboxMark: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  checkboxLabel: {
    fontSize: 12,
    color: '#374151',
  },
  tableContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  table: {
    minWidth: '100%',
  },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#D1D5DB',
  },
  headerCell: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: '#D1D5DB',
  },
  distanceCell: {
    width: 60,
    backgroundColor: '#F9FAFB',
  },
  styleCell: {
    width: 100,
  },
  headerText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#111827',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#D1D5DB',
  },
  cell: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: '#D1D5DB',
    minHeight: 60,
  },
  distanceText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  timeContainer: {
    alignItems: 'center',
    position: 'relative',
  },
  newBadge: {
    position: 'absolute',
    top: -8,
    right: -16,
    backgroundColor: '#DC2626',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 8,
  },
  newBadgeText: {
    fontSize: 8,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  timeText: {
    fontSize: 14,
    fontWeight: '600',
  },
  timeTextNew: {
    color: '#DC2626',
  },
  timeSuffix: {
    fontSize: 10,
    marginLeft: 2,
  },
  emptyCellText: {
    fontSize: 14,
    color: '#D1D5DB',
  },
  annotation: {
    alignItems: 'flex-end',
  },
  annotationText: {
    fontSize: 12,
    color: '#DC2626',
  },
})
