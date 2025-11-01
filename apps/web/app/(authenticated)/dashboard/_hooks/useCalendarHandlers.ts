// =============================================================================
// カレンダーイベントハンドラー用カスタムフック
// =============================================================================

import type { Database } from '@/lib/supabase'
import type { EditingData } from '@/stores/types'
import type { CalendarItemType } from '@apps/shared/types/database'
import type { CalendarItem } from '@apps/shared/types/ui'
import type { SupabaseClient } from '@supabase/supabase-js'
import { parseISO, startOfDay } from 'date-fns'
import { useCallback } from 'react'

interface UseCalendarHandlersProps {
  supabase: SupabaseClient<Database>
  // Form store actions
  openPracticeBasicForm: (date?: Date, item?: CalendarItem) => void
  openPracticeLogForm: (practiceId?: string, editData?: EditingData) => void
  openCompetitionBasicForm: (date?: Date, item?: CalendarItem) => void
  openEntryLogForm: (competitionId: string, item?: CalendarItem) => void
  openRecordLogForm: (competitionId: string | undefined, entries?: any[], editData?: EditingData) => void
  setSelectedDate: (date: Date) => void
  setEditingData: (data: EditingData | null) => void
  handleDeleteItem: (itemId: string, itemType?: CalendarItemType) => Promise<void>
  refetch: () => Promise<void>
  refetchRecords: () => Promise<void>
  refreshCalendar: () => void
}

/**
 * カレンダーのイベントハンドラーを提供するカスタムフック
 */
export function useCalendarHandlers({
  supabase,
  openPracticeBasicForm,
  openPracticeLogForm,
  openCompetitionBasicForm,
  openEntryLogForm,
  openRecordLogForm,
  setSelectedDate,
  setEditingData,
  handleDeleteItem,
  refetch,
  refetchRecords,
  refreshCalendar
}: UseCalendarHandlersProps) {
  // タイムゾーンを考慮した日付パース
  const parseDateString = useCallback((dateString: string): Date => {
    const parsedDate = parseISO(dateString)
    return startOfDay(parsedDate)
  }, [])

  // 日付クリックハンドラー（現在は未使用）
  const onDateClick = useCallback((_date: Date) => {
    // 必要に応じて実装
  }, [])

  // アイテム追加ハンドラー（CalendarPropsでは'practice' | 'record'のみ受け取る）
  const onAddItem = useCallback((date: Date, type: 'practice' | 'record') => {
    if (type === 'practice') {
      openPracticeBasicForm(date)
    } else {
      setSelectedDate(date)
      setEditingData(null)
      openCompetitionBasicForm()
    }
  }, [openPracticeBasicForm, openCompetitionBasicForm, setSelectedDate, setEditingData])

  // アイテム編集ハンドラー
  const onEditItem = useCallback((item: CalendarItem) => {
    const dateObj = parseDateString(item.date)
    
    if (item.type === 'practice' || item.type === 'team_practice') {
      openPracticeBasicForm(dateObj, item)
    } else if (item.type === 'practice_log') {
      openPracticeLogForm(undefined, item)
    } else if (item.type === 'entry') {
      const competitionId = item.metadata?.entry?.competition_id
      if (competitionId) {
        openEntryLogForm(competitionId, item)
      }
    } else if (item.type === 'competition' || item.type === 'team_competition') {
      openCompetitionBasicForm(dateObj, item)
    }
  }, [parseDateString, openPracticeBasicForm, openPracticeLogForm, openEntryLogForm, openCompetitionBasicForm])

  // アイテム削除ハンドラー（handleDeleteItemを使用）
  const onDeleteItem = useCallback(async (itemId: string, itemType?: CalendarItemType) => {
    await handleDeleteItem(itemId, itemType)
  }, [handleDeleteItem])

  // 練習ログ追加ハンドラー
  const onAddPracticeLog = useCallback((practiceId: string) => {
    openPracticeLogForm(practiceId)
  }, [openPracticeLogForm])

  // 練習ログ編集ハンドラー
  const onEditPracticeLog = useCallback((log: any) => {
    const editData: EditingData = {
      id: log.id,
      practice_id: log.practice_id,
      style: log.style,
      note: log.note || undefined
    }
    openPracticeLogForm(undefined, editData)
  }, [openPracticeLogForm])

  // 練習ログ削除ハンドラー
  const onDeletePracticeLog = useCallback(async (logId: string) => {
    if (!confirm('この練習ログを削除してもよろしいですか？')) {
      return
    }
    
    try {
      const { error } = await supabase
        .from('practice_logs')
        .delete()
        .eq('id', logId)

      if (error) throw error

      await Promise.all([refetch()])
      refreshCalendar()

      alert('練習ログを削除しました')
    } catch (error) {
      console.error('練習ログの削除に失敗しました:', error)
    }
  }, [supabase, refetch, refreshCalendar])

  // 記録追加ハンドラー
  const onAddRecord = useCallback((params: { competitionId?: string; entryData?: any }) => {
    const { competitionId, entryData } = params
    
    if (!competitionId || competitionId.trim() === '') {
      openCompetitionBasicForm()
      return
    }
    
      if (entryData) {
        const editData: EditingData = { entryData }
        openRecordLogForm(competitionId || undefined, undefined, editData)
      } else {
        if (competitionId) {
          openEntryLogForm(competitionId)
        }
      }
  }, [openCompetitionBasicForm, openRecordLogForm, openEntryLogForm])

  // 記録編集ハンドラー
  const onEditRecord = useCallback((record: any) => {
    const splitTimes = record.split_times || []
    const convertedSplitTimes: Array<{ distance: number; split_time: number }> = splitTimes.map((st: any) => ({
      distance: st.distance,
      split_time: st.split_time
    }))
    
    const editData: EditingData = {
      id: record.id,
      style_id: record.style_id ?? record.style?.id,
      time: record.time || record.time_result,
      is_relaying: record.is_relaying,
      note: record.note || undefined,
      video_url: record.video_url,
      split_times: convertedSplitTimes,
      competition_id: record.competition_id
    }
    
    openRecordLogForm(record.competition_id || undefined, undefined, editData)
  }, [openRecordLogForm])

  // 記録削除ハンドラー
  const onDeleteRecord = useCallback(async (recordId: string) => {
    if (!confirm('この大会記録を削除してもよろしいですか？')) {
      return
    }
    
    try {
      const { error } = await supabase
        .from('records')
        .delete()
        .eq('id', recordId)

      if (error) throw error

      await Promise.all([refetchRecords()])
      refreshCalendar()

      alert('大会記録を削除しました')
    } catch (error) {
      console.error('大会記録の削除に失敗しました:', error)
    }
  }, [supabase, refetchRecords, refreshCalendar])

  return {
    onDateClick,
    onAddItem: onAddItem as (date: Date, type: CalendarItemType) => void, // 型定義ではCalendarItemType全体を受け取るが、実際は'practice' | 'record'のみ
    onEditItem,
    onDeleteItem,
    onAddPracticeLog,
    onEditPracticeLog,
    onDeletePracticeLog,
    onAddRecord,
    onEditRecord,
    onDeleteRecord
  }
}

