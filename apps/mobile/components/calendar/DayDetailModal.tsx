import React, { useState, useEffect, useCallback } from 'react'
import { View, Text, Modal, Pressable, ScrollView, StyleSheet, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import { useAuth } from '@/contexts/AuthProvider'
import { formatTime, formatCircleTime } from '@/utils/formatters'
import { EntryAPI } from '@apps/shared/api/entries'
import type { CalendarItem } from '@apps/shared/types/ui'
import type { PracticeTime } from '@apps/shared/types'

interface DayDetailModalProps {
  visible: boolean
  date: Date
  entries: CalendarItem[]
  onClose: () => void
  onEntryPress?: (item: CalendarItem) => void
  onAddPractice?: (date: Date) => void
  onAddRecord?: (dateOrCompetitionId: Date | string, dateParam?: string) => void
  onEditPractice?: (item: CalendarItem) => void
  onDeletePractice?: (itemId: string) => void
  onAddPracticeLog?: (practiceId: string) => void
  onEditPracticeLog?: (item: CalendarItem) => void
  onDeletePracticeLog?: (logId: string) => void
  onEditRecord?: (item: CalendarItem) => void
  onDeleteRecord?: (recordId: string) => void
  onEditEntry?: (item: CalendarItem) => void
  onDeleteEntry?: (entryId: string) => void
  onAddEntry?: (competitionId: string, date: string) => void
  onEditCompetition?: (item: CalendarItem) => void
  onDeleteCompetition?: (competitionId: string) => void
}

/**
 * 日付詳細モーダルコンポーネント
 * 選択した日付のエントリー一覧を表示
 */
export const DayDetailModal: React.FC<DayDetailModalProps> = ({
  visible,
  date,
  entries,
  onClose,
  onEntryPress,
  onAddPractice,
  onAddRecord,
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
}) => {
  // エントリーのタイトルを生成
  const getEntryTitle = (item: CalendarItem): string => {
    let displayTitle = item.title

    if (item.type === 'team_practice') {
      const teamName = item.metadata?.team?.name || 'チーム'
      displayTitle = `${teamName} - ${item.title}`
    } else if (item.type === 'entry' || item.type === 'record') {
      displayTitle = item.metadata?.competition?.title || item.title || '大会'
    }

    return displayTitle
  }

  // エントリーの種類に応じた色を取得
  const getEntryColor = (type: CalendarItem['type']): string => {
    switch (type) {
      case 'practice':
      case 'team_practice':
      case 'practice_log':
        return '#10B981' // 緑色
      case 'competition':
      case 'team_competition':
      case 'entry':
      case 'record':
        return '#2563EB' // 青色
      default:
        return '#6B7280' // グレー
    }
  }

  // エントリーの種類に応じたラベルを取得
  const getEntryTypeLabel = (type: CalendarItem['type']): string => {
    switch (type) {
      case 'practice':
        return '練習'
      case 'team_practice':
        return 'チーム練習'
      case 'practice_log':
        return '練習ログ'
      case 'competition':
        return '大会'
      case 'team_competition':
        return 'チーム大会'
      case 'entry':
        return 'エントリー'
      case 'record':
        return '記録'
      default:
        return 'その他'
    }
  }

  const formattedDate = format(date, 'M月d日(E)', { locale: ja })
  
  // PracticeLogのPracticeTimeの有無を追跡
  const [practiceLogsWithTimes, setPracticeLogsWithTimes] = useState<Set<string>>(new Set())
  
  // PracticeTimeの有無を更新するコールバック
  const handlePracticeTimeLoaded = useCallback((practiceLogId: string, hasTimes: boolean) => {
    setPracticeLogsWithTimes(prev => {
      const next = new Set(prev)
      if (hasTimes) {
        next.add(practiceLogId)
      } else {
        next.delete(practiceLogId)
      }
      return next
    })
  }, [])
  
  // エントリー数と種類に応じて最小高さを動的に計算
  const minHeight = React.useMemo(() => {
    // PracticeLogが含まれているかチェック
    const hasPracticeLog = entries.some(entry => entry.type === 'practice_log')
    // PracticeLogでPracticeTimeがあるものがあるかチェック
    const hasPracticeLogWithTimes = entries.some(
      entry => entry.type === 'practice_log' && practiceLogsWithTimes.has(entry.id)
    )
    
    if (entries.length === 0) {
      return 300 // 空の場合は最小高さ
    }
    if (entries.length === 1) {
      // Practiceのみ
      if (!hasPracticeLog) {
        return 400
      }
      // PracticeLogあり且つPracticeTimeあり
      if (hasPracticeLogWithTimes) {
        return 600
      }
      // PracticeLogあり（PracticeTimeなし）
      return 350
    }
    if (entries.length === 2) {
      // PracticeLogが含まれている場合は大きめに
      if (hasPracticeLogWithTimes) {
        return 600
      }
      return hasPracticeLog ? 600 : 375
    }
    // 3個以上の場合
    if (hasPracticeLogWithTimes) {
      return 700
    }
    return 500
  }, [entries, practiceLogsWithTimes])

  // 動的なスタイルを生成
  const modalContentStyle = React.useMemo(
    () => [styles.modalContent, { minHeight }],
    [minHeight]
  )

  return (
    <Modal
      visible={visible}
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <SafeAreaView edges={['bottom']} style={styles.safeAreaContainer} pointerEvents="box-none">
          <View style={modalContentStyle}>
          {/* ヘッダー */}
          <View style={styles.header}>
            <Text style={styles.title}>{formattedDate}の記録</Text>
            <Pressable style={styles.closeButton} onPress={onClose}>
              <Feather name="x" size={24} color="#6B7280" />
            </Pressable>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            {/* エントリーがない場合 */}
            {entries.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyTextMain}>この日の記録はありません</Text>
                <View style={styles.addButtonContainer}>
                  {onAddPractice && (
                    <Pressable
                      style={[styles.addButton, styles.addPracticeButton]}
                      onPress={() => {
                        onAddPractice(date)
                        onClose()
                      }}
                    >
                      <Feather name="activity" size={18} color="#FFFFFF" style={styles.addButtonIcon} />
                      <Text style={styles.addButtonText}>練習を追加</Text>
                    </Pressable>
                  )}
                  {onAddRecord && (
                    <Pressable
                      style={[styles.addButton, styles.addRecordButton]}
                      onPress={() => {
                        onAddRecord(date)
                        onClose()
                      }}
                    >
                      <Feather name="droplet" size={18} color="#FFFFFF" style={styles.addButtonIcon} />
                      <Text style={styles.addButtonText}>大会記録を追加</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            ) : (
              <>
              <View style={styles.entriesContainer}>
                {(() => {
                  // エントリータイプをフィルタリング
                  const recordItems = entries.filter(e => e.type === 'record')
                  const entryItems = entries.filter(e => e.type === 'entry')
                  
                  // 記録を大会IDでグループ化
                  const recordsByCompetition = new Map<string, CalendarItem[]>()
                  recordItems.forEach(record => {
                    const competitionId = record.metadata?.competition?.id || 
                                       record.metadata?.record?.competition_id || 
                                       record.id
                    if (!recordsByCompetition.has(competitionId)) {
                      recordsByCompetition.set(competitionId, [])
                    }
                    recordsByCompetition.get(competitionId)!.push(record)
                  })
                  
                  // エントリーを大会IDでグループ化
                  const entriesByCompetition = new Map<string, CalendarItem[]>()
                  entryItems.forEach(entry => {
                    const competitionId = entry.metadata?.competition?.id || 
                                        entry.metadata?.entry?.competition_id
                    if (competitionId) {
                      if (!entriesByCompetition.has(competitionId)) {
                        entriesByCompetition.set(competitionId, [])
                      }
                      entriesByCompetition.get(competitionId)!.push(entry)
                    }
                  })
                  
                  // エントリーや記録を持っていないcompetitionタイプのIDを取得
                  const competitionsWithEntriesOrRecords = new Set<string>()
                  recordsByCompetition.forEach((_, competitionId) => {
                    competitionsWithEntriesOrRecords.add(competitionId)
                  })
                  entriesByCompetition.forEach((_, competitionId) => {
                    competitionsWithEntriesOrRecords.add(competitionId)
                  })
                  
                  // その他のアイテム（エントリーや記録を持っていないcompetitionも含む）
                  const otherItems = entries.filter(e => {
                    // recordとentryは除外
                    if (e.type === 'record' || e.type === 'entry') {
                      return false
                    }
                    // competition/team_competitionで、エントリーや記録を持っている場合は除外
                    if (e.type === 'competition' || e.type === 'team_competition') {
                      return !competitionsWithEntriesOrRecords.has(e.id)
                    }
                    // その他は含める
                    return true
                  })
                  
                  return (
                    <>
                      {/* 記録以外のエントリー（entryとcompetition以外） */}
                      {otherItems.map((item) => {
                        const title = getEntryTitle(item)
                        const color = getEntryColor(item.type)
                        const typeLabel = getEntryTypeLabel(item.type)
                        const isPractice = item.type === 'practice' || item.type === 'team_practice'
                        const isPracticeLog = item.type === 'practice_log'
                        const practiceId = item.metadata?.practice_id || item.id
                        
                        // Competitionの場合、そのCompetitionにエントリーや記録があるかどうかを判定
                        const isCompetition = item.type === 'competition' || item.type === 'team_competition'
                        const competitionId = isCompetition ? item.id : null
                        const hasEntriesOrRecords = isCompetition && competitionId
                          ? entries.some(
                              (e) =>
                                (e.type === 'entry' || e.type === 'record') &&
                                (e.metadata?.competition?.id === competitionId ||
                                  e.metadata?.entry?.competition_id === competitionId ||
                                  e.metadata?.record?.competition_id === competitionId)
                            )
                          : false

                        return (
                          <MemoizedPracticeLogDetail
                            key={`${item.type}-${item.id}`}
                            item={item}
                            title={title}
                            color={color}
                            typeLabel={typeLabel}
                            isPractice={isPractice}
                            isPracticeLog={isPracticeLog}
                            practiceId={practiceId}
                            hasEntriesOrRecords={hasEntriesOrRecords}
                            onEntryPress={onEntryPress}
                            onClose={onClose}
                            onEditPractice={onEditPractice}
                            onDeletePractice={onDeletePractice}
                            onAddPracticeLog={onAddPracticeLog}
                            onEditPracticeLog={onEditPracticeLog}
                            onDeletePracticeLog={onDeletePracticeLog}
                            onEditRecord={onEditRecord}
                            onDeleteRecord={onDeleteRecord}
                            onEditEntry={onEditEntry}
                            onDeleteEntry={onDeleteEntry}
                            onAddEntry={onAddEntry}
                            onEditCompetition={onEditCompetition}
                            onDeleteCompetition={onDeleteCompetition}
                            onPracticeTimeLoaded={handlePracticeTimeLoaded}
                          />
                        )
                      })}
                      
                      {/* エントリー済み（記録未登録）を大会ごとに表示 */}
                      {Array.from(entriesByCompetition.entries()).map(([competitionId, entryList]) => {
                        // この大会に記録がある場合はスキップ（記録がある場合はRecordDetailで表示される）
                        if (recordsByCompetition.has(competitionId)) {
                          return null
                        }
                        
                        const firstEntry = entryList[0]
                        const competitionName = firstEntry.metadata?.competition?.title || firstEntry.title || '大会'
                        const place = firstEntry.place || firstEntry.metadata?.competition?.place || ''
                        const poolType = firstEntry.metadata?.competition?.pool_type ?? 0
                        const note = firstEntry.note || undefined
                        
                        return (
                          <EntryDetail
                            key={`entry-competition-${competitionId}`}
                            competitionId={competitionId}
                            competitionName={competitionName}
                            place={place}
                            poolType={poolType}
                            note={note}
                            entries={entryList}
                            onEditCompetition={(item) => {
                              if (onEditCompetition) {
                                onEditCompetition(item)
                                onClose()
                              }
                            }}
                            onDeleteCompetition={() => {
                              if (onDeleteCompetition) {
                                onDeleteCompetition(competitionId)
                              }
                            }}
                            onEditEntry={onEditEntry}
                            onDeleteEntry={onDeleteEntry}
                            onAddRecord={(compId: string, dateParam: string) => {
                              if (onAddRecord) {
                                onAddRecord(compId, dateParam)
                                onClose()
                              }
                            }}
                            onClose={onClose}
                          />
                        )
                      })}
                      
                      {/* 記録を大会ごとに表示 */}
                      {Array.from(recordsByCompetition.entries()).map(([competitionId, records]) => {
                        const firstRecord = records[0]
                        const competitionName = firstRecord.metadata?.competition?.title || firstRecord.title || '大会'
                        const place = firstRecord.place || firstRecord.metadata?.competition?.place || ''
                        const poolType = firstRecord.metadata?.competition?.pool_type ?? firstRecord.metadata?.pool_type ?? 0
                        const note = firstRecord.note || undefined
                        
                        return (
                          <RecordDetail
                            key={`competition-${competitionId}`}
                            competitionId={competitionId}
                            competitionName={competitionName}
                            place={place}
                            poolType={poolType}
                            note={note}
                            records={records}
                            onEditCompetition={() => {
                              const competitionItem = entries.find(e => 
                                (e.type === 'competition' || e.type === 'team_competition') && e.id === competitionId
                              )
                              if (competitionItem && onEditCompetition) {
                                onEditCompetition(competitionItem)
                                onClose()
                              }
                            }}
                            onDeleteCompetition={() => {
                              if (onDeleteCompetition) {
                                onDeleteCompetition(competitionId)
                              }
                            }}
                            onAddRecord={() => {
                              if (onAddRecord) {
                                onAddRecord(date)
                                onClose()
                              }
                            }}
                            onEditRecord={onEditRecord}
                            onDeleteRecord={onDeleteRecord}
                            onClose={onClose}
                          />
                        )
                      })}
                    </>
                  )
                })()}
              </View>
                {/* 記録追加セクション */}
                <View style={styles.addRecordSection}>
                  <Text style={styles.addRecordSectionTitle}>記録を追加</Text>
                  <View style={styles.addRecordButtonContainer}>
                    {onAddPractice && (
                      <Pressable
                        style={styles.addRecordButtonRow}
                        onPress={() => {
                          onAddPractice(date)
                          onClose()
                        }}
                      >
                        <Feather name="activity" size={20} color="#F59E0B" />
                        <Text style={styles.addRecordButtonText}>練習記録</Text>
                      </Pressable>
                    )}
                    {onAddRecord && (
                      <Pressable
                        style={styles.addRecordButtonRow}
                        onPress={() => {
                          onAddRecord(date)
                          onClose()
                        }}
                      >
                        <Feather name="droplet" size={20} color="#3B82F6" />
                        <Text style={styles.addRecordButtonText}>大会記録</Text>
          </Pressable>
                    )}
                  </View>
                </View>
              </>
            )}
          </ScrollView>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  )
}

/**
 * Practice_Logの詳細表示コンポーネント
 */
const PracticeLogDetail: React.FC<{
  item: CalendarItem
  title: string
  color: string
  typeLabel: string
  isPractice: boolean
  isPracticeLog: boolean
  practiceId: string
  hasEntriesOrRecords?: boolean
  onEntryPress?: (item: CalendarItem) => void
  onClose: () => void
  onEditPractice?: (item: CalendarItem) => void
  onDeletePractice?: (itemId: string) => void
  onAddPracticeLog?: (practiceId: string) => void
  onEditPracticeLog?: (item: CalendarItem) => void
  onDeletePracticeLog?: (logId: string) => void
  onEditRecord?: (item: CalendarItem) => void
  onDeleteRecord?: (recordId: string) => void
  onEditEntry?: (item: CalendarItem) => void
  onDeleteEntry?: (entryId: string) => void
  onAddEntry?: (competitionId: string, date: string) => void
  onEditCompetition?: (item: CalendarItem) => void
  onDeleteCompetition?: (competitionId: string) => void
  onPracticeTimeLoaded?: (practiceLogId: string, hasTimes: boolean) => void
}> = ({
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
  const [practiceLogs, setPracticeLogs] = useState<Array<{
    id: string
    practiceId: string
    style: string
    repCount: number
    setCount: number
    distance: number
    circle: number | null
    note: string | null
    times: Array<{
      id: string
      time: number
      repNumber: number
      setNumber: number
    }>
  }>>([])
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

      const formattedLogs = (data.practice_logs || []).map((log: {
        id: string
        practice_id: string
        style: string
        rep_count: number
        set_count: number
        distance: number
        circle: number | null
        note: string | null
        practice_times?: PracticeTime[]
      }) => ({
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
  const [practiceLogDetail, setPracticeLogDetail] = useState<{
    id: string
    style: string
    repCount: number
    setCount: number
    distance: number
    circle: number | null
    note: string | null
    times: Array<{ id: string; time: number; repNumber: number; setNumber: number }>
  } | null>(null)
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
const MemoizedPracticeLogDetail = React.memo(PracticeLogDetail)

/**
 * タイムテーブルコンポーネント
 */
const TimeTable: React.FC<{
  times: Array<{ id: string; time: number; repNumber: number; setNumber: number }>
  repCount: number
  setCount: number
}> = ({ times, repCount, setCount }) => {
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
const MemoizedTimeTable = React.memo(TimeTable)

/**
 * 記録詳細表示コンポーネント（大会ごとにグループ化）
 */
const RecordDetail: React.FC<{
  competitionId: string
  competitionName: string
  place?: string
  poolType?: number
  note?: string
  records: CalendarItem[]
  onEditCompetition?: () => void
  onDeleteCompetition?: () => void
  onAddRecord?: () => void
  onEditRecord?: (item: CalendarItem) => void
  onDeleteRecord?: (recordId: string) => void
  onClose?: () => void
}> = ({
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
  const [actualRecords, setActualRecords] = useState<Array<{
    id: string
    styleName: string
    time: number
    reactionTime: number | null
    isRelaying: boolean
    note: string | null
    styleId: number
    styleDistance: number
  }>>([])
  const [loading, setLoading] = useState(true)
  const [splitTimesMap, setSplitTimesMap] = useState<Map<string, Array<{ distance: number; split_time: number }>>>(new Map())
  const [loadingSplits, setLoadingSplits] = useState<Set<string>>(new Set())

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
      // 最新のloadingSplitsを使用して、まだロードしていないレコードIDを取得
      const recordsToLoad = recordIds.filter(id => !loadingSplits.has(id))
      
      if (recordsToLoad.length === 0) return

      for (const recordId of recordsToLoad) {
        // アンマウントチェック
        if (cancelled) return

        try {
          if (cancelled) return
          setLoadingSplits(prev => new Set(prev).add(recordId))
          
          const { data, error } = await supabase
            .from('split_times')
            .select('distance, split_time')
            .eq('record_id', recordId)
            .order('distance', { ascending: true })

          if (error) throw error
          
          // アンマウントチェック
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

    // クリーンアップ関数: アンマウント時にキャンセルフラグを設定
    return () => {
      cancelled = true
    }
  }, [actualRecords, supabase, loadingSplits])

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
          actualRecords.map((record) => {
            const splits = splitTimesMap.get(record.id) || []

            return (
              <View key={record.id} style={styles.recordCard}>
              {/* 記録内容カード */}
              <View style={styles.recordContentCard}>
                {/* 編集・削除ボタン（右上） */}
                <View style={styles.recordCardActions}>
                  <View style={styles.recordCardActionsRow}>
                    {onEditRecord && (
                      <Pressable
                        style={styles.recordCardActionButton}
                        onPress={async () => {
                          // 記録の完全なデータを取得してから編集
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
                              // CalendarItem形式に変換
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
                                    competition_id: fullRecord.competition_id || _competitionId,
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

              {/* スプリットタイム */}
              {splits.length > 0 && (
                <View style={styles.splitTimesContainer}>
                  <View style={styles.splitTimesHeader}>
                    <View style={styles.splitTimesHeaderBar} />
                    <Text style={styles.splitTimesHeaderText}>スプリットタイム</Text>
                  </View>
                  <View style={styles.splitTimesList}>
                    {splits.map((split, index) => (
                      <View key={index} style={styles.splitTimeItem}>
                        <Text style={styles.splitTimeDistance}>{split.distance}m</Text>
                        <Text style={styles.splitTimeValue}>{formatTime(split.split_time)}</Text>
                      </View>
                    ))}
                  </View>
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
          })
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

/**
 * エントリー詳細表示コンポーネント（大会ごとにグループ化、記録未登録）
 */
const EntryDetail: React.FC<{
  competitionId: string
  competitionName: string
  place?: string
  poolType?: number
  note?: string
  entries: CalendarItem[]
  onEditCompetition?: (item: CalendarItem) => void
  onDeleteCompetition?: () => void
  onEditEntry?: (item: CalendarItem) => void
  onDeleteEntry?: (entryId: string) => void
  onAddRecord?: (competitionId: string, date: string) => void
  onClose?: () => void
}> = ({
  competitionId,
  competitionName,
  place,
  poolType,
  note,
  entries,
  onEditCompetition,
  onDeleteCompetition,
  onEditEntry,
  onDeleteEntry,
  onAddRecord,
  onClose,
}) => {
  const { supabase } = useAuth()
  const [actualEntries, setActualEntries] = useState<Array<{
    id: string
    styleId: number
    styleName: string
    entryTime: number | null
    note: string | null
  }>>([])
  const [loading, setLoading] = useState(true)

  const fetchEntries = useCallback(async () => {
    try {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setLoading(false)
        return
      }

      const { data: entryData, error } = await supabase
        .from('entries')
        .select(`
          id,
          style_id,
          entry_time,
          note,
          style:styles!inner(id, name_jp)
        `)
        .eq('competition_id', competitionId)
        .eq('user_id', user.id)

      if (error) throw error

      if (entryData && entryData.length > 0) {
        type EntryRow = {
          id: string
          style_id: number
          entry_time: number | null
          note: string | null
          style: { id: number; name_jp: string } | { id: number; name_jp: string }[]
        }

        const mapped = (entryData as EntryRow[]).map((row) => {
          const style = Array.isArray(row.style) ? row.style[0] : row.style
          return {
            id: row.id,
            styleId: row.style_id,
            styleName: style?.name_jp || '',
            entryTime: row.entry_time,
            note: row.note
          }
        })
        setActualEntries(mapped)
      } else {
        // カレンダーアイテムから初期データを構築
        const initialEntries = entries.map((entry) => {
          const style = entry.metadata?.style
          return {
            id: entry.id,
            styleId: (typeof style === 'object' && style !== null && 'id' in style) ? Number(style.id) : 0,
            styleName: (typeof style === 'object' && style !== null && 'name_jp' in style) ? String(style.name_jp) : '',
            entryTime: entry.metadata?.entry_time || null,
            note: entry.note || null
          }
        })
        setActualEntries(initialEntries)
      }
    } catch (err) {
      console.error('エントリーデータの取得エラー:', err)
    } finally {
      setLoading(false)
    }
  }, [competitionId, supabase, entries])

  useEffect(() => {
    fetchEntries()
  }, [fetchEntries])

  const getPoolTypeText = (poolType: number) => {
    return poolType === 1 ? '長水路(50m)' : '短水路(25m)'
  }

  // エントリーが0件で読み込み完了した場合は、コンポーネント全体を非表示にする
  if (!loading && actualEntries.length === 0) {
    return null
  }

  return (
    <View style={styles.competitionRecordContainer}>
      {/* 大会ヘッダー */}
      <View style={styles.competitionHeader}>
        <View style={styles.competitionHeaderTopRow}>
          <View style={styles.competitionHeaderLeft}>
            <Text style={styles.competitionHeaderTitle}>{competitionName}</Text>
          </View>
          <View style={styles.competitionHeaderActions}>
            {onEditCompetition && (
              <Pressable
                style={styles.competitionHeaderActionButton}
                onPress={() => {
                  // CalendarItemを構築して渡す
                  const firstEntry = entries[0]
                  if (firstEntry && onEditCompetition) {
                    const competitionItem: CalendarItem = {
                      id: competitionId,
                      type: firstEntry.metadata?.competition?.team_id ? 'team_competition' : 'competition',
                      title: competitionName,
                      date: firstEntry.date || '',
                      place: place || undefined,
                      note: note || undefined,
                      metadata: {
                        competition: {
                          id: competitionId,
                          title: competitionName,
                          date: firstEntry.date || '',
                          end_date: null,
                          place: place || null,
                          pool_type: poolType ?? 0,
                          team_id: firstEntry.metadata?.competition?.team_id || null,
                        },
                      },
                    }
                    onEditCompetition(competitionItem)
                    onClose?.()
                  }
                }}
              >
                <Feather name="edit" size={18} color="#2563EB" />
              </Pressable>
            )}
            {onDeleteCompetition && (
              <Pressable
                style={styles.competitionHeaderActionButton}
                onPress={onDeleteCompetition}
              >
                <Feather name="trash-2" size={18} color="#EF4444" />
              </Pressable>
            )}
          </View>
        </View>
        {place && (
          <Text style={styles.competitionHeaderPlace}>📍 {place}</Text>
        )}
        {poolType !== undefined && (
          <Text style={styles.competitionHeaderPoolType}>{getPoolTypeText(poolType)}</Text>
        )}
      </View>

      {note && (
        <View style={styles.competitionNoteContainer}>
          <Text style={styles.competitionNoteText}>{note}</Text>
        </View>
      )}

      {/* エントリー済み（記録未登録）セクション */}
      <View style={styles.entrySection}>
        <View style={styles.entrySectionHeader}>
          <Text style={styles.entrySectionHeaderEmoji}>📝</Text>
          <Text style={styles.entrySectionHeaderTitle}>エントリー済み（記録未登録）</Text>
          {onEditEntry && (
            <Pressable
              style={styles.entrySectionHeaderActionButton}
              onPress={() => {
                // actualEntriesから最初のエントリーを取得して編集対象とする
                if (actualEntries.length > 0 && !loading) {
                  const firstActualEntry = actualEntries[0]
                  const firstCalendarEntry = entries[0]
                  if (firstCalendarEntry && onEditEntry) {
                    // 実際のエントリーIDを使用してCalendarItemを構築
                    const entryItem: CalendarItem = {
                      ...firstCalendarEntry,
                      id: firstActualEntry.id, // 実際のエントリーIDを使用
                    }
                    onEditEntry(entryItem)
                    onClose?.()
                  }
                } else if (entries.length > 0 && onEditEntry) {
                  // actualEntriesがまだ読み込まれていない場合は、CalendarItemをそのまま使用
                  onEditEntry(entries[0])
                  onClose?.()
                }
              }}
            >
              <Feather name="edit" size={18} color="#2563EB" />
            </Pressable>
          )}
        </View>

        {loading ? (
          <Text style={styles.entryLoadingText}>読み込み中...</Text>
        ) : actualEntries.length === 0 ? (
          <Text style={styles.entryEmptyText}>エントリー情報が見つかりません</Text>
        ) : (
          <View style={styles.entryList}>
            {actualEntries.map((entry) => (
              <View key={entry.id} style={styles.entryCard}>
                <View style={styles.entryCardContent}>
                  <View style={styles.entryCardInfo}>
                    <View style={styles.entryCardInfoRow}>
                      <Text style={styles.entryCardInfoLabel}>種目:</Text>
                      <Text style={styles.entryCardInfoValue}>{entry.styleName}</Text>
                    </View>
                    {entry.entryTime && entry.entryTime > 0 && (
                      <View style={styles.entryCardInfoRow}>
                        <Text style={styles.entryCardInfoLabel}>エントリータイム:</Text>
                        <Text style={styles.entryCardInfoValueTime}>{formatTime(entry.entryTime)}</Text>
                      </View>
                    )}
                    {entry.note && entry.note.trim().length > 0 && (
                      <View style={styles.entryCardInfoRow}>
                        <Text style={styles.entryCardInfoLabel}>メモ:</Text>
                        <Text style={styles.entryCardInfoValue}>{entry.note}</Text>
                      </View>
                    )}
                  </View>
                  {onDeleteEntry && (
                    <Pressable
                      style={styles.entryCardDeleteButton}
                      onPress={async () => {
                        Alert.alert(
                          '削除確認',
                          'このエントリーを削除しますか？\nこの操作は取り消せません。',
                          [
                            {
                              text: 'キャンセル',
                              style: 'cancel',
                            },
                            {
                              text: '削除',
                              style: 'destructive',
                              onPress: async () => {
                                try {
                                  const api = new EntryAPI(supabase)
                                  await api.deleteEntry(entry.id)
                                  // 削除後にエントリー一覧を再取得
                                  await fetchEntries()
                                  // 親コンポーネントに削除完了を通知（カレンダーのリフレッシュのため）
                                  // 削除確認は既に表示済みなので、親コンポーネントの削除確認はスキップされる
                                  if (onDeleteEntry) {
                                    onDeleteEntry(entry.id)
                                  }
                                } catch (error) {
                                  console.error('削除エラー:', error)
                                  Alert.alert(
                                    'エラー',
                                    error instanceof Error ? error.message : '削除に失敗しました',
                                    [{ text: 'OK' }]
                                  )
                                }
                              },
                            },
                          ]
                        )
                      }}
                    >
                      <Feather name="trash-2" size={16} color="#EF4444" />
                    </Pressable>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* 大会記録を追加ボタン */}
      {onAddRecord && (
        <Pressable
          style={styles.addCompetitionRecordButton}
          onPress={() => {
            const firstEntry = entries[0]
            const dateParam = firstEntry?.date || ''
            if (competitionId && dateParam) {
              onAddRecord(competitionId, dateParam)
              onClose?.()
            }
          }}
        >
          <Feather name="plus" size={20} color="#FFFFFF" />
          <Text style={styles.addCompetitionRecordButtonText}>大会記録を追加</Text>
        </Pressable>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  safeAreaContainer: {
    width: '100%',
    maxWidth: 500,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    width: '100%',
    maxHeight: '90%',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  body: {
    flex: 1,
  },
  bodyContent: {
    paddingBottom: 20,
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyTextMain: {
    fontSize: 16,
    color: '#6B7280',
    marginBottom: 24,
  },
  addButtonContainer: {
    width: '100%',
    gap: 12,
  },
  addButton: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  addPracticeButton: {
    backgroundColor: '#10B981',
  },
  addRecordButton: {
    backgroundColor: '#2563EB',
  },
  addButtonIcon: {
    marginRight: 0,
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  entriesContainer: {
    padding: 16,
    gap: 12,
  },
  addRecordSection: {
    padding: 16,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  addRecordSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
  },
  addRecordButtonContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  addRecordButtonRow: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  addRecordButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  entryItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  entryContentWrapper: {
    flex: 1,
  },
  entryContent: {
    gap: 8,
  },
  entryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  actionButton: {
    padding: 4,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 28,
    minHeight: 28,
  },
  addLogButton: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#F3F4F6',
    borderRadius: 6,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  addLogButtonIcon: {
    marginRight: 0,
  },
  addLogButtonText: {
    fontSize: 12,
    color: '#374151',
    fontWeight: '500',
  },
  entryTypeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  entryTypeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  entryTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  entryPlaceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  entryPlace: {
    fontSize: 14,
    color: '#6B7280',
  },
  entryNote: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
  },
  recordDetailContainer: {
    marginTop: 8,
    gap: 4,
  },
  recordRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  recordLabel: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
  },
  recordValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  recordNote: {
    fontSize: 13,
    color: '#374151',
  },
  recordEmptyText: {
    fontSize: 13,
    color: '#6B7280',
  },
  expandedContent: {
    paddingTop: 12,
    paddingHorizontal: 12,
    gap: 12,
  },
  practiceLogDetail: {
    backgroundColor: '#F0FDF4',
    borderRadius: 8,
    padding: 12,
    gap: 12,
  },
  practiceContentContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#10B981',
  },
  practiceContentLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 4,
  },
  practiceContentText: {
    fontSize: 14,
    color: '#111827',
  },
  practiceContentValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#059669',
  },
  timeContainer: {
    marginTop: 8,
  },
  timeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  timeHeaderBar: {
    width: 4,
    height: 16,
    backgroundColor: '#10B981',
    borderRadius: 2,
  },
  timeHeaderText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#059669',
  },
  timeTableContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#10B981',
  },
  timeTable: {
    gap: 0,
  },
  timeTableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#D1FAE5',
  },
  timeTableHeaderCell: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#10B981',
  },
  timeTableHeaderText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#065F46',
  },
  timeTableLabelCell: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 4,
    justifyContent: 'center',
  },
  timeTableLabelText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  timeTableCell: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeTableValue: {
    fontSize: 12,
    color: '#111827',
  },
  timeTableFastest: {
    color: '#2563EB',
    fontWeight: 'bold',
  },
  timeTableAverageRow: {
    backgroundColor: '#F0FDF4',
  },
  timeTableAverageLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#065F46',
  },
  timeTableAverageValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#065F46',
  },
  timeTableOverallRow: {
    backgroundColor: '#DBEAFE',
    borderTopWidth: 2,
    borderTopColor: '#2563EB',
  },
  timeTableOverallLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1E40AF',
  },
  timeTableOverallValue: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#1E40AF',
  },
  loadingText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    padding: 16,
  },
  emptyText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    padding: 16,
  },
  noteContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  noteLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 4,
  },
  noteText: {
    fontSize: 14,
    color: '#374151',
  },
  // RecordDetail用のスタイル
  competitionRecordContainer: {
    marginBottom: 20,
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  competitionHeader: {
    marginBottom: 12,
  },
  competitionHeaderTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  competitionHeaderLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  competitionHeaderContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  competitionHeaderBar: {
    width: 4,
    height: 20,
    backgroundColor: '#2563EB',
    borderRadius: 2,
    marginRight: 8,
  },
  competitionHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  competitionHeaderTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  competitionHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  competitionHeaderButton: {
    padding: 4,
  },
  competitionHeaderInfo: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 4,
  },
  competitionHeaderInfoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  competitionHeaderInfoText: {
    fontSize: 12,
    color: '#6B7280',
  },
  competitionHeaderNote: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  recordsList: {
    gap: 12,
  },
  recordCard: {
    backgroundColor: '#DBEAFE',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#93C5FD',
  },
  recordContentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#93C5FD',
    position: 'relative',
  },
  recordCardActions: {
    position: 'absolute',
    top: 8,
    right: 8,
    alignItems: 'flex-end',
    gap: 4,
  },
  recordCardActionsRow: {
    flexDirection: 'row',
    gap: 4,
  },
  recordCardActionButton: {
    padding: 4,
  },
  recordReactionTime: {
    fontSize: 10,
    color: '#6B7280',
  },
  recordInfoGrid: {
    marginTop: 8,
    gap: 8,
  },
  recordInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  recordInfoLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    minWidth: 50,
  },
  recordStyleValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1E40AF',
    flex: 1,
  },
  recordRelayBadge: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#DC2626',
  },
  recordTimeContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    flex: 1,
    flexWrap: 'wrap',
  },
  recordTimeValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1E40AF',
  },
  recordReactionTimeInline: {
    fontSize: 11,
    color: '#6B7280',
  },
  splitTimesContainer: {
    marginTop: 8,
  },
  splitTimesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  splitTimesHeaderBar: {
    width: 3,
    height: 16,
    backgroundColor: '#2563EB',
    borderRadius: 2,
    marginRight: 6,
  },
  splitTimesHeaderText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E40AF',
  },
  splitTimesList: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: '#93C5FD',
  },
  splitTimeItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  splitTimeDistance: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  splitTimeValue: {
    fontSize: 14,
    color: '#1E40AF',
    fontWeight: '600',
  },
  recordNoteContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  recordNoteLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 4,
  },
  recordNoteText: {
    fontSize: 14,
    color: '#374151',
  },
  addCompetitionRecordButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DBEAFE',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#93C5FD',
    gap: 6,
  },
  addCompetitionRecordButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E40AF',
  },
  // EntryDetail用のスタイル
  entrySection: {
    backgroundColor: '#FFF7ED',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#FED7AA',
    marginTop: 12,
  },
  entrySectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  entrySectionHeaderEmoji: {
    fontSize: 18,
  },
  entrySectionHeaderTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#9A3412',
  },
  entrySectionHeaderActionButton: {
    padding: 4,
  },
  entryLoadingText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    padding: 8,
  },
  entryEmptyText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    padding: 8,
  },
  entryList: {
    gap: 8,
  },
  entryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    padding: 12,
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  entryCardContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  entryCardInfo: {
    flex: 1,
    gap: 6,
  },
  entryCardInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  entryCardInfoLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#9A3412',
    minWidth: 100,
  },
  entryCardInfoValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
    flex: 1,
  },
  entryCardInfoValueTime: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    fontFamily: 'monospace',
  },
  entryCardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 8,
  },
  entryCardDeleteButton: {
    padding: 4,
  },
  competitionHeaderPlace: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  competitionHeaderPoolType: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  competitionNoteContainer: {
    backgroundColor: '#F9FAFB',
    borderRadius: 6,
    padding: 8,
    marginBottom: 12,
  },
  competitionNoteText: {
    fontSize: 14,
    color: '#374151',
  },
  competitionHeaderActionButton: {
    padding: 4,
  },
})
