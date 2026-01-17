'use client'

import React, { useState, useEffect } from 'react'
import { Input } from '@/components/ui'
import type { MilestoneTimeParams, MilestoneRepsTimeParams, MilestoneSetParams } from '@apps/shared/types'
import { formatTime, parseTimeToSeconds } from '@/utils/formatters'
import StyleSelector from '../shared/StyleSelector'
import SwimCategorySelector from '../shared/SwimCategorySelector'

interface TimeParamsFormProps {
  params: MilestoneTimeParams
  onChange: (params: MilestoneTimeParams) => void
}

export function TimeParamsForm({ params, onChange }: TimeParamsFormProps) {
  const [timeDisplayValue, setTimeDisplayValue] = useState<string>('')
  const [timeError, setTimeError] = useState<string>('')

  // params.target_timeが変更されたときに表示値を更新
  useEffect(() => {
    if (params.target_time > 0) {
      setTimeDisplayValue(formatTime(params.target_time))
      setTimeError('')
    } else {
      setTimeDisplayValue('')
    }
  }, [params.target_time])

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setTimeDisplayValue(value)

    // 空の場合はエラーをクリア
    if (value.trim() === '') {
      setTimeError('')
      onChange({ ...params, target_time: 0 })
      return
    }

    // 入力値を秒数に変換
    const seconds = parseTimeToSeconds(value)
    
    // 有効な値の場合のみ更新
    if (!isNaN(seconds) && seconds >= 0) {
      setTimeError('')
      onChange({ ...params, target_time: seconds })
    } else {
      // 無効な値の場合はエラーを表示（ただし入力中は表示しない）
      // フォーカスが外れたときにエラーを表示するため、ここではエラーを設定しない
    }
  }

  const handleTimeBlur = () => {
    // フォーカスが外れたときにバリデーション
    if (timeDisplayValue.trim() === '') {
      setTimeError('目標タイムを入力してください')
      return
    }

    const seconds = parseTimeToSeconds(timeDisplayValue)
    if (isNaN(seconds) || seconds < 0) {
      setTimeError('有効なタイム形式で入力してください（例: 1:14.28 または 74.28）')
    } else {
      setTimeError('')
      // 表示値を正規化
      setTimeDisplayValue(formatTime(seconds))
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          距離 (m)
        </label>
        <Input
          type="number"
          value={params.distance}
          onChange={(e) => onChange({ ...params, distance: parseInt(e.target.value, 10) })}
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          種目
        </label>
        <StyleSelector
          value={params.style}
          onChange={(value) => onChange({ ...params, style: value })}
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          目標タイム
        </label>
        <Input
          type="text"
          value={timeDisplayValue}
          onChange={handleTimeChange}
          onBlur={handleTimeBlur}
          placeholder="例: 1:14.28 または 74.28"
          required
          className={timeError ? 'border-red-500' : ''}
        />
        {timeError ? (
          <p className="text-xs text-red-500 mt-1">{timeError}</p>
        ) : (
          <p className="text-xs text-gray-500 mt-1">
            形式: 分:秒.小数（例: 1:14.28）または 秒.小数（例: 74.28）
          </p>
        )}
      </div>
    </div>
  )
}

interface RepsTimeParamsFormProps {
  params: MilestoneRepsTimeParams
  onChange: (params: MilestoneRepsTimeParams) => void
}

export function RepsTimeParamsForm({ params, onChange }: RepsTimeParamsFormProps) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          距離 (m)
        </label>
        <Input
          type="number"
          value={params.distance}
          onChange={(e) => onChange({ ...params, distance: parseInt(e.target.value, 10) })}
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          本数
        </label>
        <Input
          type="number"
          value={params.reps}
          onChange={(e) => onChange({ ...params, reps: parseInt(e.target.value, 10) })}
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          セット数
        </label>
        <Input
          type="number"
          value={params.sets}
          onChange={(e) => onChange({ ...params, sets: parseInt(e.target.value, 10) })}
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          平均目標タイム (秒)
        </label>
        <Input
          type="number"
          step="0.01"
          value={params.target_average_time}
          onChange={(e) => onChange({ ...params, target_average_time: parseFloat(e.target.value) })}
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          種目
        </label>
        <StyleSelector
          value={params.style}
          onChange={(value) => onChange({ ...params, style: value })}
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Swim/Pull/Kick
        </label>
        <SwimCategorySelector
          value={params.swim_category}
          onChange={(value) => onChange({ ...params, swim_category: value })}
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          サークル (秒)
        </label>
        <Input
          type="number"
          step="0.01"
          value={params.circle}
          onChange={(e) => onChange({ ...params, circle: parseFloat(e.target.value) })}
          required
        />
      </div>
    </div>
  )
}

interface SetParamsFormProps {
  params: MilestoneSetParams
  onChange: (params: MilestoneSetParams) => void
}

export function SetParamsForm({ params, onChange }: SetParamsFormProps) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          距離 (m)
        </label>
        <Input
          type="number"
          value={params.distance}
          onChange={(e) => onChange({ ...params, distance: parseInt(e.target.value, 10) })}
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          本数
        </label>
        <Input
          type="number"
          value={params.reps}
          onChange={(e) => onChange({ ...params, reps: parseInt(e.target.value, 10) })}
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          セット数
        </label>
        <Input
          type="number"
          value={params.sets}
          onChange={(e) => onChange({ ...params, sets: parseInt(e.target.value, 10) })}
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          サークル (秒)
        </label>
        <Input
          type="number"
          step="0.01"
          value={params.circle}
          onChange={(e) => onChange({ ...params, circle: parseFloat(e.target.value) })}
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          種目
        </label>
        <StyleSelector
          value={params.style}
          onChange={(value) => onChange({ ...params, style: value })}
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Swim/Pull/Kick
        </label>
        <SwimCategorySelector
          value={params.swim_category}
          onChange={(value) => onChange({ ...params, swim_category: value })}
          required
        />
      </div>
    </div>
  )
}
