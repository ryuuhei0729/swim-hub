'use client'

import React, { useState } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { TrophyIcon, ClipboardDocumentListIcon } from '@heroicons/react/24/solid'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import { useAuth } from '@/contexts'
import {
  DayDetailModalProps,
  CalendarItem,
  isPracticeMetadata,
  isCompetitionMetadata,
  isRecordMetadata,
  isTeamInfo
} from '@/types'
import type { PracticeLog } from '@apps/shared/types'
import {
  PracticeDetails,
  CompetitionDetails,
  CompetitionWithEntry,
  AttendanceModal,
  DeleteConfirmModal
} from './components'
import type { DeleteConfirmState, AttendanceModalState } from './types'

export default function DayDetailModal({
  isOpen,
  onClose,
  date,
  entries,
  onEditItem,
  onDeleteItem,
  onAddItem,
  onAddPracticeLog,
  onAddPracticeLogFromTemplate,
  onEditPracticeLog,
  onDeletePracticeLog,
  onAddRecord,
  onEditRecord,
  onDeleteRecord
}: DayDetailModalProps) {
  const { supabase } = useAuth()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<DeleteConfirmState | null>(null)
  const [deletedEntryIds, setDeletedEntryIds] = useState<string[]>([])
  const [showAttendanceModal, setShowAttendanceModal] = useState<AttendanceModalState | null>(null)

  if (!isOpen) return null

  // エントリーの分類
  const practiceItems = entries.filter(e => e.type === 'practice' || e.type === 'team_practice')
  const practiceLogItems = entries.filter(e => e.type === 'practice_log')
  const recordItems = entries.filter(e => e.type === 'record')
  const competitionItems = entries.filter(e => e.type === 'competition' || e.type === 'team_competition')
  const entryItems = entries.filter(e => e.type === 'entry')

  const hasPracticeContent = practiceItems.length > 0 || practiceLogItems.length > 0
  const hasRecordContent = competitionItems.length > 0 || entryItems.length > 0 || recordItems.length > 0

  const detailTestId = hasPracticeContent
    ? 'practice-detail-modal'
    : hasRecordContent
      ? 'record-detail-modal'
      : 'day-detail-modal'

  const handleDeleteConfirm = async () => {
    if (showDeleteConfirm) {
      await onDeleteItem?.(showDeleteConfirm.id, showDeleteConfirm.type)
      if (showDeleteConfirm.type === 'entry') {
        setDeletedEntryIds(prev => [...prev, showDeleteConfirm.id])
      }
      setShowDeleteConfirm(null)
      const remainingEntries = entries.filter(e => e.id !== showDeleteConfirm.id)
      if (remainingEntries.length === 0) {
        onClose()
      }
    }
  }

  const handleShowAttendance = (eventId: string, eventType: 'practice' | 'competition', teamId: string) => {
    setShowAttendanceModal({ eventId, eventType, teamId })
  }

  // エントリー編集ハンドラー
  const handleEditEntry = async (item: CalendarItem, competitionId: string) => {
    // getUser()とcompetitionステータスチェックを並行実行
    const [{ data: { user } }, competitionStatusResult] = await Promise.all([
      supabase.auth.getUser(),
      item.metadata?.team_id
        ? supabase.from('competitions').select('entry_status').eq('id', competitionId).single()
        : Promise.resolve({ data: null, error: null })
    ])
    if (!user) return

    // チームcompetitionの場合、entry_statusをチェック
    if (item.metadata?.team_id && !competitionStatusResult.error && competitionStatusResult.data) {
      const status = competitionStatusResult.data.entry_status || 'before'
      if (status !== 'open') {
        const statusLabel = status === 'before' ? '受付前' : '受付終了'
        window.alert(`エントリーは${statusLabel}のため、エントリー登録はできません。記録入力に進みます。`)
        onAddRecord?.({ competitionId })
        return
      }
    }

    // エントリーデータを取得
    const { data: entryData, error } = await supabase
      .from('entries')
      .select(`
        *,
        style:styles!inner(id, name_jp),
        competition:competitions!inner(id, title, date, place, pool_type, team_id)
      `)
      .eq('competition_id', competitionId)
      .eq('user_id', user.id)

    if (error || !entryData || entryData.length === 0) {
      console.error('エントリー取得エラー:', error)
      return
    }

    type EntryRow = {
      id: string
      competition_id: string
      style_id: number
      entry_time: number | null
      note: string | null
      style: { id: number; name_jp: string }
      competition: { id: string; title: string; date: string; place: string | null; pool_type: number; team_id: string | null }
    }

    const rows = entryData as EntryRow[]
    const entryList = rows.map((row) => ({
      id: row.id,
      styleId: row.style_id,
      entryTime: row.entry_time,
      note: row.note ?? '',
      style: row.style,
      competition: row.competition
    }))

    const editPayload = {
      type: 'entry' as const,
      competitionId,
      entries: entryList,
      date: rows[0]?.competition.date ?? item.date ?? '',
      competition: rows[0]?.competition
    }

    onEditItem?.({
      ...item,
      editData: editPayload
    } as CalendarItem)
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" data-testid={detailTestId}>
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/40 transition-opacity" onClick={onClose} />

        <div className="relative bg-white rounded-lg shadow-2xl border-2 border-gray-300 w-full max-w-2xl">
          {/* ヘッダー */}
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg leading-6 font-medium text-gray-900">
                {format(date, 'M月d日（E）', { locale: ja })}の記録
              </h3>
              <button onClick={onClose} className="close-button text-gray-400 hover:text-gray-600 transition-colors" data-testid="modal-close-button">
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            {/* 空の状態 */}
            {entries.length === 0 && (
              <div className="text-center py-8">
                <div className="flex gap-3">
                  <button onClick={() => onAddItem?.(date, 'record')} className="flex-1 flex flex-col items-center justify-center px-4 py-12 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-blue-50 hover:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-300" data-testid="add-record-button">
                    <TrophyIcon className="h-8 w-8 text-blue-500 mb-2" />
                    大会記録を追加
                  </button>
                  <button onClick={() => onAddItem?.(date, 'practice')} className="flex-1 flex flex-col items-center justify-center px-4 py-12 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-green-50 hover:border-green-300 focus:outline-none focus:ring-2 focus:ring-green-500" data-testid="add-practice-button">
                    <ClipboardDocumentListIcon className="h-8 w-8 text-green-500 mb-2" />
                    練習予定を追加
                  </button>
                </div>
              </div>
            )}

            {/* 練習セクション */}
            {hasPracticeContent && (
              <div className="mb-6">
                <div className="space-y-3">
                  {practiceItems.map((item) => (
                    <PracticeDetails
                      key={item.id}
                      practiceId={item.id}
                      place={item.place}
                      isTeamPractice={item.type === 'team_practice'}
                      teamId={item.metadata?.team_id}
                      teamName={isPracticeMetadata(item.metadata) && isTeamInfo(item.metadata.team) ? item.metadata.team.name : undefined}
                      onEdit={() => onEditItem?.(item)}
                      onDelete={() => setShowDeleteConfirm({ id: item.id, type: item.type })}
                      onAddPracticeLog={onAddPracticeLog}
                      onAddPracticeLogFromTemplate={onAddPracticeLogFromTemplate}
                      onEditPracticeLog={onEditPracticeLog}
                      onDeletePracticeLog={onDeletePracticeLog}
                      onShowAttendance={item.type === 'team_practice' && item.metadata?.team_id ? () => handleShowAttendance(item.id, 'practice', item.metadata!.team_id!) : undefined}
                    />
                  ))}

                  {practiceLogItems.map((item) => {
                    const practiceId = isPracticeMetadata(item.metadata) ? (item.metadata.practice?.id || item.metadata.practice_id) : null
                    if (!practiceId) return null

                    const practiceLogUpdateKey = practiceLogItems
                      .filter(p => {
                        const pid = isPracticeMetadata(p.metadata) ? (p.metadata.practice?.id || p.metadata.practice_id) : null
                        return pid === practiceId
                      })
                      .map(p => {
                        const practiceLog = (p.metadata as { practice_log?: PracticeLog })?.practice_log
                        return `${p.id}:${practiceLog?.updated_at || p.id}`
                      })
                      .sort()
                      .join(',')

                    return (
                      <PracticeDetails
                        key={item.id}
                        practiceId={practiceId}
                        place={item.place}
                        practiceLogUpdateKey={practiceLogUpdateKey}
                        isTeamPractice={isPracticeMetadata(item.metadata) ? !!item.metadata.team_id : false}
                        teamId={isPracticeMetadata(item.metadata) ? item.metadata.team_id : undefined}
                        teamName={isPracticeMetadata(item.metadata) && isTeamInfo(item.metadata.team) ? item.metadata.team.name : undefined}
                        onEdit={(images) => {
                          const practiceData = {
                            id: practiceId,
                            type: 'practice' as const,
                            date: item.date || '',
                            title: item.title || '練習',
                            place: item.place || '',
                            note: item.note || undefined,
                            metadata: isPracticeMetadata(item.metadata) ? (item.metadata.practice || {}) : {},
                            editData: { images }
                          }
                          onEditItem?.(practiceData)
                        }}
                        onDelete={() => setShowDeleteConfirm({ id: practiceId, type: 'practice' as const })}
                        onAddPracticeLog={onAddPracticeLog}
                        onAddPracticeLogFromTemplate={onAddPracticeLogFromTemplate}
                        onEditPracticeLog={onEditPracticeLog}
                        onDeletePracticeLog={onDeletePracticeLog}
                        onShowAttendance={isPracticeMetadata(item.metadata) && item.metadata.team_id ? () => handleShowAttendance(practiceId, 'practice', item.metadata.team_id!) : undefined}
                      />
                    )
                  })}
                </div>
              </div>
            )}

            {/* 大会セクション */}
            {hasRecordContent && (
              <div className="mb-6">
                <div className="space-y-3">
                  {competitionItems.map((item) => (
                    <CompetitionDetails
                      key={item.id}
                      competitionId={item.id}
                      competitionName={item.title || '大会'}
                      place={item.place}
                      poolType={item.metadata?.competition?.pool_type}
                      note={item.note}
                      isTeamCompetition={item.type === 'team_competition'}
                      teamId={item.metadata?.team_id}
                      teamName={isCompetitionMetadata(item.metadata) && isTeamInfo(item.metadata.team) ? item.metadata.team.name : undefined}
                      onEdit={() => { onEditItem?.(item); onClose() }}
                      onDelete={() => setShowDeleteConfirm({ id: item.id, type: item.type })}
                      onAddRecord={onAddRecord}
                      onEditRecord={onEditRecord}
                      onDeleteRecord={onDeleteRecord}
                      onClose={onClose}
                      onShowAttendance={item.type === 'team_competition' && item.metadata?.team_id ? () => handleShowAttendance(item.id, 'competition', item.metadata!.team_id!) : undefined}
                    />
                  ))}

                  {entryItems.filter(item => item.metadata?.competition?.id).map((item) => {
                    const competitionId = item.metadata?.competition?.id
                    if (!competitionId) return null

                    return (
                      <CompetitionWithEntry
                        key={item.id}
                        entryId={item.id}
                        competitionId={competitionId}
                        competitionName={item.metadata?.competition?.title || '大会'}
                        place={item.place}
                        note={item.note}
                        styleId={item.metadata?.style?.id}
                        styleName={item.metadata?.style?.name_jp || ''}
                        entryTime={item.metadata?.entry_time}
                        isTeamCompetition={!!item.metadata?.team_id}
                        deletedEntryIds={deletedEntryIds}
                        onAddRecord={onAddRecord}
                        onEditCompetition={(images) => {
                          const competitionData = {
                            id: competitionId,
                            type: 'competition' as const,
                            date: item.date || '',
                            title: item.metadata?.competition?.title || '',
                            place: item.place || '',
                            note: item.note || undefined,
                            metadata: {
                              competition: {
                                id: competitionId,
                                title: item.metadata?.competition?.title || '',
                                date: item.metadata?.competition?.date || item.date,
                                end_date: item.metadata?.competition?.end_date || null,
                                place: item.place || '',
                                pool_type: item.metadata?.competition?.pool_type || 0
                              }
                            },
                            editData: { images }
                          }
                          onEditItem?.(competitionData)
                        }}
                        onDeleteCompetition={() => setShowDeleteConfirm({ id: competitionId, type: 'competition' })}
                        onEditEntry={() => handleEditEntry(item, competitionId)}
                        onDeleteEntry={(entryId) => {
                          if (!entryId) return
                          setShowDeleteConfirm({ id: entryId, type: 'entry', competitionId })
                        }}
                        onClose={onClose}
                      />
                    )
                  })}

                  {recordItems.map((record) => {
                    const compId = record.metadata?.competition?.id || record.id
                    const poolType = record.metadata?.pool_type || 0

                    return (
                      <CompetitionDetails
                        key={compId}
                        competitionId={compId}
                        competitionName={record.title || '大会'}
                        place={record.place}
                        poolType={poolType}
                        note={record.note || undefined}
                        records={[record]}
                        isTeamCompetition={record.metadata?.competition?.team_id != null}
                        teamId={record.metadata?.competition?.team_id}
                        teamName={record.metadata?.competition?.team_id && isRecordMetadata(record.metadata) && isTeamInfo(record.metadata.team) ? record.metadata.team.name : undefined}
                        onEdit={(images) => {
                          const competitionData = {
                            id: compId,
                            type: 'competition' as const,
                            date: record.date || '',
                            title: record.title || '',
                            place: record.place || '',
                            note: record.note || undefined,
                            metadata: {
                              competition: {
                                id: compId,
                                title: record.title || '',
                                date: record.metadata?.competition?.date || record.date,
                                end_date: record.metadata?.competition?.end_date || null,
                                place: record.place || '',
                                pool_type: poolType
                              }
                            },
                            editData: { images }
                          }
                          onEditItem?.(competitionData)
                        }}
                        onDelete={() => setShowDeleteConfirm({ id: compId, type: 'competition' })}
                        onAddRecord={onAddRecord}
                        onEditRecord={onEditRecord}
                        onDeleteRecord={onDeleteRecord}
                        onClose={onClose}
                        onShowAttendance={record.metadata?.competition?.team_id ? () => handleShowAttendance(compId, 'competition', record.metadata!.competition!.team_id!) : undefined}
                      />
                    )
                  })}
                </div>
              </div>
            )}

            {/* 記録追加ボタン */}
            {entries.length > 0 && (
              <div className="border-t border-gray-200 pt-4">
                <h4 className="text-sm font-medium text-gray-700 mb-3">記録を追加</h4>
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => onAddItem?.(date, 'record')} className="flex items-center justify-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-blue-50 hover:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500" data-testid="add-record-button">
                    <TrophyIcon className="h-5 w-5 text-blue-500 mr-2" />
                    大会記録
                  </button>
                  <button onClick={() => onAddItem?.(date, 'practice')} className="flex items-center justify-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-green-50 hover:border-green-300 focus:outline-none focus:ring-2 focus:ring-green-500" data-testid="add-practice-button">
                    <ClipboardDocumentListIcon className="h-5 w-5 text-green-500 mr-2" />
                    練習記録
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* フッター */}
          <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
            <button type="button" className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm" onClick={onClose}>
              閉じる
            </button>
          </div>
        </div>
      </div>

      {/* 削除確認モーダル */}
      <DeleteConfirmModal
        isOpen={!!showDeleteConfirm}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setShowDeleteConfirm(null)}
      />

      {/* 出欠情報モーダル */}
      {showAttendanceModal && (
        <AttendanceModal
          isOpen={true}
          onClose={() => setShowAttendanceModal(null)}
          eventId={showAttendanceModal.eventId}
          eventType={showAttendanceModal.eventType}
          teamId={showAttendanceModal.teamId}
        />
      )}
    </div>
  )
}
