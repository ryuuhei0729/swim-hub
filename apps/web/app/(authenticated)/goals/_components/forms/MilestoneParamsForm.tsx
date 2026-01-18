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
          onChange={(e) => {
            const parsed = parseInt(e.target.value, 10)
            const value = Number.isFinite(parsed) ? parsed : 0
            onChange({ ...params, distance: value })
          }}
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
  const [averageTimeDisplayValue, setAverageTimeDisplayValue] = useState<string>('')
  const [averageTimeError, setAverageTimeError] = useState<string>('')
  const [circleDisplayValue, setCircleDisplayValue] = useState<string>('')
  const [circleError, setCircleError] = useState<string>('')

  // params.target_average_timeが変更されたときに表示値を更新
  useEffect(() => {
    if (params.target_average_time > 0) {
      setAverageTimeDisplayValue(formatTime(params.target_average_time))
      setAverageTimeError('')
    } else {
      setAverageTimeDisplayValue('')
    }
  }, [params.target_average_time])

  // params.circleが変更されたときに表示値を更新
  useEffect(() => {
    if (params.circle > 0) {
      setCircleDisplayValue(formatTime(params.circle))
      setCircleError('')
    } else {
      setCircleDisplayValue('')
    }
  }, [params.circle])

  const handleAverageTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setAverageTimeDisplayValue(value)

    // 空の場合はエラーをクリア
    if (value.trim() === '') {
      setAverageTimeError('')
      onChange({ ...params, target_average_time: 0 })
      return
    }

    // 入力値を秒数に変換
    const seconds = parseTimeToSeconds(value)
    
    // 有効な値の場合のみ更新
    if (!isNaN(seconds) && seconds >= 0) {
      setAverageTimeError('')
      onChange({ ...params, target_average_time: seconds })
    }
  }

  const handleAverageTimeBlur = () => {
    // フォーカスが外れたときにバリデーション
    if (averageTimeDisplayValue.trim() === '') {
      setAverageTimeError('平均目標タイムを入力してください')
      return
    }

    const seconds = parseTimeToSeconds(averageTimeDisplayValue)
    if (isNaN(seconds) || seconds < 0) {
      setAverageTimeError('有効なタイム形式で入力してください（例: 1:14.28 または 74.28）')
    } else {
      setAverageTimeError('')
      // 表示値を正規化
      setAverageTimeDisplayValue(formatTime(seconds))
    }
  }

  const handleCircleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setCircleDisplayValue(value)

    // 空の場合はエラーをクリア
    if (value.trim() === '') {
      setCircleError('')
      onChange({ ...params, circle: 0 })
      return
    }

    // 入力値を秒数に変換
    const seconds = parseTimeToSeconds(value)
    
    // 有効な値の場合のみ更新
    if (!isNaN(seconds) && seconds >= 0) {
      setCircleError('')
      onChange({ ...params, circle: seconds })
    }
  }

  const handleCircleBlur = () => {
    // フォーカスが外れたときにバリデーション
    if (circleDisplayValue.trim() === '') {
      setCircleError('サークルを入力してください')
      return
    }

    const seconds = parseTimeToSeconds(circleDisplayValue)
    if (isNaN(seconds) || seconds < 0) {
      setCircleError('有効なタイム形式で入力してください（例: 1:30 または 90）')
    } else {
      setCircleError('')
      // 表示値を正規化
      setCircleDisplayValue(formatTime(seconds))
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
          onChange={(e) => {
            const parsed = parseInt(e.target.value, 10)
            const value = Number.isFinite(parsed) ? parsed : 0
            onChange({ ...params, distance: value })
          }}
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
          onChange={(e) => {
            const parsed = parseInt(e.target.value, 10)
            const value = Number.isFinite(parsed) ? parsed : 0
            onChange({ ...params, reps: value })
          }}
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
          onChange={(e) => {
            const parsed = parseInt(e.target.value, 10)
            const value = Number.isFinite(parsed) ? parsed : 0
            onChange({ ...params, sets: value })
          }}
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          平均目標タイム
        </label>
        <Input
          type="text"
          value={averageTimeDisplayValue}
          onChange={handleAverageTimeChange}
          onBlur={handleAverageTimeBlur}
          placeholder="例: 1:14.28 または 74.28"
          required
          className={averageTimeError ? 'border-red-500' : ''}
        />
        {averageTimeError ? (
          <p className="text-xs text-red-500 mt-1">{averageTimeError}</p>
        ) : (
          <p className="text-xs text-gray-500 mt-1">
            形式: 分:秒.小数（例: 1:14.28）または 秒.小数（例: 74.28）
          </p>
        )}
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
          サークル
        </label>
        <Input
          type="text"
          value={circleDisplayValue}
          onChange={handleCircleChange}
          onBlur={handleCircleBlur}
          placeholder="例: 1:30 または 90"
          required
          className={circleError ? 'border-red-500' : ''}
        />
        {circleError ? (
          <p className="text-xs text-red-500 mt-1">{circleError}</p>
        ) : (
          <p className="text-xs text-gray-500 mt-1">
            形式: 分:秒.小数（例: 1:30）または 秒.小数（例: 90）
          </p>
        )}
      </div>
    </div>
  )
}

interface SetParamsFormProps {
  params: MilestoneSetParams
  onChange: (params: MilestoneSetParams) => void
}

export function SetParamsForm({ params, onChange }: SetParamsFormProps) {
  const [circleDisplayValue, setCircleDisplayValue] = useState<string>('')
  const [circleError, setCircleError] = useState<string>('')

  // params.circleが変更されたときに表示値を更新
  useEffect(() => {
    if (params.circle > 0) {
      setCircleDisplayValue(formatTime(params.circle))
      setCircleError('')
    } else {
      setCircleDisplayValue('')
    }
  }, [params.circle])

  const handleCircleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setCircleDisplayValue(value)

    // 空の場合はエラーをクリア
    if (value.trim() === '') {
      setCircleError('')
      onChange({ ...params, circle: 0 })
      return
    }

    // 入力値を秒数に変換
    const seconds = parseTimeToSeconds(value)
    
    // 有効な値の場合のみ更新
    if (!isNaN(seconds) && seconds >= 0) {
      setCircleError('')
      onChange({ ...params, circle: seconds })
    }
  }

  const handleCircleBlur = () => {
    // フォーカスが外れたときにバリデーション
    if (circleDisplayValue.trim() === '') {
      setCircleError('サークルを入力してください')
      return
    }

    const seconds = parseTimeToSeconds(circleDisplayValue)
    if (isNaN(seconds) || seconds < 0) {
      setCircleError('有効なタイム形式で入力してください（例: 1:30 または 90）')
    } else {
      setCircleError('')
      // 表示値を正規化
      setCircleDisplayValue(formatTime(seconds))
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
          onChange={(e) => {
            const parsed = parseInt(e.target.value, 10)
            const value = Number.isFinite(parsed) ? parsed : 0
            onChange({ ...params, distance: value })
          }}
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
          onChange={(e) => {
            const parsed = parseInt(e.target.value, 10)
            const value = Number.isFinite(parsed) ? parsed : 0
            onChange({ ...params, reps: value })
          }}
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
          onChange={(e) => {
            const parsed = parseInt(e.target.value, 10)
            const value = Number.isFinite(parsed) ? parsed : 0
            onChange({ ...params, sets: value })
          }}
          required
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          サークル
        </label>
        <Input
          type="text"
          value={circleDisplayValue}
          onChange={handleCircleChange}
          onBlur={handleCircleBlur}
          placeholder="例: 1:30 または 90"
          required
          className={circleError ? 'border-red-500' : ''}
        />
        {circleError ? (
          <p className="text-xs text-red-500 mt-1">{circleError}</p>
        ) : (
          <p className="text-xs text-gray-500 mt-1">
            形式: 分:秒.小数（例: 1:30）または 秒.小数（例: 90）
          </p>
        )}
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
