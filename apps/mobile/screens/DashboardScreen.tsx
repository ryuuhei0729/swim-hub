import React, { useState, useMemo } from 'react'
import { View, ScrollView, StyleSheet } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { addMonths, subMonths, format } from 'date-fns'
import { useAuth } from '@/contexts/AuthProvider'
import { useCalendarQuery } from '@/hooks/useCalendarQuery'
import { CalendarView } from '@/components/calendar'
import { DayDetailModal } from '@/components/calendar'
import { LoadingSpinner } from '@/components/layout/LoadingSpinner'
import { ErrorView } from '@/components/layout/ErrorView'
import type { MainStackParamList } from '@/navigation/types'
import type { CalendarItem } from '@apps/shared/types/ui'

type DashboardScreenNavigationProp = NativeStackNavigationProp<MainStackParamList>

/**
 * ダッシュボード画面
 * カレンダービューで練習・大会を表示
 */
export const DashboardScreen: React.FC = () => {
  const navigation = useNavigation<DashboardScreenNavigationProp>()
  const { supabase } = useAuth()
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [showDayDetail, setShowDayDetail] = useState(false)

  // カレンダーデータ取得
  const {
    data: entries = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useCalendarQuery(supabase, {
    currentDate,
  })

  // 選択した日付のエントリーを取得
  const selectedDateEntries = useMemo(() => {
    if (!selectedDate) return []
    // CalendarViewと同じ方法で日付をフォーマット（タイムゾーン問題を回避）
    const dateKey = format(selectedDate, 'yyyy-MM-dd')
    return entries.filter((item) => item.date === dateKey)
  }, [selectedDate, entries])

  // 前月へ
  const handlePrevMonth = () => {
    setCurrentDate((prev) => subMonths(prev, 1))
  }

  // 次月へ
  const handleNextMonth = () => {
    setCurrentDate((prev) => addMonths(prev, 1))
  }

  // 今日に戻る
  const handleTodayClick = () => {
    setCurrentDate(new Date())
  }

  // 年月選択
  const handleMonthYearSelect = (year: number, month: number) => {
    setCurrentDate(new Date(year, month, 1))
  }

  // 日付タップ
  const handleDateClick = (date: Date) => {
    setSelectedDate(date)
    setShowDayDetail(true)
  }

  // 追加ボタンタップ
  const handleAddClick = (date: Date) => {
    setSelectedDate(date)
    setShowDayDetail(true)
  }

  // エントリータップ
  const handleEntryPress = (item: CalendarItem) => {
    if (item.type === 'practice' || item.type === 'team_practice') {
      const practiceId = item.metadata?.practice_id || item.id
      navigation.navigate('PracticeDetail', { practiceId })
    } else if (item.type === 'record') {
      const recordId = item.metadata?.record?.id || item.id
      navigation.navigate('RecordDetail', { recordId })
    } else if (item.type === 'competition' || item.type === 'team_competition') {
      // 大会の詳細画面は未実装のため、一旦スキップ
      // TODO: CompetitionDetail画面を実装したら追加
    }
  }

  // 練習追加
  const handleAddPractice = (date: Date) => {
    navigation.navigate('PracticeForm', {})
  }

  // 大会記録追加
  const handleAddRecord = (date: Date) => {
    navigation.navigate('RecordForm', {})
  }

  // エラー状態
  if (isError && error) {
    return (
      <View style={styles.container}>
        <ErrorView
          message={error.message || 'カレンダーデータの取得に失敗しました'}
          onRetry={() => refetch()}
          fullScreen
        />
      </View>
    )
  }

  // ローディング状態
  if (isLoading && entries.length === 0) {
    return (
      <View style={styles.container}>
        <LoadingSpinner fullScreen message="カレンダーを読み込み中..." />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <CalendarView
          currentDate={currentDate}
          entries={entries}
          isLoading={isLoading}
          onDateClick={handleDateClick}
          onAddClick={handleAddClick}
          onPrevMonth={handlePrevMonth}
          onNextMonth={handleNextMonth}
          onTodayClick={handleTodayClick}
          onMonthYearSelect={handleMonthYearSelect}
        />
      </ScrollView>

      {/* 日付詳細モーダル */}
      {selectedDate && (
        <DayDetailModal
          visible={showDayDetail}
          date={selectedDate}
          entries={selectedDateEntries}
          onClose={() => {
            setShowDayDetail(false)
            setSelectedDate(null)
          }}
          onEntryPress={handleEntryPress}
          onAddPractice={handleAddPractice}
          onAddRecord={handleAddRecord}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#EFF6FF',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
})
