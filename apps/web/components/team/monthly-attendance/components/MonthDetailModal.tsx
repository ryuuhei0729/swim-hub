'use client'

import React from 'react'
import BaseModal from '@/components/ui/BaseModal'
import { TeamEvent } from '@swim-hub/shared/types'
import { AttendanceEditState } from '../hooks/useAttendanceEdit'
import { getStatusBadge } from './StatusBadge'
import { formatDate } from '@apps/shared/utils/date'

interface MonthDetailModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  events: TeamEvent[]
  editStates: Record<string, AttendanceEditState>
  loading: boolean
  error: string | null
  saving: boolean
  onStatusChange: (eventId: string, status: 'present' | 'absent' | 'other' | null) => void
  onNoteChange: (eventId: string, note: string) => void
  onSaveAll: () => void
  onEventClick: (event: TeamEvent) => void
}

const NOTE_MAX_LENGTH = 500

export const MonthDetailModal = React.memo(({
  isOpen,
  onClose,
  title,
  events,
  editStates,
  loading,
  error,
  saving,
  onStatusChange,
  onNoteChange,
  onSaveAll,
  onEventClick
}: MonthDetailModalProps) => {
  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
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
          {events.length === 0 ? (
            <div className="bg-gray-50 rounded-lg p-6 text-center">
              <p className="text-sm text-gray-600">この月にはイベントがありません</p>
            </div>
          ) : (
            <>
              <div className="bg-white rounded-lg shadow divide-y divide-gray-200">
                {events.map((event) => {
                  const editState = editStates[event.id] || { status: null, note: '' }

                  return (
                    <div
                      key={`${event.type}-${event.id}`}
                      className={`p-4 hover:bg-gray-50 cursor-pointer ${
                        event.type === 'competition'
                          ? 'bg-purple-50'
                          : 'bg-white'
                      }`}
                      onClick={() => onEventClick(event)}
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

                        <div className="flex flex-col items-end gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
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
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="flex justify-center pt-3">
                <button
                  onClick={onSaveAll}
                  disabled={saving}
                  className={`px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors ${
                    saving ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  {saving ? '保存中...' : `${title}分をまとめて保存`}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </BaseModal>
  )
})

MonthDetailModal.displayName = 'MonthDetailModal'
