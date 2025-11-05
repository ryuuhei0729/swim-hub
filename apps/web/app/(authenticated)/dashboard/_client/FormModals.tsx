'use client'

import React, { Suspense } from 'react'
import dynamic from 'next/dynamic'
import type { PracticeTag, Style } from '@apps/shared/types/database'
import type { TimeEntry, EntryInfo } from '@apps/shared/types/ui'
import {
  usePracticeFormStore,
  useCompetitionFormStore,
} from '@/stores'
import type {
  EditingData,
  PracticeMenuFormData,
  EntryFormData,
  RecordFormDataInternal,
  EntryWithStyle
} from '@/stores/types'

interface FormModalsProps {
  onPracticeBasicSubmit: (basicData: { date: string; place: string; note: string }) => Promise<void>
  onPracticeLogSubmit: (formDataArray: PracticeMenuFormData[]) => Promise<void>
  onCompetitionBasicSubmit: (basicData: { date: string; title: string; place: string; poolType: number; note: string }) => Promise<void>
  onEntrySubmit: (entriesData: EntryFormData[]) => Promise<void>
  onEntrySkip: () => void
  onRecordLogSubmit: (formData: RecordFormDataInternal) => Promise<void>
  styles: Style[]
}

/**
 * すべてのフォームモーダルを管理するClient Component
 */
export function FormModals({
  onPracticeBasicSubmit,
  onPracticeLogSubmit,
  onCompetitionBasicSubmit,
  onEntrySubmit,
  onEntrySkip,
  onRecordLogSubmit,
  styles
}: FormModalsProps) {
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

  // EntryInfoを取得するヘルパー関数
  const getEntryDataForRecord = (editingData: unknown, createdEntries: EntryWithStyle[]): EntryInfo | undefined => {
    if (editingData && typeof editingData === 'object' && 'entryData' in editingData 
      && editingData.entryData 
      && typeof editingData.entryData === 'object' 
      && editingData.entryData !== null) {
      const entryData = editingData.entryData
      if ('styleId' in entryData && 'styleName' in entryData) {
        const styleId = typeof entryData.styleId === 'number' ? entryData.styleId 
          : typeof entryData.styleId === 'string' ? Number(entryData.styleId) 
          : undefined
        const styleName = typeof entryData.styleName === 'string' ? entryData.styleName : ''
        const entryTime = 'entryTime' in entryData 
          ? (typeof entryData.entryTime === 'number' ? entryData.entryTime 
            : entryData.entryTime === null ? null 
            : undefined)
          : undefined
        
        if (styleId !== undefined && styleName !== undefined) {
          return { styleId, styleName, entryTime }
        }
      }
    }
    
    if (createdEntries.length > 0) {
      return {
        styleId: createdEntries[0].styleId,
        styleName: String(createdEntries[0].styleName || ''),
        entryTime: createdEntries[0].entryTime
      }
    }
    
    return undefined
  }

  // フォームモーダルを動的インポート（コード分割）
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

  return (
    <>
      {/* 第1段階: 練習基本情報フォーム */}
      <Suspense fallback={null}>
        <PracticeBasicForm
        isOpen={isPracticeBasicFormOpen}
        onClose={closePracticeBasicForm}
        onSubmit={onPracticeBasicSubmit}
        selectedDate={selectedDate || new Date()}
        editData={editingData && typeof editingData === 'object' && 'metadata' in editingData && editingData.metadata
          ? {
              date: editingData.date,
              place: editingData.metadata.practice?.place || '',
              note: editingData.note || ''
            }
          : undefined}
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
        competitionId={createdCompetitionId || 
          (competitionEditingData && typeof competitionEditingData === 'object' && 'competitionId' in competitionEditingData 
            ? competitionEditingData.competitionId || ''
            : '')}
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
        />
      </Suspense>

      {/* 第3段階: 記録登録フォーム */}
      <Suspense fallback={null}>
        <RecordLogForm
        isOpen={isRecordLogFormOpen}
        onClose={closeRecordLogForm}
        onSubmit={onRecordLogSubmit}
        competitionId={createdCompetitionId || 
          (competitionEditingData && typeof competitionEditingData === 'object' && 'competitionId' in competitionEditingData 
            ? competitionEditingData.competitionId || ''
            : '')}
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
            videoUrl?: string | null 
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
            videoUrl: data.videoUrl === null ? undefined : data.videoUrl
          }
        })()}
        isLoading={competitionIsLoading}
        styles={styles.map(style => ({
          id: style.id.toString(),
          nameJp: style.name_jp,
          distance: style.distance
        }))}
        entryData={getEntryDataForRecord(competitionEditingData, createdEntries)}
        />
      </Suspense>
    </>
  )
}

