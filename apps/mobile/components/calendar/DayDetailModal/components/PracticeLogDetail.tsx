import React, { useState, useEffect, useCallback } from 'react'
import { View, Text, Pressable } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { useAuth } from '@/contexts/AuthProvider'
import { formatTime, formatCircleTime } from '@/utils/formatters'
import type { PracticeTime } from '@apps/shared/types'
import { styles } from '../styles'
import { MemoizedTimeTable } from './TimeTable'
import type { PracticeLogDetailProps, PracticeLogData, PracticeLogDetailData, PracticeLogFromDB } from '../types'

/**
 * Practice_Logの詳細表示コンポーネント
 */
export const PracticeLogDetail: React.FC<PracticeLogDetailProps> = ({
  item,
  title,
  color,
  typeLabel,
  isPractice,
  isPracticeLog,
  practiceId,
  hasEntriesOrRecords = false,
  onEntryPress,
  onClose,
  onEditPractice,
  onDeletePractice,
  onAddPracticeLog,
  onEditPracticeLog,
  onDeletePracticeLog,
  onEditRecord,
  onDeleteRecord,
  onEditEntry,
  onDeleteEntry,
  onAddEntry,
  onEditCompetition,
  onDeleteCompetition,
  onPracticeTimeLoaded,
}) => {
  const { supabase } = useAuth()
  const [expanded, setExpanded] = useState(false)
  const [recordDetail, setRecordDetail] = useState<{
    time: number
    note: string
    reactionTime: number | null
  } | null>(null)
  const [loadingRecordDetail, setLoadingRecordDetail] = useState(false)
  const [practiceLogs, setPracticeLogs] = useState<PracticeLogData[]>([])
  const [loading, setLoading] = useState(false)

  const loadPracticeLogs = useCallback(async () => {
    if (!isPractice || !practiceId) return

    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('practices')
        .select(`
          *,
          practice_logs (
            *,
            practice_times (*)
          )
        `)
        .eq('id', practiceId)
        .single()

      if (error) throw error
      if (!data) return

      const formattedLogs = (data.practice_logs || []).map((log: PracticeLogFromDB) => ({
        id: log.id,
        practiceId: log.practice_id,
        style: log.style,
        repCount: log.rep_count,
        setCount: log.set_count,
        distance: log.distance,
        circle: log.circle,
        note: log.note,
        times: (log.practice_times || []).map((time: PracticeTime) => ({
          id: time.id,
          time: time.time,
          repNumber: time.rep_number,
          setNumber: time.set_number,
        })),
      }))

      setPracticeLogs(formattedLogs)
    } catch (error) {
      console.error('練習ログの取得エラー:', error)
    } finally {
      setLoading(false)
    }
  }, [isPractice, practiceId, supabase])

  useEffect(() => {
    if (expanded && isPractice && practiceId) {
      loadPracticeLogs()
    }
  }, [expanded, isPractice, practiceId, loadPracticeLogs])

  // Practice_Logの場合は直接タイム情報を表示
  const [practiceLogDetail, setPracticeLogDetail] = useState<PracticeLogDetailData | null>(null)
  const [loadingLogDetail, setLoadingLogDetail] = useState(false)

  const loadPracticeLogDetail = useCallback(async () => {
    if (!isPracticeLog || !item.id) return

    try {
      setLoadingLogDetail(true)
      const { data, error } = await supabase
        .from('practice_logs')
        .select(`
          *,
          practice_times (*)
        `)
        .eq('id', item.id)
        .single()

      if (error) throw error
      if (!data) return

      const log = data as {
        id: string
        style: string
        rep_count: number
        set_count: number
        distance: number
        circle: number | null
        note: string | null
        practice_times?: PracticeTime[]
      }

      const times = (log.practice_times || []).map((time: PracticeTime) => ({
        id: time.id,
        time: time.time,
        repNumber: time.rep_number,
        setNumber: time.set_number,
      }))

      setPracticeLogDetail({
        id: log.id,
        style: log.style,
        repCount: log.rep_count,
        setCount: log.set_count,
        distance: log.distance,
        circle: log.circle,
        note: log.note,
        times,
      })

      // PracticeTimeの有無を親に通知
      if (onPracticeTimeLoaded) {
        onPracticeTimeLoaded(item.id, times.length > 0)
      }
    } catch (error) {
      console.error('練習ログ詳細の取得エラー:', error)
    } finally {
      setLoadingLogDetail(false)
    }
  }, [isPracticeLog, item.id, supabase, onPracticeTimeLoaded])

  useEffect(() => {
    if (isPracticeLog && item.id) {
      loadPracticeLogDetail()
    }
  }, [isPracticeLog, item.id, loadPracticeLogDetail])

  // 記録詳細を取得（record表示用）
  useEffect(() => {
    if (item.type !== 'record') return

    let isMounted = true
    const loadRecordDetail = async () => {
      try {
        setLoadingRecordDetail(true)
        const competitionId =
          item.metadata?.competition?.id ||
          item.metadata?.record?.competition_id ||
          item.id
        if (!competitionId) return

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data, error } = await supabase
          .from('records')
          .select('id, time, note, reaction_time')
          .eq('competition_id', competitionId)
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()

        if (!isMounted) return
        if (error) {
          console.error('記録詳細取得エラー:', error)
          return
        }
        if (!data) return

        setRecordDetail({
          time: data.time,
          note: data.note || '',
          reactionTime: data.reaction_time ?? null,
        })
      } catch (error) {
        if (!isMounted) return
        console.error('記録詳細取得エラー:', error)
      } finally {
        if (isMounted) {
          setLoadingRecordDetail(false)
        }
      }
    }

    loadRecordDetail()

    return () => {
      isMounted = false
    }
  }, [item, supabase])

  if (isPracticeLog) {
    return (
      <View style={[styles.entryItem, { borderLeftColor: color }]}>
        <View style={styles.entryContent}>
          <View style={styles.entryHeader}>
            <View style={[styles.entryTypeBadge, { backgroundColor: color }]}>
              <Text style={styles.entryTypeText}>{typeLabel}</Text>
            </View>
            <View style={styles.actionButtons}>
              {onEditPracticeLog && (
                <Pressable
                  style={styles.actionButton}
                  onPress={(e) => {
                    e.stopPropagation()
                    onEditPracticeLog(item)
                    onClose()
                  }}
                >
                  <Feather name="edit" size={18} color="#2563EB" />
                </Pressable>
              )}
              {onDeletePracticeLog && (
                <Pressable
                  style={styles.actionButton}
                  onPress={(e) => {
                    e.stopPropagation()
                    onDeletePracticeLog(item.id)
                  }}
                >
                  <Feather name="trash-2" size={16} color="#EF4444" />
                </Pressable>
              )}
            </View>
          </View>

          {loadingLogDetail ? (
            <Text style={styles.loadingText}>読み込み中...</Text>
          ) : practiceLogDetail ? (
            <>
              {/* 練習内容 */}
              <View style={styles.practiceContentContainer}>
                <Text style={styles.practiceContentLabel}>練習内容</Text>
                <Text style={styles.practiceContentText}>
                  <Text style={styles.practiceContentValue}>{practiceLogDetail.distance}</Text>m ×{' '}
                  <Text style={styles.practiceContentValue}>{practiceLogDetail.repCount}</Text>
                  {practiceLogDetail.setCount > 1 && (
                    <>
                      {' × '}
                      <Text style={styles.practiceContentValue}>{practiceLogDetail.setCount}</Text>
                    </>
                  )}
                  {'　　'}
                  <Text style={styles.practiceContentValue}>
                    {formatCircleTime(practiceLogDetail.circle)}
                  </Text>
                  {'　'}
                  <Text style={styles.practiceContentValue}>{practiceLogDetail.style}</Text>
                </Text>
              </View>

              {/* タイム表示 */}
              {practiceLogDetail.times.length > 0 && (
                <View style={styles.timeContainer}>
                  <View style={styles.timeHeader}>
                    <View style={styles.timeHeaderBar} />
                    <Text style={styles.timeHeaderText}>タイム</Text>
                  </View>
                  <View style={styles.timeTableContainer}>
                    <MemoizedTimeTable times={practiceLogDetail.times} repCount={practiceLogDetail.repCount} setCount={practiceLogDetail.setCount} />
                  </View>
                </View>
              )}

              {practiceLogDetail.note && (
                <View style={styles.noteContainer}>
                  <Text style={styles.noteLabel}>メモ</Text>
                  <Text style={styles.noteText}>{practiceLogDetail.note}</Text>
                </View>
              )}
            </>
          ) : null}

          {item.place && (
            <View style={styles.entryPlaceContainer}>
              <Feather name="map-pin" size={14} color="#6B7280" />
              <Text style={styles.entryPlace} numberOfLines={1}>
                {item.place}
              </Text>
            </View>
          )}
        </View>
      </View>
    )
  }

  // Practiceの場合は展開可能
  return (
    <View style={[styles.entryItem, { borderLeftColor: color }]}>
      <Pressable
        style={styles.entryContentWrapper}
        onPress={() => {
          if (isPractice) {
            setExpanded(!expanded)
          } else {
            onEntryPress?.(item)
            onClose()
          }
        }}
      >
        <View style={styles.entryContent}>
          <View style={styles.entryHeader}>
            <View style={[styles.entryTypeBadge, { backgroundColor: color }]}>
              <Text style={styles.entryTypeText}>{typeLabel}</Text>
            </View>
            <View style={styles.actionButtons}>
              {isPractice && onEditPractice && (
                <Pressable
                  style={styles.actionButton}
                  onPress={(e) => {
                    e.stopPropagation()
                    onEditPractice(item)
                    onClose()
                  }}
                >
                  <Feather name="edit" size={18} color="#2563EB" />
                </Pressable>
              )}
              {isPractice && onDeletePractice && (
                <Pressable
                  style={styles.actionButton}
                  onPress={(e) => {
                    e.stopPropagation()
                    onDeletePractice(item.id)
                  }}
                >
                  <Feather name="trash-2" size={20} color="#EF4444" />
                </Pressable>
              )}
              {item.type === 'record' && onEditRecord && (
                <Pressable
                  style={styles.actionButton}
                  onPress={(e) => {
                    e.stopPropagation()
                    onEditRecord(item)
                    onClose()
                  }}
                >
                  <Feather name="edit" size={18} color="#2563EB" />
                </Pressable>
              )}
              {item.type === 'record' && onDeleteRecord && (
                <Pressable
                  style={styles.actionButton}
                  onPress={(e) => {
                    e.stopPropagation()
                    onDeleteRecord(item.id)
                  }}
                >
                  <Feather name="trash-2" size={20} color="#EF4444" />
                </Pressable>
              )}
              {item.type === 'entry' && onEditEntry && (
                <Pressable
                  style={styles.actionButton}
                  onPress={(e) => {
                    e.stopPropagation()
                    onEditEntry(item)
                    onClose()
                  }}
                >
                  <Feather name="edit" size={18} color="#2563EB" />
                </Pressable>
              )}
              {item.type === 'entry' && onDeleteEntry && (
                <Pressable
                  style={styles.actionButton}
                  onPress={(e) => {
                    e.stopPropagation()
                    onDeleteEntry(item.id)
                  }}
                >
                  <Feather name="trash-2" size={20} color="#EF4444" />
                </Pressable>
              )}
              {(item.type === 'competition' || item.type === 'team_competition') && onEditCompetition && (
                <Pressable
                  style={styles.actionButton}
                  onPress={(e) => {
                    e.stopPropagation()
                    onEditCompetition(item)
                    onClose()
                  }}
                >
                  <Feather name="edit" size={18} color="#2563EB" />
                </Pressable>
              )}
              {(item.type === 'competition' || item.type === 'team_competition') && onDeleteCompetition && (
                <Pressable
                  style={styles.actionButton}
                  onPress={(e) => {
                    e.stopPropagation()
                    onDeleteCompetition(item.id)
                  }}
                >
                  <Feather name="trash-2" size={20} color="#EF4444" />
                </Pressable>
              )}
              {isPractice && (
                <Pressable
                  style={styles.actionButton}
                  onPress={(e) => {
                    e.stopPropagation()
                    setExpanded(!expanded)
                  }}
                >
                  <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color="#6B7280" />
                </Pressable>
              )}
            </View>
          </View>
          <Text style={styles.entryTitle} numberOfLines={2}>
            {title}
          </Text>
          {item.type === 'record' && (
            <View style={styles.recordDetailContainer}>
              {loadingRecordDetail ? (
                <Text style={styles.loadingText}>記録を読み込み中...</Text>
              ) : recordDetail ? (
                <>
                  <View style={styles.recordRow}>
                    <Text style={styles.recordLabel}>タイム</Text>
                    <Text style={styles.recordValue}>{formatTime(recordDetail.time)}</Text>
                  </View>
                  {recordDetail.reactionTime !== null && (
                    <View style={styles.recordRow}>
                      <Text style={styles.recordLabel}>リアクション</Text>
                      <Text style={styles.recordValue}>{recordDetail.reactionTime}</Text>
                    </View>
                  )}
                  {recordDetail.note ? (
                    <Text style={styles.recordNote} numberOfLines={2}>
                      {recordDetail.note}
                    </Text>
                  ) : null}
                </>
              ) : (
                <Text style={styles.recordEmptyText}>記録詳細が見つかりません</Text>
              )}
            </View>
          )}
          {item.place && (
            <View style={styles.entryPlaceContainer}>
              <Feather name="map-pin" size={14} color="#6B7280" />
              <Text style={styles.entryPlace} numberOfLines={1}>
                {item.place}
              </Text>
            </View>
          )}
          {item.note && (
            <Text style={styles.entryNote} numberOfLines={2}>
              {item.note}
            </Text>
          )}
          {/* 練習ログ追加ボタン */}
          {isPractice && onAddPracticeLog && (
            <Pressable
              style={styles.addLogButton}
              onPress={(e) => {
                e.stopPropagation()
                onAddPracticeLog(practiceId)
                onClose()
              }}
            >
              <Feather name="plus" size={14} color="#374151" style={styles.addLogButtonIcon} />
              <Text style={styles.addLogButtonText}>練習メニューを追加</Text>
            </Pressable>
          )}
          {/* 大会記録追加ボタン */}
          {(item.type === 'competition' || item.type === 'team_competition') &&
            !hasEntriesOrRecords &&
            onAddEntry && (
              <Pressable
                style={styles.addLogButton}
                onPress={(e) => {
                  e.stopPropagation()
                  const competitionId = item.id
                  const dateParam = item.date
                  if (competitionId && dateParam && onAddEntry) {
                    onAddEntry(competitionId, dateParam)
                    onClose()
                  }
                }}
              >
                <Feather name="plus" size={14} color="#374151" style={styles.addLogButtonIcon} />
                <Text style={styles.addLogButtonText}>大会記録を追加</Text>
              </Pressable>
            )}
        </View>
      </Pressable>

      {/* 展開時のPractice_Log詳細表示 */}
      {expanded && isPractice && (
        <View style={styles.expandedContent}>
          {loading ? (
            <Text style={styles.loadingText}>読み込み中...</Text>
          ) : practiceLogs.length === 0 ? (
            <Text style={styles.emptyText}>練習メニューがありません</Text>
          ) : (
            practiceLogs.map((log) => (
              <View key={log.id} style={styles.practiceLogDetail}>
                {/* 練習内容 */}
                <View style={styles.practiceContentContainer}>
                  <Text style={styles.practiceContentLabel}>練習内容</Text>
                  <Text style={styles.practiceContentText}>
                    <Text style={styles.practiceContentValue}>{log.distance}</Text>m ×{' '}
                    <Text style={styles.practiceContentValue}>{log.repCount}</Text>
                    {log.setCount > 1 && (
                      <>
                        {' × '}
                        <Text style={styles.practiceContentValue}>{log.setCount}</Text>
                      </>
                    )}
                    {'　　'}
                    <Text style={styles.practiceContentValue}>
                      {formatCircleTime(log.circle)}
                    </Text>
                    {'　'}
                    <Text style={styles.practiceContentValue}>{log.style}</Text>
                  </Text>
                </View>

                {/* タイム表示 */}
                {log.times.length > 0 && (
                  <View style={styles.timeContainer}>
                    <View style={styles.timeHeader}>
                      <View style={styles.timeHeaderBar} />
                      <Text style={styles.timeHeaderText}>タイム</Text>
                    </View>
                    <View style={styles.timeTableContainer}>
                      <MemoizedTimeTable times={log.times} repCount={log.repCount} setCount={log.setCount} />
                    </View>
                  </View>
                )}

                {log.note && (
                  <View style={styles.noteContainer}>
                    <Text style={styles.noteLabel}>メモ</Text>
                    <Text style={styles.noteText}>{log.note}</Text>
                  </View>
                )}
              </View>
            ))
          )}
        </View>
      )}
    </View>
  )
}

// PracticeLogDetailをメモ化して不要な再レンダリングを防ぐ
export const MemoizedPracticeLogDetail = React.memo(PracticeLogDetail)
