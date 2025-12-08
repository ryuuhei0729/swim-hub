import React, { useState } from 'react'
import { View, Text, Pressable, Modal, StyleSheet, ScrollView } from 'react-native'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import { LoadingSpinner } from '@/components/layout/LoadingSpinner'

interface CalendarHeaderProps {
  currentDate: Date
  isLoading: boolean
  onPrevMonth: () => void
  onNextMonth: () => void
  onTodayClick: () => void
  onMonthYearSelect: (year: number, month: number) => void
}

/**
 * カレンダーヘッダーコンポーネント
 * 月・年の表示、前月・次月ボタン、今日ボタン、月選択機能
 */
export const CalendarHeader: React.FC<CalendarHeaderProps> = ({
  currentDate,
  isLoading,
  onPrevMonth,
  onNextMonth,
  onTodayClick,
  onMonthYearSelect,
}) => {
  const [showMonthSelector, setShowMonthSelector] = useState(false)

  const currentYear = currentDate.getFullYear()
  const currentMonth = currentDate.getMonth()

  // 年リスト（現在年±5年）
  const years = Array.from({ length: 11 }, (_, i) => new Date().getFullYear() - 5 + i)

  const handleMonthSelect = (year: number, month: number) => {
    onMonthYearSelect(year, month)
    setShowMonthSelector(false)
  }

  return (
    <>
      <View style={styles.container}>
        <View style={styles.content}>
          <View style={styles.leftSection}>
            <Text style={styles.title}>カレンダー</Text>
            {isLoading && <LoadingSpinner size="small" />}
          </View>
          <View style={styles.rightSection}>
            <Pressable
              style={styles.todayButton}
              onPress={onTodayClick}
              disabled={isLoading}
            >
              <Text style={styles.todayButtonText}>今日</Text>
            </Pressable>
            <Pressable
              style={styles.navButton}
              onPress={onPrevMonth}
              disabled={isLoading}
            >
              <Text style={styles.navButtonText}>‹</Text>
            </Pressable>
            <Pressable
              style={styles.monthYearButton}
              onPress={() => setShowMonthSelector(true)}
              disabled={isLoading}
            >
              <Text style={styles.monthYearText}>
                {format(currentDate, 'yyyy年M月', { locale: ja })}
              </Text>
            </Pressable>
            <Pressable
              style={styles.navButton}
              onPress={onNextMonth}
              disabled={isLoading}
            >
              <Text style={styles.navButtonText}>›</Text>
            </Pressable>
          </View>
        </View>
      </View>

      {/* 月選択モーダル */}
      <Modal
        visible={showMonthSelector}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMonthSelector(false)}
      >
        <Pressable
          style={styles.modalOverlay}
          onPress={() => setShowMonthSelector(false)}
        >
          <Pressable style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>年月を選択</Text>
              <Pressable
                style={styles.modalCloseButton}
                onPress={() => setShowMonthSelector(false)}
              >
                <Text style={styles.modalCloseButtonText}>×</Text>
              </Pressable>
            </View>

            <ScrollView style={styles.modalBody}>
              {/* 年選択 */}
              <View style={styles.selectorSection}>
                <Text style={styles.selectorLabel}>年</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={styles.yearList}>
                    {years.map((year) => (
                      <Pressable
                        key={year}
                        style={[
                          styles.yearOption,
                          currentYear === year && styles.yearOptionSelected,
                        ]}
                        onPress={() => handleMonthSelect(year, currentMonth)}
                      >
                        <Text
                          style={[
                            styles.yearOptionText,
                            currentYear === year && styles.yearOptionTextSelected,
                          ]}
                        >
                          {year}年
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </ScrollView>
              </View>

              {/* 月選択 */}
              <View style={styles.selectorSection}>
                <Text style={styles.selectorLabel}>月</Text>
                <View style={styles.monthGrid}>
                  {Array.from({ length: 12 }, (_, i) => i).map((month) => (
                    <Pressable
                      key={month}
                      style={[
                        styles.monthOption,
                        currentMonth === month && styles.monthOptionSelected,
                      ]}
                      onPress={() => handleMonthSelect(currentYear, month)}
                    >
                      <Text
                        style={[
                          styles.monthOptionText,
                          currentMonth === month && styles.monthOptionTextSelected,
                        ]}
                      >
                        {month + 1}月
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  content: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: '#111827',
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  todayButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2563EB',
    backgroundColor: '#FFFFFF',
  },
  todayButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#2563EB',
  },
  navButton: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  navButtonText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#6B7280',
  },
  monthYearButton: {
    minWidth: 100,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  monthYearText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#111827',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  modalCloseButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
  },
  modalCloseButtonText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#6B7280',
  },
  modalBody: {
    padding: 20,
  },
  selectorSection: {
    marginBottom: 24,
  },
  selectorLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 12,
  },
  yearList: {
    flexDirection: 'row',
    gap: 8,
  },
  yearOption: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
  },
  yearOptionSelected: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  yearOptionText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  yearOptionTextSelected: {
    color: '#FFFFFF',
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  monthOption: {
    width: '30%',
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
  },
  monthOptionSelected: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  monthOptionText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  monthOptionTextSelected: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
})
