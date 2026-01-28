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
  const [distanceValue, setDistanceValue] = useState<string>(params.distance > 0 ? String(params.distance) : '')

  // params.target_timeが変更されたときに表示値を更新
  useEffect(() => {
    if (params.target_time > 0) {
      setTimeDisplayValue(formatTime(params.target_time))
      setTimeError('')
    } else {
      setTimeDisplayValue('')
    }
  }, [params.target_time])

  // params.distanceが変更されたときに表示値を更新
  useEffect(() => {
    if (params.distance > 0) {
      setDistanceValue(String(params.distance))
    }
  }, [params.distance])

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

  const handleDistanceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setDistanceValue(value)
    const parsed = parseInt(value, 10)
    if (Number.isFinite(parsed) && parsed > 0) {
      onChange({ ...params, distance: parsed })
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-2">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            距離 (m)
          </label>
          <Input
            type="number"
            value={distanceValue}
            onChange={handleDistanceChange}
            placeholder="100"
            min="1"
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
            S/P/K
          </label>
          <SwimCategorySelector
            value={params.swim_category}
            onChange={(value) => onChange({ ...params, swim_category: value })}
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
            placeholder="1:14.28"
            required
            className={timeError ? 'border-red-500' : ''}
          />
        </div>
      </div>
      {timeError && (
        <p className="text-xs text-red-500">{timeError}</p>
      )}
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
  const [circleMin, setCircleMin] = useState<string>(params.circle > 0 ? String(Math.floor(params.circle / 60)) : '')
  const [circleSec, setCircleSec] = useState<string>(params.circle > 0 ? String(params.circle % 60) : '')
  const [distanceValue, setDistanceValue] = useState<string>(params.distance > 0 ? String(params.distance) : '')
  const [repsValue, setRepsValue] = useState<string>(params.reps > 0 ? String(params.reps) : '')
  const [setsValue, setSetsValue] = useState<string>(params.sets > 0 ? String(params.sets) : '')

  // params.target_average_timeが変更されたときに表示値を更新
  useEffect(() => {
    if (params.target_average_time > 0) {
      setAverageTimeDisplayValue(formatTime(params.target_average_time))
      setAverageTimeError('')
    } else {
      setAverageTimeDisplayValue('')
    }
  }, [params.target_average_time])

  // params.circleが変更されたときに分・秒を更新
  useEffect(() => {
    if (params.circle > 0) {
      setCircleMin(String(Math.floor(params.circle / 60)))
      setCircleSec(String(params.circle % 60))
    }
  }, [params.circle])

  // params.distance, reps, setsが変更されたときに表示値を更新
  useEffect(() => {
    if (params.distance > 0) setDistanceValue(String(params.distance))
  }, [params.distance])
  useEffect(() => {
    if (params.reps > 0) setRepsValue(String(params.reps))
  }, [params.reps])
  useEffect(() => {
    if (params.sets > 0) setSetsValue(String(params.sets))
  }, [params.sets])

  const handleAverageTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setAverageTimeDisplayValue(value)

    if (value.trim() === '') {
      setAverageTimeError('')
      onChange({ ...params, target_average_time: 0 })
      return
    }

    const seconds = parseTimeToSeconds(value)
    if (!isNaN(seconds) && seconds >= 0) {
      setAverageTimeError('')
      onChange({ ...params, target_average_time: seconds })
    }
  }

  const handleAverageTimeBlur = () => {
    if (averageTimeDisplayValue.trim() === '') {
      setAverageTimeError('平均目標タイムを入力してください')
      return
    }

    const seconds = parseTimeToSeconds(averageTimeDisplayValue)
    if (isNaN(seconds) || seconds < 0) {
      setAverageTimeError('有効なタイム形式で入力してください')
    } else {
      setAverageTimeError('')
      setAverageTimeDisplayValue(formatTime(seconds))
    }
  }

  const handleDistanceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setDistanceValue(value)
    const parsed = parseInt(value, 10)
    if (Number.isFinite(parsed) && parsed > 0) {
      onChange({ ...params, distance: parsed })
    }
  }

  const handleRepsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setRepsValue(value)
    const parsed = parseInt(value, 10)
    if (Number.isFinite(parsed) && parsed > 0) {
      onChange({ ...params, reps: parsed })
    }
  }

  const handleSetsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setSetsValue(value)
    const parsed = parseInt(value, 10)
    if (Number.isFinite(parsed) && parsed > 0) {
      onChange({ ...params, sets: parsed })
    }
  }

  const handleCircleMinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setCircleMin(value)
    const min = value === '' ? 0 : parseInt(value, 10)
    const sec = circleSec === '' ? 0 : parseInt(circleSec, 10)
    const totalSeconds = (Number.isFinite(min) ? min : 0) * 60 + (Number.isFinite(sec) ? sec : 0)
    onChange({ ...params, circle: totalSeconds })
  }

  const handleCircleSecChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setCircleSec(value)
    const min = circleMin === '' ? 0 : parseInt(circleMin, 10)
    const sec = value === '' ? 0 : Math.min(parseInt(value, 10), 59)
    const totalSeconds = (Number.isFinite(min) ? min : 0) * 60 + (Number.isFinite(sec) ? sec : 0)
    onChange({ ...params, circle: totalSeconds })
  }

  return (
    <div className="space-y-3">
      {/* 1行目：距離、本数、セット数、平均目標タイム */}
      <div className="grid grid-cols-4 gap-2">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            距離 (m)
          </label>
          <Input
            type="number"
            value={distanceValue}
            onChange={handleDistanceChange}
            placeholder="100"
            min="1"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            本数
          </label>
          <Input
            type="number"
            value={repsValue}
            onChange={handleRepsChange}
            placeholder="4"
            min="1"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            セット数
          </label>
          <Input
            type="number"
            value={setsValue}
            onChange={handleSetsChange}
            placeholder="1"
            min="1"
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
            placeholder="1:14.28"
            required
            className={averageTimeError ? 'border-red-500' : ''}
          />
        </div>
      </div>
      {averageTimeError && (
        <p className="text-xs text-red-500">{averageTimeError}</p>
      )}

      {/* 2行目：種目、Swim/Pull/Kick、サークル（分）、サークル（秒） */}
      <div className="grid grid-cols-4 gap-2">
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
            S/P/K
          </label>
          <SwimCategorySelector
            value={params.swim_category}
            onChange={(value) => onChange({ ...params, swim_category: value })}
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            サークル(分)
          </label>
          <Input
            type="number"
            value={circleMin}
            onChange={handleCircleMinChange}
            placeholder="1"
            min="0"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            サークル(秒)
          </label>
          <Input
            type="number"
            value={circleSec}
            onChange={handleCircleSecChange}
            placeholder="30"
            min="0"
            max="59"
          />
        </div>
      </div>
    </div>
  )
}

interface SetParamsFormProps {
  params: MilestoneSetParams
  onChange: (params: MilestoneSetParams) => void
}

export function SetParamsForm({ params, onChange }: SetParamsFormProps) {
  const [circleMin, setCircleMin] = useState<string>(params.circle > 0 ? String(Math.floor(params.circle / 60)) : '')
  const [circleSec, setCircleSec] = useState<string>(params.circle > 0 ? String(params.circle % 60) : '')
  const [distanceValue, setDistanceValue] = useState<string>(params.distance > 0 ? String(params.distance) : '')
  const [repsValue, setRepsValue] = useState<string>(params.reps > 0 ? String(params.reps) : '')
  const [setsValue, setSetsValue] = useState<string>(params.sets > 0 ? String(params.sets) : '')

  // params.circleが変更されたときに分・秒を更新
  useEffect(() => {
    if (params.circle > 0) {
      setCircleMin(String(Math.floor(params.circle / 60)))
      setCircleSec(String(params.circle % 60))
    }
  }, [params.circle])

  // params.distance, reps, setsが変更されたときに表示値を更新
  useEffect(() => {
    if (params.distance > 0) setDistanceValue(String(params.distance))
  }, [params.distance])
  useEffect(() => {
    if (params.reps > 0) setRepsValue(String(params.reps))
  }, [params.reps])
  useEffect(() => {
    if (params.sets > 0) setSetsValue(String(params.sets))
  }, [params.sets])

  const handleDistanceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setDistanceValue(value)
    const parsed = parseInt(value, 10)
    if (Number.isFinite(parsed) && parsed > 0) {
      onChange({ ...params, distance: parsed })
    }
  }

  const handleRepsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setRepsValue(value)
    const parsed = parseInt(value, 10)
    if (Number.isFinite(parsed) && parsed > 0) {
      onChange({ ...params, reps: parsed })
    }
  }

  const handleSetsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setSetsValue(value)
    const parsed = parseInt(value, 10)
    if (Number.isFinite(parsed) && parsed > 0) {
      onChange({ ...params, sets: parsed })
    }
  }

  const handleCircleMinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setCircleMin(value)
    const min = value === '' ? 0 : parseInt(value, 10)
    const sec = circleSec === '' ? 0 : parseInt(circleSec, 10)
    const totalSeconds = (Number.isFinite(min) ? min : 0) * 60 + (Number.isFinite(sec) ? sec : 0)
    onChange({ ...params, circle: totalSeconds })
  }

  const handleCircleSecChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setCircleSec(value)
    const min = circleMin === '' ? 0 : parseInt(circleMin, 10)
    const sec = value === '' ? 0 : Math.min(parseInt(value, 10), 59)
    const totalSeconds = (Number.isFinite(min) ? min : 0) * 60 + (Number.isFinite(sec) ? sec : 0)
    onChange({ ...params, circle: totalSeconds })
  }

  return (
    <div className="space-y-3">
      {/* 1行目：距離、本数、セット数 */}
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            距離 (m)
          </label>
          <Input
            type="number"
            value={distanceValue}
            onChange={handleDistanceChange}
            placeholder="100"
            min="1"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            本数
          </label>
          <Input
            type="number"
            value={repsValue}
            onChange={handleRepsChange}
            placeholder="4"
            min="1"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            セット数
          </label>
          <Input
            type="number"
            value={setsValue}
            onChange={handleSetsChange}
            placeholder="1"
            min="1"
            required
          />
        </div>
      </div>

      {/* 2行目：種目、S/P/K、サークル（分）、サークル（秒） */}
      <div className="grid grid-cols-4 gap-2">
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
            S/P/K
          </label>
          <SwimCategorySelector
            value={params.swim_category}
            onChange={(value) => onChange({ ...params, swim_category: value })}
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            サークル(分)
          </label>
          <Input
            type="number"
            value={circleMin}
            onChange={handleCircleMinChange}
            placeholder="1"
            min="0"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            サークル(秒)
          </label>
          <Input
            type="number"
            value={circleSec}
            onChange={handleCircleSecChange}
            placeholder="30"
            min="0"
            max="59"
          />
        </div>
      </div>
    </div>
  )
}
