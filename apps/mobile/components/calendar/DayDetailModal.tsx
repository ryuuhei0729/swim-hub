import React from 'react'
import { View, Text, Modal, Pressable, ScrollView, StyleSheet } from 'react-native'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import type { CalendarItem } from '@apps/shared/types/ui'

interface DayDetailModalProps {
  visible: boolean
  date: Date
  entries: CalendarItem[]
  onClose: () => void
  onEntryPress?: (item: CalendarItem) => void
  onAddPractice?: (date: Date) => void
  onAddRecord?: (date: Date) => void
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

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
          {/* ヘッダー */}
          <View style={styles.header}>
            <Text style={styles.title}>{formattedDate}の記録</Text>
            <Pressable style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>×</Text>
            </Pressable>
          </View>

          <ScrollView style={styles.body}>
            {/* エントリーがない場合 */}
            {entries.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>この日の記録はありません</Text>
                <View style={styles.addButtonContainer}>
                  {onAddPractice && (
                    <Pressable
                      style={[styles.addButton, styles.addPracticeButton]}
                      onPress={() => {
                        onAddPractice(date)
                        onClose()
                      }}
                    >
                      <Text style={styles.addButtonText}>💪 練習を追加</Text>
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
                      <Text style={styles.addButtonText}>🏊 大会記録を追加</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            ) : (
              <View style={styles.entriesContainer}>
                {entries.map((item) => {
                  const title = getEntryTitle(item)
                  const color = getEntryColor(item.type)
                  const typeLabel = getEntryTypeLabel(item.type)

                  return (
                    <Pressable
                      key={`${item.type}-${item.id}`}
                      style={[styles.entryItem, { borderLeftColor: color }]}
                      onPress={() => {
                        onEntryPress?.(item)
                        onClose()
                      }}
                    >
                      <View style={styles.entryContent}>
                        <View style={styles.entryHeader}>
                          <View style={[styles.entryTypeBadge, { backgroundColor: color }]}>
                            <Text style={styles.entryTypeText}>{typeLabel}</Text>
                          </View>
                        </View>
                        <Text style={styles.entryTitle} numberOfLines={2}>
                          {title}
                        </Text>
                        {item.place && (
                          <Text style={styles.entryPlace} numberOfLines={1}>
                            📍 {item.place}
                          </Text>
                        )}
                        {item.note && (
                          <Text style={styles.entryNote} numberOfLines={2}>
                            {item.note}
                          </Text>
                        )}
                      </View>
                    </Pressable>
                  )
                })}
              </View>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    paddingBottom: 20,
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
  closeButtonText: {
    fontSize: 24,
    fontWeight: '600',
    color: '#6B7280',
    lineHeight: 28,
  },
  body: {
    flex: 1,
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
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
    alignItems: 'center',
  },
  addPracticeButton: {
    backgroundColor: '#10B981',
  },
  addRecordButton: {
    backgroundColor: '#2563EB',
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
  entryContent: {
    gap: 8,
  },
  entryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  entryPlace: {
    fontSize: 14,
    color: '#6B7280',
  },
  entryNote: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
  },
})
