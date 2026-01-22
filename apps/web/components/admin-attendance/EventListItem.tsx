'use client'

import React, { memo } from 'react'
import { parseISO, isValid } from 'date-fns'
import { ja } from 'date-fns/locale'
import { formatInTimeZone } from 'date-fns-tz'
import { TeamEvent } from '@swim-hub/shared/types'
import type { EventStatusEditState } from '@/types/admin-attendance'

interface EventListItemProps {
  event: TeamEvent
  editState: EventStatusEditState
  isSaving: boolean
  hasChanges: boolean
  onStatusChange: (eventId: string, status: 'open' | 'closed') => void
  onSave: (eventId: string) => void
  onClick: () => void
}

/**
 * イベントリストアイテム（React.memoで再レンダリング最適化）
 */
export const EventListItem = memo(function EventListItem({
  event,
  editState,
  isSaving,
  hasChanges,
  onStatusChange,
  onSave,
  onClick
}: EventListItemProps) {
  const formatEventDate = (dateStr: string) => {
    const parsed = parseISO(dateStr)
    if (!isValid(parsed)) {
      return '-'
    }
    return formatInTimeZone(parsed, 'Asia/Tokyo', 'MMMM d日 (EEE)', { locale: ja })
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      if (e.key === ' ') {
        e.preventDefault()
      }
      onClick?.()
    }
  }

  return (
    <div
      className={`p-4 hover:bg-gray-50 cursor-pointer ${
        event.type === 'competition' ? 'bg-purple-50' : 'bg-white'
      }`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={`${formatEventDate(event.date)} ${event.type === 'competition' ? (event.title || '大会') : (event.title || '練習')}の詳細を表示`}
      onKeyDown={handleKeyDown}
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
            onClick={() => onStatusChange(event.id, 'open')}
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
            onClick={() => onStatusChange(event.id, 'closed')}
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
            onClick={() => onSave(event.id)}
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
})
