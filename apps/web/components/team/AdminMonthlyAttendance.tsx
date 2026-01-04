'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useAuth } from '@/contexts'
import { TeamAttendancesAPI } from '@apps/shared/api/teams/attendances'
import { AttendanceStatusType, TeamEvent } from '@swim-hub/shared/types/database'
import { getMonthDateRange } from '@swim-hub/shared/utils/date'
import { format, startOfMonth, endOfMonth, addMonths } from 'date-fns'
import BaseModal from '@/components/ui/BaseModal'

export interface AdminMonthlyAttendanceProps {
  teamId: string
}

interface EventStatusEditState {
  attendanceStatus: AttendanceStatusType | null
}

interface MonthItem {
  year: number
  month: number
  eventCount: number
}

export default function AdminMonthlyAttendance({ teamId }: AdminMonthlyAttendanceProps) {
  const { supabase } = useAuth()
  const attendancesAPI = useMemo(() => new TeamAttendancesAPI(supabase), [supabase])

  // 月リスト表示用の状態
  const [monthList, setMonthList] = useState<MonthItem[]>([])
  const [loadingMonthList, setLoadingMonthList] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // モーダル表示用の状態
  const [selectedMonth, setSelectedMonth] = useState<{ year: number; month: number } | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  // モーダル内のイベント情報
  const [events, setEvents] = useState<TeamEvent[]>([])
  const [loading, setLoading] = useState(false)

  // 編集状態（ローカル）
  const [editStates, setEditStates] = useState<Record<string, EventStatusEditState>>({})
  const [saving, setSaving] = useState(false)

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
      
      // 練習と大会を取得
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
        const monthKey = `${year}-${month}`
        monthSet.add(monthKey)
      })

      const monthList: MonthItem[] = []
      for (const monthKey of Array.from(monthSet).sort()) {
        const [yearStr, monthStr] = monthKey.split('-')
        const year = parseInt(yearStr)
        const month = parseInt(monthStr)

        // イベント数をカウント
        const [startDateStr, endDateStr] = getMonthDateRange(year, month)
        const [practicesCount, competitionsCount] = await Promise.all([
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

        const eventCount = (practicesCount.count || 0) + (competitionsCount.count || 0)
        
        if (eventCount > 0) {
          monthList.push({
            year,
            month,
            eventCount
          })
        }
      }
      
      setMonthList(monthList)
    } catch (err) {
      console.error('月リストの取得に失敗:', err)
      setError('月リストの取得に失敗しました')
    } finally {
      setLoadingMonthList(false)
    }
  }, [teamId, supabase])

  // 選択された月のイベントと出欠ステータスを取得
  const loadEvents = useCallback(async () => {
    if (!selectedMonth) return

    try {
      setLoading(true)
      setError(null)

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
  }, [teamId, selectedMonth, supabase])

  // 月リストを初期読み込み
  useEffect(() => {
    loadMonthList()
  }, [loadMonthList])

  // モーダルが開かれたときに詳細データを読み込む
  useEffect(() => {
    if (selectedMonth && isModalOpen) {
      loadEvents()
    }
  }, [selectedMonth, isModalOpen, loadEvents])

  // ステータス変更
  const handleStatusChange = (eventId: string, status: AttendanceStatusType | null) => {
    setEditStates((prev) => ({
      ...prev,
      [eventId]: {
        ...prev[eventId],
        attendanceStatus: status
      }
    }))
  }

  // 一括でステータス変更
  const handleBulkStatusChange = (status: AttendanceStatusType | null) => {
    const newEditStates: Record<string, EventStatusEditState> = {}
    events.forEach((event) => {
      newEditStates[event.id] = {
        attendanceStatus: status
      }
    })
    setEditStates(newEditStates)
  }

  // まとめて保存
  const handleSaveAll = async () => {
    try {
      setSaving(true)
      setError(null)

      // 変更されたイベントのみを抽出
      const updates = events
        .map((event) => {
          const editState = editStates[event.id]
          if (!editState) return null

          // 変更がない場合はスキップ
          if (event.attendance_status === editState.attendanceStatus) {
            return null
          }

          return {
            eventId: event.id,
            eventType: event.type,
            status: editState.attendanceStatus
          }
        })
        .filter((u): u is { eventId: string; eventType: 'practice' | 'competition'; status: AttendanceStatusType | null } => u !== null)

      if (updates.length === 0) {
        // 変更がない場合は何もしない
        return
      }

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
      await loadEvents()
      // 月リストも更新
      await loadMonthList()
      
      // 保存成功後、モーダルを閉じる
      handleCloseModal()
    } catch (err) {
      console.error('出欠ステータスの保存に失敗:', err)
      setError('出欠ステータスの保存に失敗しました')
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
              <span className="text-xs text-gray-600">
                {monthItem.eventCount}件のイベント
              </span>
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
            {/* 一括変更ボタン */}
            {events.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-blue-900">一括変更:</span>
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => handleBulkStatusChange('open')}
                      className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-800 rounded hover:bg-blue-200 transition-colors"
                    >
                      全て「提出受付中」に
                    </button>
                    <button
                      onClick={() => handleBulkStatusChange('closed')}
                      className="px-2 py-0.5 text-xs font-medium bg-red-100 text-red-800 rounded hover:bg-red-200 transition-colors"
                    >
                      全て「提出締切」に
                    </button>
                    <button
                      onClick={() => handleBulkStatusChange(null)}
                      className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-800 rounded hover:bg-gray-200 transition-colors"
                    >
                      全て「未設定」に
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* イベント一覧 */}
            {events.length === 0 ? (
              <div className="bg-gray-50 rounded-lg p-6 text-center">
                <p className="text-sm text-gray-600">この月にはイベントがありません</p>
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  {events.map((event) => {
                    const editState = editStates[event.id] || { attendanceStatus: null }

                    return (
                      <div
                        key={`${event.type}-${event.id}`}
                        className={`border rounded-lg p-3 ${
                          event.type === 'competition'
                            ? 'bg-purple-50 border-purple-200'
                            : 'bg-white border-gray-200'
                        }`}
                      >
                        {/* イベント情報とステータス選択を横並び */}
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
                              {event.type === 'competition' ? (event.title || '大会') : (event.title || '練習')}
                            </h3>
                            {event.place && (
                              <span className="text-xs text-gray-600">@{event.place}</span>
                            )}
                          </div>

                          {/* 右側：ステータス選択 */}
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <button
                              onClick={() => handleStatusChange(event.id, 'open')}
                              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                                editState.attendanceStatus === 'open'
                                  ? 'bg-blue-100 text-blue-800 border-2 border-blue-500'
                                  : 'bg-gray-100 text-gray-600 hover:bg-blue-50 border-2 border-transparent'
                              }`}
                            >
                              提出受付中
                            </button>
                            <button
                              onClick={() => handleStatusChange(event.id, 'closed')}
                              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                                editState.attendanceStatus === 'closed'
                                  ? 'bg-red-100 text-red-800 border-2 border-red-500'
                                  : 'bg-gray-100 text-gray-600 hover:bg-red-50 border-2 border-transparent'
                              }`}
                            >
                              提出締切
                            </button>
                            <button
                              onClick={() => handleStatusChange(event.id, null)}
                              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                                editState.attendanceStatus === null
                                  ? 'bg-gray-200 text-gray-800 border-2 border-gray-500'
                                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border-2 border-transparent'
                              }`}
                            >
                              未設定
                            </button>
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

