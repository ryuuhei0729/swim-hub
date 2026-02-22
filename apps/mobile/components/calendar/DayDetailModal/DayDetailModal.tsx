import React, { useState, useCallback, useMemo } from 'react'
import { View, Text, Modal, Pressable, ScrollView, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'
import { format, isValid } from 'date-fns'
import { ja } from 'date-fns/locale'
import type { CalendarItem } from '@apps/shared/types/ui'
import { styles } from './styles'
import { MemoizedPracticeLogDetail, RecordDetail, EntryDetail } from './components'
import type { DayDetailModalProps } from './types'

/**
 * エントリーのタイトルを生成
 */
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

/**
 * エントリーの種類に応じた色を取得
 */
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

/**
 * エントリーの種類に応じたラベルを取得
 */
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
  const minHeight = useMemo(() => {
    const hasPracticeLog = entries.some(entry => entry.type === 'practice_log')
    const hasPracticeLogWithTimes = entries.some(
      entry => entry.type === 'practice_log' && practiceLogsWithTimes.has(entry.id)
    )

    if (entries.length === 0) return 300
    if (entries.length === 1) {
      if (!hasPracticeLog) return 400
      if (hasPracticeLogWithTimes) return 600
      return 350
    }
    if (entries.length === 2) {
      if (hasPracticeLogWithTimes) return 600
      return hasPracticeLog ? 600 : 375
    }
    if (hasPracticeLogWithTimes) return 700
    return 500
  }, [entries, practiceLogsWithTimes])

  // 動的なスタイルを生成
  const modalContentStyle = useMemo(
    () => [styles.modalContent, { minHeight }],
    [minHeight]
  )

  // エントリータイプをフィルタリング・グループ化
  const { otherItems, entriesByCompetition, recordsByCompetition } = useMemo(() => {
    const recordItems = entries.filter(e => e.type === 'record')
    const entryItems = entries.filter(e => e.type === 'entry')

    // 記録を大会IDでグループ化
    const recordsByComp = new Map<string, CalendarItem[]>()
    recordItems.forEach(record => {
      const competitionId = record.metadata?.competition?.id ||
                         record.metadata?.record?.competition_id ||
                         record.id
      if (!recordsByComp.has(competitionId)) {
        recordsByComp.set(competitionId, [])
      }
      recordsByComp.get(competitionId)!.push(record)
    })

    // エントリーを大会IDでグループ化
    const entriesByComp = new Map<string, CalendarItem[]>()
    entryItems.forEach(entry => {
      const competitionId = entry.metadata?.competition?.id ||
                          entry.metadata?.entry?.competition_id
      if (competitionId) {
        if (!entriesByComp.has(competitionId)) {
          entriesByComp.set(competitionId, [])
        }
        entriesByComp.get(competitionId)!.push(entry)
      }
    })

    // エントリーや記録を持っていないcompetitionタイプのIDを取得
    const competitionsWithEntriesOrRecords = new Set<string>()
    recordsByComp.forEach((_, competitionId) => {
      competitionsWithEntriesOrRecords.add(competitionId)
    })
    entriesByComp.forEach((_, competitionId) => {
      competitionsWithEntriesOrRecords.add(competitionId)
    })

    // その他のアイテム
    const others = entries.filter(e => {
      if (e.type === 'record' || e.type === 'entry') return false
      if (e.type === 'competition' || e.type === 'team_competition') {
        return !competitionsWithEntriesOrRecords.has(e.id)
      }
      return true
    })

    return {
      otherItems: others,
      entriesByCompetition: entriesByComp,
      recordsByCompetition: recordsByComp,
    }
  }, [entries])

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
                    {/* 記録以外のエントリー */}
                    {otherItems.map((item) => {
                      const title = getEntryTitle(item)
                      const color = getEntryColor(item.type)
                      const typeLabel = getEntryTypeLabel(item.type)
                      const isPractice = item.type === 'practice' || item.type === 'team_practice'
                      const isPracticeLog = item.type === 'practice_log'
                      const practiceId = item.metadata?.practice_id || item.id

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
                      if (recordsByCompetition.has(competitionId)) return null

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
                              const firstRecord = records[0]
                              const dateParam = firstRecord?.date || (isValid(date) ? format(date, 'yyyy-MM-dd') : '')
                              onAddRecord(competitionId, dateParam)
                              onClose()
                            }
                          }}
                          onEditRecord={onEditRecord}
                          onDeleteRecord={onDeleteRecord}
                          onClose={onClose}
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
