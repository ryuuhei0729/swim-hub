import React, { useState } from 'react'
import { BaseModal } from '@/components/ui'
import { TeamEvent } from '@swim-hub/shared/types'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import type { EventGroupedByMonth } from '@/types/admin-attendance'

interface BulkChangeModalProps {
  isOpen: boolean
  events: TeamEvent[]
  onClose: () => void
  onBulkUpdate: (selectedEventIds: Set<string>, status: 'open' | 'closed') => Promise<void>
}

function groupEventsByMonth(events: TeamEvent[]): EventGroupedByMonth[] {
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

export function BulkChangeModal({
  isOpen,
  events,
  onClose,
  onBulkUpdate
}: BulkChangeModalProps) {
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(new Set())

  const groupedEvents = groupEventsByMonth(events)

  const handleToggleMonth = (monthEvents: TeamEvent[]) => {
    const monthEventIds = new Set(monthEvents.map((e) => e.id))
    const selectedCount = Array.from(monthEventIds).filter((id) => selectedEventIds.has(id)).length
    const allSelected = selectedCount === monthEventIds.size

    setSelectedEventIds((prev) => {
      const next = new Set(prev)
      if (allSelected) {
        monthEventIds.forEach((id) => next.delete(id))
      } else {
        monthEventIds.forEach((id) => next.add(id))
      }
      return next
    })
  }

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

  const getMonthCheckboxState = (monthEvents: TeamEvent[]): 'checked' | 'unchecked' | 'indeterminate' => {
    const monthEventIds = monthEvents.map((e) => e.id)
    const selectedCount = monthEventIds.filter((id) => selectedEventIds.has(id)).length

    if (selectedCount === 0) return 'unchecked'
    if (selectedCount === monthEventIds.length) return 'checked'
    return 'indeterminate'
  }

  const getMonthLabel = (year: number, month: number) => {
    return `${year}年${month}月`
  }

  const getDayOfMonth = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.getDate()
  }

  const getWeekday = (dateStr: string) => {
    return format(new Date(dateStr), 'E', { locale: ja })
  }

  const handleUpdate = async (status: 'open' | 'closed') => {
    await onBulkUpdate(selectedEventIds, status)
    setSelectedEventIds(new Set())
    onClose()
  }

  const handleClose = () => {
    setSelectedEventIds(new Set())
    onClose()
  }

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={handleClose}
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
                onClick={() => handleUpdate('open')}
                disabled={selectedEventIds.size === 0}
                className={`px-6 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors ${
                  selectedEventIds.size === 0 ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                受付中にする
              </button>
              <button
                onClick={() => handleUpdate('closed')}
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
  )
}
