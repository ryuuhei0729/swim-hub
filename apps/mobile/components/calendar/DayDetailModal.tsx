import React, { useState, useEffect, useCallback } from 'react'
import { View, Text, Modal, Pressable, ScrollView, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Feather, MaterialIcons } from '@expo/vector-icons'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import { useAuth } from '@/contexts/AuthProvider'
import { formatTime } from '@/utils/formatters'
import type { CalendarItem } from '@apps/shared/types/ui'
import type { PracticeTime } from '@apps/shared/types/database'

interface DayDetailModalProps {
  visible: boolean
  date: Date
  entries: CalendarItem[]
  onClose: () => void
  onEntryPress?: (item: CalendarItem) => void
  onAddPractice?: (date: Date) => void
  onAddRecord?: (date: Date) => void
  onEditPractice?: (item: CalendarItem) => void
  onDeletePractice?: (itemId: string) => void
  onAddPracticeLog?: (practiceId: string) => void
  onEditPracticeLog?: (item: CalendarItem) => void
  onDeletePracticeLog?: (logId: string) => void
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
                      <MaterialIcons name="pool" size={18} color="#FFFFFF" style={styles.addButtonIcon} />
                      <Text style={styles.addButtonText}>大会記録を追加</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            ) : (
              <>
              <View style={styles.entriesContainer}>
                {entries.map((item) => {
                  const title = getEntryTitle(item)
                  const color = getEntryColor(item.type)
                  const typeLabel = getEntryTypeLabel(item.type)
                  const isPractice = item.type === 'practice' || item.type === 'team_practice'
                  const isPracticeLog = item.type === 'practice_log'
                  const practiceId = item.metadata?.practice_id || item.id

                  return (
                    <PracticeLogDetail
                      key={`${item.type}-${item.id}`}
                      item={item}
                      title={title}
                      color={color}
                      typeLabel={typeLabel}
                      isPractice={isPractice}
                      isPracticeLog={isPracticeLog}
                      practiceId={practiceId}
                      onEntryPress={onEntryPress}
                      onClose={onClose}
                      onEditPractice={onEditPractice}
                      onDeletePractice={onDeletePractice}
                      onAddPracticeLog={onAddPracticeLog}
                      onEditPracticeLog={onEditPracticeLog}
                      onDeletePracticeLog={onDeletePracticeLog}
                      onPracticeTimeLoaded={handlePracticeTimeLoaded}
                    />
                  )
                })}
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
                        <MaterialIcons name="pool" size={20} color="#3B82F6" />
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
  onEntryPress?: (item: CalendarItem) => void
  onClose: () => void
  onEditPractice?: (item: CalendarItem) => void
  onDeletePractice?: (itemId: string) => void
  onAddPracticeLog?: (practiceId: string) => void
  onEditPracticeLog?: (item: CalendarItem) => void
  onDeletePracticeLog?: (logId: string) => void
  onPracticeTimeLoaded?: (practiceLogId: string, hasTimes: boolean) => void
}> = ({
  item,
  title,
  color,
  typeLabel,
  isPractice,
  isPracticeLog,
  practiceId,
  onEntryPress,
  onClose,
  onEditPractice,
  onDeletePractice,
  onAddPracticeLog,
  onEditPracticeLog,
  onDeletePracticeLog,
  onPracticeTimeLoaded,
}) => {
  const { supabase } = useAuth()
  const [expanded, setExpanded] = useState(false)
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
                  <MaterialIcons name="edit" size={16} color="#6B7280" />
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
                  <Feather name="trash-2" size={16} color="#6B7280" />
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
                    {practiceLogDetail.circle ? `${Math.floor(practiceLogDetail.circle / 60)}'${Math.floor(practiceLogDetail.circle % 60).toString().padStart(2, '0')}"` : '-'}
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
                    <TimeTable times={practiceLogDetail.times} repCount={practiceLogDetail.repCount} setCount={practiceLogDetail.setCount} />
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
                  <MaterialIcons name="edit" size={20} color="#6B7280" />
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
                  <Feather name="trash-2" size={20} color="#6B7280" />
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
                      {log.circle ? `${Math.floor(log.circle / 60)}'${Math.floor(log.circle % 60).toString().padStart(2, '0')}"` : '-'}
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
                      <TimeTable times={log.times} repCount={log.repCount} setCount={log.setCount} />
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
            {getOverallAverage() > 0 ? formatTime(getOverallAverage()) : '-'}
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
            {getOverallFastest() > 0 ? formatTime(getOverallFastest()) : '-'}
          </Text>
        </View>
      </View>
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
  },
  actionButton: {
    padding: 4,
    justifyContent: 'center',
    alignItems: 'center',
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
})
