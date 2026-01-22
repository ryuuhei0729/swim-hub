'use client'

import React from 'react'
import { Button, Input } from '@/components/ui'
import { PlusIcon, TrashIcon } from '@heroicons/react/24/outline'
import { formatTime } from '@/utils/formatters'
import { LapTimeDisplay } from '../../LapTimeDisplay'
import type { EntryInfo } from '@apps/shared/types/ui'
import type { RecordLogFormState, StyleOption } from '../types'

interface RecordLogEntryProps {
  formData: RecordLogFormState
  index: number
  entryInfo?: EntryInfo
  styles: StyleOption[]
  isLoading: boolean
  onTimeChange: (value: string) => void
  onToggleRelaying: (checked: boolean) => void
  onNoteChange: (value: string) => void
  onVideoChange: (value: string) => void
  onReactionTimeChange: (value: string) => void
  onStyleChange: (value: string) => void
  onAddSplitTime: () => void
  onAddSplitTimesEvery25m: () => void
  onRemoveSplitTime: (splitIndex: number) => void
  onSplitTimeChange: (
    splitIndex: number,
    field: 'distance' | 'splitTime',
    value: string
  ) => void
}

/**
 * 記録ログエントリ入力コンポーネント
 */
export default function RecordLogEntry({
  formData,
  index,
  entryInfo,
  styles,
  isLoading,
  onTimeChange,
  onToggleRelaying,
  onNoteChange,
  onVideoChange,
  onReactionTimeChange,
  onStyleChange,
  onAddSplitTime,
  onAddSplitTimesEvery25m,
  onRemoveSplitTime,
  onSplitTimeChange,
}: RecordLogEntryProps) {
  const sectionIndex = index + 1
  const styleOptions = styles.map((style) => ({
    id: style.id.toString(),
    label: style.nameJp,
  }))

  const currentStyleId = entryInfo ? String(entryInfo.styleId) : formData.styleId
  const currentStyle = styles.find((s) => s.id.toString() === currentStyleId)
  const raceDistance = currentStyle?.distance

  // スプリットタイムを距離でソート
  const sortedSplitTimes = [...formData.splitTimes]
    .sort((a, b) => {
      const distA =
        typeof a.distance === 'number'
          ? a.distance
          : a.distance === ''
            ? 0
            : parseInt(String(a.distance)) || 0
      const distB =
        typeof b.distance === 'number'
          ? b.distance
          : b.distance === ''
            ? 0
            : parseInt(String(b.distance)) || 0
      return distA - distB
    })
    .map((st) => {
      const originalIndex = formData.splitTimes.findIndex((s) => s.uiKey === st.uiKey)
      return { st, originalIndex }
    })

  // 有効なスプリットタイムを取得
  const validSplitTimes = formData.splitTimes
    .map((st) => {
      const distance =
        typeof st.distance === 'number'
          ? st.distance
          : st.distance === ''
            ? NaN
            : parseInt(String(st.distance))
      if (!isNaN(distance) && distance > 0 && st.splitTime > 0) {
        return { distance, splitTime: st.splitTime }
      }
      return null
    })
    .filter((st): st is { distance: number; splitTime: number } => st !== null)

  return (
    <div
      className="rounded-xl border border-gray-200 bg-gray-50/60 p-4 sm:p-6 space-y-4"
      data-testid={`record-entry-section-${sectionIndex}`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <h4 className="text-base font-semibold text-gray-900">
          記録入力 {sectionIndex}
        </h4>
        {entryInfo && (
          <div className="text-sm text-blue-800 bg-blue-100 px-3 py-1 rounded-full inline-flex items-center gap-2">
            <span className="font-medium">{entryInfo.styleName}</span>
            {entryInfo.entryTime && entryInfo.entryTime > 0 && (
              <span className="text-blue-700">entry: {formatTime(entryInfo.entryTime)}</span>
            )}
          </div>
        )}
      </div>

      {/* 種目 */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          種目 <span className="text-red-500">*</span>
        </label>
        {entryInfo ? (
          <div className="w-full px-3 py-2 border border-gray-200 rounded-md bg-gray-100 text-gray-700">
            {entryInfo.styleName}
          </div>
        ) : (
          <select
            value={formData.styleId}
            onChange={(e) => onStyleChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            required
            data-testid={`record-style-${sectionIndex}`}
          >
            <option value="">種目を選択</option>
            {styleOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* タイムとリアクションタイム */}
      <div className="grid grid-cols-[1fr_auto] gap-2 items-start">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            タイム <span className="text-red-500">*</span>
          </label>
          <Input
            type="text"
            value={formData.timeDisplayValue}
            onChange={(e) => onTimeChange(e.target.value)}
            placeholder="例: 1:23.45 または 32.45"
            className="w-full"
            data-testid={`record-time-${sectionIndex}`}
          />
          <p className="text-xs text-gray-500 mt-1">
            形式: 分:秒.小数（例: 1:23.45）または 秒.小数（例: 32.45）
          </p>
        </div>
        <div className="w-42">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            リアクションタイム
          </label>
          <Input
            type="number"
            step="0.01"
            min="0.40"
            max="1.00"
            value={formData.reactionTime}
            onChange={(e) => onReactionTimeChange(e.target.value)}
            placeholder="0.65"
            className="w-full"
            data-testid={`record-reaction-time-${sectionIndex}`}
          />
        </div>
      </div>

      {/* リレー */}
      <div className="flex items-center">
        <input
          type="checkbox"
          id={`isRelaying-${sectionIndex}`}
          checked={formData.isRelaying}
          onChange={(e) => onToggleRelaying(e.target.checked)}
          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          data-testid={`record-relay-${sectionIndex}`}
        />
        <label htmlFor={`isRelaying-${sectionIndex}`} className="ml-2 text-sm text-gray-700">
          リレー種目
        </label>
      </div>

      {/* スプリットタイム */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-gray-700">
            スプリットタイム
          </label>
          <div className="flex gap-2">
            <Button
              type="button"
              onClick={onAddSplitTimesEvery25m}
              variant="outline"
              className="text-xs"
              disabled={isLoading || !raceDistance}
              data-testid={`record-split-add-25m-button-${sectionIndex}`}
            >
              <PlusIcon className="h-4 w-4 mr-1" />
              追加(25mごと)
            </Button>
            <Button
              type="button"
              onClick={onAddSplitTime}
              variant="outline"
              className="text-xs"
              disabled={isLoading}
              data-testid={`record-split-add-button-${sectionIndex}`}
            >
              <PlusIcon className="h-4 w-4 mr-1" />
              追加
            </Button>
          </div>
        </div>
        {formData.splitTimes.length === 0 ? (
          <p className="text-sm text-gray-500">スプリットタイムはありません</p>
        ) : (
          <div className="space-y-2">
            {sortedSplitTimes.map(({ st, originalIndex }, splitIndex) => (
              <div
                key={st.uiKey || `${index}-${originalIndex}`}
                className="flex items-center space-x-2"
              >
                <Input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={st.distance === 0 || st.distance === '' ? '' : String(st.distance)}
                  onChange={(e) => {
                    const value = e.target.value
                    if (value === '' || /^\d+$/.test(value)) {
                      onSplitTimeChange(originalIndex, 'distance', value)
                    }
                  }}
                  placeholder="距離 (m)"
                  className="w-24"
                  data-testid={`record-split-distance-${sectionIndex}-${originalIndex + 1}`}
                />
                <Input
                  type="text"
                  value={st.splitTimeDisplayValue || ''}
                  onChange={(e) =>
                    onSplitTimeChange(originalIndex, 'splitTime', e.target.value)
                  }
                  placeholder="例: 28.50 または 0:28.50"
                  className="flex-1"
                  data-testid={`record-split-time-${sectionIndex}-${originalIndex + 1}`}
                />
                <button
                  type="button"
                  onClick={() => onRemoveSplitTime(originalIndex)}
                  className="p-2 text-red-600 hover:text-red-700"
                  disabled={isLoading}
                  data-testid={`record-split-remove-button-${sectionIndex}-${splitIndex + 1}`}
                >
                  <TrashIcon className="h-5 w-5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Lap-Time表示 */}
        <LapTimeDisplay splitTimes={validSplitTimes} raceDistance={raceDistance} />
      </div>

      {/* ビデオURL */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          ビデオURL
        </label>
        <Input
          type="url"
          value={formData.videoUrl}
          onChange={(e) => onVideoChange(e.target.value)}
          placeholder="https://..."
          className="w-full"
          data-testid={`record-video-${sectionIndex}`}
        />
      </div>

      {/* メモ */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">メモ</label>
        <textarea
          value={formData.note}
          onChange={(e) => onNoteChange(e.target.value)}
          placeholder="記録に関するメモ（任意）"
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          data-testid={`record-note-${sectionIndex}`}
        />
      </div>
    </div>
  )
}
