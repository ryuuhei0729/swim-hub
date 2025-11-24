'use client'

import React from 'react'
import { useAuth } from '@/contexts'
import CalendarContainer from '../_components/CalendarContainer'
import TeamAnnouncementsSection from '../_components/TeamAnnouncementsSection'
import {
  useCreatePracticeMutation,
  useUpdatePracticeMutation,
  useCreatePracticeLogMutation,
  useUpdatePracticeLogMutation,
  useCreatePracticeTimeMutation,
  useDeletePracticeTimeMutation,
} from '@apps/shared/hooks/queries/practices'
import {
  useCreateRecordMutation,
  useUpdateRecordMutation,
  useCreateCompetitionMutation,
  useUpdateCompetitionMutation,
  useCreateSplitTimesMutation,
  useReplaceSplitTimesMutation,
} from '@apps/shared/hooks/queries/records'
import type {
  TeamMembership,
  Team,
  Style,
  PracticeTag
} from '@apps/shared/types/database'
import type {
  CalendarItem,
  MonthlySummary
} from '@apps/shared/types/ui'
import {
  usePracticeFormStore,
  useCompetitionFormStore,
  useUIStore
} from '@/stores'
import { FormModals } from './FormModals'
import { useDashboardHandlers } from '../_hooks/useDashboardHandlers'
import { useCalendarHandlers } from '../_hooks/useCalendarHandlers'

interface DashboardClientProps {
  // サーバー側で取得したデータ
  initialCalendarItems: CalendarItem[]
  initialMonthlySummary: MonthlySummary
  teams: Array<TeamMembership & { team?: Team }>
  styles: Style[]
  tags: PracticeTag[]
}

/**
 * ダッシュボードのインタラクティブ部分を担当するClient Component
 */
export default function DashboardClient({
  initialCalendarItems,
  initialMonthlySummary,
  teams,
  styles,
  tags
}: DashboardClientProps) {
  const { user, supabase } = useAuth()

  // Zustandストア
  const {
    calendarRefreshKey,
    refreshCalendar,
  } = useUIStore()

  const {
    isBasicFormOpen: _isPracticeBasicFormOpen,
    isLogFormOpen: _isPracticeLogFormOpen,
    selectedDate: _selectedDate,
    editingData,
    createdPracticeId,
    isLoading: _isLoading,
    availableTags: _availableTags,
    openBasicForm: openPracticeBasicForm,
    openLogForm: openPracticeLogForm,
    closeBasicForm: closePracticeBasicForm,
    closeLogForm: closePracticeLogForm,
    setSelectedDate,
    setEditingData,
    setCreatedPracticeId: _setCreatedPracticeId,
    setAvailableTags,
    setLoading,
  } = usePracticeFormStore()

  const {
    isBasicFormOpen: _isCompetitionBasicFormOpen,
    isEntryFormOpen: _isEntryLogFormOpen,
    isRecordFormOpen: _isRecordLogFormOpen,
    createdCompetitionId,
    createdEntries: _createdEntries,
    editingData: competitionEditingData,
    openBasicForm: openCompetitionBasicForm,
    openEntryForm: openEntryLogForm,
    openRecordForm: openRecordLogForm,
    closeBasicForm: closeCompetitionBasicForm,
    closeEntryForm: closeEntryLogForm,
    closeRecordForm: closeRecordLogForm,
    setCreatedCompetitionId: _setCreatedCompetitionId,
    setCreatedEntries,
    setStyles: setCompetitionStyles,
  } = useCompetitionFormStore()

  // サーバー側から取得したデータをストアに設定
  React.useEffect(() => {
    setAvailableTags(tags)
    setCompetitionStyles(styles)
  }, [tags, styles, setAvailableTags, setCompetitionStyles])

  // カレンダーイベントハンドラーは useCalendarHandlers カスタムフックから取得

  // 練習記録用のミューテーションフック
  const createPracticeMutation = useCreatePracticeMutation(supabase)
  const updatePracticeMutation = useUpdatePracticeMutation(supabase)
  const createPracticeLogMutation = useCreatePracticeLogMutation(supabase)
  const updatePracticeLogMutation = useUpdatePracticeLogMutation(supabase)
  const createPracticeTimeMutation = useCreatePracticeTimeMutation(supabase)
  const deletePracticeTimeMutation = useDeletePracticeTimeMutation(supabase)

  // 大会記録用のミューテーションフック
  const createRecordMutation = useCreateRecordMutation(supabase)
  const updateRecordMutation = useUpdateRecordMutation(supabase)
  const createCompetitionMutation = useCreateCompetitionMutation(supabase)
  const updateCompetitionMutation = useUpdateCompetitionMutation(supabase)
  const createSplitTimesMutation = useCreateSplitTimesMutation(supabase)
  const replaceSplitTimesMutation = useReplaceSplitTimesMutation(supabase)

  // ラッパー関数（既存のハンドラーとの互換性のため）
  const createPractice = async (practice: Parameters<typeof createPracticeMutation.mutateAsync>[0]) => {
    return await createPracticeMutation.mutateAsync(practice)
  }
  const updatePractice = async (id: string, updates: Parameters<typeof updatePracticeMutation.mutateAsync>[0]['updates']) => {
    return await updatePracticeMutation.mutateAsync({ id, updates })
  }
  const createPracticeLog = async (log: Parameters<typeof createPracticeLogMutation.mutateAsync>[0]) => {
    return await createPracticeLogMutation.mutateAsync(log)
  }
  const updatePracticeLog = async (id: string, updates: Parameters<typeof updatePracticeLogMutation.mutateAsync>[0]['updates']) => {
    return await updatePracticeLogMutation.mutateAsync({ id, updates })
  }
  const createPracticeTime = async (time: Parameters<typeof createPracticeTimeMutation.mutateAsync>[0]) => {
    return await createPracticeTimeMutation.mutateAsync(time)
  }
  const deletePracticeTime = async (id: string) => {
    return await deletePracticeTimeMutation.mutateAsync(id)
  }
  const refetch = async () => {
    // React Queryは自動的にキャッシュを更新するため、明示的なrefetchは不要
    // 必要に応じてqueryClient.invalidateQueriesを使用
  }

  const createRecord = async (record: Parameters<typeof createRecordMutation.mutateAsync>[0]) => {
    return await createRecordMutation.mutateAsync(record)
  }
  const updateRecord = async (id: string, updates: Parameters<typeof updateRecordMutation.mutateAsync>[0]['updates']) => {
    return await updateRecordMutation.mutateAsync({ id, updates })
  }
  const createCompetition = async (competition: Parameters<typeof createCompetitionMutation.mutateAsync>[0]) => {
    return await createCompetitionMutation.mutateAsync(competition)
  }
  const updateCompetition = async (id: string, updates: Parameters<typeof updateCompetitionMutation.mutateAsync>[0]['updates']) => {
    return await updateCompetitionMutation.mutateAsync({ id, updates })
  }
  const createSplitTimes = async (recordId: string, splitTimes: Array<{ distance: number; split_time?: number; splitTime?: number }>) => {
    return await createSplitTimesMutation.mutateAsync({ recordId, splitTimes })
  }
  const replaceSplitTimes = async (recordId: string, splitTimes: Omit<import('@apps/shared/types/database').SplitTimeInsert, 'record_id'>[]) => {
    return await replaceSplitTimesMutation.mutateAsync({ recordId, splitTimes })
  }
  const refetchRecords = async () => {
    // React Queryは自動的にキャッシュを更新するため、明示的なrefetchは不要
  }

  // ハンドラー関数は useDashboardHandlers カスタムフックから取得
  const {
    handlePracticeBasicSubmit,
    handlePracticeLogSubmit,
    handleDeleteItem,
    handleCompetitionBasicSubmit,
    handleEntrySubmit,
    handleEntrySkip,
    handleRecordLogSubmit
  } = useDashboardHandlers({
    supabase,
    user,
    styles,
    createPractice,
    updatePractice,
    createPracticeLog,
    updatePracticeLog,
    createPracticeTime,
    deletePracticeTime,
    refetch,
    createRecord,
    updateRecord,
    createCompetition,
    updateCompetition,
    createSplitTimes,
    replaceSplitTimes,
    refetchRecords,
    editingData,
    createdPracticeId,
    competitionEditingData,
    createdCompetitionId,
    setLoading,
    closePracticeBasicForm,
    closePracticeLogForm,
    closeCompetitionBasicForm,
    closeEntryLogForm,
    closeRecordLogForm,
    openPracticeLogForm,
    setCreatedEntries,
    openEntryLogForm,
    openRecordLogForm,
    refreshCalendar
  })

  // カレンダーイベントハンドラー
  const {
    onDateClick,
    onAddItem,
    onEditItem,
    onDeleteItem: onDeleteCalendarItem,
    onAddPracticeLog,
    onEditPracticeLog,
    onDeletePracticeLog,
    onAddRecord,
    onEditRecord,
    onDeleteRecord
  } = useCalendarHandlers({
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
  })

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="w-full">
        {/* チームのお知らせセクション */}
        <TeamAnnouncementsSection teams={teams} />
        
        {/* カレンダーコンポーネント */}
        <CalendarContainer 
          refreshKey={calendarRefreshKey}
          initialCalendarItems={initialCalendarItems}
          initialMonthlySummary={initialMonthlySummary}
          onDateClick={onDateClick}
          onAddItem={onAddItem}
          onEditItem={onEditItem}
          onDeleteItem={onDeleteCalendarItem}
          onAddPracticeLog={onAddPracticeLog}
          onEditPracticeLog={onEditPracticeLog}
          onDeletePracticeLog={onDeletePracticeLog}
          onAddRecord={onAddRecord}
          onEditRecord={onEditRecord}
          onDeleteRecord={onDeleteRecord}
          openDayDetail={null}
        />

        {/* フォームモーダル */}
        <FormModals
          onPracticeBasicSubmit={handlePracticeBasicSubmit}
          onPracticeLogSubmit={handlePracticeLogSubmit}
          onCompetitionBasicSubmit={handleCompetitionBasicSubmit}
          onEntrySubmit={handleEntrySubmit}
          onEntrySkip={handleEntrySkip}
          onRecordLogSubmit={handleRecordLogSubmit}
          styles={styles}
        />
      </div>
    </div>
  )
}

