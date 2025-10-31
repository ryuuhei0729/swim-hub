'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { AttendanceAPI, TeamAttendanceWithDetails } from '@swim-hub/shared'
import { AttendanceStatus } from '@swim-hub/shared/types/database'

export interface TeamAttendanceListProps {
  practiceId?: string
  competitionId?: string
  isAdmin?: boolean
}

export default function TeamAttendanceList({ 
  practiceId, 
  competitionId,
  isAdmin = false 
}: TeamAttendanceListProps) {
  const [attendances, setAttendances] = useState<TeamAttendanceWithDetails[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [canSubmit, setCanSubmit] = useState(false)
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [noteInput, setNoteInput] = useState<string>('')
  
  const supabase = useMemo(() => createClient(), [])
  const attendanceAPI = useMemo(() => new AttendanceAPI(supabase), [supabase])

  useEffect(() => {
    loadAttendances()
  }, [practiceId, competitionId])

  const loadAttendances = async () => {
    try {
      setLoading(true)
      setError(null)

      if (practiceId) {
        const data = await attendanceAPI.getAttendanceByPractice(practiceId)
        setAttendances(data)
        
        // 出欠提出可能かチェック
        const canSubmitStatus = await attendanceAPI.canSubmitAttendance(practiceId, null)
        setCanSubmit(canSubmitStatus)
      } else if (competitionId) {
        const data = await attendanceAPI.getAttendanceByCompetition(competitionId)
        setAttendances(data)
        
        // 出欠提出可能かチェック
        const canSubmitStatus = await attendanceAPI.canSubmitAttendance(null, competitionId)
        setCanSubmit(canSubmitStatus)
      }
    } catch (err) {
      console.error('出欠情報の取得に失敗:', err)
      setError('出欠情報の取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  const handleStatusChange = async (attendanceId: string, status: AttendanceStatus | null, note?: string) => {
    try {
      await attendanceAPI.updateMyAttendance(attendanceId, { status, note: note || null })
      setEditingNoteId(null)
      setNoteInput('')
      loadAttendances()
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      console.error('出欠情報の更新に失敗:', error)
      alert(`出欠情報の更新に失敗しました: ${error.message || String(err)}`)
    }
  }

  const handleAdminStatusChange = async (attendanceId: string, status: AttendanceStatus | null) => {
    try {
      await attendanceAPI.updateAttendance(attendanceId, { status })
      loadAttendances()
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      console.error('出欠情報の更新に失敗:', error)
      alert(`出欠情報の更新に失敗しました: ${error.message || String(err)}`)
    }
  }

  const handleNoteEdit = (attendanceId: string, currentNote: string | null) => {
    setEditingNoteId(attendanceId)
    setNoteInput(currentNote || '')
  }

  const handleNoteSave = async (attendanceId: string, status: AttendanceStatus | null) => {
    await handleStatusChange(attendanceId, status, noteInput)
  }

  const handleNoteCancel = () => {
    setEditingNoteId(null)
    setNoteInput('')
  }

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
        <p className="mt-2 text-gray-500">読み込み中...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800">{error}</p>
      </div>
    )
  }

  // 出欠統計を計算
  const stats = {
    present: attendances.filter(a => a.status === 'present').length,
    absent: attendances.filter(a => a.status === 'absent').length,
    other: attendances.filter(a => a.status === 'other').length,
    pending: attendances.filter(a => a.status === null).length,
    total: attendances.length
  }

  return (
    <div className="space-y-4">
      {/* 提出期間外の警告 */}
      {!canSubmit && !isAdmin && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-yellow-800 text-sm">
            ⚠️ 現在、出欠提出期間外です。管理者が提出期間を「提出受付中」に変更するまでお待ちください。
          </p>
        </div>
      )}

      {/* 統計 */}
      <div className="grid grid-cols-5 gap-4">
        <div className="bg-green-50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-green-600">{stats.present}</div>
          <div className="text-xs text-green-700">出席</div>
        </div>
        <div className="bg-red-50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-red-600">{stats.absent}</div>
          <div className="text-xs text-red-700">欠席</div>
        </div>
        <div className="bg-yellow-50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-yellow-600">{stats.other}</div>
          <div className="text-xs text-yellow-700">その他</div>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-gray-600">{stats.pending}</div>
          <div className="text-xs text-gray-700">未回答</div>
        </div>
        <div className="bg-blue-50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-blue-600">{stats.total}</div>
          <div className="text-xs text-blue-700">合計</div>
        </div>
      </div>

      {/* 出欠リスト */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  名前
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  ステータス
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  備考
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {attendances.map((attendance) => (
                <tr key={attendance.id}>
                  <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                    {attendance.user?.name || '不明'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {isAdmin ? (
                      <select
                        value={attendance.status || ''}
                        onChange={(e) => handleAdminStatusChange(
                          attendance.id, 
                          e.target.value === '' ? null : e.target.value as AttendanceStatus
                        )}
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                      >
                        <option value="">未回答</option>
                        <option value="present">出席</option>
                        <option value="absent">欠席</option>
                        <option value="other">その他</option>
                      </select>
                    ) : (
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleStatusChange(attendance.id, 'present', attendance.note || undefined)}
                          disabled={!canSubmit}
                          className={`px-3 py-1 rounded text-sm ${
                            attendance.status === 'present'
                              ? 'bg-green-100 text-green-800 font-medium'
                              : canSubmit
                              ? 'bg-gray-100 text-gray-600 hover:bg-green-50'
                              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          }`}
                        >
                          出席
                        </button>
                        <button
                          onClick={() => handleStatusChange(attendance.id, 'absent', attendance.note || undefined)}
                          disabled={!canSubmit}
                          className={`px-3 py-1 rounded text-sm ${
                            attendance.status === 'absent'
                              ? 'bg-red-100 text-red-800 font-medium'
                              : canSubmit
                              ? 'bg-gray-100 text-gray-600 hover:bg-red-50'
                              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          }`}
                        >
                          欠席
                        </button>
                        <button
                          onClick={() => handleStatusChange(attendance.id, 'other', attendance.note || undefined)}
                          disabled={!canSubmit}
                          className={`px-3 py-1 rounded text-sm ${
                            attendance.status === 'other'
                              ? 'bg-yellow-100 text-yellow-800 font-medium'
                              : canSubmit
                              ? 'bg-gray-100 text-gray-600 hover:bg-yellow-50'
                              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          }`}
                        >
                          その他
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {editingNoteId === attendance.id ? (
                      <div className="flex items-center space-x-2">
                        <input
                          type="text"
                          value={noteInput}
                          onChange={(e) => setNoteInput(e.target.value)}
                          placeholder="備考を入力..."
                          className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                          disabled={!canSubmit && !isAdmin}
                        />
                        <button
                          onClick={() => handleNoteSave(attendance.id, attendance.status)}
                          className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
                        >
                          保存
                        </button>
                        <button
                          onClick={handleNoteCancel}
                          className="px-2 py-1 bg-gray-300 text-gray-700 rounded text-xs hover:bg-gray-400"
                        >
                          キャンセル
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <span className="text-gray-700">
                          {attendance.note || <span className="text-gray-400">なし</span>}
                        </span>
                        {(canSubmit || isAdmin) && (
                          <button
                            onClick={() => handleNoteEdit(attendance.id, attendance.note)}
                            className="ml-2 text-blue-600 hover:text-blue-800 text-xs"
                          >
                            編集
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
