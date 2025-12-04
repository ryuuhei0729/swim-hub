'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useAuth } from '@/contexts'
import { AttendanceAPI, TeamAttendanceWithDetails } from '@swim-hub/shared'
import { AttendanceStatus, TeamEvent } from '@swim-hub/shared/types/database'
import { getMonthDateRange } from '@swim-hub/shared/utils/date'
import { ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline'

export interface MyMonthlyAttendanceProps {
  teamId: string
}

interface AttendanceEditState {
  status: AttendanceStatus | null
  note: string
}

export default function MyMonthlyAttendance({ teamId }: MyMonthlyAttendanceProps) {
  const { supabase } = useAuth()
  const attendanceAPI = useMemo(() => new AttendanceAPI(supabase), [supabase])

  // 現在の年月を管理
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear())
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth() + 1)

  // 出欠情報とイベント情報
  const [attendances, setAttendances] = useState<TeamAttendanceWithDetails[]>([])
  const [events, setEvents] = useState<TeamEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 編集状態（ローカル）
  const [editStates, setEditStates] = useState<Record<string, AttendanceEditState>>({})
  const [saving, setSaving] = useState(false)

  // 月別の出欠情報を取得
  const loadAttendances = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)

      // 月の開始日と終了日を計算
      const [startDateStr, endDateStr] = getMonthDateRange(currentYear, currentMonth)

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
        currentYear,
        currentMonth
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
  }, [teamId, currentYear, currentMonth, supabase, attendanceAPI])

  useEffect(() => {
    loadAttendances()
  }, [loadAttendances])

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
            note: editState.note || null
          }
        })
        .filter((u): u is { attendanceId: string; status: AttendanceStatus | null; note: string | null } => u !== null)

      if (updates.length === 0) {
        // 変更がない場合は何もしない
        return
      }

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
          return {
            user_id: user.id,
            practice_id: event.type === 'practice' ? event.id : null,
            competition_id: event.type === 'competition' ? event.id : null,
            status: editState.status,
            note: editState.note || null
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
      const updateOnly = updates.filter((u) => u.attendanceId !== '')
      if (updateOnly.length > 0) {
        await attendanceAPI.bulkUpdateMyAttendances(updateOnly)
      }

      // 再読み込み
      await loadAttendances()
    } catch (err) {
      console.error('出欠情報の保存に失敗:', err)
      setError('出欠情報の保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  // 前月へ
  const handlePrevMonth = () => {
    if (currentMonth === 1) {
      setCurrentYear(currentYear - 1)
      setCurrentMonth(12)
    } else {
      setCurrentMonth(currentMonth - 1)
    }
  }

  // 翌月へ
  const handleNextMonth = () => {
    if (currentMonth === 12) {
      setCurrentYear(currentYear + 1)
      setCurrentMonth(1)
    } else {
      setCurrentMonth(currentMonth + 1)
    }
  }

  // 月名を取得
  const getMonthLabel = () => {
    return `${currentYear}年${currentMonth}月`
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

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
          <p className="mt-2 text-gray-500">読み込み中...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-4">
      {/* 月ナビゲーション */}
      <div className="flex items-center justify-between">
        <button
          onClick={handlePrevMonth}
          className="flex items-center gap-1 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ChevronLeftIcon className="h-5 w-5" />
          前月
        </button>
        <h2 className="text-xl font-bold text-gray-900">{getMonthLabel()}</h2>
        <button
          onClick={handleNextMonth}
          className="flex items-center gap-1 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
        >
          翌月
          <ChevronRightIcon className="h-5 w-5" />
        </button>
      </div>

      {/* イベント一覧 */}
      {events.length === 0 ? (
        <div className="bg-gray-50 rounded-lg p-8 text-center">
          <p className="text-gray-600">この月にはイベントがありません</p>
        </div>
      ) : (
        <div className="space-y-4">
          {events.map((event) => {
            const editState = editStates[event.id] || { status: null, note: '' }

            return (
              <div
                key={`${event.type}-${event.id}`}
                className={`border rounded-lg p-4 ${
                  event.type === 'competition'
                    ? 'bg-purple-50 border-purple-200'
                    : 'bg-white border-gray-200'
                }`}
              >
                {/* イベント情報と出欠選択を横並び */}
                <div className="flex items-center justify-between gap-4">
                  {/* 左側：日付、タイトル、場所を1行で */}
                  <div className="flex-1 flex items-center gap-3">
                    <span className="text-lg font-bold text-gray-900 whitespace-nowrap">
                      {new Date(event.date).toLocaleDateString('ja-JP', {
                        month: 'long',
                        day: 'numeric',
                        weekday: 'short'
                      })}
                    </span>
                    <h3 className="font-medium text-gray-900">
                      {event.type === 'competition' ? event.title : '練習'}
                    </h3>
                    {event.place && (
                      <span className="text-sm text-gray-600">@{event.place}</span>
                    )}
                  </div>

                  {/* 右側：ステータスバッジ、出欠選択と備考 */}
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    {/* ステータスバッジ */}
                    <div>
                      {getStatusBadge(event.attendance_status)}
                    </div>
                    {/* 出欠選択と備考 */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleStatusChange(event.id, 'present')}
                        className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                          editState.status === 'present'
                            ? 'bg-green-100 text-green-800 border-2 border-green-500'
                            : 'bg-gray-100 text-gray-600 hover:bg-green-50 border-2 border-transparent'
                        }`}
                      >
                        出席
                      </button>
                      <button
                        onClick={() => handleStatusChange(event.id, 'absent')}
                        className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                          editState.status === 'absent'
                            ? 'bg-red-100 text-red-800 border-2 border-red-500'
                            : 'bg-gray-100 text-gray-600 hover:bg-red-50 border-2 border-transparent'
                        }`}
                      >
                        欠席
                      </button>
                      <button
                        onClick={() => handleStatusChange(event.id, 'other')}
                        className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
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
                        className="w-48 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )
          })}

          {/* まとめて保存ボタン */}
          <div className="flex justify-center pt-4">
            <button
              onClick={handleSaveAll}
              disabled={saving}
              className={`px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors ${
                saving ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {saving ? '保存中...' : `${getMonthLabel()}分をまとめて保存`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

