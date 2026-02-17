'use client'

import React from 'react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { PlusIcon, TrashIcon } from '@heroicons/react/24/outline'
import { LapTimeDisplay } from '../../LapTimeDisplay'
import type { RecordSet, SplitTimeInput, SwimStyle } from '../types'
import { parseTimeString, formatTimeDisplay } from '../utils/timeParser'

interface RecordSetItemProps {
  record: RecordSet
  recordIndex: number
  styles: SwimStyle[]
  canRemove: boolean
  onUpdate: (updates: Partial<RecordSet>) => void
  onRemove: () => void
  onAddSplitTime: () => void
  onAddSplitTimesEvery25m: () => void
  onUpdateSplitTime: (splitIndex: number, updates: Partial<SplitTimeInput>) => void
  onRemoveSplitTime: (splitIndex: number) => void
}

/**
 * 記録セット（種目）入力コンポーネント
 */
export default function RecordSetItem({
  record,
  recordIndex,
  styles,
  canRemove,
  onUpdate,
  onRemove,
  onAddSplitTime,
  onAddSplitTimesEvery25m,
  onUpdateSplitTime,
  onRemoveSplitTime,
}: RecordSetItemProps) {
  const styleId = `record-${record.id}-style`
  const timeId = `record-${record.id}-time`
  const relayId = `record-${record.id}-relay`
  const currentStyle = styles.find((s) => s.id === record.styleId)

  // 安全な数値パース関数
  const safeParseDistance = (value: string | number | undefined): number => {
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : 0
    }
    if (typeof value === 'string') {
      const parsed = parseInt(value, 10)
      return Number.isFinite(parsed) ? parsed : 0
    }
    return 0
  }

  // スプリットタイムを距離でソート（originalIndexをソート前にキャプチャ）
  const sortedSplitTimes = record.splitTimes
    .map((split, originalIndex) => ({ split, originalIndex }))
    .sort((a, b) => {
      const distA = safeParseDistance(a.split.distance)
      const distB = safeParseDistance(b.split.distance)
      return distA - distB
    })

  return (
    <div className="border border-gray-200 rounded-lg p-3 sm:p-4 space-y-3 sm:space-y-4 bg-blue-50">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <h4 className="text-sm sm:text-base font-medium text-gray-700">
          種目 {recordIndex + 1}
        </h4>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-red-500 hover:text-red-700"
            aria-label="種目を削除"
            data-testid={`record-remove-button-${recordIndex + 1}`}
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* 種目・タイム・リアクションタイム */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 sm:gap-4">
        <div>
          <label
            htmlFor={styleId}
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            種目
          </label>
          <select
            id={styleId}
            value={record.styleId}
            onChange={(e) => onUpdate({ styleId: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
            data-testid={`record-style-${recordIndex + 1}`}
          >
            <option value="">種目を選択</option>
            {styles.map((style) => (
              <option key={style.id} value={style.id}>
                {style.nameJp}
              </option>
            ))}
          </select>
        </div>

        <div className="md:col-span-2">
          <div className="grid grid-cols-[1fr_auto] gap-2 items-start">
            <div>
              <label
                htmlFor={timeId}
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                タイム
              </label>
              <Input
                id={timeId}
                type="text"
                value={
                  record.timeDisplayValue !== undefined
                    ? record.timeDisplayValue
                    : record.time > 0
                      ? formatTimeDisplay(record.time)
                      : ''
                }
                onChange={(e) => onUpdate({ timeDisplayValue: e.target.value })}
                onBlur={(e) => {
                  const timeStr = e.target.value
                  if (timeStr === '') {
                    onUpdate({ time: 0, timeDisplayValue: undefined })
                  } else {
                    const time = parseTimeString(timeStr)
                    onUpdate({ time, timeDisplayValue: undefined })
                  }
                }}
                placeholder="例: 1:30.50"
                required
                data-testid={`record-time-${recordIndex + 1}`}
              />
            </div>
            <div className="w-full sm:w-36">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                リアクションタイム
              </label>
              <Input
                type="number"
                step="0.01"
                min="0.40"
                max="1.00"
                value={record.reactionTime}
                onChange={(e) => onUpdate({ reactionTime: e.target.value })}
                placeholder="0.65"
                data-testid={`record-reaction-time-${recordIndex + 1}`}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center">
          <input
            id={relayId}
            type="checkbox"
            checked={record.isRelaying}
            onChange={(e) => onUpdate({ isRelaying: e.target.checked })}
            className="mr-2"
            data-testid={`record-relay-${recordIndex + 1}`}
          />
          <label htmlFor={relayId} className="text-sm text-gray-700">
            リレー
          </label>
        </div>
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
              className="text-sm"
              variant="outline"
              disabled={!currentStyle?.distance}
              data-testid={`record-split-add-25m-button-${recordIndex + 1}`}
            >
              <PlusIcon className="h-3 w-3 mr-1" />
              追加(25mごと)
            </Button>
            <Button
              type="button"
              onClick={onAddSplitTime}
              className="text-sm"
              variant="outline"
              data-testid={`record-split-add-button-${recordIndex + 1}`}
            >
              <PlusIcon className="h-3 w-3 mr-1" />
              スプリットを追加
            </Button>
          </div>
        </div>

        {sortedSplitTimes.map(({ split, originalIndex }) => (
          <div key={split.uiKey} className="flex items-center gap-2 mb-2">
            <Input
              type="text"
              placeholder="距離 (m)"
              value={split.distance}
              onChange={(e) => {
                const value = e.target.value
                if (value === '') {
                  onUpdateSplitTime(originalIndex, { distance: '' })
                } else {
                  const parsed = parseInt(value, 10)
                  onUpdateSplitTime(originalIndex, {
                    distance: Number.isFinite(parsed) ? parsed : '',
                  })
                }
              }}
              className="w-24"
              data-testid={`record-split-distance-${recordIndex + 1}-${originalIndex + 1}`}
            />
            <span className="text-gray-500">m:</span>
            <Input
              type="text"
              placeholder="例: 1:30.50"
              value={
                split.splitTimeDisplayValue !== undefined
                  ? split.splitTimeDisplayValue
                  : split.splitTime > 0
                    ? formatTimeDisplay(split.splitTime)
                    : ''
              }
              onChange={(e) =>
                onUpdateSplitTime(originalIndex, { splitTimeDisplayValue: e.target.value })
              }
              onBlur={(e) => {
                const timeStr = e.target.value
                if (timeStr === '') {
                  onUpdateSplitTime(originalIndex, {
                    splitTime: 0,
                    splitTimeDisplayValue: undefined,
                  })
                } else {
                  const time = parseTimeString(timeStr)
                  onUpdateSplitTime(originalIndex, {
                    splitTime: time,
                    splitTimeDisplayValue: undefined,
                  })
                }
              }}
              className="flex-1"
              data-testid={`record-split-time-${recordIndex + 1}-${originalIndex + 1}`}
            />
            <button
              type="button"
              onClick={() => onRemoveSplitTime(originalIndex)}
              className="text-red-500 hover:text-red-700"
              aria-label="スプリットを削除"
              data-testid={`record-split-remove-button-${recordIndex + 1}-${originalIndex + 1}`}
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          </div>
        ))}

        {/* Lap-Time表示 */}
        <LapTimeDisplay
          splitTimes={sortedSplitTimes.map(({ split }) => ({
            distance: split.distance,
            splitTime: split.splitTime,
          }))}
          raceDistance={currentStyle?.distance}
        />
      </div>

      {/* 動画URL・メモ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            動画URL
          </label>
          <Input
            type="url"
            value={record.videoUrl || ''}
            onChange={(e) => onUpdate({ videoUrl: e.target.value })}
            placeholder="https://..."
            data-testid={`record-video-${recordIndex + 1}`}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            メモ
          </label>
          <Input
            type="text"
            value={record.note}
            onChange={(e) => onUpdate({ note: e.target.value })}
            placeholder="特記事項"
            data-testid={`record-note-${recordIndex + 1}`}
          />
        </div>
      </div>
    </div>
  )
}
