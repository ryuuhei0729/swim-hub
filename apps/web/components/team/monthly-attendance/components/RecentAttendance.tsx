'use client'

import React, { useState, useMemo } from 'react'
import { TeamEvent, TeamAttendanceWithDetails } from '@swim-hub/shared/types'
import { AttendanceEditState } from '../hooks/useAttendanceEdit'
import { getStatusBadge } from './StatusBadge'
import { parseISO } from 'date-fns'
import { formatDate } from '@apps/shared/utils/date'

interface RecentAttendanceProps {
  events: TeamEvent[]
  editStates: Record<string, AttendanceEditState>
  savingEventIds: Set<string>
  loading: boolean
  onStatusChange: (eventId: string, status: 'present' | 'absent' | 'other' | null) => void
  onNoteChange: (eventId: string, note: string) => void
  onSave: (eventId: string) => void
  attendances: TeamAttendanceWithDetails[]
}

const NOTE_MAX_LENGTH = 500

export const RecentAttendance = React.memo(({
  events,
  editStates,
  savingEventIds,
  loading,
  onStatusChange,
  onNoteChange,
  onSave,
  attendances
}: RecentAttendanceProps) => {
  const [selectedTab, setSelectedTab] = useState<'current' | 'next'>('current')

  const filteredEvents = useMemo(() => {
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth() + 1
    const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1
    const nextYear = currentMonth === 12 ? currentYear + 1 : currentYear

    return events.filter((event) => {
      const eventDate = parseISO(event.date)
      const eventYear = eventDate.getFullYear()
      const eventMonth = eventDate.getMonth() + 1

      if (selectedTab === 'current') {
        return eventYear === currentYear && eventMonth === currentMonth
      } else {
        return eventYear === nextYear && eventMonth === nextMonth
      }
    })
  }, [events, selectedTab])

  if (loading) {
    return (
      <div className="text-center py-6">
        <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900"></div>
        <p className="mt-1.5 text-sm text-gray-500">読み込み中...</p>
      </div>
    )
  }

  return (
    <div className="mt-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">直近の出欠</h2>

      <div className="flex border-b border-gray-200 mb-4">
        <button
          onClick={() => setSelectedTab('current')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            selectedTab === 'current'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          今月
        </button>
        <button
          onClick={() => setSelectedTab('next')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            selectedTab === 'next'
              ? 'border-blue-500 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          来月
        </button>
      </div>

      {filteredEvents.length === 0 ? (
        <div className="bg-gray-50 rounded-lg p-6 text-center">
          <p className="text-sm text-gray-600">
            {selectedTab === 'current' ? '今月' : '来月'}のイベントがありません
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow divide-y divide-gray-200">
          {filteredEvents.map((event) => {
            const editState = editStates[event.id] || { status: null, note: '' }
            const isSaving = savingEventIds.has(event.id)
            const existingAttendance = attendances.find((a) => {
              if (event.type === 'practice') {
                return a.practice_id === event.id
              } else {
                return a.competition_id === event.id
              }
            })
            const hasChanges = existingAttendance
              ? existingAttendance.status !== editState.status ||
                (existingAttendance.note || '').trim() !== (editState.note || '').trim()
              : editState.status !== null || (editState.note || '').trim() !== ''

            return (
              <div
                key={`${event.type}-${event.id}`}
                className={`p-4 hover:bg-gray-50 ${
                  event.type === 'competition'
                    ? 'bg-purple-50'
                    : 'bg-white'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 flex items-center gap-2">
                    <span className="text-sm font-bold text-gray-900 whitespace-nowrap">
                      {formatDate(event.date, 'shortWithWeekday')}
                    </span>
                    <h3 className="text-xs font-medium text-gray-900">
                      {event.type === 'competition' ? event.title : '練習'}
                    </h3>
                    {event.place && (
                      <span className="text-xs text-gray-600">@{event.place}</span>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <div>
                      {getStatusBadge(event.attendance_status)}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => onStatusChange(event.id, 'present')}
                        className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                          editState.status === 'present'
                            ? 'bg-green-100 text-green-800 border-2 border-green-500'
                            : 'bg-gray-100 text-gray-600 hover:bg-green-50 border-2 border-transparent'
                        }`}
                      >
                        出席
                      </button>
                      <button
                        onClick={() => onStatusChange(event.id, 'absent')}
                        className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                          editState.status === 'absent'
                            ? 'bg-red-100 text-red-800 border-2 border-red-500'
                            : 'bg-gray-100 text-gray-600 hover:bg-red-50 border-2 border-transparent'
                        }`}
                      >
                        欠席
                      </button>
                      <button
                        onClick={() => onStatusChange(event.id, 'other')}
                        className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
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
                        onChange={(e) => onNoteChange(event.id, e.target.value)}
                        placeholder="備考を入力（任意）"
                        maxLength={NOTE_MAX_LENGTH}
                        className="w-60 px-2 py-1 border border-gray-300 rounded-md text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                      <button
                        onClick={() => onSave(event.id)}
                        disabled={isSaving || !hasChanges}
                        className={`px-3 py-1 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700 transition-colors ${
                          isSaving || !hasChanges ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                      >
                        {isSaving ? '保存中...' : '保存'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
})

RecentAttendance.displayName = 'RecentAttendance'
