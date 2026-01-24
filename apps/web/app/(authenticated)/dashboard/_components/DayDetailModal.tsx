'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { XMarkIcon, PencilIcon, TrashIcon, ClipboardDocumentCheckIcon, ShareIcon } from '@heroicons/react/24/outline'
import { BoltIcon, TrophyIcon } from '@heroicons/react/24/solid'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import { ShareCardModal } from '@/components/share'
import type { CompetitionShareData, PracticeShareData, PracticeMenuItem } from '@/components/share'
import { formatTime } from '@/utils/formatters'
import { useAuth } from '@/contexts'
import { CalendarItemType, DayDetailModalProps, CalendarItem, EntryInfo, isPracticeMetadata, isCompetitionMetadata, isRecordMetadata, isTeamInfo } from '@/types'
import { LapTimeDisplay } from '@/components/forms/LapTimeDisplay'
import { BestTimeBadge } from '@/components/ui'
import ImageGallery, { GalleryImage } from '@/components/ui/ImageGallery'
import type {
  Record,
  Practice,
  PracticeLog,
  PracticeLogWithTimes,
  PracticeTime,
  PracticeTag,
  TeamAttendanceWithDetails,
  SplitTime,
  PoolType
} from '@apps/shared/types'
import { AttendanceAPI, EntryAPI } from '@swim-hub/shared'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function DayDetailModal({
  isOpen,
  onClose,
  date,
  entries,
  onEditItem,
  onDeleteItem,
  onAddItem,
  onAddPracticeLog,
  onEditPracticeLog,
  onDeletePracticeLog,
  onAddRecord,
  onEditRecord,
  onDeleteRecord
}: DayDetailModalProps) {
  const { supabase } = useAuth()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<{id: string, type: CalendarItemType, competitionId?: string} | null>(null)
  const [deletedEntryIds, setDeletedEntryIds] = useState<string[]>([])
  const [showAttendanceModal, setShowAttendanceModal] = useState<{
    eventId: string
    eventType: 'practice' | 'competition'
    teamId: string
  } | null>(null)

  if (!isOpen) return null

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
      
      // エントリー削除の場合、削除されたIDを記録
      if (showDeleteConfirm.type === 'entry') {
        setDeletedEntryIds(prev => [...prev, showDeleteConfirm.id])
      }
      
      setShowDeleteConfirm(null)
      
      // 削除後、残りのエントリーがない場合はモーダルを閉じる
      const remainingEntries = entries.filter(e => e.id !== showDeleteConfirm.id)
      if (remainingEntries.length === 0) {
        onClose()
      }
    }
  }


  const _getPoolTypeText = (poolType: number) => {
    return poolType === 1 ? '長水路(50m)' : '短水路(25m)'
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" data-testid={detailTestId}>
      <div className="flex min-h-screen items-center justify-center p-4">
        {/* オーバーレイ */}
        <div 
          className="fixed inset-0 bg-black/40 transition-opacity" 
          onClick={onClose}
        />

        {/* モーダルコンテンツ */}
        <div className="relative bg-white rounded-lg shadow-2xl border-2 border-gray-300 w-full max-w-2xl">
          {/* ヘッダー */}
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg leading-6 font-medium text-gray-900">
                {format(date, 'M月d日（E）', { locale: ja })}の記録
              </h3>
              <button
                onClick={onClose}
                className="close-button text-gray-400 hover:text-gray-600 transition-colors"
                data-testid="modal-close-button"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            {/* エントリーがない場合 */}
            {entries.length === 0 && (
              <div className="text-center py-8">
                <p className="text-gray-500 mb-4" data-testid="empty-day-message">この日の記録はありません</p>
                <div className="space-y-2">
                  <button
                    onClick={() => onAddItem?.(date, 'practice')}
                    className="w-full flex items-center justify-center px-4 py-3 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-green-50 hover:border-green-300 focus:outline-none focus:ring-2 focus:ring-green-500"
                    data-testid="add-practice-button"
                  >
                    <span className="mr-2">💪</span>
                    練習予定を追加
                  </button>
                  <button
                    onClick={() => onAddItem?.(date, 'record')}
                    className="w-full flex items-center justify-center px-4 py-3 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-blue-50 hover:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    data-testid="add-record-button"
                  >
                    <span className="mr-2">🏊‍♂️</span>
                    大会記録を追加
                  </button>
                </div>
              </div>
            )}

            {/* 練習記録セクション */}
            {(practiceItems.length > 0 || practiceLogItems.length > 0) && (
              <div className="mb-6">
                <div className="space-y-3">
                  {/* 練習（practice_logがない場合のみ） */}
                  {practiceItems.map((item) => (
                    <PracticeDetails 
                      key={item.id} 
                      practiceId={item.id} 
                      place={item.place}
                      isTeamPractice={item.type === 'team_practice'}
                      teamId={item.metadata?.team_id}
                      teamName={isPracticeMetadata(item.metadata) && isTeamInfo(item.metadata.team) ? item.metadata.team.name : undefined}
                      onEdit={() => onEditItem?.(item)}
                      onDelete={() => setShowDeleteConfirm({id: item.id, type: item.type})}
                      onAddPracticeLog={onAddPracticeLog}
                      onEditPracticeLog={onEditPracticeLog}
                      onDeletePracticeLog={onDeletePracticeLog}
                      onShowAttendance={item.type === 'team_practice' && item.metadata?.team_id ? () => {
                        const teamId = item.metadata?.team_id
                        if (teamId) {
                          setShowAttendanceModal({
                            eventId: item.id,
                            eventType: 'practice',
                            teamId
                          })
                        }
                      } : undefined}
                    />
                  ))}
                  
                  {/* 練習ログ（practice情報からログを取得して表示） */}
                  {practiceLogItems.map((item) => {
                    const practiceId = isPracticeMetadata(item.metadata) 
                      ? (item.metadata.practice?.id || item.metadata.practice_id)
                      : null
                    if (!practiceId) return null
                    
                    // practice_logの更新を検知するために、practice_logのupdated_atを含めた文字列を取得
                    const practiceLogUpdateKey = practiceLogItems
                      .filter(p => {
                        const pid = isPracticeMetadata(p.metadata) 
                          ? (p.metadata.practice?.id || p.metadata.practice_id)
                          : null
                        return pid === practiceId
                      })
                      .map(p => {
                        // metadata.practice_log.updated_atを取得
                        const practiceLog = (p.metadata as { practice_log?: PracticeLog })?.practice_log
                        const updatedAt = practiceLog?.updated_at || p.id
                        return `${p.id}:${updatedAt}`
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
                        onEdit={() => {
                          // practiceの編集
                          const practiceData = {
                            id: practiceId,
                            type: 'practice' as const,
                            date: item.date || '',
                            title: '練習',
                            place: item.place || '',
                            note: item.note || undefined,
                            metadata: isPracticeMetadata(item.metadata) ? (item.metadata.practice || {}) : {}
                          }
                          onEditItem?.(practiceData)
                        }}
                        onDelete={() => {
                          // practiceの削除
                          setShowDeleteConfirm({id: practiceId, type: 'practice' as const})
                        }}
                        onAddPracticeLog={onAddPracticeLog}
                        onEditPracticeLog={onEditPracticeLog}
                        onDeletePracticeLog={onDeletePracticeLog}
                        onShowAttendance={isPracticeMetadata(item.metadata) && item.metadata.team_id ? () => {
                          const teamId = item.metadata.team_id
                          if (teamId) {
                            setShowAttendanceModal({
                              eventId: practiceId,
                              eventType: 'practice',
                              teamId
                            })
                          }
                        } : undefined}
                      />
                    )
                  })}
                </div>
              </div>
            )}

            {/* 大会セクション */}
            {(competitionItems.length > 0 || entryItems.filter(item => item.metadata?.competition?.id).length > 0 || recordItems.length > 0) && (
              <div className="mb-6">
                <div className="space-y-3">
                  {/* パターン1: Competitionのみ（エントリーなし、記録なし） */}
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
                      onEdit={() => {
                        onEditItem?.(item)
                        onClose()
                      }}
                      onDelete={() => setShowDeleteConfirm({id: item.id, type: item.type})}
                      onAddRecord={onAddRecord}
                      onEditRecord={onEditRecord}
                      onDeleteRecord={onDeleteRecord}
                      onClose={onClose}
                      onShowAttendance={item.type === 'team_competition' && item.metadata?.team_id ? () => {
                        const teamId = item.metadata?.team_id
                        if (teamId) {
                          setShowAttendanceModal({
                            eventId: item.id,
                            eventType: 'competition',
                            teamId
                          })
                        }
                      } : undefined}
                    />
                  ))}
                  
                  {/* パターン2: Entry あり（記録なし） */}
                  {entryItems
                    .filter(item => item.metadata?.competition?.id) // competition.idが存在するもののみフィルタリング
                    .map((item) => {
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
                        onEditCompetition={() => {
                          // 大会情報を編集
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
                            }
                          }
                          onEditItem?.(competitionData)
                        }}
                        onDeleteCompetition={() => setShowDeleteConfirm({id: competitionId, type: 'competition'})}
                        onEditEntry={async () => {
                          // エントリー編集処理
                          const { data: { user } } = await supabase.auth.getUser()
                          if (!user) return

                          // チームcompetitionの場合、entry_statusをチェック
                          if (item.metadata?.team_id) {
                            const { data: competitionData, error: competitionError } = await supabase
                              .from('competitions')
                              .select('entry_status')
                              .eq('id', competitionId)
                              .single()

                            if (!competitionError && competitionData) {
                              const status = competitionData.entry_status || 'before'
                              if (status !== 'open') {
                                // entry_statusが'open'でない場合はalertを表示してrecord入力モーダルに遷移
                                const statusLabel = status === 'before' ? '受付前' : '受付終了'
                                window.alert(`エントリーは${statusLabel}のため、エントリー登録はできません。記録入力に進みます。`)
                                
                                // record入力モーダルに遷移
                                onAddRecord?.({ competitionId })
                                return
                              }
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
                          competition: {
                            id: string
                            title: string
                            date: string
                            place: string | null
                            pool_type: number
                            team_id: string | null
                          }
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
                        // EntryLogFormを開いた後、モーダルは開いたまま
                      }}
                      onDeleteEntry={async (entryId) => {
                        if (!entryId) return
                        const { data: { user } } = await supabase.auth.getUser()
                        if (!user) return
                        setShowDeleteConfirm({ id: entryId, type: 'entry', competitionId })
                      }}
                      onClose={onClose}
                    />
                    )
                  })}
                  
                  {/* パターン3: Recordがある大会を表示 */}
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
                        onEdit={() => {
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
                            }
                          }
                          onEditItem?.(competitionData)
                          // 編集フォームを開いた後、モーダルは開いたまま
                        }}
                        onDelete={() => setShowDeleteConfirm({id: compId, type: 'competition'})}
                        onAddRecord={onAddRecord}
                        onEditRecord={onEditRecord}
                        onDeleteRecord={onDeleteRecord}
                        onClose={onClose}
                        onShowAttendance={record.metadata?.competition?.team_id ? () => {
                          const teamId = record.metadata?.competition?.team_id
                          if (teamId) {
                            setShowAttendanceModal({
                              eventId: compId,
                              eventType: 'competition',
                              teamId
                            })
                          }
                        } : undefined}
                      />
                    )
                  })}
                </div>
              </div>
            )}

            {/* 記録追加ボタン（既に記録がある場合） */}
            {entries.length > 0 && (
              <div className="border-t border-gray-200 pt-4">
                <h4 className="text-sm font-medium text-gray-700 mb-3">記録を追加</h4>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => onAddItem?.(date, 'practice')}
                    className="flex items-center justify-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-green-50 hover:border-green-300 focus:outline-none focus:ring-2 focus:ring-green-500"
                    data-testid="add-practice-button"
                  >
                    <span className="mr-2">💪</span>
                    練習記録
                  </button>
                  <button
                    onClick={() => onAddItem?.(date, 'record')}
                    className="flex items-center justify-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-blue-50 hover:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    data-testid="add-record-button"
                  >
                    <span className="mr-2">🏊‍♂️</span>
                    大会記録
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* フッター */}
          <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
            <button
              type="button"
              className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
              onClick={onClose}
            >
              閉じる
            </button>
          </div>
        </div>
      </div>

      {/* 削除確認モーダル */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-60 overflow-y-auto">
          <div className="flex min-h-screen items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/40 transition-opacity"></div>
            
            <div className="relative bg-white rounded-lg shadow-2xl border-2 border-red-300 w-full max-w-lg" data-testid="confirm-dialog">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <div className="sm:flex sm:items-start">
                  <div className="mx-auto shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-red-100 sm:mx-0 sm:h-10 sm:w-10">
                    <TrashIcon className="h-6 w-6 text-red-600" />
                  </div>
                  <div className="mt-3 text-center sm:mt-0 sm:ml-4 sm:text-left">
                    <h3 className="text-lg leading-6 font-medium text-gray-900">
                      記録を削除
                    </h3>
                    <div className="mt-2">
                      <p className="text-sm text-gray-500">
                        本当に削除しますか？
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                <button
                  type="button"
                  className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-red-600 text-base font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 sm:ml-3 sm:w-auto sm:text-sm"
                  onClick={handleDeleteConfirm}
                  data-testid="confirm-delete-button"
                >
                  削除
                </button>
                <button
                  type="button"
                  className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                  onClick={() => setShowDeleteConfirm(null)}
                  data-testid="cancel-delete-button"
                >
                  キャンセル
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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

// 出欠アイコンボタン
function AttendanceButton({ 
  onClick
}: { 
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 px-3 py-1.5 bg-blue-100 text-blue-700 hover:bg-blue-200 rounded-lg transition-colors text-sm"
      title="出欠状況を確認"
    >
      <ClipboardDocumentCheckIcon className="h-4 w-4" />
      <span>出欠状況</span>
    </button>
  )
}

// 出欠情報モーダル
function AttendanceModal({ 
  isOpen,
  onClose,
  eventId, 
  eventType,
  teamId 
}: { 
  isOpen: boolean
  onClose: () => void
  eventId: string
  eventType: 'practice' | 'competition'
  teamId: string
}) {
  const { supabase } = useAuth()
  const [attendances, setAttendances] = useState<TeamAttendanceWithDetails[]>([])
  const [loading, setLoading] = useState(true)
  const attendanceAPI = useMemo(() => new AttendanceAPI(supabase), [supabase])

  const loadAttendances = useCallback(async () => {
    try {
      setLoading(true)
      const data = eventType === 'practice'
        ? await attendanceAPI.getAttendanceByPractice(eventId)
        : await attendanceAPI.getAttendanceByCompetition(eventId)
      setAttendances(data)
    } catch (err) {
      console.error('出欠情報の取得に失敗:', err)
    } finally {
      setLoading(false)
    }
  }, [eventType, eventId, attendanceAPI])

  useEffect(() => {
    if (isOpen) {
      loadAttendances()
    }
  }, [isOpen, eventId, eventType, loadAttendances])

  if (!isOpen) return null

  const stats = {
    present: attendances.filter(a => a.status === 'present').length,
    absent: attendances.filter(a => a.status === 'absent').length,
    other: attendances.filter(a => a.status === 'other').length,
    pending: attendances.filter(a => !a.status).length,
    total: attendances.length
  }

  return (
    <div className="fixed inset-0 z-60 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div 
          className="fixed inset-0 bg-black/40 transition-opacity" 
          onClick={onClose}
        />

        <div className="relative bg-white rounded-lg shadow-2xl border-2 border-blue-300 w-full max-w-2xl">
          {/* ヘッダー */}
          <div className="bg-blue-50 px-4 pt-5 pb-4 sm:p-6 border-b border-blue-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ClipboardDocumentCheckIcon className="h-6 w-6 text-blue-600" />
                <h3 className="text-lg leading-6 font-medium text-gray-900">
                  出欠状況
                </h3>
              </div>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>
          </div>

          {/* コンテンツ */}
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6">
            {loading ? (
              <div className="text-center py-8">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                <p className="mt-2 text-gray-500">読み込み中...</p>
              </div>
            ) : (
              <>
                {/* 統計サマリー */}
                <div className="grid grid-cols-4 gap-3 mb-6">
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-green-700">{stats.present}</div>
                    <div className="text-xs text-green-600 mt-1">出席</div>
                  </div>
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-red-700">{stats.absent}</div>
                    <div className="text-xs text-red-600 mt-1">欠席</div>
                  </div>
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-yellow-700">{stats.other}</div>
                    <div className="text-xs text-yellow-600 mt-1">その他</div>
                  </div>
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-gray-700">{stats.pending}</div>
                    <div className="text-xs text-gray-600 mt-1">未回答</div>
                  </div>
                </div>

                {/* 詳細リスト */}
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">名前</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ステータス</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">備考</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {attendances.map((attendance) => (
                        <tr key={attendance.id}>
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">
                            {attendance.user?.name || '不明'}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {attendance.status === 'present' && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                出席
                              </span>
                            )}
                            {attendance.status === 'absent' && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                欠席
                              </span>
                            )}
                            {attendance.status === 'other' && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                その他
                              </span>
                            )}
                            {!attendance.status && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                未回答
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {attendance.note || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          {/* フッター */}
          <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse gap-3">
            <Link
              href={`/teams/${teamId}?tab=attendance`}
              className="w-full inline-flex justify-center items-center gap-2 rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:w-auto sm:text-sm"
            >
              <ClipboardDocumentCheckIcon className="h-4 w-4" />
              出欠を変更する
            </Link>
            <button
              type="button"
              className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:mt-0 sm:w-auto sm:text-sm"
              onClick={onClose}
            >
              閉じる
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// 練習記録の詳細表示
function PracticeDetails({ 
  practiceId, 
  place, 
  practiceLogUpdateKey,
  onEdit, 
  onDelete,
  onAddPracticeLog,
  onEditPracticeLog,
  onDeletePracticeLog,
  isTeamPractice = false,
  teamId,
  teamName,
  onShowAttendance
}: { 
  practiceId: string
  place?: string
  practiceLogUpdateKey?: string
  onEdit?: () => void
  onDelete?: () => void
  onAddPracticeLog?: (practiceId: string) => void
  onEditPracticeLog?: (log: PracticeLogWithTimes & { tags?: PracticeTag[] }) => void
  onDeletePracticeLog?: (logId: string) => void
  isTeamPractice?: boolean
  teamId?: string | null
  teamName?: string | undefined
  onShowAttendance?: () => void
}) {
  type FormattedPracticeLog = {
    id: string
    practiceId: string
    style: string
    swim_category?: 'Swim' | 'Pull' | 'Kick'
    repCount: number
    setCount: number
    distance: number
    circle: number | null
    note: string | null
    tags: PracticeTag[]
    times: Array<{
      id: string
      time: number
      repNumber: number
      setNumber: number
    }>
  }
  type PracticeWithFormattedLogs = Omit<Practice, 'practiceLogs' | 'practice_logs'> & {
    practiceLogs: FormattedPracticeLog[]
  }
  const { supabase } = useAuth()
  const [practice, setPractice] = useState<PracticeWithFormattedLogs | null>(null)
  const [practiceImages, setPracticeImages] = useState<GalleryImage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [showShareModal, setShowShareModal] = useState(false)
  const [sharePracticeData, setSharePracticeData] = useState<PracticeShareData | null>(null)

  useEffect(() => {
    const loadPractice = async () => {
      try {
        setLoading(true)
        const { data, error } = await supabase
          .from('practices')
          .select(`
            *,
            practice_logs (
              *,
              practice_times (*),
              practice_log_tags (
                practice_tag:practice_tags (*)
              )
            ),
            practice_images (
              id,
              original_path,
              thumbnail_path,
              file_name,
              display_order
            )
          `)
          .eq('id', practiceId)
          .single()

        if (error) throw error
        if (!data) throw new Error('Practice data not found')
        
        // データ整形（camelCase構造に変換）
        type PracticeLogFromDB = {
          id: string
          practice_id: string
          style: string
          swim_category?: 'Swim' | 'Pull' | 'Kick'
          rep_count: number
          set_count: number
          distance: number
          circle: number | null
          note: string | null
          practice_log_tags?: Array<{ practice_tag: PracticeTag }>
          practice_times?: PracticeTime[]
        }
        type PracticeImageFromDB = {
          id: string
          original_path: string
          thumbnail_path: string
          file_name: string
          display_order: number
        }
        type PracticeFromDB = Practice & {
          practice_logs?: PracticeLogFromDB[]
          practice_images?: PracticeImageFromDB[]
        }
        const practiceData = data as PracticeFromDB
        const formattedPractice: PracticeWithFormattedLogs = {
          ...practiceData,
          practiceLogs: (practiceData.practice_logs || []).map((log: PracticeLogFromDB): FormattedPracticeLog => ({
            id: log.id,
            practiceId: log.practice_id,
            style: log.style,
            swim_category: log.swim_category,
            repCount: log.rep_count,
            setCount: log.set_count,
            distance: log.distance,
            circle: log.circle,
            note: log.note,
            tags: log.practice_log_tags?.map((plt: { practice_tag: PracticeTag }) => plt.practice_tag) || [],
            times: log.practice_times?.map((time: PracticeTime) => ({
              id: time.id,
              time: time.time,
              repNumber: time.rep_number,
              setNumber: time.set_number
            })) || []
          }))
        }
        
        // 画像データを変換
        const images: GalleryImage[] = (practiceData.practice_images || [])
          .sort((a, b) => a.display_order - b.display_order)
          .map((img: PracticeImageFromDB) => ({
            id: img.id,
            thumbnailUrl: supabase.storage.from('practice-images').getPublicUrl(img.thumbnail_path).data.publicUrl,
            originalUrl: supabase.storage.from('practice-images').getPublicUrl(img.original_path).data.publicUrl,
            fileName: img.file_name
          }))
        
        setPractice(formattedPractice)
        setPracticeImages(images)
      } catch (err) {
        console.error('練習詳細の取得エラー:', err)
        setError(err as Error)
      } finally {
        setLoading(false)
      }
    }

    loadPractice()
  }, [practiceId, supabase, practiceLogUpdateKey])

  if (loading) {
    return (
      <div className="mt-3 text-sm text-gray-500">練習詳細を読み込み中...</div>
    )
  }
  if (error) {
    return (
      <div className="mt-3 text-sm text-red-600">練習詳細の取得に失敗しました</div>
    )
  }

  if (!practice) {
    return null
  }

  const practiceLogs = practice.practiceLogs || []

  // 種目の選択肢（コード値からラベルに変換するため）
  const SWIM_STYLES = [
    { value: 'Fr', label: '自由形' },
    { value: 'Ba', label: '背泳ぎ' },
    { value: 'Br', label: '平泳ぎ' },
    { value: 'Fly', label: 'バタフライ' },
    { value: 'IM', label: '個人メドレー' }
  ]

  // コード値をラベルに変換する関数
  const getStyleLabel = (styleValue: string): string => {
    const style = SWIM_STYLES.find(s => s.value === styleValue)
    if (style) return style.label
    // 既にラベルの場合はそのまま返す
    if (SWIM_STYLES.some(s => s.label === styleValue)) return styleValue
    return styleValue
  }

  // 色の明度に基づいてテキスト色を決定する関数
  const getTextColor = (backgroundColor: string) => {
    // 16進数カラーをRGBに変換
    const hex = backgroundColor.replace('#', '')
    const r = parseInt(hex.substr(0, 2), 16)
    const g = parseInt(hex.substr(2, 2), 16)
    const b = parseInt(hex.substr(4, 2), 16)
    
    // 明度を計算（0-255）
    const brightness = (r * 299 + g * 587 + b * 114) / 1000
    
    // 明度が128より高い場合は黒、低い場合は白
    return brightness > 128 ? '#000000' : '#FFFFFF'
  }

  // 平均タイムを計算する関数
  type TimeEntry = {
    id: string
    time: number
    repNumber: number
    setNumber: number
  }
  const calculateAverageTime = (times: TimeEntry[]) => {
    const validTimes = times.filter(t => t.time > 0)
    if (validTimes.length === 0) return 0
    return validTimes.reduce((sum, t) => sum + t.time, 0) / validTimes.length
  }

  // セットごとの平均タイムを計算する関数
  const _calculateSetAverageTime = (times: TimeEntry[], setNumber: number) => {
    const setTimes = times.filter(t => t.setNumber === setNumber)
    return calculateAverageTime(setTimes)
  }

  return (
    <div className="mt-3">
      {/* Practice全体の枠 */}
      <div className="bg-green-50 rounded-xl p-3" data-testid="practice-detail-modal">
        {/* Practice全体のヘッダー */}
        <div className="flex items-start justify-between">
          <div className="flex-1">
                <div
                  className="flex items-center gap-2 mb-2"
                  data-testid="practice-log-summary"
                  
                >
              <span className={`text-lg font-semibold px-3 py-1 rounded-lg flex items-center gap-2 ${
                isTeamPractice 
                  ? 'text-emerald-800 bg-emerald-200' 
                  : 'text-green-800 bg-green-200'
              }`}>
                <BoltIcon className="h-5 w-5" />
                練習記録
                {isTeamPractice && teamName && <span className="text-sm">({teamName})</span>}
              </span>
              {isTeamPractice && teamId && onShowAttendance && (
                <AttendanceButton onClick={onShowAttendance} />
              )}
            </div>
            {place && (
              <p className="text-sm text-gray-700 mb-2 flex items-center gap-1">
                <span className="text-gray-500">📍</span>
                {place}
              </p>
            )}
          </div>
          <div className="flex items-center space-x-2 ml-4">
            <button
              onClick={onEdit}
              className="p-2 text-gray-500 hover:text-green-600 rounded-lg hover:bg-green-100 transition-colors"
              title="練習記録を編集"
              data-testid="edit-practice-button"
            >
              <PencilIcon className="h-5 w-5" />
            </button>
            <button
              onClick={onDelete}
              className="p-2 text-gray-500 hover:text-red-600 rounded-lg hover:bg-red-100 transition-colors"
              title="練習記録を削除"
              data-testid="delete-practice-button"
            >
              <TrashIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Practice_logsのコンテナ */}
        <div className="space-y-3">
          {/* PracticeLogsがない場合 */}
          {practiceLogs.length === 0 && (
            <div className="bg-white border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
              <button
                onClick={() => onAddPracticeLog?.(practiceId)}
                className="inline-flex items-center px-4 py-2 border border-green-300 rounded-lg shadow-sm text-sm font-medium text-green-700 bg-white hover:bg-green-50 hover:border-green-400 focus:outline-none focus:ring-2 focus:ring-green-500 transition-colors"
                data-testid="add-practice-log-button"
              >
                <span className="mr-2">➕</span>
                練習メニューを追加
              </button>
            </div>
          )}

          {/* PracticeLogsがある場合の表示 */}
          {practiceLogs.map((log, index: number) => {
            type FormattedLog = {
              id: string
              practiceId: string
              style: string
              swim_category?: 'Swim' | 'Pull' | 'Kick'
              repCount: number
              setCount: number
              distance: number
              circle: number | null
              note: string | null
              tags: PracticeTag[]
              times: Array<{
                id: string
                time: number
                repNumber: number
                setNumber: number
              }>
              created_at?: string
              updated_at?: string
            }
            const formattedLog = log as unknown as FormattedLog
            const allTimes = formattedLog.times || []
        
            return (
              <div
                key={formattedLog.id}
                className="bg-green-50 rounded-lg p-4"
                data-testid={`practice-log-item-${index + 1}`}
              >
                {/* 練習メニューのヘッダー */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    {formattedLog.tags && Array.isArray(formattedLog.tags) && formattedLog.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {formattedLog.tags.map((tag: PracticeTag) => (
                          <span
                            key={tag.id}
                            className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full"
                            style={{ 
                              backgroundColor: tag.color,
                              color: getTextColor(tag.color)
                            }}
                            data-testid={`selected-tag-${tag.id}`}
                          >
                            {tag.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
            
                {/* 練習内容: 距離 × 本数 × セット数 サークル 泳法 */}
                <div className="bg-white rounded-lg p-3 mb-3 border border-green-300 relative">
                  {/* 編集・削除ボタン（右上） */}
                  {/* シェア・編集・削除ボタン（右上） */}
                  <div className="absolute top-3 right-3 flex items-center space-x-2">
                    <button
                      onClick={() => {
                        // この日の全メニューをシェアデータに変換
                        const menuItems: PracticeMenuItem[] = practiceLogs.map(log => ({
                          style: log.style,
                          category: log.swim_category || 'Swim',
                          distance: log.distance,
                          repCount: log.repCount,
                          setCount: log.setCount,
                          circle: log.circle ?? undefined,
                          times: log.times?.map(t => ({
                            setNumber: t.setNumber,
                            repNumber: t.repNumber,
                            time: t.time
                          })),
                          note: log.note ?? undefined
                        }))

                        const totalDistance = practiceLogs.reduce((sum, log) =>
                          sum + (log.distance * log.repCount * log.setCount), 0)

                        const totalSets = practiceLogs.reduce((sum, log) =>
                          sum + (log.setCount || 0), 0)

                        // 日付を安全にパースしてフォーマット
                        const parsedDate = practice.date ? parseISO(practice.date) : null
                        const formattedDate = parsedDate && isValid(parsedDate)
                          ? format(parsedDate, 'yyyy年M月d日（E）', { locale: ja })
                          : ''

                        setSharePracticeData({
                          date: formattedDate,
                          title: practice.note || '練習',
                          place: place ?? undefined,
                          menuItems,
                          totalDistance,
                          totalSets,
                          userName: '',
                          teamName: teamName
                        })
                        setShowShareModal(true)
                      }}
                      className="p-2 text-gray-500 hover:text-cyan-600 rounded-lg hover:bg-cyan-100 transition-colors"
                      title="練習をシェア"
                      data-testid="share-practice-log-button"
                    >
                      <ShareIcon className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => {
                        // 編集に必要な情報を保持したまま渡す
                        // styleの値をコード値に変換（ラベルの場合はコード値に変換）
                        const styleValue = formattedLog.style
                        // ラベルの場合はコード値に変換
                        const styleCode = SWIM_STYLES.find(s => s.label === styleValue)?.value ||
                                         SWIM_STYLES.find(s => s.value === styleValue)?.value ||
                                         styleValue || 'Fr'

                        const formData = {
                          id: formattedLog.id,
                          user_id: practice.user_id,
                          practice_id: formattedLog.practiceId,
                          style: styleCode,
                          swim_category: formattedLog.swim_category || 'Swim',
                          rep_count: formattedLog.repCount,
                          set_count: formattedLog.setCount,
                          distance: formattedLog.distance,
                          circle: formattedLog.circle,
                          note: formattedLog.note,
                          // タグを保持
                          tags: formattedLog.tags || [],
                          // times形式に変換
                          times: [{
                            memberId: '',
                            times: formattedLog.times || []
                          }],
                          // ログ側の created_at/updated_at を優先（親 practice の値で上書きしない）
                          created_at: formattedLog.created_at,
                          updated_at: formattedLog.updated_at
                        } as unknown as PracticeLogWithTimes & { tags?: PracticeTag[] }
                        onEditPracticeLog?.(formData)
                      }}
                      className="p-2 text-gray-500 hover:text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                      title="練習メニューを編集"
                      data-testid="edit-practice-log-button"
                    >
                      <PencilIcon className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => onDeletePracticeLog?.(formattedLog.id)}
                      className="p-2 text-gray-500 hover:text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                      title="練習メニューを削除"
                      data-testid="delete-practice-log-button"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="text-xs font-medium text-gray-500 mb-1">練習内容</div>
                    <div className="text-sm text-gray-800">
                      <span className="text-lg font-semibold text-green-700">{formattedLog.distance}</span>m ×{' '}
                      <span className="text-lg font-semibold text-green-700">{formattedLog.repCount}</span>
                      {formattedLog.setCount > 1 && (
                        <>
                          {' × '}
                          <span className="text-lg font-semibold text-green-700">{formattedLog.setCount}</span>
                        </>
                      )}
                      {'　　'}
                      <span className="text-lg font-semibold text-green-700">
                        {formattedLog.circle ? `${Math.floor(formattedLog.circle / 60)}'${Math.floor(formattedLog.circle % 60).toString().padStart(2, '0')}"` : '-'}
                      </span>
                      {'　'}
                      <span className="text-lg font-semibold text-green-700">{getStyleLabel(formattedLog.style)}</span>
                      {formattedLog.swim_category && formattedLog.swim_category !== 'Swim' && (
                        <>
                          {'　'}
                          <span className="text-lg font-semibold text-green-700">
                            {formattedLog.swim_category}
                          </span>
                        </>
                      )}
                    </div>
                </div>

            {/* タイム表示 */}
            {allTimes.length > 0 && (
              <div className="mt-3">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-1 h-4 bg-green-500 rounded-full"></div>
                  <p className="text-sm font-medium text-green-700">タイム</p>
                </div>
                <div className="bg-white rounded-lg p-3 border border-green-300 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-green-300">
                        <th className="text-left py-2 px-2 font-medium text-green-800"></th>
                        {Array.from({ length: formattedLog.setCount }, (_, setIndex) => (
                          <th key={setIndex + 1} className="text-center py-2 px-2 font-medium text-green-800">
                            {setIndex + 1}セット目
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: formattedLog.repCount }, (_, repIndex) => {
                        const repNumber = repIndex + 1
                        return (
                          <tr key={repNumber} className="border-b border-green-100">
                            <td className="py-2 px-2 font-medium text-gray-700">{repNumber}本目</td>
                            {Array.from({ length: formattedLog.setCount }, (_, setIndex) => {
                              const setNumber = setIndex + 1
                              const time = allTimes.find((t) => t.setNumber === setNumber && t.repNumber === repNumber)
                              const setTimes = allTimes.filter((t) => t.setNumber === setNumber && t.time > 0)
                              const setFastest = setTimes.length > 0 ? Math.min(...setTimes.map((t) => t.time)) : 0
                              const isFastest = time && time.time > 0 && time.time === setFastest
                              
                              return (
                                <td key={setNumber} className="py-2 px-2 text-center">
                                  <span className={isFastest ? "text-blue-600 font-bold" : "text-gray-800"}>
                                    {time && time.time > 0 ? formatTime(time.time) : '-'}
                                  </span>
                                </td>
                              )
                            })}
                          </tr>
                        )
                      })}
                      {/* 平均行 */}
                      <tr className="border-b border-green-100 bg-green-50">
                        <td className="py-2 px-2 font-medium text-green-800">セット平均</td>
                        {Array.from({ length: formattedLog.setCount }, (_, setIndex) => {
                          const setNumber = setIndex + 1
                          const setTimes = allTimes.filter((t) => t.setNumber === setNumber && t.time > 0)
                          const average = setTimes.length > 0 
                            ? setTimes.reduce((sum, t) => sum + t.time, 0) / setTimes.length 
                            : 0
                          return (
                            <td key={setNumber} className="py-2 px-2 text-center">
                              <span className="text-green-800 font-medium">
                                {average > 0 ? formatTime(average) : '-'}
                              </span>
                            </td>
                          )
                        })}
                      </tr>
                      {/* 全体平均行 */}
                      <tr className="border-t-2 border-green-300 bg-blue-50">
                        <td className="py-2 px-2 font-medium text-blue-800">全体平均</td>
                        <td className="py-2 px-2 text-center" colSpan={formattedLog.setCount}>
                          <span className="text-blue-800 font-bold">
                            {(() => {
                              const allValidTimes = allTimes.filter((t) => t.time > 0)
                              const overallAverage = allValidTimes.length > 0 
                                ? allValidTimes.reduce((sum, t) => sum + t.time, 0) / allValidTimes.length 
                                : 0
                              return overallAverage > 0 ? formatTime(overallAverage) : '-'
                            })()}
                          </span>
                        </td>
                      </tr>
                      {/* 全体最速行 */}
                      <tr className="bg-blue-50">
                        <td className="py-2 px-2 font-medium text-blue-800">全体最速</td>
                        <td className="py-2 px-2 text-center" colSpan={formattedLog.setCount}>
                          <span className="text-blue-800 font-bold">
                            {(() => {
                              const allValidTimes = allTimes.filter((t) => t.time > 0)
                              const overallFastest = allValidTimes.length > 0 
                                ? Math.min(...allValidTimes.map((t) => t.time))
                                : 0
                              return overallFastest > 0 ? formatTime(overallFastest) : '-'
                            })()}
                          </span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* メモ */}
            {formattedLog.note && (
              <div className="rounded-lg p-3 mb-1 border border-slate-200">
                <div className="text-xs font-medium text-gray-500 mb-1">メモ</div>
                <div className="text-sm text-gray-700">
                  {formattedLog.note}
                </div>
              </div>
            )}
              </div>
            )
          })}
        </div>
        
        {/* 添付画像 */}
        {practiceImages.length > 0 && (
          <div className="mt-4 pt-4 border-t border-green-200">
            <ImageGallery images={practiceImages} />
          </div>
        )}
      </div>

      {/* シェアカードモーダル */}
      {showShareModal && sharePracticeData && (
        <ShareCardModal
          isOpen={showShareModal}
          onClose={() => {
            setShowShareModal(false)
            setSharePracticeData(null)
          }}
          type="practice"
          data={sharePracticeData}
        />
      )}
    </div>
  )
}


// 大会記録のスプリットタイム一覧
function RecordSplitTimes({ recordId, raceDistance }: { recordId: string; raceDistance?: number }) {
  const { supabase } = useAuth()
  const [splits, setSplits] = useState<SplitTime[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    const loadSplits = async () => {
      try {
        setLoading(true)
        const { data, error } = await supabase
          .from('split_times')
          .select('*')
          .eq('record_id', recordId)
          .order('distance', { ascending: true })

        if (error) throw error
        
        setSplits(data || [])
      } catch (err) {
        console.error('スプリットタイムの取得エラー:', err)
        setError(err as Error)
      } finally {
        setLoading(false)
      }
    }

    loadSplits()
  }, [recordId, supabase])

  if (loading) {
    return (
      <div className="mt-3 text-sm text-gray-500">スプリットを読み込み中...</div>
    )
  }
  if (error) {
    return (
      <div className="mt-3 text-sm text-red-600">スプリットの取得に失敗しました</div>
    )
  }

  if (!splits.length) {
    return null
  }

  return (
    <div className="mt-3">
      {/* 距離別Lap表示 */}
      {splits.length > 0 && (
        <LapTimeDisplay
          splitTimes={splits.map(st => ({
            distance: st.distance,
            splitTime: st.split_time
          }))}
          raceDistance={raceDistance}
        />
      )}
    </div>
  )
}

// CompetitionDetails: 大会情報とそれに紐づくRecordを表示
function CompetitionDetails({
  competitionId,
  competitionName,
  place,
  poolType,
  note,
  records = [],
  onEdit,
  onDelete,
  onAddRecord,
  onEditRecord,
  onDeleteRecord,
  onClose,
  isTeamCompetition = false,
  teamId,
  teamName,
  onShowAttendance
}: {
  competitionId: string
  competitionName?: string
  place?: string
  poolType?: number
  note?: string
  records?: CalendarItem[]
  onEdit?: () => void
  onDelete?: () => void
  onAddRecord?: (params: { competitionId?: string; entryData?: { styleId: number; styleName: string } }) => void
  onEditRecord?: (record: Record) => void
  onDeleteRecord?: (recordId: string) => void
  onClose?: () => void
  isTeamCompetition?: boolean
  teamId?: string | null
  teamName?: string | undefined
  onShowAttendance?: () => void
}) {
  const { supabase, user } = useAuth()
  const [actualRecords, setActualRecords] = useState<CalendarItem[]>([])
  const [competitionImages, setCompetitionImages] = useState<GalleryImage[]>([])
  const [loading, setLoading] = useState(true)
  const [showShareModal, setShowShareModal] = useState(false)
  const [shareRecordData, setShareRecordData] = useState<CompetitionShareData | null>(null)

  useEffect(() => {
    const loadRecords = async () => {
      try {
        setLoading(true)
        let recordQuery = supabase
          .from('records')
          .select(`
              *,
              style:styles(*),
              competition:competitions(*),
              split_times(*)
            `)
          .eq('competition_id', competitionId)

        // チーム大会の場合は自分の記録だけを表示
        if (isTeamCompetition && user?.id) {
          recordQuery = recordQuery.eq('user_id', user.id)
        }

        const imagesQuery = supabase
          .from('competition_images')
          .select('id, original_path, thumbnail_path, file_name, display_order')
          .eq('competition_id', competitionId)
          .order('display_order')

        const [{ data, error }, { data: imageData, error: imageError }] = await Promise.all([
          recordQuery,
          imagesQuery
        ])

        if (error) throw error
        if (imageError) throw imageError

        // calendar_view形式に変換
        type RecordFromDB = {
          id: string
          competition_id: string | null
          style_id: number
          time: number
          video_url: string | null
          note: string | null
          is_relaying: boolean
          reaction_time?: number | null
          competition?: {
            id: string
            title: string
            date: string
            place: string | null
            pool_type: number
          } | null
          style?: {
            id: number
            name_jp: string
            distance: number
          } | null
          split_times?: Array<{
            id: string
            record_id: string
            distance: number
            split_time: number
            created_at: string
          }>
        }
        const formattedRecords = ((data || []) as RecordFromDB[]).map((record): CalendarItem => ({
          id: record.id,
          type: 'record' as const,
          date: record.competition?.date || '',
          title: record.competition?.title || '',
          place: record.competition?.place || '',
          note: record.note || undefined,
          metadata: {
            record: {
              time: record.time,
              is_relaying: record.is_relaying,
              video_url: record.video_url || undefined,
              reaction_time: record.reaction_time ?? null,
              style: record.style ? {
                id: record.style.id.toString(),
                name_jp: record.style.name_jp,
                distance: record.style.distance
              } : {
                id: record.style_id.toString(),
                name_jp: '',
                distance: 0
              },
              competition_id: record.competition_id || undefined,
              split_times: record.split_times || []
            },
            competition: record.competition || undefined,
            style: record.style || undefined,
            pool_type: record.competition?.pool_type || 0
          }
        }))

        setActualRecords(formattedRecords)

        // 画像データを変換
        type CompetitionImageFromDB = {
          id: string
          original_path: string
          thumbnail_path: string
          file_name: string
          display_order: number
        }
        const images: GalleryImage[] = ((imageData || []) as CompetitionImageFromDB[])
          .sort((a, b) => a.display_order - b.display_order)
          .map((img: CompetitionImageFromDB) => ({
            id: img.id,
            thumbnailUrl: supabase.storage.from('competition-images').getPublicUrl(img.thumbnail_path).data.publicUrl,
            originalUrl: supabase.storage.from('competition-images').getPublicUrl(img.original_path).data.publicUrl,
            fileName: img.file_name
          }))
        setCompetitionImages(images)
      } catch (err) {
        console.error('記録の取得エラー:', err)
        setActualRecords([])
        setCompetitionImages([])
      } finally {
        setLoading(false)
      }
    }

    loadRecords()
  }, [competitionId, supabase, isTeamCompetition, user?.id])

  const _getPoolTypeText = (poolType: number) => {
    return poolType === 1 ? '長水路(50m)' : '短水路(25m)'
  }

  return (
    <div className="mt-3">
      {/* Competition全体の枠 */}
      <div className="bg-blue-50 rounded-xl p-3" data-testid="record-detail-modal">
        {/* Competition全体のヘッダー */}
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-lg font-semibold px-3 py-1 rounded-lg flex items-center gap-2 ${
                isTeamCompetition 
                  ? 'text-violet-800 bg-violet-200' 
                  : 'text-blue-800 bg-blue-200'
              }`} data-testid="competition-title-display">
                <TrophyIcon className="h-5 w-5" />
                {competitionName || '大会'}
                {isTeamCompetition && teamName && <span className="text-sm">({teamName})</span>}
              </span>
              {isTeamCompetition && teamId && onShowAttendance && (
                <AttendanceButton onClick={onShowAttendance} />
              )}
            </div>
            {(place || poolType != null) && (
              <div className="text-sm text-gray-700 mb-2 flex flex-wrap items-center gap-3">
                {place && (
                  <span className="flex items-center gap-1" data-testid="competition-place-display">
                    <span className="text-gray-500">📍</span>
                    {place}
                  </span>
                )}
                {poolType != null && (
                  <span className="flex items-center gap-1">
                    <span className="text-gray-500">🏊‍♀️</span>
                    {_getPoolTypeText(poolType)}
                  </span>
                )}
              </div>
            )}
            {note && (
              <p className="text-sm text-gray-600 mt-2">
                💭 {note}
              </p>
            )}
          </div>
          <div className="flex items-center space-x-2 ml-4">
            <button
              onClick={onEdit}
              className="p-2 text-gray-500 hover:text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
              title="大会情報を編集"
              data-testid="edit-competition-button"
            >
              <PencilIcon className="h-5 w-5" />
            </button>
            <button
              onClick={onDelete}
              className="p-2 text-gray-500 hover:text-red-600 rounded-lg hover:bg-red-100 transition-colors"
              title="大会を削除"
              data-testid="delete-competition-button"
            >
              <TrashIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Recordsのコンテナ */}
        <div className="space-y-3">
          {/* Loading状態 */}
          {loading && (
            <div className="bg-white border-2 border-dashed border-blue-300 rounded-lg p-6 text-center">
              <div className="text-gray-500">
                <span className="text-2xl">⏳</span>
                <p className="text-sm mt-2">記録を読み込み中...</p>
              </div>
            </div>
          )}

          {/* Recordsがない場合 */}
          {!loading && actualRecords.length === 0 && (
            <div className="bg-white border-2 border-dashed border-blue-300 rounded-lg p-6 text-center">
              <button
                onClick={() => {
                  onAddRecord?.({ competitionId })
                  onClose?.()
                }}
                className="inline-flex items-center px-4 py-2 border border-blue-300 rounded-lg shadow-sm text-sm font-medium text-blue-700 bg-white hover:bg-blue-50 hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
              >
                <span className="mr-2">➕</span>
                大会記録を追加
              </button>
            </div>
          )}

          {/* Recordsがある場合の表示 */}
          {!loading && actualRecords.map((record, _index: number) => {
            const openRecordEditor = async () => {
              const { data: fullRecord } = await supabase
                .from('records')
                .select(`
                  id,
                  style_id,
                  time,
                  video_url,
                  note,
                  is_relaying,
                  reaction_time,
                  competition_id,
                  split_times (*)
                `)
                .eq('id', record.id)
                .single()

              type FullRecord = {
                id: string
                style_id: number
                time: number
                is_relaying: boolean
                note: string | null
                video_url: string | null
                reaction_time?: number | null
                competition_id: string
                split_times: SplitTime[]
              }
              if (fullRecord) {
                const recordData = fullRecord as FullRecord
                const editData: Record = {
                  id: recordData.id,
                  user_id: '',
                  competition_id: recordData.competition_id,
                  style_id: recordData.style_id,
                  time: recordData.time,
                  video_url: recordData.video_url,
                  note: recordData.note,
                  is_relaying: recordData.is_relaying,
                  reaction_time: recordData.reaction_time ?? null,
                  created_at: '',
                  updated_at: '',
                  pool_type: ((record.metadata as { pool_type?: number } | undefined)?.pool_type ?? 0) as PoolType,
                  split_times: recordData.split_times || []
                }
                onEditRecord?.(editData)
              }
              onClose?.()
            }

            return (
              <div key={record.id} className="bg-blue-50 rounded-lg p-4">
                {/* 記録内容 */}
                <div className="bg-white rounded-lg p-3 mb-3 border border-blue-300 relative">
                  {/* シェア・編集・削除ボタン（右上） */}
                  <div className="absolute top-1 right-3 flex flex-col items-end gap-1">
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => {
                          const competition = record.metadata?.competition
                          const recordData = record.metadata?.record
                          const style = record.metadata?.style || recordData?.style
                          setShareRecordData({
                            competitionName: competitionName || competition?.title || '大会',
                            date: competition?.date
                              ? format(new Date(competition.date), 'yyyy年M月d日', { locale: ja })
                              : record.date
                              ? format(new Date(record.date), 'yyyy年M月d日', { locale: ja })
                              : '',
                            place: place || competition?.place || '',
                            poolType: (poolType ?? competition?.pool_type) === 1 ? 'long' : 'short',
                            eventName: style?.name_jp || '',
                            raceDistance: style?.distance || 0,
                            time: recordData?.time || 0,
                            reactionTime: recordData?.reaction_time ?? undefined,
                            splitTimes: recordData?.split_times,
                            isBestTime: false,
                            userName: '',
                            teamName: teamName,
                          })
                          setShowShareModal(true)
                        }}
                        className="p-2 text-gray-500 hover:text-cyan-600 rounded-lg hover:bg-cyan-100 transition-colors"
                        title="記録をシェア"
                        data-testid="share-record-button"
                      >
                        <ShareIcon className="h-4 w-4" />
                      </button>
                      <button
                        onClick={openRecordEditor}
                        className="p-2 text-gray-500 hover:text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                        title="記録を編集"
                        data-testid="edit-record-button"
                      >
                        <PencilIcon className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => onDeleteRecord?.(record.id)}
                        className="p-2 text-gray-500 hover:text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                        title="記録を削除"
                        data-testid="delete-record-button"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                    {record.metadata?.record?.reaction_time != null && typeof record.metadata?.record?.reaction_time === 'number' && (
                      <span className="text-s text-gray-600 font-normal whitespace-nowrap" data-testid="record-reaction-time-display">
                        ( RT {record.metadata.record.reaction_time.toFixed(2)} )
                      </span>
                    )}
                  </div>
                  {/* 2行×2列の表構造（罫線なし、すべて左寄せ） */}
                  <div className="grid grid-cols-[auto_1fr] gap-x-20 gap-y-1 items-end">
                    {/* 1行目：カラム名 */}
                    <div className="text-xs font-medium text-gray-500 py-0 leading-tight self-start">種目</div>
                    <div className="text-xs font-medium text-gray-500 py-0 leading-tight self-start">タイム</div>
                    
                    {/* 2行目：データ */}
                    <div className="text-xl font-bold text-blue-700 whitespace-nowrap">
                      {record.metadata?.style?.name_jp || record.metadata?.record?.style?.name_jp || record.title}
                      {record.metadata?.record?.is_relaying && <span className="font-bold text-red-600 ml-2">R</span>}
                    </div>
                    {record.metadata?.record?.time ? (
                      <div className="flex items-end gap-4">
                        <div className="relative text-2xl font-bold text-blue-700" data-testid="record-time-display">
                          <span className="inline-block">{formatTime(record.metadata.record.time)}</span>
                        </div>
                        <BestTimeBadge
                          recordId={record.id}
                          styleId={(() => {
                            const id = record.metadata?.style?.id || record.metadata?.record?.style?.id
                            return typeof id === 'number' ? id : undefined
                          })()}
                          currentTime={record.metadata.record.time}
                          recordDate={record.metadata?.competition?.date}
                          poolType={record.metadata?.competition?.pool_type ?? record.metadata?.pool_type}
                          isRelaying={record.metadata?.record?.is_relaying}
                        />
                      </div>
                    ) : (
                      <div></div>
                    )}
                  </div>
                </div>

                {/* スプリットタイム */}
                <RecordSplitTimes 
                  recordId={record.id}
                  raceDistance={record.metadata?.style?.distance || record.metadata?.record?.style?.distance}
                />

                {/* メモ */}
                {(record.note) && (
                  <div className=" rounded-lg p-3 mb-1 border border-slate-200 mt-2">
                    <div className="text-xs font-medium text-gray-500 mb-1">メモ</div>
                    <div className="text-sm text-gray-700">
                      {record.note}
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          {/* 「大会記録を追加」ボタン（Recordsがある場合でも表示） */}
          {records.length > 0 && (
            <div className="text-center pt-2">
              <button
                onClick={() => {
                  onAddRecord?.({ competitionId })
                  onClose?.()
                }}
                className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 rounded transition-colors"
              >
                <span className="mr-1">➕</span>
                大会記録を追加
              </button>
            </div>
          )}
        </div>

        {/* 添付画像 */}
        {competitionImages.length > 0 && (
          <div className="mt-4 pt-4 border-t border-blue-200">
            <ImageGallery images={competitionImages} />
          </div>
        )}
      </div>

      {/* シェアカードモーダル */}
      {showShareModal && shareRecordData && (
        <ShareCardModal
          isOpen={showShareModal}
          onClose={() => {
            setShowShareModal(false)
            setShareRecordData(null)
          }}
          type="competition"
          data={shareRecordData}
        />
      )}
    </div>
  )
}

// CompetitionWithEntry: エントリー情報付きの大会を表示（パターン2）
type CompetitionEntryDisplay = {
  id: string
  styleId: number
  styleName: string
  entryTime?: number | null
  note?: string | null
}

function CompetitionWithEntry({
  entryId: _entryId,
  competitionId,
  competitionName,
  place,
  note,
  styleId,
  styleName,
  entryTime,
  isTeamCompetition = false,
  deletedEntryIds,
  onAddRecord,
  onEditCompetition,
  onDeleteCompetition,
  onEditEntry,
  onDeleteEntry,
  onClose
}: {
  entryId: string
  competitionId: string
  competitionName: string
  place?: string
  note?: string
  styleId?: number
  styleName: string
  entryTime?: number | null
  isTeamCompetition?: boolean
  deletedEntryIds?: string[]
  onAddRecord?: (params: { competitionId?: string; entryData?: { styleId: number; styleName: string }; entryDataList?: EntryInfo[] }) => void
  onEditCompetition?: () => void
  onDeleteCompetition?: () => void
  onEditEntry?: () => void
  onDeleteEntry?: (entryId: string) => void
  onClose?: () => void
}) {
  const router = useRouter()
  const { supabase } = useAuth()
  const entryApi = useMemo(() => new EntryAPI(supabase), [supabase])
  const [competitionImages, setCompetitionImages] = useState<GalleryImage[]>([])
  const [entries, setEntries] = useState<CompetitionEntryDisplay[]>(() => {
    if (styleId && styleName) {
      return [
        {
          id: _entryId,
          styleId,
          styleName,
          entryTime,
          note
        }
      ]
    }
    return []
  })
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)
  const [entryStatus, setEntryStatus] = useState<'before' | 'open' | 'closed' | null>(null)

  useEffect(() => {
    const fetchEntryData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          setLoading(false)
          setAuthError('認証が必要です。ログインしてください。')
          router.replace('/login')
          return
        }

        // 添付画像を取得
        const { data: imageData, error: imageError } = await supabase
          .from('competition_images')
          .select('id, original_path, thumbnail_path, file_name, display_order')
          .eq('competition_id', competitionId)
          .order('display_order')
        if (imageError) throw imageError

        type CompetitionImageFromDB = {
          id: string
          original_path: string
          thumbnail_path: string
          file_name: string
          display_order: number
        }
        const images: GalleryImage[] = ((imageData || []) as CompetitionImageFromDB[])
          .sort((a, b) => a.display_order - b.display_order)
          .map((img: CompetitionImageFromDB) => ({
            id: img.id,
            thumbnailUrl: supabase.storage.from('competition-images').getPublicUrl(img.thumbnail_path).data.publicUrl,
            originalUrl: supabase.storage.from('competition-images').getPublicUrl(img.original_path).data.publicUrl,
            fileName: img.file_name
          }))
        setCompetitionImages(images)

        // competitionのentry_statusを取得
        const { data: competitionData, error: competitionError } = await supabase
          .from('competitions')
          .select('entry_status')
          .eq('id', competitionId)
          .single()

        if (!competitionError && competitionData) {
          setEntryStatus(competitionData.entry_status || 'before')
        }

        // EntryAPIを使用してエントリーを取得
        const allEntries = await entryApi.getEntriesByCompetition(competitionId)
        
        // 現在のユーザーのエントリーのみをフィルタリング
        const userEntries = allEntries.filter(entry => entry.user_id === user.id)

        if (userEntries && userEntries.length > 0) {
          const mapped = userEntries.map((entry) => {
            const style = entry.style
            return {
              id: entry.id,
              styleId: entry.style_id,
              styleName: style?.name_jp || '',
              entryTime: entry.entry_time,
              note: entry.note
            } as CompetitionEntryDisplay
          })
          setEntries(mapped)
        } else if (entries.length === 0 && styleId && styleName) {
          setEntries([
            {
              id: _entryId,
              styleId,
              styleName,
              entryTime,
              note
            }
          ])
        }
      } catch (err) {
        console.error('エントリーデータの取得エラー:', err)
        setCompetitionImages([])
      } finally {
        setLoading(false)
      }
    }

    fetchEntryData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [competitionId, entryApi, deletedEntryIds?.length])

  const entryInfoList: EntryInfo[] = entries.map((entry) => ({
    styleId: entry.styleId,
    styleName: entry.styleName,
    entryTime: entry.entryTime ?? undefined
  }))

  const handleAddRecordClick = () => {
    if (!onAddRecord) return

    if (entryInfoList.length > 0) {
      onAddRecord({
        competitionId,
        entryDataList: entryInfoList
      })
      onClose?.()
    } else {
      onAddRecord({ competitionId })
    }
  }

  const handleEditEntryClick = async () => {
    if (!onEditEntry) return

    // チームcompetitionの場合、entry_statusをチェック
    if (isTeamCompetition) {
      // entry_statusがまだ取得されていない場合は取得
      if (entryStatus === null) {
        try {
          const { data: competitionData, error: competitionError } = await supabase
            .from('competitions')
            .select('entry_status')
            .eq('id', competitionId)
            .single()

          if (!competitionError && competitionData) {
            const status = competitionData.entry_status || 'before'
            setEntryStatus(status)

            // entry_statusが'open'でない場合はalertを表示してrecord入力モーダルに遷移
            if (status !== 'open') {
              const statusLabel = status === 'before' ? '受付前' : '受付終了'
              window.alert(`エントリーは${statusLabel}のため、エントリー登録はできません。記録入力に進みます。`)
              
              // record入力モーダルに遷移
              if (onAddRecord) {
                handleAddRecordClick()
              }
              return
            }
          }
        } catch (err) {
          console.error('エントリーステータスの取得エラー:', err)
        }
      } else if (entryStatus !== 'open') {
        // entry_statusが'open'でない場合はalertを表示してrecord入力モーダルに遷移
        const statusLabel = entryStatus === 'before' ? '受付前' : '受付終了'
        window.alert(`エントリーは${statusLabel}のため、エントリー登録はできません。記録入力に進みます。`)
        
        // record入力モーダルに遷移
        if (onAddRecord) {
          handleAddRecordClick()
        }
        return
      }
    }

    if (entries.length === 0) {
      onEditEntry()
      return
    }

    // 既存のonEditEntryはDayDetailModal内で再度データ取得＆モーダルを開くため、
    // entriesを最新化するためにmetadataへ埋め込んだデータと合わせて渡す
    onEditEntry()
  }

  return (
    <div className="bg-white border border-blue-200 rounded-lg overflow-hidden">
      {/* 大会情報ヘッダー */}
      <div className="bg-blue-50 px-4 py-3 border-b border-blue-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h5 className="font-semibold text-gray-900" data-testid="competition-title-display">{competitionName || '大会'}</h5>
            {isTeamCompetition && (
              <span className="text-xs bg-violet-100 text-violet-700 px-2 py-1 rounded-full">
                チーム
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {onEditCompetition && (
              <button
                onClick={onEditCompetition}
                className="p-1.5 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors"
                title="大会を編集"
                data-testid="edit-competition-button"
              >
                <PencilIcon className="h-5 w-5" />
              </button>
            )}
            {onDeleteCompetition && (
              <button
                onClick={onDeleteCompetition}
                className="p-1.5 text-red-600 hover:bg-red-100 rounded-lg transition-colors"
                title="大会を削除"
                data-testid="delete-competition-button"
              >
                <TrashIcon className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>
        {place && (
          <p className="text-sm text-gray-600 mt-1" data-testid="competition-place-display">📍 {place}</p>
        )}
        {authError && (
          <p className="text-sm text-red-600 mt-2 bg-red-50 border border-red-200 rounded px-3 py-2">
            {authError}
          </p>
        )}
      </div>

      {/* エントリー情報ボックス */}
      <div className="p-4">
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-3" data-testid="entry-section">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">📝</span>
              <h6 className="text-sm font-semibold text-orange-900">エントリー済み（記録未登録）</h6>
            </div>
            <div className="flex items-center gap-1">
              {onEditEntry && (
                <button
                  onClick={handleEditEntryClick}
                  className="p-1 text-blue-600 hover:bg-blue-100 rounded transition-colors"
                  title="エントリーを編集"
                  data-testid="edit-entry-button"
                >
                  <PencilIcon className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
          <div className="space-y-3 text-sm">
            {loading ? (
              <p className="text-gray-500">読み込み中...</p>
            ) : entries.length === 0 ? (
              <p className="text-gray-500">エントリー情報が見つかりません</p>
            ) : (
              entries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex flex-col gap-1 rounded-md border border-orange-200 bg-white/70 px-3 py-2 shadow-sm"
                  data-testid={`entry-summary-${entry.id}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-baseline gap-2">
                        <span className="font-semibold text-orange-900 min-w-[72px]">種目:</span>
                        <span className="text-gray-900 font-medium">{entry.styleName}</span>
                      </div>
                      {entry.entryTime && entry.entryTime > 0 && (
                        <div className="flex items-baseline gap-2">
                          <span className="font-semibold text-orange-900 min-w-[72px]">エントリータイム:</span>
                          <span className="text-gray-900 font-mono font-semibold">
                            {formatTime(entry.entryTime)}
                          </span>
                        </div>
                      )}
                      {entry.note && entry.note.trim().length > 0 && (
                        <div className="flex items-baseline gap-2">
                          <span className="font-semibold text-orange-900 min-w-[72px]">メモ:</span>
                          <span className="text-gray-700">{entry.note}</span>
                        </div>
                      )}
                    </div>
                    {onDeleteEntry && (
                      <button
                        onClick={() => onDeleteEntry(entry.id)}
                        className="p-1 text-red-600 hover:bg-red-100 rounded transition-colors"
                        title="このエントリーを削除"
                        data-testid={`delete-entry-button-${entry.id}`}
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* メモ */}
        {note && (
          <div className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3 mb-3">
            <p className="font-medium text-gray-700 mb-1">メモ</p>
            <p className="text-gray-600">{note}</p>
          </div>
        )}

        {/* 記録追加ボタン */}
        <button
          onClick={handleAddRecordClick}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all shadow-sm font-medium"
        >
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          <span>大会記録を追加</span>
        </button>

        {/* 添付画像 */}
        {competitionImages.length > 0 && (
          <div className="mt-4 pt-4 border-t border-blue-200">
            <ImageGallery images={competitionImages} />
          </div>
        )}
      </div>
    </div>
  )
}
