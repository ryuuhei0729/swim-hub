// =============================================================================
// カレンダーイベントハンドラー用カスタムフック
// =============================================================================

import type { Database } from '@/lib/supabase'
import type { EditingData, EntryWithStyle } from '@/stores/types'
import type { CalendarItemType } from '@apps/shared/types/database'
import type { CalendarItem, EntryInfo } from '@apps/shared/types/ui'
import type { SupabaseClient } from '@supabase/supabase-js'
import { parseISO, startOfDay } from 'date-fns'
import { useCallback } from 'react'

// スプリットタイム型（編集時に使用）
export interface RecordSplitTime {
  distance: number
  split_time: number
}

// 記録型（編集時に使用）
export interface RecordForEdit {
  id: string
  style_id: number
  style?: { id: number }
  time?: number
  time_result?: number
  is_relaying?: boolean
  note?: string | null
  video_url?: string | null
  split_times?: RecordSplitTime[]
  competition_id?: string | null
}

interface UseCalendarHandlersProps {
  supabase: SupabaseClient<Database>
  // Form store actions
  openPracticeBasicForm: (date?: Date, item?: CalendarItem) => void
  openPracticeLogForm: (practiceId?: string, editData?: EditingData) => void
  openCompetitionBasicForm: (date?: Date, item?: CalendarItem) => void
  openEntryLogForm: (competitionId: string, item?: CalendarItem) => void
  openRecordLogForm: (competitionId: string | undefined, entries?: EntryWithStyle[], editData?: EditingData) => void
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
      openCompetitionBasicForm(date)
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
      practiceId: log.practice_id || log.practiceId,
      style: log.style,
      distance: log.distance,
      rep_count: log.rep_count,
      set_count: log.set_count,
      circle: log.circle,
      note: log.note || undefined,
      tags: log.tags,
      times: log.times
    }
    openPracticeLogForm(undefined, editData)
  }, [openPracticeLogForm])

  // 練習ログ削除ハンドラー
  const onDeletePracticeLog = useCallback(async (logId: string) => {
    try {
      const { error } = await supabase
        .from('practice_logs')
        .delete()
        .eq('id', logId)

      if (error) throw error

      await Promise.all([refetch()])
      refreshCalendar()
    } catch (error) {
      console.error('練習ログの削除に失敗しました:', error)
    }
  }, [supabase, refetch, refreshCalendar])

  // 記録追加ハンドラー
  const onAddRecord = useCallback((params: { competitionId?: string; entryData?: EntryInfo; entryDataList?: EntryInfo[] }) => {
    const { competitionId, entryData, entryDataList } = params
    
    if (!competitionId || competitionId.trim() === '') {
      openCompetitionBasicForm()
      return
    }
    
    if (entryDataList && entryDataList.length > 0) {
      const editData: EditingData = { entryDataList }
      openRecordLogForm(competitionId || undefined, undefined, editData)
      return
    }

    if (entryData) {
      const editData: EditingData = { entryData }
      openRecordLogForm(competitionId || undefined, undefined, editData)
    } else if (competitionId) {
      openEntryLogForm(competitionId)
    }
  }, [openCompetitionBasicForm, openRecordLogForm, openEntryLogForm])

  // 記録編集ハンドラー
  const onEditRecord = useCallback((record: RecordForEdit) => {
    const splitTimes = record.split_times || []
    const convertedSplitTimes: Array<{ distance: number; splitTime: number }> = splitTimes.map((st: RecordSplitTime) => ({
      distance: st.distance,
      splitTime: st.split_time
    }))
    
    const editData: EditingData = {
      id: record.id,
      styleId: record.style_id ?? record.style?.id,
      time: record.time ?? record.time_result,
      isRelaying: record.is_relaying,
      note: record.note ?? undefined,
      videoUrl: record.video_url ?? undefined,
      splitTimes: convertedSplitTimes,
      competitionId: record.competition_id ?? undefined
    }
    
    openRecordLogForm(record.competition_id ?? undefined, undefined, editData)
  }, [openRecordLogForm])

  // 記録削除ハンドラー
  const onDeleteRecord = useCallback(async (recordId: string) => {
    try {
      const { error } = await supabase
        .from('records')
        .delete()
        .eq('id', recordId)

      if (error) throw error

      await Promise.all([refetchRecords()])
      refreshCalendar()
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

