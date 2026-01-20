'use client'

import React, { Suspense, useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import type { PracticeTag, Style } from '@apps/shared/types/database'
import type { TimeEntry, EntryInfo } from '@apps/shared/types/ui'
import {
  usePracticeFormStore,
  useCompetitionFormStore,
} from '@/stores'
import type {
  PracticeMenuFormData,
  EntryFormData,
  RecordFormDataInternal,
  EntryWithStyle
} from '@/stores/types'
import type { PracticeImageData } from '@/components/forms/PracticeBasicForm'
import { convertRecordFormData } from '@/stores/types'
import { getCompetitionId } from '../_utils/dashboardHelpers'
import { useAuth } from '@/contexts'

interface FormModalsProps {
  onPracticeBasicSubmit: (basicData: { date: string; title: string; place: string; note: string }, imageData?: PracticeImageData) => Promise<void>
  onPracticeLogSubmit: (formDataArray: PracticeMenuFormData[]) => Promise<void>
  onCompetitionBasicSubmit: (basicData: { date: string; endDate: string; title: string; place: string; poolType: number; note: string }) => Promise<void>
  onEntrySubmit: (entriesData: EntryFormData[]) => Promise<void>
  onEntrySkip: () => void
  onRecordLogSubmit: (formDataList: RecordFormDataInternal[]) => Promise<void>
  styles: Style[]
}

/**
 * すべてのフォームモーダルを管理するClient Component
 */
const PracticeBasicForm = dynamic(
  () => import('@/components/forms/PracticeBasicForm'),
  { ssr: false }
)

const PracticeLogForm = dynamic(
  () => import('@/components/forms/PracticeLogForm'),
  { ssr: false }
)

const CompetitionBasicForm = dynamic(
  () => import('@/components/forms/CompetitionBasicForm'),
  { ssr: false }
)

const EntryLogForm = dynamic(
  () => import('@/components/forms/EntryLogForm'),
  { ssr: false }
)

const RecordLogForm = dynamic(
  () => import('@/components/forms/RecordLogForm'),
  { ssr: false }
)

export function FormModals({
  onPracticeBasicSubmit,
  onPracticeLogSubmit,
  onCompetitionBasicSubmit,
  onEntrySubmit,
  onEntrySkip,
  onRecordLogSubmit,
  styles
}: FormModalsProps) {
  const { supabase } = useAuth()
  const [competitionInfo, setCompetitionInfo] = useState<{ title?: string; date?: string } | null>(null)

  const {
    isBasicFormOpen: isPracticeBasicFormOpen,
    isLogFormOpen: isPracticeLogFormOpen,
    selectedDate,
    editingData,
    createdPracticeId,
    isLoading,
    availableTags,
    closeBasicForm: closePracticeBasicForm,
    closeLogForm: closePracticeLogForm,
    setAvailableTags,
  } = usePracticeFormStore()

  const {
    isBasicFormOpen: isCompetitionBasicFormOpen,
    isEntryFormOpen: isEntryLogFormOpen,
    isRecordFormOpen: isRecordLogFormOpen,
    selectedDate: competitionSelectedDate,
    createdCompetitionId,
    createdEntries,
    editingData: competitionEditingData,
    isLoading: competitionIsLoading,
    closeBasicForm: closeCompetitionBasicForm,
    closeEntryForm: closeEntryLogForm,
    closeRecordForm: closeRecordLogForm,
  } = useCompetitionFormStore()

  // competitionIdを計算（createdCompetitionIdまたはcompetitionEditingDataから取得）
  const computedCompetitionId = React.useMemo(() => {
    return getCompetitionId(createdCompetitionId, competitionEditingData) || ''
  }, [createdCompetitionId, competitionEditingData])

  // competitionIdから大会情報を取得（competitionEditingDataに情報がない場合）
  useEffect(() => {
    const isFormOpen = isEntryLogFormOpen || isRecordLogFormOpen
    if (!isFormOpen || !computedCompetitionId || !supabase) {
      setCompetitionInfo(null)
      return
    }

    // competitionEditingDataに情報がある場合は取得しない
    if (competitionEditingData && typeof competitionEditingData === 'object') {
      const data = competitionEditingData as { 
        title?: string
        date?: string
        metadata?: { competition?: { title?: string; date?: string } }
        editData?: { competition?: { title?: string; date?: string }; date?: string }
      }
      
      // 既に情報がある場合は取得しない
      if (data.metadata?.competition?.title || data.title || data.editData?.competition?.title) {
        setCompetitionInfo(null)
        return
      }
    }

    // データベースから大会情報を取得
    const fetchCompetitionInfo = async () => {
      try {
        const { data, error } = await supabase
          .from('competitions')
          .select('title, date')
          .eq('id', computedCompetitionId)
          .single()

        if (!error && data) {
          setCompetitionInfo({
            title: data.title || undefined,
            date: data.date || undefined
          })
        } else {
          setCompetitionInfo(null)
        }
      } catch (error) {
        console.error('大会情報の取得エラー:', error)
        setCompetitionInfo(null)
      }
    }

    fetchCompetitionInfo()
  }, [isEntryLogFormOpen, isRecordLogFormOpen, computedCompetitionId, supabase, competitionEditingData])

  // 大会のtitleを取得（competitionEditingDataまたはcompetitionInfoから）
  const computedCompetitionTitle = React.useMemo(() => {
    if (competitionEditingData && typeof competitionEditingData === 'object') {
      const data = competitionEditingData as { 
        title?: string
        metadata?: { competition?: { title?: string } }
        editData?: { competition?: { title?: string } }
      }
      
      // DayDetailModalから渡される場合: editData.competition.title
      if (data.editData) {
        const editData = data.editData as { competition?: { title?: string } }
        if (editData.competition?.title) {
          return editData.competition.title
        }
      }
      
      // その他の場合: metadata.competition.title または title
      if (data.metadata?.competition?.title || data.title) {
        return data.metadata?.competition?.title || data.title
      }
    }
    
    // competitionEditingDataに情報がない場合は、データベースから取得した情報を使用
    return competitionInfo?.title
  }, [competitionEditingData, competitionInfo])

  // 大会の日付を取得（competitionEditingDataまたはcompetitionInfoから）
  const computedCompetitionDate = React.useMemo(() => {
    if (competitionEditingData && typeof competitionEditingData === 'object') {
      const data = competitionEditingData as { 
        date?: string
        metadata?: { competition?: { date?: string } }
        editData?: { date?: string; competition?: { date?: string } }
      }
      
      // DayDetailModalから渡される場合: editData.competition.date または editData.date
      if (data.editData) {
        const editData = data.editData as { date?: string; competition?: { date?: string } }
        if (editData.competition?.date || editData.date) {
          return editData.competition?.date || editData.date
        }
      }
      
      // その他の場合: metadata.competition.date または date
      if (data.metadata?.competition?.date || data.date) {
        return data.metadata?.competition?.date || data.date
      }
    }
    
    // competitionEditingDataに情報がない場合は、データベースから取得した情報を使用
    return competitionInfo?.date
  }, [competitionEditingData, competitionInfo])

  // Entryフォーム初期値を取得するヘルパー関数
  const getEntryInitialEntries = (editingData: unknown): Array<{
    id: string
    styleId: string
    entryTime: number
    note: string
  }> => {
    if (!editingData || typeof editingData !== 'object') {
      return []
    }

    // CalendarItem経由で渡される editData.entries を優先
    if ('editData' in editingData && editingData.editData && typeof editingData.editData === 'object') {
      const editPayload = editingData.editData as { entries?: Array<Record<string, unknown>> }
      if (Array.isArray(editPayload.entries)) {
        return editPayload.entries.map((entry, index) => ({
          id: String(entry.id ?? `entry-${index + 1}`),
          styleId: String(entry.styleId ?? entry.style_id ?? ''),
          entryTime: typeof entry.entryTime === 'number'
            ? entry.entryTime
            : typeof entry.entry_time === 'number'
              ? entry.entry_time
              : 0,
          note: String(entry.note ?? '')
        }))
      }
    }

    // editingDataが直接entriesプロパティを持っている場合（DayDetailModalから渡される場合）
    if ('entries' in editingData && Array.isArray((editingData as { entries?: Array<Record<string, unknown>> }).entries)) {
      const entries = (editingData as { entries: Array<Record<string, unknown>> }).entries
      return entries.map((entry, index) => ({
        id: String(entry.id ?? `entry-${index + 1}`),
        styleId: String(entry.styleId ?? entry.style_id ?? ''),
        entryTime: typeof entry.entryTime === 'number'
          ? entry.entryTime
          : typeof entry.entry_time === 'number'
            ? entry.entry_time
            : 0,
        note: String(entry.note ?? '')
      }))
    }

    // 旧フォーマット（単一エントリー）
    if ('type' in editingData && (editingData as { type?: string }).type === 'entry') {
      const legacy = editingData as {
        id?: string
        styleId?: number
        style_id?: number
        entryTime?: number
        entry_time?: number | null
        note?: string | null
      }

      return [
        {
          id: legacy.id || 'entry-1',
          styleId: String(legacy.styleId ?? legacy.style_id ?? ''),
          entryTime: legacy.entryTime ?? legacy.entry_time ?? 0,
          note: legacy.note ?? ''
        }
      ]
    }

    return []
  }

  const entryInitialEntries = React.useMemo(
    () => getEntryInitialEntries(competitionEditingData),
    [competitionEditingData]
  )

  // Recordフォーム用 EntryInfo一覧を取得するヘルパー
  const getEntryDataListForRecord = (editingData: unknown, createdEntries: EntryWithStyle[]): EntryInfo[] => {
    if (
      editingData &&
      typeof editingData === 'object' &&
      'entryDataList' in editingData &&
      Array.isArray((editingData as { entryDataList?: EntryInfo[] }).entryDataList)
    ) {
      return (editingData as { entryDataList: EntryInfo[] }).entryDataList
    }

    if (
      editingData &&
      typeof editingData === 'object' &&
      'editData' in editingData &&
      editingData.editData &&
      typeof editingData.editData === 'object'
    ) {
      const editPayload = editingData.editData as { entries?: Array<Record<string, unknown>> }
      if (Array.isArray(editPayload.entries) && editPayload.entries.length > 0) {
        return editPayload.entries.map((entry) => {
          const style = entry.style && typeof entry.style === 'object' && 'name_jp' in entry.style
            ? entry.style as { name_jp?: string }
            : null
          return {
            styleId: Number(entry.styleId ?? entry.style_id),
            styleName: style?.name_jp ?? String(entry.styleName ?? ''),
            entryTime:
              typeof entry.entryTime === 'number'
                ? entry.entryTime
                : typeof entry.entry_time === 'number'
                  ? entry.entry_time
                  : undefined
          }
        })
      }
    }

    if (
      editingData &&
      typeof editingData === 'object' &&
      'entryData' in editingData &&
      editingData.entryData &&
      typeof editingData.entryData === 'object'
    ) {
      const entryData = (editingData as { entryData: EntryInfo }).entryData
      return [
        {
          styleId: Number(entryData.styleId),
          styleName: entryData.styleName,
          entryTime: entryData.entryTime
        }
      ]
    }

    if (createdEntries.length > 0) {
      return createdEntries.map((entry) => ({
        styleId: entry.styleId,
        styleName: String(entry.styleName || ''),
        entryTime: entry.entryTime ?? undefined
      }))
    }

    return []
  }

  return (
    <>
      {/* 第1段階: 練習基本情報フォーム */}
      <Suspense fallback={null}>
        <PracticeBasicForm
        isOpen={isPracticeBasicFormOpen}
        onClose={closePracticeBasicForm}
        onSubmit={onPracticeBasicSubmit}
        selectedDate={selectedDate || new Date()}
        editData={(() => {
          if (!editingData || typeof editingData !== 'object') {
            return undefined
          }
          
          // CalendarItem型の場合
          if ('type' in editingData && (editingData.type === 'practice' || editingData.type === 'team_practice')) {
            const item = editingData as { 
              date?: string
              place?: string
              note?: string
              metadata?: { practice?: { place?: string } }
              editData?: { images?: Array<{ id: string; thumbnailUrl: string; originalUrl: string; fileName: string }> }
            }
            return {
              date: item.date,
              place: item.place || item.metadata?.practice?.place || '',
              note: item.note || '',
              images: item.editData?.images
            }
          }
          
          // EditingData型の場合（旧フォーマット）
          if ('metadata' in editingData && editingData.metadata) {
            const item = editingData as {
              date?: string
              note?: string
              metadata?: { practice?: { place?: string } }
              editData?: { images?: Array<{ id: string; thumbnailUrl: string; originalUrl: string; fileName: string }> }
            }
            return {
              date: item.date,
              place: item.metadata?.practice?.place || '',
              note: item.note || '',
              images: item.editData?.images
            }
          }
          
          return undefined
        })()}
        isLoading={isLoading}
        />
      </Suspense>

      {/* 第2段階: 練習メニューフォーム */}
      <Suspense fallback={null}>
        <PracticeLogForm
        isOpen={isPracticeLogFormOpen}
        onClose={closePracticeLogForm}
        onSubmit={onPracticeLogSubmit}
        practiceId={createdPracticeId || 
          (editingData && typeof editingData === 'object' && 'practiceId' in editingData 
            ? (editingData.practiceId || '')
            : '')}
        editData={(() => {
          if (!editingData || typeof editingData !== 'object' || !('style' in editingData)) {
            return undefined
          }
          
          const data = editingData as { 
            id?: string; 
            style: string; 
            swim_category?: 'Swim' | 'Pull' | 'Kick';
            distance?: number; 
            rep_count?: number; 
            set_count?: number; 
            circle?: number | null; 
            note?: string | null; 
            tags?: PracticeTag[]; 
            times?: Array<{ memberId: string; times: TimeEntry[] }> 
          }
          
          return {
            id: data.id,
            style: String(data.style || 'Fr'),
            swim_category: data.swim_category || 'Swim',
            distance: data.distance,
            rep_count: data.rep_count,
            set_count: data.set_count,
            circle: data.circle,
            note: data.note,
            tags: data.tags,
            times: data.times
          }
        })()}
        isLoading={isLoading}
        availableTags={availableTags}
        setAvailableTags={setAvailableTags}
        styles={[]}
        />
      </Suspense>

      {/* 第1段階: 大会基本情報フォーム */}
      <Suspense fallback={null}>
        <CompetitionBasicForm
        isOpen={isCompetitionBasicFormOpen}
        onClose={closeCompetitionBasicForm}
        onSubmit={onCompetitionBasicSubmit}
        selectedDate={competitionSelectedDate || new Date()}
        editData={(() => {
          if (!competitionEditingData || typeof competitionEditingData !== 'object' || !('title' in competitionEditingData)) {
            return undefined
          }
          
          const data = competitionEditingData as { 
            date?: string; 
            title?: string; 
            place?: string; 
            note?: string; 
            metadata?: { competition?: { title?: string; place?: string; pool_type?: number } } 
          }
          
          return {
            date: data.date,
            title: data.title,
            competition_name: data.metadata?.competition?.title,
            place: data.place || data.metadata?.competition?.place || '',
            pool_type: data.metadata?.competition?.pool_type,
            note: data.note || ''
          }
        })()}
        isLoading={competitionIsLoading}
        />
      </Suspense>

      {/* 第2段階: エントリー登録フォーム（SKIP可能） */}
      <Suspense fallback={null}>
        <EntryLogForm
        isOpen={isEntryLogFormOpen}
        onClose={closeEntryLogForm}
        onSubmit={onEntrySubmit}
        onSkip={onEntrySkip}
        competitionId={computedCompetitionId}
        competitionTitle={computedCompetitionTitle}
        competitionDate={computedCompetitionDate}
        isLoading={competitionIsLoading}
        styles={styles.map(s => ({ id: s.id.toString(), nameJp: s.name_jp, distance: s.distance }))}
        editData={(() => {
          if (!competitionEditingData || competitionEditingData === null || typeof competitionEditingData !== 'object') {
            return undefined
          }
          
          if ('type' in competitionEditingData && competitionEditingData.type === 'entry') {
            const data = competitionEditingData as { 
              id?: string; 
              type: string; 
              styleId?: number; 
              entryTime?: number; 
              note?: string 
            }
            
            return {
              id: data.id,
              styleId: data.styleId,
              entryTime: data.entryTime,
              note: data.note
            }
          }
          
          return undefined
        })()}
        initialEntries={entryInitialEntries}
        />
      </Suspense>

      {/* 第3段階: 記録登録フォーム */}
      <Suspense fallback={null}>
        <RecordLogForm
        isOpen={isRecordLogFormOpen}
        onClose={closeRecordLogForm}
        onSubmit={async (formDataList) => {
          const converted = formDataList.map(convertRecordFormData)
          await onRecordLogSubmit(converted)
        }}
        competitionId={computedCompetitionId}
        competitionTitle={computedCompetitionTitle}
        competitionDate={computedCompetitionDate}
        editData={(() => {
          if (!competitionEditingData || competitionEditingData === null || typeof competitionEditingData !== 'object' || !('id' in competitionEditingData)) {
            return null
          }
          
          const data = competitionEditingData as { 
            id?: string; 
            styleId?: number; 
            time?: number; 
            isRelaying?: boolean; 
            splitTimes?: Array<{ id?: string; recordId?: string; distance: number; splitTime: number; createdAt?: string }>; 
            note?: string; 
            videoUrl?: string | null;
            reactionTime?: number | null
          }
          
          const splitTimes = data.splitTimes?.map(st => ({
            id: st.id || '', 
            recordId: st.recordId || '', 
            distance: st.distance,
            splitTime: st.splitTime,
            createdAt: st.createdAt || '' 
          }))
          
          return {
            id: data.id,
            styleId: data.styleId,
            time: data.time,
            isRelaying: data.isRelaying,
            splitTimes: splitTimes,
            note: data.note,
            videoUrl: data.videoUrl === null ? undefined : data.videoUrl,
            reactionTime: data.reactionTime
          }
        })()}
        isLoading={competitionIsLoading}
        styles={styles.map(style => ({
          id: style.id.toString(),
          nameJp: style.name_jp,
          distance: style.distance
        }))}
        entryDataList={getEntryDataListForRecord(competitionEditingData, createdEntries)}
        />
      </Suspense>
    </>
  )
}

