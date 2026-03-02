import React, { useState, useEffect, useRef, useMemo } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { useAuth } from '@/contexts/AuthProvider'
import { formatTime } from '@/utils/formatters'
import type { CalendarItem } from '@apps/shared/types/ui'
import { styles } from '../styles'
import type { RecordDetailProps, RecordData } from '../types'

/**
 * 個別記録カードコンポーネント（タブ付きスプリットタイム表示）
 */
const RecordCard: React.FC<{
  record: RecordData
  splits: Array<{ distance: number; split_time: number }>
  records: CalendarItem[]
  place?: string
  poolType?: number
  competitionId: string
  supabase: ReturnType<typeof useAuth>['supabase']
  onEditRecord?: (item: CalendarItem) => void
  onDeleteRecord?: (recordId: string) => void
  onClose?: () => void
}> = ({ record, splits, records, place, poolType, competitionId, supabase, onEditRecord, onDeleteRecord, onClose }) => {
  const [splitTab, setSplitTab] = useState<'race' | 'all'>('race')

  // ゴールタイムを含む表示用スプリットデータ
  const displaySplitTimes = useMemo(() => {
    const sorted = [...splits].sort((a, b) => a.distance - b.distance)
    const base = sorted.map((st, i) => ({
      distance: st.distance,
      split_time: st.split_time,
      id: `split-${i}`,
    }))
    const raceDistance = record.styleDistance
    if (raceDistance && record.time > 0) {
      const hasGoal = base.some((st) => st.distance === raceDistance)
      if (!hasGoal) {
        base.push({ distance: raceDistance, split_time: record.time, id: 'goal' })
      }
    }
    return base
  }, [splits, record.styleDistance, record.time])

  // 距離別Lap用: 25m刻みのみフィルタ
  const raceSplitTimes = useMemo(() => {
    return displaySplitTimes.filter((st) => st.distance % 25 === 0 && st.split_time > 0)
  }, [displaySplitTimes])

  // 距離別Lapのカラム間隔を決定
  const lapIntervals = useMemo(() => {
    const raceDistance = record.styleDistance
    if (!raceDistance) return []
    const intervals: number[] = []
    if (raceDistance >= 25 && raceDistance !== 25) intervals.push(25)
    if (raceDistance >= 50 && raceDistance !== 50) intervals.push(50)
    return intervals
  }, [record.styleDistance])

  // データが1つもないintervalは列ごと非表示
  const visibleLapIntervals = useMemo(() => {
    return lapIntervals.filter(interval =>
      raceSplitTimes.some(st => {
        if (st.distance % interval !== 0) return false
        const prevDistance = st.distance - interval
        if (prevDistance === 0) return true
        const prevSplit = raceSplitTimes.find(s => s.distance === prevDistance)
        return prevSplit != null && prevSplit.split_time > 0
      })
    )
  }, [lapIntervals, raceSplitTimes])

  // 距離別Lapの各行のラップタイム計算
  const raceLapData = useMemo(() => {
    return raceSplitTimes.map((st) => {
      const lapTimes: Record<number, number | null> = {}
      for (const interval of lapIntervals) {
        if (st.distance % interval === 0) {
          const prevDistance = st.distance - interval
          if (prevDistance === 0) {
            lapTimes[interval] = st.split_time
          } else {
            const prevSplit = raceSplitTimes.find((s) => s.distance === prevDistance)
            lapTimes[interval] = prevSplit && prevSplit.split_time > 0
              ? st.split_time - prevSplit.split_time
              : null
          }
        } else {
          lapTimes[interval] = null
        }
      }
      return { ...st, lapTimes }
    })
  }, [raceSplitTimes, lapIntervals])

  // All Lap計算（各区間のラップ）
  const allLapTimes = useMemo(() => {
    if (displaySplitTimes.length === 0) return []
    const laps: { fromDistance: number; toDistance: number; lapTime: number }[] = []
    if (displaySplitTimes[0].distance > 0) {
      laps.push({
        fromDistance: 0,
        toDistance: displaySplitTimes[0].distance,
        lapTime: displaySplitTimes[0].split_time,
      })
    }
    for (let i = 1; i < displaySplitTimes.length; i++) {
      const prev = displaySplitTimes[i - 1]
      const curr = displaySplitTimes[i]
      if (prev.split_time > 0 && curr.split_time > 0) {
        laps.push({
          fromDistance: prev.distance,
          toDistance: curr.distance,
          lapTime: curr.split_time - prev.split_time,
        })
      }
    }
    return laps
  }, [displaySplitTimes])

  return (
    <View style={styles.recordCard}>
      {/* 記録内容カード */}
      <View style={styles.recordContentCard}>
        {/* 編集・削除ボタン（右上） */}
        <View style={styles.recordCardActions}>
          <View style={styles.recordCardActionsRow}>
            {onEditRecord && (
              <Pressable
                style={styles.recordCardActionButton}
                onPress={async () => {
                  try {
                    const { data: fullRecord } = await supabase
                      .from('records')
                      .select(`
                        *,
                        style:styles(*),
                        competition:competitions(*),
                        split_times(*)
                      `)
                      .eq('id', record.id)
                      .single()

                    if (fullRecord) {
                      const calendarItem: CalendarItem = {
                        id: fullRecord.id,
                        type: 'record',
                        date: records[0]?.date || fullRecord.competition?.date || '',
                        title: fullRecord.style?.name_jp || record.styleName,
                        place: place || fullRecord.competition?.place || undefined,
                        note: fullRecord.note || undefined,
                        metadata: {
                          record: {
                            time: fullRecord.time,
                            is_relaying: fullRecord.is_relaying || false,
                            reaction_time: fullRecord.reaction_time ?? null,
                            style: {
                              id: fullRecord.style?.id?.toString() || record.styleId.toString(),
                              name_jp: fullRecord.style?.name_jp || record.styleName,
                              distance: fullRecord.style?.distance || record.styleDistance,
                            },
                            competition_id: fullRecord.competition_id || competitionId,
                            split_times: fullRecord.split_times || [],
                          },
                          competition: fullRecord.competition || records[0]?.metadata?.competition,
                          style: fullRecord.style || {
                            id: record.styleId,
                            name_jp: record.styleName,
                            distance: record.styleDistance,
                          },
                          pool_type: fullRecord.competition?.pool_type ?? poolType ?? 0,
                        },
                      }
                      onEditRecord(calendarItem)
                      onClose?.()
                    }
                  } catch (error) {
                    console.error('記録編集データ取得エラー:', error)
                  }
                }}
              >
                <Feather name="edit" size={18} color="#2563EB" />
              </Pressable>
            )}
            {onDeleteRecord && (
              <Pressable
                style={styles.recordCardActionButton}
                onPress={() => onDeleteRecord(record.id)}
              >
                <Feather name="trash-2" size={18} color="#EF4444" />
              </Pressable>
            )}
          </View>
        </View>

        {/* 種目とタイム */}
        <View style={styles.recordInfoGrid}>
          <View style={styles.recordInfoRow}>
            <Text style={styles.recordInfoLabel}>種目</Text>
            <Text style={styles.recordStyleValue}>
              {record.styleName}
              {record.isRelaying && <Text style={styles.recordRelayBadge}> R</Text>}
            </Text>
          </View>
          <View style={styles.recordInfoRow}>
            <Text style={styles.recordInfoLabel}>タイム</Text>
            <View style={styles.recordTimeContainer}>
              <Text style={styles.recordTimeValue}>{formatTime(record.time)}</Text>
              {record.reactionTime != null && typeof record.reactionTime === 'number' && (
                <Text style={styles.recordReactionTimeInline}>
                  (RT {record.reactionTime.toFixed(2)})
                </Text>
              )}
            </View>
          </View>
        </View>
      </View>

      {/* スプリットタイム（タブ付き） */}
      {displaySplitTimes.length > 0 && (
        <View style={splitStyles.splitSection}>
          {/* タブ */}
          <View style={splitStyles.tabRow}>
            <Pressable
              style={[splitStyles.tab, splitTab === 'race' && splitStyles.tabActive]}
              onPress={() => setSplitTab('race')}
            >
              <Text style={[splitStyles.tabText, splitTab === 'race' && splitStyles.tabTextActive]}>
                距離別 Lap
              </Text>
            </Pressable>
            <Pressable
              style={[splitStyles.tab, splitTab === 'all' && splitStyles.tabActive]}
              onPress={() => setSplitTab('all')}
            >
              <Text style={[splitStyles.tabText, splitTab === 'all' && splitStyles.tabTextActive]}>
                All Lap
              </Text>
            </Pressable>
          </View>

          {splitTab === 'race' ? (
            <>
              <View style={splitStyles.splitHeaderRow}>
                <Text style={[splitStyles.splitHeaderCell, splitStyles.splitDistanceCol]}>距離</Text>
                <Text style={[splitStyles.splitHeaderCell, splitStyles.splitTimeCol]}>Split</Text>
                {visibleLapIntervals.map((interval) => (
                  <Text key={interval} style={[splitStyles.splitHeaderCell, splitStyles.splitLapCol]}>
                    {interval}m Lap
                  </Text>
                ))}
              </View>
              {raceLapData.map((st, index) => (
                <View
                  key={st.id || index}
                  style={[splitStyles.splitRow, index % 2 === 0 && splitStyles.splitRowEven]}
                >
                  <Text style={[splitStyles.splitCell, splitStyles.splitDistanceCol, splitStyles.splitDistanceText]}>
                    {st.distance}m
                  </Text>
                  <Text style={[splitStyles.splitCell, splitStyles.splitTimeCol, splitStyles.splitTimeText]}>
                    {formatTime(st.split_time)}
                  </Text>
                  {visibleLapIntervals.map((interval) => (
                    <Text key={interval} style={[splitStyles.splitCell, splitStyles.splitLapCol, splitStyles.splitLapText]}>
                      {st.lapTimes[interval] != null ? formatTime(st.lapTimes[interval]!) : '-'}
                    </Text>
                  ))}
                </View>
              ))}
            </>
          ) : (
            <>
              <View style={splitStyles.splitHeaderRow}>
                <Text style={[splitStyles.splitHeaderCell, splitStyles.splitDistanceCol]}>区間</Text>
                <Text style={[splitStyles.splitHeaderCell, { flex: 2 }]}>Lap Time</Text>
              </View>
              {allLapTimes.map((lap, index) => (
                <View
                  key={index}
                  style={[splitStyles.splitRow, index % 2 === 0 && splitStyles.splitRowEven]}
                >
                  <Text style={[splitStyles.splitCell, splitStyles.splitDistanceCol, splitStyles.splitDistanceText]}>
                    {lap.fromDistance}m → {lap.toDistance}m
                  </Text>
                  <Text style={[splitStyles.splitCell, { flex: 2 }, splitStyles.splitTimeText]}>
                    {formatTime(lap.lapTime)}
                  </Text>
                </View>
              ))}
            </>
          )}
        </View>
      )}

      {/* メモ */}
      {record.note && (
        <View style={styles.recordNoteContainer}>
          <Text style={styles.recordNoteLabel}>メモ</Text>
          <Text style={styles.recordNoteText}>{record.note}</Text>
        </View>
      )}
    </View>
  )
}

/**
 * 記録詳細表示コンポーネント（大会ごとにグループ化）
 */
export const RecordDetail: React.FC<RecordDetailProps> = ({
  competitionId: _competitionId,
  competitionName,
  place,
  poolType,
  note,
  records,
  onEditCompetition,
  onDeleteCompetition,
  onAddRecord,
  onEditRecord,
  onDeleteRecord,
  onClose,
}) => {
  const { supabase, user } = useAuth()
  const [actualRecords, setActualRecords] = useState<RecordData[]>([])
  const [loading, setLoading] = useState(true)
  const [splitTimesMap, setSplitTimesMap] = useState<Map<string, Array<{ distance: number; split_time: number }>>>(new Map())
  const [_loadingSplits, setLoadingSplits] = useState<Set<string>>(new Set())
  const loadingSplitsRef = useRef<Set<string>>(new Set())

  // プール種別のテキストを取得
  const getPoolTypeText = (poolType: number): string => {
    return poolType === 1 ? '長水路(50m)' : '短水路(25m)'
  }

  // 記録データを取得
  useEffect(() => {
    const loadRecords = async () => {
      try {
        setLoading(true)
        let query = supabase
          .from('records')
          .select(`
            id,
            time,
            reaction_time,
            is_relaying,
            note,
            style_id,
            style:styles(id, name_jp, distance)
          `)
          .eq('competition_id', _competitionId)

        // チーム大会の場合は自分の記録だけを表示
        const isTeamCompetition = records[0]?.metadata?.team_id != null
        if (isTeamCompetition && user?.id) {
          query = query.eq('user_id', user.id)
        }

        const { data, error } = await query

        if (error) throw error

        type RecordFromDB = {
          id: string
          time: number
          reaction_time: number | null
          is_relaying: boolean
          note: string | null
          style_id: number
          style: {
            id: number
            name_jp: string
            distance: number
          } | {
            id: number
            name_jp: string
            distance: number
          }[] | null
        }
        const recordsData = (data || []) as unknown as RecordFromDB[]
        const formattedRecords = recordsData.map((record) => {
          const style = Array.isArray(record.style) ? record.style[0] : record.style
          return {
            id: record.id,
            styleName: style?.name_jp || '',
            time: record.time || 0,
            reactionTime: record.reaction_time ?? null,
            isRelaying: record.is_relaying || false,
            note: record.note,
            styleId: record.style_id,
            styleDistance: style?.distance || 0,
          }
        })

        setActualRecords(formattedRecords)
      } catch (err) {
        console.error('記録の取得エラー:', err)
        setActualRecords([])
      } finally {
        setLoading(false)
      }
    }

    loadRecords()
  }, [_competitionId, supabase, user?.id, records])

  // スプリットタイムを取得
  useEffect(() => {
    let cancelled = false

    const loadSplitTimes = async () => {
      const recordIds = actualRecords.map(r => r.id)
      const recordsToLoad = recordIds.filter(id => !loadingSplitsRef.current.has(id))

      if (recordsToLoad.length === 0) return

      for (const recordId of recordsToLoad) {
        if (cancelled) return

        try {
          if (cancelled) return
          loadingSplitsRef.current.add(recordId)
          setLoadingSplits(prev => new Set(prev).add(recordId))

          const { data, error } = await supabase
            .from('split_times')
            .select('distance, split_time')
            .eq('record_id', recordId)
            .order('distance', { ascending: true })

          if (error) throw error

          if (cancelled) return

          if (data && data.length > 0) {
            setSplitTimesMap(prev => {
              if (cancelled) return prev
              const newMap = new Map(prev)
              newMap.set(recordId, data.map(st => ({
                distance: st.distance,
                split_time: st.split_time
              })))
              return newMap
            })
          }
        } catch (error) {
          if (cancelled) return
          console.error('スプリットタイム取得エラー:', error)
        } finally {
          if (!cancelled) {
            loadingSplitsRef.current.delete(recordId)
            setLoadingSplits(prev => {
              const newSet = new Set(prev)
              newSet.delete(recordId)
              return newSet
            })
          }
        }
      }
    }

    loadSplitTimes()

    return () => {
      cancelled = true
    }
  }, [actualRecords, supabase])

  return (
    <View style={styles.competitionRecordContainer}>
      {/* 大会ヘッダー */}
      <View style={styles.competitionHeader}>
        <View style={styles.competitionHeaderContent}>
          <View style={styles.competitionHeaderLeft}>
            <View style={styles.competitionHeaderTitleRow}>
              <View style={[styles.entryTypeBadge, { backgroundColor: '#2563EB' }]}>
                <Text style={styles.entryTypeText}>大会</Text>
              </View>
              <Text style={styles.competitionHeaderTitle}>{competitionName}</Text>
            </View>
          </View>
          <View style={styles.competitionHeaderActions}>
            {onEditCompetition && (
              <Pressable
                style={styles.competitionHeaderButton}
                onPress={onEditCompetition}
              >
                <Feather name="edit" size={18} color="#2563EB" />
              </Pressable>
            )}
            {onDeleteCompetition && (
              <Pressable
                style={styles.competitionHeaderButton}
                onPress={onDeleteCompetition}
              >
                <Feather name="trash-2" size={20} color="#EF4444" />
              </Pressable>
            )}
          </View>
        </View>
        {(place || poolType !== undefined) && (
          <View style={styles.competitionHeaderInfo}>
            {place && (
              <View style={styles.competitionHeaderInfoItem}>
                <Feather name="map-pin" size={14} color="#6B7280" />
                <Text style={styles.competitionHeaderInfoText}>{place}</Text>
              </View>
            )}
            {poolType !== undefined && (
              <View style={styles.competitionHeaderInfoItem}>
                <Feather name="droplet" size={14} color="#6B7280" />
                <Text style={styles.competitionHeaderInfoText}>{getPoolTypeText(poolType)}</Text>
              </View>
            )}
          </View>
        )}
        {note && (
          <Text style={styles.competitionHeaderNote}>{note}</Text>
        )}
      </View>

      {/* 記録カード一覧 */}
      <View style={styles.recordsList}>
        {loading ? (
          <View style={styles.recordCard}>
            <Text style={styles.loadingText}>記録を読み込み中...</Text>
          </View>
        ) : actualRecords.length === 0 ? (
          <View style={styles.recordCard}>
            <Text style={styles.emptyText}>記録がありません</Text>
            {onAddRecord && (
              <Pressable
                style={styles.addCompetitionRecordButton}
                onPress={() => {
                  onAddRecord()
                  onClose?.()
                }}
              >
                <Feather name="plus" size={18} color="#2563EB" />
                <Text style={styles.addCompetitionRecordButtonText}>大会記録を追加</Text>
              </Pressable>
            )}
          </View>
        ) : (
          actualRecords.map((record) => (
            <RecordCard
              key={record.id}
              record={record}
              splits={splitTimesMap.get(record.id) || []}
              records={records}
              place={place}
              poolType={poolType}
              competitionId={_competitionId}
              supabase={supabase}
              onEditRecord={onEditRecord}
              onDeleteRecord={onDeleteRecord}
              onClose={onClose}
            />
          ))
        )}

        {/* 大会記録を追加ボタン */}
        {onAddRecord && (
          <Pressable
            style={styles.addCompetitionRecordButton}
            onPress={() => {
              onAddRecord()
              onClose?.()
            }}
          >
            <Feather name="plus" size={18} color="#2563EB" />
            <Text style={styles.addCompetitionRecordButtonText}>大会記録を追加</Text>
          </Pressable>
        )}
      </View>
    </View>
  )
}

const splitStyles = StyleSheet.create({
  splitSection: {
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    overflow: 'hidden',
    marginTop: 8,
  },
  tabRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#2563EB',
  },
  tabText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6B7280',
  },
  tabTextActive: {
    color: '#2563EB',
    fontWeight: '600',
  },
  splitHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  splitHeaderCell: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7280',
  },
  splitRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  splitRowEven: {
    backgroundColor: '#FFFFFF',
  },
  splitCell: {
    fontSize: 13,
  },
  splitDistanceCol: {
    flex: 1,
  },
  splitTimeCol: {
    flex: 1.5,
  },
  splitLapCol: {
    flex: 1.5,
  },
  splitDistanceText: {
    fontWeight: '600',
    color: '#111827',
  },
  splitTimeText: {
    color: '#1E40AF',
    fontWeight: '600',
  },
  splitLapText: {
    color: '#111827',
  },
})
