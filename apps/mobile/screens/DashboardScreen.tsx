import React, { useState, useMemo, useEffect, useCallback } from 'react'
import { ScrollView, StyleSheet, RefreshControl } from 'react-native'
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
import { useDeleteRecordMutation, useDeleteCompetitionMutation } from '@apps/shared/hooks/queries/records'
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
  const [refreshing, setRefreshing] = useState(false)

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

  // デバッグ: recordタイプのアイテムをログ出力
  useEffect(() => {
    if (entries.length > 0) {
      const recordItems = entries.filter(item => item.type === 'record')
      if (recordItems.length > 0) {
        console.log('[DashboardScreen] Record items found:', recordItems.length)
        console.log('[DashboardScreen] Record items:', recordItems.map(item => ({
          id: item.id,
          type: item.type,
          date: item.date,
          title: item.title,
          metadata: item.metadata,
        })))
      } else {
        console.log('[DashboardScreen] No record items found in entries')
        console.log('[DashboardScreen] All entry types:', entries.map(item => item.type))
      }
    }
  }, [entries])

  // 選択した日付のエントリーを取得
  const selectedDateEntries = useMemo(() => {
    if (!selectedDate) return []
    // CalendarViewと同じ方法で日付をフォーマット（タイムゾーン問題を回避）
    const dateKey = formatDate(selectedDate, 'yyyy-MM-dd')
    return entries.filter((item) => item.date === dateKey)
  }, [selectedDate, entries])

  // プルリフレッシュ処理
  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await refetch()
    } finally {
      setRefreshing(false)
    }
  }, [refetch])

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
  const handleAddRecord = (dateOrCompetitionId: Date | string, dateParam?: string) => {
    // EntryDetailから呼ばれた場合（competitionIdとdateが渡される）
    if (typeof dateOrCompetitionId === 'string' && dateParam) {
      navigation.navigate('RecordForm', {
        competitionId: dateOrCompetitionId,
        date: dateParam,
      })
    } else if (dateOrCompetitionId instanceof Date) {
      // 通常の呼び出し（dateのみ）
      const formattedDate = formatDate(dateOrCompetitionId, 'yyyy-MM-dd')
      navigation.navigate('CompetitionForm', { date: formattedDate })
    }
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

  // 記録編集
  const handleEditRecord = async (item: CalendarItem) => {
    console.log('handleEditRecord - item:', item)
    console.log('handleEditRecord - item.id:', item.id)
    console.log('handleEditRecord - item.metadata:', item.metadata)
    
    const dateParam = item.date
    
    // competitionIdを取得（複数のパスを試す）
    // type='record'の場合、item.idはcompetitionのIDなので、それをcompetitionIdとして使用
    const competitionId = item.metadata?.competition?.id || item.metadata?.record?.competition_id || item.id
    
    if (!competitionId) {
      Alert.alert('エラー', '大会情報が見つかりませんでした')
      return
    }
    
    // competitionIdを使って、最初のrecordを取得
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        Alert.alert('エラー', '認証が必要です')
        return
      }
      
      const { data: records, error } = await supabase
        .from('records')
        .select('id')
        .eq('competition_id', competitionId)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
      
      if (error) {
        console.error('記録取得エラー:', error)
        Alert.alert('エラー', '記録の取得に失敗しました')
        return
      }
      
      if (!records || records.length === 0) {
        Alert.alert('エラー', '記録が見つかりませんでした')
        return
      }
      
      const recordId = records[0].id
      console.log('handleEditRecord - recordId:', recordId)
      console.log('handleEditRecord - competitionId:', competitionId)
      
      navigation.navigate('RecordLogForm', {
        competitionId,
        recordId,
        date: dateParam,
      })
    } catch (error) {
      console.error('記録取得エラー:', error)
      Alert.alert('エラー', '記録の取得に失敗しました')
    }
  }

  // 記録削除
  const deleteRecordMutation = useDeleteRecordMutation(supabase)
  const handleDeleteRecord = async (recordId: string) => {
    Alert.alert(
      '削除確認',
      'この大会記録を削除しますか？\nこの操作は取り消せません。',
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
              await deleteRecordMutation.mutateAsync(recordId)
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

  // エントリー編集
  const handleEditEntry = (item: CalendarItem) => {
    const entryId = item.id
    const competitionId = item.metadata?.entry?.competition_id || item.metadata?.competition?.id
    const dateParam = item.date
    
    if (competitionId) {
      navigation.navigate('EntryForm', {
        competitionId,
        entryId,
        date: dateParam,
      })
    }
  }

  // 大会記録を追加（エントリー入力フォームへ遷移）
  const handleAddEntry = (competitionId: string, date: string) => {
    navigation.navigate('EntryForm', {
      competitionId,
      date,
    })
  }

  // エントリー削除
  // EntryDetail内で削除確認と削除処理が完結しているため、
  // ここでは削除成功後にカレンダーをリフレッシュするだけ
  const handleDeleteEntry = async (_entryId: string) => {
    // 削除はEntryDetail内で既に完了しているため、カレンダーのリフレッシュのみ実行
    refetch()
  }

  // 大会編集
  const handleEditCompetition = (item: CalendarItem) => {
    const competitionId = item.metadata?.competition?.id || item.id
    const dateParam = item.date
    navigation.navigate('CompetitionForm', {
      competitionId,
      date: dateParam,
    })
  }

  // 大会削除
  const deleteCompetitionMutation = useDeleteCompetitionMutation(supabase)
  const handleDeleteCompetition = async (competitionId: string) => {
    Alert.alert(
      '削除確認',
      'この大会を削除しますか？\nこの操作は取り消せません。',
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
              await deleteCompetitionMutation.mutateAsync(competitionId)
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
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={['#2563EB']}
            tintColor="#2563EB"
          />
        }
      >
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
          onEditRecord={handleEditRecord}
          onDeleteRecord={handleDeleteRecord}
          onEditEntry={handleEditEntry}
          onDeleteEntry={handleDeleteEntry}
          onAddEntry={handleAddEntry}
          onEditCompetition={handleEditCompetition}
          onDeleteCompetition={handleDeleteCompetition}
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
