'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useAuth } from '@/contexts'
import { AttendanceAPI, TeamAttendanceWithDetails } from '@swim-hub/shared'
import { AttendanceStatus, TeamEvent } from '@swim-hub/shared/types/database'
import { getMonthDateRange } from '@swim-hub/shared/utils/date'
import { format, startOfMonth, endOfMonth, addMonths } from 'date-fns'
import BaseModal from '@/components/ui/BaseModal'

export interface MyMonthlyAttendanceProps {
  teamId: string
}

interface AttendanceEditState {
  status: AttendanceStatus | null
  note: string
}

interface MonthItem {
  year: number
  month: number
  status: 'has_unanswered' | 'all_answered' | null
  eventCount: number
  answeredCount: number
}

export default function MyMonthlyAttendance({ teamId }: MyMonthlyAttendanceProps) {
  const { supabase } = useAuth()
  const attendanceAPI = useMemo(() => new AttendanceAPI(supabase), [supabase])

  // 月リスト表示用の状態
  const [monthList, setMonthList] = useState<MonthItem[]>([])
  const [loadingMonthList, setLoadingMonthList] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // モーダル表示用の状態
  const [selectedMonth, setSelectedMonth] = useState<{ year: number; month: number } | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  // モーダル内の出欠情報とイベント情報（既存のロジックを再利用）
  const [attendances, setAttendances] = useState<TeamAttendanceWithDetails[]>([])
  const [events, setEvents] = useState<TeamEvent[]>([])
  const [loading, setLoading] = useState(false)

  // 編集状態（ローカル）
  const [editStates, setEditStates] = useState<Record<string, AttendanceEditState>>({})
  const [saving, setSaving] = useState(false)

  // 各月のステータスを計算
  const calculateMonthStatus = useCallback(async (year: number, month: number): Promise<{ eventCount: number; answeredCount: number; status: 'has_unanswered' | 'all_answered' | null }> => {
    const [startDateStr, endDateStr] = getMonthDateRange(year, month)
    
    // イベント数を取得
    const [practicesResult, competitionsResult] = await Promise.all([
      supabase
        .from('practices')
        .select('id', { count: 'exact', head: true })
        .eq('team_id', teamId)
        .gte('date', startDateStr)
        .lte('date', endDateStr),
      supabase
        .from('competitions')
        .select('id', { count: 'exact', head: true })
        .eq('team_id', teamId)
        .gte('date', startDateStr)
        .lte('date', endDateStr)
    ])
    
    if (practicesResult.error) throw practicesResult.error
    if (competitionsResult.error) throw competitionsResult.error
    
    const eventCount = (practicesResult.count || 0) + (competitionsResult.count || 0)
    
    // 自分の出欠回答数を取得
    const attendanceData = await attendanceAPI.getMyAttendancesByMonth(teamId, year, month)
    const answeredCount = attendanceData.length
    
    return {
      eventCount,
      answeredCount,
      status: eventCount === 0 ? null : (answeredCount < eventCount ? 'has_unanswered' : 'all_answered')
    }
  }, [teamId, supabase, attendanceAPI])

  // 月リストを取得
  const loadMonthList = useCallback(async () => {
    try {
      setLoadingMonthList(true)
      setError(null)

      const now = new Date()
      
      // 1年後の日付を計算
      const oneYearLater = addMonths(now, 12)
      const startDateStr = format(startOfMonth(now), 'yyyy-MM-dd')
      const endDateStr = format(endOfMonth(oneYearLater), 'yyyy-MM-dd')
      
      // 練習・大会を取得（日付のみ）
      const [practicesResult, competitionsResult] = await Promise.all([
        supabase
          .from('practices')
          .select('date')
          .eq('team_id', teamId)
          .gte('date', startDateStr)
          .lte('date', endDateStr),
        supabase
          .from('competitions')
          .select('date')
          .eq('team_id', teamId)
          .gte('date', startDateStr)
          .lte('date', endDateStr)
      ])

      if (practicesResult.error) throw practicesResult.error
      if (competitionsResult.error) throw competitionsResult.error
      
      // 月ごとにグループ化
      const monthSet = new Set<string>()
      const allDates = [
        ...(practicesResult.data || []).map(p => p.date),
        ...(competitionsResult.data || []).map(c => c.date)
      ]
      
      allDates.forEach(dateStr => {
        const date = new Date(dateStr)
        const year = date.getFullYear()
        const month = date.getMonth() + 1
        const monthKey = `${year}-${String(month).padStart(2, '0')}`
        monthSet.add(monthKey)
      })
      
      // 月リストを作成してステータスを計算
      const monthList: MonthItem[] = []
      const sortedMonthKeys = Array.from(monthSet).sort()
      
      for (const monthKey of sortedMonthKeys) {
        const [yearStr, monthStr] = monthKey.split('-')
        const year = parseInt(yearStr)
        const month = parseInt(monthStr)
        
        const status = await calculateMonthStatus(year, month)
        monthList.push({
          year,
          month,
          ...status
        })
      }
      
      setMonthList(monthList)
    } catch (err) {
      console.error('月リストの取得に失敗:', err)
      setError('月リストの取得に失敗しました')
    } finally {
      setLoadingMonthList(false)
    }
  }, [teamId, supabase, calculateMonthStatus])

  // 月別の出欠情報を取得（モーダル用）
  const loadAttendances = useCallback(async () => {
    if (!selectedMonth) return

    try {
      setLoading(true)
      setError(null)

      // 月の開始日と終了日を計算
      const [startDateStr, endDateStr] = getMonthDateRange(selectedMonth.year, selectedMonth.month)

      // 練習と大会を取得
      const [practicesResult, competitionsResult] = await Promise.all([
        supabase
          .from('practices')
          .select('*')
          .eq('team_id', teamId)
          .gte('date', startDateStr)
          .lte('date', endDateStr)
          .order('date', { ascending: true }),
        supabase
          .from('competitions')
          .select('*')
          .eq('team_id', teamId)
          .gte('date', startDateStr)
          .lte('date', endDateStr)
          .order('date', { ascending: true })
      ])

      if (practicesResult.error) throw practicesResult.error
      if (competitionsResult.error) throw competitionsResult.error

      // イベントを統合
      const practices: TeamEvent[] = (practicesResult.data || []).map((p) => ({
        ...p,
        type: 'practice' as const
      }))
      const competitions: TeamEvent[] = (competitionsResult.data || []).map((c) => ({
        ...c,
        type: 'competition' as const
      }))
      const allEvents = [...practices, ...competitions].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      )
      setEvents(allEvents)

      // 出欠情報を取得
      const attendanceData = await attendanceAPI.getMyAttendancesByMonth(
        teamId,
        selectedMonth.year,
        selectedMonth.month
      )
      setAttendances(attendanceData)

      // 編集状態を初期化（既存の出欠情報から）
      const initialEditStates: Record<string, AttendanceEditState> = {}
      attendanceData.forEach((attendance) => {
        const eventId = attendance.practice_id || attendance.competition_id
        if (eventId) {
          initialEditStates[eventId] = {
            status: attendance.status,
            note: attendance.note || ''
          }
        }
      })
      // イベントがあって出欠情報がない場合は未回答として初期化
      allEvents.forEach((event) => {
        if (!initialEditStates[event.id]) {
          initialEditStates[event.id] = {
            status: null,
            note: ''
          }
        }
      })
      setEditStates(initialEditStates)
    } catch (err) {
      console.error('出欠情報の取得に失敗:', err)
      setError('出欠情報の取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [teamId, selectedMonth, supabase, attendanceAPI])

  // 月リストを初期読み込み
  useEffect(() => {
    loadMonthList()
  }, [loadMonthList])

  // モーダルが開かれたときに詳細データを読み込む
  useEffect(() => {
    if (selectedMonth && isModalOpen) {
      loadAttendances()
    }
  }, [selectedMonth, isModalOpen, loadAttendances])

  // ステータス変更
  const handleStatusChange = (eventId: string, status: AttendanceStatus | null) => {
    setEditStates((prev) => ({
      ...prev,
      [eventId]: {
        ...prev[eventId],
        status
      }
    }))
  }

  // 備考変更
  const handleNoteChange = (eventId: string, note: string) => {
    setEditStates((prev) => ({
      ...prev,
      [eventId]: {
        ...prev[eventId],
        note
      }
    }))
  }

  // まとめて保存
  const handleSaveAll = async () => {
    try {
      setSaving(true)
      setError(null)

      // 編集された出欠情報のみを抽出
      const updates = events
        .map((event) => {
          const editState = editStates[event.id]
          if (!editState) return null

          // 既存の出欠情報を取得
          const existingAttendance = attendances.find(
            (a) => (a.practice_id || a.competition_id) === event.id
          )

          // 変更がない場合はスキップ
          if (existingAttendance) {
            if (
              existingAttendance.status === editState.status &&
              (existingAttendance.note || '') === editState.note
            ) {
              return null
            }
          } else if (editState.status === null && editState.note === '') {
            // 新規で未回答の場合はスキップ
            return null
          }

          return {
            attendanceId: existingAttendance?.id || '',
            status: editState.status,
            note: editState.note || null,
            eventId: event.id,
            eventAttendanceStatus: event.attendance_status,
            isNew: !existingAttendance
          }
        })
        .filter((u): u is { attendanceId: string; status: AttendanceStatus | null; note: string | null; eventId: string; eventAttendanceStatus: 'open' | 'closed' | null | undefined; isNew: boolean } => u !== null)

      if (updates.length === 0) {
        // 変更がない場合は何もしない
        return
      }

      // 提出締め切り後の編集があるかチェック
      const hasClosedEdits = updates.some((update) => {
        const event = events.find((e) => e.id === update.eventId)
        return event && event.attendance_status === 'closed'
      })

      // 提出締め切り後の編集がある場合、確認を求める
      if (hasClosedEdits) {
        const confirmed = window.confirm(
          '提出締め切り後の編集になります。備考に編集日時が自動的に追加されます。保存しますか？'
        )
        if (!confirmed) {
          setSaving(false)
          return
        }
      }

      // API側で備考に編集日時を追加するため、フロントエンド側ではそのまま渡す
      const processedUpdates = updates.map((update) => ({
        attendanceId: update.attendanceId,
        status: update.status,
        note: update.note
      }))

      // 新規作成が必要な出欠情報を特定
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('認証が必要です')

      const newAttendances = events
        .filter((event) => {
          const editState = editStates[event.id]
          if (!editState) return false
          const existingAttendance = attendances.find(
            (a) => (a.practice_id || a.competition_id) === event.id
          )
          return !existingAttendance && (editState.status !== null || editState.note !== '')
        })
        .map((event) => {
          const editState = editStates[event.id]
          let note = editState.note || null
          
          // 提出締め切り後の新規作成の場合、備考に編集日時を追加
          // API側で処理するため、フロントエンド側ではそのまま渡す
          // ただし、新規作成の場合はAPI側で処理されないため、フロントエンド側で追加
          if (event.attendance_status === 'closed') {
            const now = new Date()
            const editTimestamp = format(now, 'MM/dd HH:mm')
            const editNote = `(${editTimestamp}編集)`
            note = note ? `${note} ${editNote}` : editNote
          }
          
          return {
            user_id: user.id,
            practice_id: event.type === 'practice' ? event.id : null,
            competition_id: event.type === 'competition' ? event.id : null,
            status: editState.status,
            note
          }
        })

      // 新規作成と更新を実行
      // 新規作成
      if (newAttendances.length > 0) {
        const { error: insertError } = await supabase
          .from('team_attendance')
          .insert(newAttendances)

        if (insertError) throw insertError
      }

      // 更新（既存のIDがあるもののみ）
      const updateOnly = processedUpdates.filter((u) => u.attendanceId !== '')
      if (updateOnly.length > 0) {
        await attendanceAPI.bulkUpdateMyAttendances(updateOnly)
      }

      // 再読み込み
      await loadAttendances()
      // 月リストも更新
      await loadMonthList()
      
      // 保存成功後、モーダルを閉じる
      handleCloseModal()
    } catch (err) {
      console.error('出欠情報の保存に失敗:', err)
      setError('出欠情報の保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  // 月アイテムをクリック
  const handleMonthClick = (year: number, month: number) => {
    setSelectedMonth({ year, month })
    setIsModalOpen(true)
  }

  // モーダルを閉じる
  const handleCloseModal = () => {
    setIsModalOpen(false)
    setSelectedMonth(null)
    setEditStates({})
  }

  // 月名を取得
  const getMonthLabel = (year: number, month: number) => {
    return `${year}年${month}月`
  }

  // 月のステータスバッジ
  const StatusBadge = ({ status }: { status: 'has_unanswered' | 'all_answered' | null }) => {
    if (status === null) return null
    
    return (
      <span className={`text-xs px-1.5 py-0.5 rounded-full ${
        status === 'has_unanswered'
          ? 'bg-yellow-100 text-yellow-800'
          : 'bg-green-100 text-green-800'
      }`}>
        {status === 'has_unanswered' ? '未回答あり' : '全て回答済み'}
      </span>
    )
  }

  // イベントのステータスバッジ
  const getStatusBadge = (status: 'open' | 'closed' | null | undefined) => {
    switch (status) {
      case 'open':
        return <span className="text-xs px-2 py-0.5 rounded-full bg-blue-200 text-blue-800">提出受付中</span>
      case 'closed':
        return <span className="text-xs px-2 py-0.5 rounded-full bg-red-200 text-red-800">提出締切</span>
      default:
        return <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 text-gray-700">未設定</span>
    }
  }

  if (loadingMonthList) {
    return (
      <div className="p-4">
        <div className="text-center py-6">
          <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900"></div>
          <p className="mt-1.5 text-sm text-gray-500">読み込み中...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-3">
      {/* 月リスト表示 */}
      {monthList.length === 0 ? (
        <div className="bg-gray-50 rounded-lg p-6 text-center">
          <p className="text-sm text-gray-600">表示できる月がありません</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {monthList.map((monthItem) => (
            <button
              key={`${monthItem.year}-${monthItem.month}`}
              onClick={() => handleMonthClick(monthItem.year, monthItem.month)}
              className="w-full flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:border-gray-300 transition-colors text-left"
            >
              <span className="text-base font-medium text-gray-900">
                {getMonthLabel(monthItem.year, monthItem.month)}
              </span>
              <StatusBadge status={monthItem.status} />
            </button>
          ))}
        </div>
      )}

      {/* 月詳細モーダル */}
      <BaseModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={selectedMonth ? getMonthLabel(selectedMonth.year, selectedMonth.month) : ''}
        size="xl"
      >
        {loading ? (
          <div className="text-center py-6">
            <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900"></div>
            <p className="mt-1.5 text-sm text-gray-500">読み込み中...</p>
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* イベント一覧 */}
            {events.length === 0 ? (
              <div className="bg-gray-50 rounded-lg p-6 text-center">
                <p className="text-sm text-gray-600">この月にはイベントがありません</p>
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  {events.map((event) => {
                    const editState = editStates[event.id] || { status: null, note: '' }

                    return (
                      <div
                        key={`${event.type}-${event.id}`}
                        className={`border rounded-lg p-3 ${
                          event.type === 'competition'
                            ? 'bg-purple-50 border-purple-200'
                            : 'bg-white border-gray-200'
                        }`}
                      >
                        {/* イベント情報と出欠選択を横並び */}
                        <div className="flex items-center justify-between gap-3">
                          {/* 左側：日付、タイトル、場所を1行で */}
                          <div className="flex-1 flex items-center gap-2">
                            <span className="text-base font-bold text-gray-900 whitespace-nowrap">
                              {new Date(event.date).toLocaleDateString('ja-JP', {
                                month: 'long',
                                day: 'numeric',
                                weekday: 'short'
                              })}
                            </span>
                            <h3 className="text-sm font-medium text-gray-900">
                              {event.type === 'competition' ? event.title : '練習'}
                            </h3>
                            {event.place && (
                              <span className="text-xs text-gray-600">@{event.place}</span>
                            )}
                          </div>

                          {/* 右側：ステータスバッジ、出欠選択と備考 */}
                          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                            {/* ステータスバッジ */}
                            <div>
                              {getStatusBadge(event.attendance_status)}
                            </div>
                            {/* 出欠選択と備考 */}
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => handleStatusChange(event.id, 'present')}
                                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                                  editState.status === 'present'
                                    ? 'bg-green-100 text-green-800 border-2 border-green-500'
                                    : 'bg-gray-100 text-gray-600 hover:bg-green-50 border-2 border-transparent'
                                }`}
                              >
                                出席
                              </button>
                              <button
                                onClick={() => handleStatusChange(event.id, 'absent')}
                                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                                  editState.status === 'absent'
                                    ? 'bg-red-100 text-red-800 border-2 border-red-500'
                                    : 'bg-gray-100 text-gray-600 hover:bg-red-50 border-2 border-transparent'
                                }`}
                              >
                                欠席
                              </button>
                              <button
                                onClick={() => handleStatusChange(event.id, 'other')}
                                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                                  editState.status === 'other'
                                    ? 'bg-yellow-100 text-yellow-800 border-2 border-yellow-500'
                                    : 'bg-gray-100 text-gray-600 hover:bg-yellow-50 border-2 border-transparent'
                                }`}
                              >
                                その他
                              </button>
                              <input
                                type="text"
                                value={editState.note}
                                onChange={(e) => handleNoteChange(event.id, e.target.value)}
                                placeholder="備考を入力（任意）"
                                className="w-40 px-2 py-1.5 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* まとめて保存ボタン */}
                <div className="flex justify-center pt-3">
                  <button
                    onClick={handleSaveAll}
                    disabled={saving}
                    className={`px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors ${
                      saving ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    {saving ? '保存中...' : selectedMonth ? `${getMonthLabel(selectedMonth.year, selectedMonth.month)}分をまとめて保存` : '保存'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </BaseModal>
    </div>
  )
}

