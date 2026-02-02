'use client'

import React, { useMemo } from 'react'
import { Button, Input } from '@/components/ui'
import { PlusIcon, TrashIcon } from '@heroicons/react/24/outline'
import { formatTimeBest } from '@/utils/formatters'
import { LapTimeDisplay } from '../../LapTimeDisplay'
import type { EntryInfo } from '@apps/shared/types/ui'
import type { RecordLogFormState, StyleOption } from '../types'
import type { BestTime } from '@/types/member-detail'

interface RecordLogEntryProps {
  formData: RecordLogFormState
  index: number
  entryInfo?: EntryInfo
  styles: StyleOption[]
  /** プールタイプ（0: 短水路, 1: 長水路） */
  poolType: number
  /** ユーザーのベストタイム一覧 */
  bestTimes: BestTime[]
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
  poolType,
  bestTimes,
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

  // 現在の種目・プールタイプ・リレーフラグに基づいてベストタイムを取得（優先順位付き）
  // リレーOFFの場合: 1. 同じ水路・非リレー → 2. 同じ水路・リレー → 3. 異なる水路・非リレー → 4. 異なる水路・リレー
  // リレーONの場合: 1. 同じ水路・リレー → 2. 同じ水路・非リレー → 3. 異なる水路・リレー → 4. 異なる水路・非リレー
  const currentBestTime = useMemo((): { time: number; label: string } | null => {
    if (!currentStyle || !bestTimes.length) return null

    const styleName = currentStyle.nameJp
    const isRelaying = formData.isRelaying
    const otherPoolType = poolType === 0 ? 1 : 0
    const otherPoolLabel = poolType === 0 ? '長水路' : '短水路'

    // 同じ水路のベストタイムを検索
    const samePool = bestTimes.find((bt) =>
      bt.style.name_jp === styleName && bt.pool_type === poolType
    )
    // 異なる水路のベストタイムを検索
    const otherPool = bestTimes.find((bt) =>
      bt.style.name_jp === styleName && bt.pool_type === otherPoolType
    )

    if (isRelaying) {
      // リレーONの場合の優先順位
      // 1. 同じ水路・リレー
      if (samePool?.relayingTime) {
        return { time: samePool.relayingTime.time, label: 'ベストタイム(引継)' }
      }
      // 2. 同じ水路・非リレー
      if (samePool && !samePool.is_relaying) {
        return { time: samePool.time, label: 'ベストタイム' }
      }
      // 3. 異なる水路・リレー
      if (otherPool?.relayingTime) {
        return { time: otherPool.relayingTime.time, label: `ベストタイム(${otherPoolLabel}引継)` }
      }
      // 4. 異なる水路・非リレー
      if (otherPool && !otherPool.is_relaying) {
        return { time: otherPool.time, label: `ベストタイム(${otherPoolLabel})` }
      }
    } else {
      // リレーOFFの場合の優先順位
      // 1. 同じ水路・非リレー
      if (samePool && !samePool.is_relaying) {
        return { time: samePool.time, label: 'ベストタイム' }
      }
      // 2. 同じ水路・リレー
      if (samePool?.relayingTime) {
        return { time: samePool.relayingTime.time, label: 'ベストタイム(引継)' }
      }
      // 3. 異なる水路・非リレー
      if (otherPool && !otherPool.is_relaying) {
        return { time: otherPool.time, label: `ベストタイム(${otherPoolLabel})` }
      }
      // 4. 異なる水路・リレー
      if (otherPool?.relayingTime) {
        return { time: otherPool.relayingTime.time, label: `ベストタイム(${otherPoolLabel}引継)` }
      }
    }

    return null
  }, [currentStyle, bestTimes, poolType, formData.isRelaying])

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
          種目 {sectionIndex}
        </h4>
        <div className="flex flex-wrap items-center gap-2">
          {entryInfo && entryInfo.entryTime && entryInfo.entryTime > 0 && (
            <div className="text-xs text-blue-800 bg-blue-100 px-3 py-1 rounded-full inline-flex items-center gap-2">
              <span className="text-blue-700">エントリータイム: {formatTimeBest(entryInfo.entryTime)}</span>
            </div>
          )}
          {currentBestTime && (
            <div className="text-xs text-green-800 bg-green-100 px-3 py-1 rounded-full inline-flex items-center gap-2">
              <span className="text-green-700">{currentBestTime.label}: {formatTimeBest(currentBestTime.time)}</span>
            </div>
          )}
        </div>
      </div>

      {/* 種目とリレー */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          種目 <span className="text-red-500">*</span>
        </label>
        <div className="flex items-center gap-3">
          <select
            value={entryInfo ? String(entryInfo.styleId) : formData.styleId}
            onChange={(e) => onStyleChange(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
            required
            disabled={!!entryInfo}
            data-testid={`record-style-${sectionIndex}`}
          >
            <option value="">種目を選択</option>
            {styleOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
          <div className="flex items-center shrink-0">
            <input
              type="checkbox"
              id={`isRelaying-${sectionIndex}`}
              checked={formData.isRelaying}
              onChange={(e) => onToggleRelaying(e.target.checked)}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              data-testid={`record-relay-${sectionIndex}`}
            />
            <label htmlFor={`isRelaying-${sectionIndex}`} className="ml-2 text-sm text-gray-700 whitespace-nowrap">
              リレー種目
            </label>
          </div>
        </div>
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
            placeholder="例: 1:23.45   32.45"
            className="w-full"
            data-testid={`record-time-${sectionIndex}`}
          />
        </div>
        <div className="w-20 sm:w-36">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            <span className="sm:hidden">RT</span>
            <span className="hidden sm:inline">リアクションタイム</span>
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

      {/* スプリットタイム */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-xs sm:text-sm font-medium text-gray-700 whitespace-nowrap">
            スプリットタイム
          </label>
          <div className="flex gap-1">
            <Button
              type="button"
              onClick={onAddSplitTimesEvery25m}
              variant="outline"
              className="text-[10px] px-2 py-1 h-7"
              disabled={isLoading || !raceDistance}
              data-testid={`record-split-add-25m-button-${sectionIndex}`}
            >
              <PlusIcon className="h-3 w-3 mr-0.5" />
              追加(25mごと)
            </Button>
            <Button
              type="button"
              onClick={onAddSplitTime}
              variant="outline"
              className="text-[10px] px-2 py-1 h-7"
              disabled={isLoading}
              data-testid={`record-split-add-button-${sectionIndex}`}
            >
              <PlusIcon className="h-3 w-3 mr-0.5" />
              追加
            </Button>
          </div>
        </div>
        {formData.splitTimes.length > 0 && (
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
                  placeholder="例: 28.50"
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
