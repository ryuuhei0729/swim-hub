import React, { useState, useMemo } from 'react'
import { View, Text, StyleSheet, Pressable } from 'react-native'
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

// テーブルヘッダー用の短縮名
const STYLE_SHORT_LABELS: Record<string, string> = {
  自由形: 'Fr',
  平泳ぎ: 'Br',
  背泳ぎ: 'Ba',
  バタフライ: 'Fly',
  個人メドレー: 'IM',
}

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

    const extractCandidates = (times: BestTime[], allowRelaying: boolean): BestTime[] => {
      const candidates: BestTime[] = []
      times.forEach((bt) => {
        if (!bt.is_relaying) {
          candidates.push(bt)
          if (allowRelaying && bt.relayingTime) {
            candidates.push({
              ...bt,
              id: bt.relayingTime.id,
              time: bt.relayingTime.time,
              created_at: bt.relayingTime.created_at,
              is_relaying: true,
              competition: bt.relayingTime.competition,
            })
          }
        } else if (allowRelaying) {
          candidates.push(bt)
        }
      })
      return candidates
    }

    if (activeTab === 'all') {
      // ALLタブ: 短水路と長水路の速い方を選択
      const candidates: BestTime[] = []

      // 短水路のタイムを取得
      const shortCourseTimes = bestTimes.filter(
        (bt) => bt.style.name_jp === dbStyleName && bt.pool_type === 0
      )
      candidates.push(...extractCandidates(shortCourseTimes, includeRelaying))

      // 長水路のタイムを取得
      const longCourseTimes = bestTimes.filter(
        (bt) => bt.style.name_jp === dbStyleName && bt.pool_type === 1
      )
      candidates.push(...extractCandidates(longCourseTimes, includeRelaying))

      if (candidates.length === 0) return null

      // 最速のタイムを選択
      return candidates.reduce((best, current) => (current.time < best.time ? current : best))
    } else {
      // 短水路/長水路タブ: フィルタリング済みのデータから取得
      const matchingTimes = filteredBestTimes.filter((bt) => bt.style.name_jp === dbStyleName)
      const candidates = extractCandidates(matchingTimes, includeRelaying)

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
          <Text style={styles.checkboxLabel}>引き継ぎタイム含</Text>
        </Pressable>
      </View>

      {/* テーブル */}
      <View style={styles.tableContainer}>
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
                  {STYLE_SHORT_LABELS[style] || style}
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
                          // 一括登録（competition なし）は New 表示対象外
                          const isNew = bestTime.competition ? differenceInDays(new Date(), createdAt) <= 30 : false
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
      </View>

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
    paddingHorizontal: 16,
  },
  tabs: {
    flexDirection: 'row',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
  },
  tab: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    backgroundColor: '#FFFFFF',
  },
  tabActive: {
    backgroundColor: '#2563EB',
  },
  tabText: {
    fontSize: 12,
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
    gap: 6,
  },
  checkbox: {
    width: 16,
    height: 16,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    borderRadius: 3,
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
    fontSize: 10,
    fontWeight: 'bold',
  },
  checkboxLabel: {
    fontSize: 11,
    color: '#374151',
  },
  tableContainer: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#D1D5DB',
  },
  table: {
    width: '100%',
  },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#D1D5DB',
  },
  headerCell: {
    paddingVertical: 6,
    paddingHorizontal: 2,
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: '#D1D5DB',
  },
  distanceCell: {
    width: 40,
    backgroundColor: '#F9FAFB',
  },
  styleCell: {
    flex: 1,
  },
  headerText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#111827',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#D1D5DB',
  },
  cell: {
    paddingVertical: 4,
    paddingHorizontal: 2,
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: '#D1D5DB',
    minHeight: 30,
  },
  distanceText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#374151',
  },
  timeContainer: {
    alignItems: 'center',
    position: 'relative',
  },
  newBadge: {
    position: 'absolute',
    top: -10,
    right: -10,
    backgroundColor: '#DC2626',
    paddingHorizontal: 3,
    paddingVertical: 1,
    borderRadius: 6,
  },
  newBadgeText: {
    fontSize: 7,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  timeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  timeTextNew: {
    color: '#DC2626',
  },
  timeSuffix: {
    fontSize: 8,
    marginLeft: 1,
  },
  emptyCellText: {
    fontSize: 11,
    color: '#D1D5DB',
  },
  annotation: {
    alignItems: 'flex-end',
    paddingHorizontal: 16,
  },
  annotationText: {
    fontSize: 12,
    color: '#DC2626',
  },
})
