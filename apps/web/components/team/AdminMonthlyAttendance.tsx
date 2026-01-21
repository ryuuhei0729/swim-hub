'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useAuth } from '@/contexts'
import { TeamAttendancesAPI } from '@apps/shared/api/teams/attendances'
import { AttendanceStatusType, TeamEvent, TeamAttendanceWithDetails } from '@swim-hub/shared/types'
import { fetchTeamMembers, TeamMember } from '@swim-hub/shared/utils/team'
import { useAttendanceGrouping } from '@swim-hub/shared/hooks/useAttendanceGrouping'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import BaseModal from '@/components/ui/BaseModal'

export interface AdminMonthlyAttendanceProps {
  teamId: string
}

// 出欠状況グループ化表示コンポーネント
function AttendanceGroupingDisplay({
  attendanceData,
  teamMembers
}: {
  attendanceData: TeamAttendanceWithDetails[]
  teamMembers: TeamMember[]
}) {
  const { presentMembers, absentMembers, otherMembers, unansweredMembers } = useAttendanceGrouping(
    attendanceData,
    teamMembers
  )

  return (
    <>
      {/* 出席 */}
      <div>
        <h3 className="text-sm font-semibold text-green-800 mb-2">
          出席 ({presentMembers.length}名)
        </h3>
        {presentMembers.length > 0 ? (
          <div className="bg-green-50 rounded-lg p-3 space-y-1">
            {presentMembers.map((member) => (
              <div key={member.id} className="text-sm text-gray-900">
                {member.name}
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-500">
            なし
          </div>
        )}
      </div>

      {/* 欠席 */}
      <div>
        <h3 className="text-sm font-semibold text-red-800 mb-2">
          欠席 ({absentMembers.length}名)
        </h3>
        {absentMembers.length > 0 ? (
          <div className="bg-red-50 rounded-lg p-3 space-y-1">
            {absentMembers.map((member) => (
              <div key={member.id} className="text-sm text-gray-900">
                {member.name}
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-500">
            なし
          </div>
        )}
      </div>

      {/* その他 */}
      <div>
        <h3 className="text-sm font-semibold text-yellow-800 mb-2">
          その他 ({otherMembers.length}名)
        </h3>
        {otherMembers.length > 0 ? (
          <div className="bg-yellow-50 rounded-lg p-3 space-y-1">
            {otherMembers.map((member) => (
              <div key={member.id} className="text-sm text-gray-900">
                {member.name}
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-500">
            なし
          </div>
        )}
      </div>

      {/* 未回答 */}
      <div>
        <h3 className="text-sm font-semibold text-gray-800 mb-2">
          未回答 ({unansweredMembers.length}名)
        </h3>
        {unansweredMembers.length > 0 ? (
          <div className="bg-gray-50 rounded-lg p-3 space-y-1">
            {unansweredMembers.map((member) => (
              <div key={member.id} className="text-sm text-gray-600">
                {member.name}
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-500">
            なし
          </div>
        )}
      </div>
    </>
  )
}

interface EventStatusEditState {
  attendanceStatus: AttendanceStatusType | null
}

interface EventGroupedByMonth {
  year: number
  month: number
  events: TeamEvent[]
}

export default function AdminMonthlyAttendance({ teamId }: AdminMonthlyAttendanceProps) {
  const { supabase } = useAuth()
  const attendancesAPI = useMemo(() => new TeamAttendancesAPI(supabase), [supabase])

  // イベント一覧の状態
  const [events, setEvents] = useState<TeamEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 編集状態（ローカル）
  const [editStates, setEditStates] = useState<Record<string, EventStatusEditState>>({})
  const [savingEventIds, setSavingEventIds] = useState<Set<string>>(new Set())
       
  // 一括変更モーダルの状態
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false)
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(new Set())

  // 出欠状況モーダルの状態
  const [isAttendanceModalOpen, setIsAttendanceModalOpen] = useState(false)
  const [selectedEventForAttendance, setSelectedEventForAttendance] = useState<TeamEvent | null>(null)
  const [attendanceData, setAttendanceData] = useState<TeamAttendanceWithDetails[]>([])
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [loadingAttendance, setLoadingAttendance] = useState(false)

  // 未来のイベント一覧を取得
  const loadFutureEvents = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      const todayStr = format(new Date(), 'yyyy-MM-dd')

      // 練習と大会を取得（未来の日付のみ）
      const [practicesResult, competitionsResult] = await Promise.all([
        supabase
          .from('practices')
          .select('*')
          .eq('team_id', teamId)
          .gte('date', todayStr)
          .order('date', { ascending: true }),
        supabase
          .from('competitions')
          .select('*')
          .eq('team_id', teamId)
          .gte('date', todayStr)
          .order('date', { ascending: true })
      ])

      if (practicesResult.error) throw practicesResult.error
      if (competitionsResult.error) throw competitionsResult.error

      const practices = (practicesResult.data || []).map((p) => ({
        ...p,
        type: 'practice' as const
      }))
      const competitions = (competitionsResult.data || []).map((c) => ({
        ...c,
        type: 'competition' as const
      }))
      const allEvents = [...practices, ...competitions].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      )
      setEvents(allEvents)

      // 編集状態を初期化（既存のattendance_statusから）
      const initialEditStates: Record<string, EventStatusEditState> = {}
      allEvents.forEach((event) => {
        initialEditStates[event.id] = {
          attendanceStatus: event.attendance_status || null
        }
      })
      setEditStates(initialEditStates)
    } catch (err) {
      console.error('イベント情報の取得に失敗:', err)
      setError('イベント情報の取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [teamId, supabase])

  // 初期読み込み
  useEffect(() => {
    loadFutureEvents()
  }, [loadFutureEvents])

  // ステータス変更（ローカル）
  const handleStatusChange = (eventId: string, status: AttendanceStatusType | null) => {
    setEditStates((prev) => ({
      ...prev,
      [eventId]: {
        ...prev[eventId],
        attendanceStatus: status
      }
    }))
  }

  // 個別保存
  const handleSaveEvent = async (eventId: string) => {
    const event = events.find((e) => e.id === eventId)
    if (!event) return

    const editState = editStates[eventId]
    if (!editState) return

    // 変更がない場合はスキップ
    if (event.attendance_status === editState.attendanceStatus) {
      return
    }

    try {
      setSavingEventIds((prev) => new Set(prev).add(eventId))
      setError(null)

      if (event.type === 'practice') {
        await attendancesAPI.updatePracticeAttendanceStatus(eventId, editState.attendanceStatus)
      } else {
        await attendancesAPI.updateCompetitionAttendanceStatus(eventId, editState.attendanceStatus)
      }

      // 該当行だけを更新（他の行の編集状態は保持）
      setEvents((prevEvents) =>
        prevEvents.map((e) =>
          e.id === eventId
            ? { ...e, attendance_status: editState.attendanceStatus }
            : e
        )
      )

      // 該当行の編集状態を保存済み状態に更新（変更がない状態にする）
      setEditStates((prev) => ({
        ...prev,
        [eventId]: {
          attendanceStatus: editState.attendanceStatus
        }
      }))
    } catch (err) {
      console.error('出欠ステータスの保存に失敗:', err)
      setError('出欠ステータスの保存に失敗しました')
    } finally {
      setSavingEventIds((prev) => {
        const next = new Set(prev)
        next.delete(eventId)
        return next
      })
    }
  }

  // 一括変更モーダルを開く
  const handleOpenBulkModal = () => {
    setSelectedEventIds(new Set())
    setIsBulkModalOpen(true)
  }

  // 一括変更モーダルを閉じる
  const handleCloseBulkModal = () => {
    setIsBulkModalOpen(false)
    setSelectedEventIds(new Set())
  }

  // 出欠状況モーダルを開く
  const handleOpenAttendanceModal = async (event: TeamEvent) => {
    setSelectedEventForAttendance(event)
    setIsAttendanceModalOpen(true)
    await loadAttendanceData(event)
  }

  // 出欠状況モーダルを閉じる
  const handleCloseAttendanceModal = () => {
    setIsAttendanceModalOpen(false)
    setSelectedEventForAttendance(null)
    setAttendanceData([])
    setTeamMembers([])
  }

  // 出欠状況データを取得
  const loadAttendanceData = useCallback(async (event: TeamEvent) => {
    try {
      setLoadingAttendance(true)
      
      // 出欠情報を取得
      const attendances = event.type === 'practice'
        ? await attendancesAPI.listByPractice(event.id)
        : await attendancesAPI.listByCompetition(event.id)
      setAttendanceData(attendances)

      // チームメンバー全員を取得
      const members = await fetchTeamMembers(supabase, teamId)
      setTeamMembers(members)
    } catch (err) {
      console.error('出欠情報の取得に失敗:', err)
      setError('出欠情報の取得に失敗しました')
    } finally {
      setLoadingAttendance(false)
    }
  }, [teamId, supabase, attendancesAPI])

  // イベントを月ごとにグループ化
  const groupEventsByMonth = (events: TeamEvent[]): EventGroupedByMonth[] => {
    const grouped: Record<string, EventGroupedByMonth> = {}

    events.forEach((event) => {
      const date = new Date(event.date)
      const year = date.getFullYear()
      const month = date.getMonth() + 1
      const key = `${year}-${month}`

      if (!grouped[key]) {
        grouped[key] = {
          year,
          month,
          events: []
        }
      }

      grouped[key].events.push(event)
    })

    return Object.values(grouped).sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year
      return a.month - b.month
    })
  }

  // 月のチェックボックスをトグル
  const handleToggleMonth = (monthEvents: TeamEvent[]) => {
    const monthEventIds = new Set(monthEvents.map((e) => e.id))
    // 月のイベントIDのうち、選択されているものの数をカウント
    const selectedCount = Array.from(monthEventIds).filter((id) => selectedEventIds.has(id)).length
    const allSelected = selectedCount === monthEventIds.size

    setSelectedEventIds((prev) => {
      const next = new Set(prev)
      if (allSelected) {
        // 全て選択されている場合は全て解除
        monthEventIds.forEach((id) => next.delete(id))
      } else {
        // 全て選択されていない場合は全て選択
        monthEventIds.forEach((id) => next.add(id))
      }
      return next
    })
  }

  // 個別イベントのチェックボックスをトグル
  const handleToggleEvent = (eventId: string) => {
    setSelectedEventIds((prev) => {
      const next = new Set(prev)
      if (next.has(eventId)) {
        next.delete(eventId)
      } else {
        next.add(eventId)
      }
      return next
    })
  }

  // 月のチェックボックス状態を取得
  const getMonthCheckboxState = (monthEvents: TeamEvent[]): 'checked' | 'unchecked' | 'indeterminate' => {
    const monthEventIds = monthEvents.map((e) => e.id)
    const selectedCount = monthEventIds.filter((id) => selectedEventIds.has(id)).length

    if (selectedCount === 0) return 'unchecked'
    if (selectedCount === monthEventIds.length) return 'checked'
    return 'indeterminate'
  }

  // 一括更新
  const handleBulkUpdate = async (status: AttendanceStatusType) => {
    if (selectedEventIds.size === 0) return

    try {
      setError(null)

      const updates = Array.from(selectedEventIds)
        .map((eventId) => {
          const event = events.find((e) => e.id === eventId)
          if (!event) return null

          return {
            eventId,
            eventType: event.type,
            status
          }
        })
        .filter((u): u is { eventId: string; eventType: 'practice' | 'competition'; status: AttendanceStatusType } => u !== null)

      // 各イベントのステータスを更新
      await Promise.all(
        updates.map((update) => {
          if (update.eventType === 'practice') {
            return attendancesAPI.updatePracticeAttendanceStatus(update.eventId, update.status)
          } else {
            return attendancesAPI.updateCompetitionAttendanceStatus(update.eventId, update.status)
          }
        })
      )

      // 再読み込み
      await loadFutureEvents()
      
      // モーダルを閉じる
      handleCloseBulkModal()
    } catch (err) {
      console.error('一括更新に失敗:', err)
      setError('一括更新に失敗しました')
    }
  }

  // 月名を取得
  const getMonthLabel = (year: number, month: number) => {
    return `${year}年${month}月`
  }

  // 日付を表示用にフォーマット
  const formatEventDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('ja-JP', {
      month: 'long',
      day: 'numeric',
      weekday: 'short'
    })
  }

  // 日付の日部分のみを取得
  const getDayOfMonth = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.getDate()
  }

  // 曜日を取得（月、火、水など）
  const getWeekday = (dateStr: string) => {
    return format(new Date(dateStr), 'E', { locale: ja })
  }

  if (loading) {
    return (
      <div className="p-4">
        <div className="text-center py-6">
          <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900"></div>
          <p className="mt-1.5 text-sm text-gray-500">読み込み中...</p>
        </div>
      </div>
    )
  }

  if (error && !events.length) {
    return (
      <div className="p-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      </div>
    )
  }

  const groupedEvents = groupEventsByMonth(events)

  return (
    <div className="p-4 space-y-4">
      {/* エラーメッセージ */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

            {/* 一括変更ボタン */}
      <div className="flex justify-end">
                    <button
          onClick={handleOpenBulkModal}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                    >
          まとめて出欠状態を変更
                    </button>
                  </div>

            {/* イベント一覧 */}
            {events.length === 0 ? (
              <div className="bg-gray-50 rounded-lg p-6 text-center">
          <p className="text-sm text-gray-600">未来のイベントがありません</p>
              </div>
            ) : (
        <div className="bg-white rounded-lg shadow divide-y divide-gray-200">
                  {events.map((event) => {
            const editState = editStates[event.id] || { attendanceStatus: event.attendance_status || null }
            const isSaving = savingEventIds.has(event.id)
            const hasChanges = event.attendance_status !== editState.attendanceStatus

                    return (
                      <div
                        key={`${event.type}-${event.id}`}
                className={`p-4 hover:bg-gray-50 cursor-pointer ${
                          event.type === 'competition'
                    ? 'bg-purple-50'
                    : 'bg-white'
                        }`}
                        onClick={() => handleOpenAttendanceModal(event)}
                      >
                <div className="flex items-center justify-between gap-4">
                  {/* 左側：日付、タイトル、場所 */}
                  <div className="flex-1 flex items-center gap-3">
                            <span className="text-base font-bold text-gray-900 whitespace-nowrap">
                      {formatEventDate(event.date)}
                            </span>
                            <h3 className="text-sm font-medium text-gray-900">
                              {event.type === 'competition' ? (event.title || '大会') : (event.title || '練習')}
                            </h3>
                            {event.place && (
                              <span className="text-xs text-gray-600">@{event.place}</span>
                            )}
                          </div>

                  {/* 右側：ステータス選択と保存ボタン */}
                  <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                            <button
                              onClick={() => handleStatusChange(event.id, 'open')}
                      disabled={isSaving}
                              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                                editState.attendanceStatus === 'open'
                                  ? 'bg-blue-100 text-blue-800 border-2 border-blue-500'
                                  : 'bg-gray-100 text-gray-600 hover:bg-blue-50 border-2 border-transparent'
                      } ${isSaving ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                      受付中
                            </button>
                            <button
                              onClick={() => handleStatusChange(event.id, 'closed')}
                      disabled={isSaving}
                              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                                editState.attendanceStatus === 'closed'
                                  ? 'bg-red-100 text-red-800 border-2 border-red-500'
                                  : 'bg-gray-100 text-gray-600 hover:bg-red-50 border-2 border-transparent'
                      } ${isSaving ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                      締切
                            </button>
                            <button
                      onClick={() => handleSaveEvent(event.id)}
                      disabled={isSaving || !hasChanges}
                       className={`px-4 py-1.5 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700 transition-colors ${
                         isSaving || !hasChanges ? 'opacity-50 cursor-not-allowed' : ''
                              }`}
                            >
                      {isSaving ? '保存中...' : '保存'}
                            </button>
                          </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 一括変更モーダル */}
      <BaseModal
        isOpen={isBulkModalOpen}
        onClose={handleCloseBulkModal}
        title="まとめて出欠状態を変更"
        size="xl"
      >
        <div className="space-y-6">
          {groupedEvents.length === 0 ? (
            <div className="bg-gray-50 rounded-lg p-6 text-center">
              <p className="text-sm text-gray-600">イベントがありません</p>
            </div>
          ) : (
            <>
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {groupedEvents.map((group) => {
                  const monthCheckboxState = getMonthCheckboxState(group.events)

                  return (
                    <div key={`${group.year}-${group.month}`} className="space-y-2">
                      {/* 月ヘッダー */}
                      <div className="flex items-center gap-2 pb-2 border-b border-gray-200">
                        <input
                          type="checkbox"
                          checked={monthCheckboxState === 'checked'}
                          ref={(input) => {
                            if (input) {
                              input.indeterminate = monthCheckboxState === 'indeterminate'
                            }
                          }}
                          onChange={() => handleToggleMonth(group.events)}
                          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <label className="text-base font-medium text-gray-900">
                          {getMonthLabel(group.year, group.month)}
                        </label>
                      </div>

                      {/* 日付リスト */}
                      <div className="pl-6 space-y-1">
                        {group.events.map((event) => {
                          const isSelected = selectedEventIds.has(event.id)
                          const currentStatus = event.attendance_status || null
                          const statusLabel = currentStatus === 'open' ? '受付中' : currentStatus === 'closed' ? '締切' : '未設定'
                          const statusColor = currentStatus === 'open' ? 'text-blue-600' : currentStatus === 'closed' ? 'text-red-600' : 'text-gray-500'

                          return (
                            <div key={event.id} className="flex items-start gap-2 py-1">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => handleToggleEvent(event.id)}
                                className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 shrink-0"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-medium text-gray-900">
                                    {getDayOfMonth(event.date)}日（{getWeekday(event.date)}）
                                  </span>
                                  {event.type === 'competition' && (
                                    <span className="text-xs text-purple-600">（大会）</span>
                                  )}
                                  <span className="text-sm text-gray-700">
                                    {event.type === 'competition' ? (event.title || '大会') : (event.title || '練習')}
                                  </span>
                                  {event.place && (
                                    <span className="text-xs text-gray-600">@{event.place}</span>
                                  )}
                                  <span className={`text-xs font-medium ${statusColor}`}>
                                    [{statusLabel}]
                                  </span>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                        </div>
                      </div>
                    )
                  })}
                </div>

              {/* 一括操作ボタン */}
              <div className="flex justify-center gap-3 pt-4 border-t border-gray-200">
                <button
                  onClick={() => handleBulkUpdate('open')}
                  disabled={selectedEventIds.size === 0}
                  className={`px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors ${
                    selectedEventIds.size === 0 ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  受付中にする
                </button>
                  <button
                  onClick={() => handleBulkUpdate('closed')}
                  disabled={selectedEventIds.size === 0}
                  className={`px-6 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors ${
                    selectedEventIds.size === 0 ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                  締切にする
                  </button>
                </div>
              </>
            )}
          </div>
      </BaseModal>

      {/* 出欠状況モーダル */}
      <BaseModal
        isOpen={isAttendanceModalOpen}
        onClose={handleCloseAttendanceModal}
        title={selectedEventForAttendance ? `${formatEventDate(selectedEventForAttendance.date)}の出欠状況` : ''}
        size="lg"
      >
        {loadingAttendance ? (
          <div className="text-center py-6">
            <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900"></div>
            <p className="mt-1.5 text-sm text-gray-500">読み込み中...</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* 4つのグループに分けて表示 */}
            <AttendanceGroupingDisplay
              attendanceData={attendanceData}
              teamMembers={teamMembers}
            />
          </div>
        )}
      </BaseModal>
    </div>
  )
}

