import React, { useState, useMemo } from 'react'
import { ScrollView, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { addMonths, subMonths, format as formatDate } from 'date-fns'
import { useAuth } from '@/contexts/AuthProvider'
import { useCalendarQuery } from '@/hooks/useCalendarQuery'
import { CalendarView } from '@/components/calendar'
import { DayDetailModal } from '@/components/calendar'
import { LoadingSpinner } from '@/components/layout/LoadingSpinner'
import { ErrorView } from '@/components/layout/ErrorView'
import { useDeletePracticeMutation } from '@apps/shared/hooks/queries/practices'
import { PracticeAPI } from '@apps/shared/api/practices'
import { Alert } from 'react-native'
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
    const dateKey = formatDate(selectedDate, 'yyyy-MM-dd')
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

  // エントリータップ
  const handleEntryPress = (item: CalendarItem) => {
    if (item.type === 'practice' || item.type === 'team_practice') {
      const practiceId = item.metadata?.practice_id || item.id
      navigation.navigate('PracticeDetail', { practiceId })
    } else if (item.type === 'record') {
      const recordId = item.id
      navigation.navigate('RecordDetail', { recordId })
    } else if (item.type === 'competition' || item.type === 'team_competition') {
      // 大会の詳細画面は未実装のため、一旦スキップ
      // TODO: CompetitionDetail画面を実装したら追加
    }
  }

  // 練習追加
  const handleAddPractice = (date: Date) => {
    const dateParam = formatDate(date, 'yyyy-MM-dd')
    navigation.navigate('PracticeForm', { date: dateParam })
  }

  // 大会記録追加
  const handleAddRecord = (date: Date) => {
    const dateParam = formatDate(date, 'yyyy-MM-dd')
    navigation.navigate('RecordForm', { date: dateParam })
  }

  // 練習編集
  const handleEditPractice = (item: CalendarItem) => {
    const practiceId = item.metadata?.practice_id || item.id
    const dateParam = item.date
    navigation.navigate('PracticeForm', { practiceId, date: dateParam })
  }

  // 練習削除
  const deleteMutation = useDeletePracticeMutation(supabase)
  const handleDeletePractice = async (itemId: string) => {
    Alert.alert(
      '削除確認',
      'この練習記録を削除しますか？\nこの操作は取り消せません。',
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
              await deleteMutation.mutateAsync(itemId)
              refetch() // カレンダーをリフレッシュ
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
  }

  // 練習ログ追加
  const handleAddPracticeLog = (practiceId: string) => {
    navigation.navigate('PracticeLogForm', { practiceId })
  }

  // 練習ログ編集
  const handleEditPracticeLog = (item: CalendarItem) => {
    const practiceId = item.metadata?.practice_id || item.metadata?.practice?.id
    const practiceLogId = item.id
    if (practiceId) {
      navigation.navigate('PracticeLogForm', { practiceId, practiceLogId })
    }
  }

  // 練習ログ削除
  const handleDeletePracticeLog = async (logId: string) => {
    Alert.alert(
      '削除確認',
      'この練習メニューを削除しますか？\nこの操作は取り消せません。',
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
              const api = new PracticeAPI(supabase)
              await api.deletePracticeLog(logId)
              refetch() // カレンダーをリフレッシュ
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
  }

  // エラー状態
  if (isError && error) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <ErrorView
          message={error.message || 'カレンダーデータの取得に失敗しました'}
          onRetry={() => refetch()}
          fullScreen
        />
      </SafeAreaView>
    )
  }

  // ローディング状態
  if (isLoading && entries.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <LoadingSpinner fullScreen message="カレンダーを読み込み中..." />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <CalendarView
          currentDate={currentDate}
          entries={entries}
          isLoading={isLoading}
          onDateClick={handleDateClick}
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
          onEditPractice={handleEditPractice}
          onDeletePractice={handleDeletePractice}
          onAddPracticeLog={handleAddPracticeLog}
          onEditPracticeLog={handleEditPracticeLog}
          onDeletePracticeLog={handleDeletePracticeLog}
        />
      )}
    </SafeAreaView>
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
    paddingVertical: 16,
    paddingHorizontal: 0,
  },
})
