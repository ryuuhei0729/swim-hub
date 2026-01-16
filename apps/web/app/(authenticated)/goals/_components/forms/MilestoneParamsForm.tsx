'use client'

import React from 'react'
import { Input } from '@/components/ui'
import type { MilestoneTimeParams, MilestoneRepsTimeParams, MilestoneSetParams } from '@apps/shared/types'
import StyleSelector from '../shared/StyleSelector'
import SwimCategorySelector from '../shared/SwimCategorySelector'

interface TimeParamsFormProps {
  params: MilestoneTimeParams
  onChange: (params: MilestoneTimeParams) => void
}

export function TimeParamsForm({ params, onChange }: TimeParamsFormProps) {
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
          目標タイム (秒)
        </label>
        <Input
          type="number"
          step="0.01"
          value={params.target_time}
          onChange={(e) => onChange({ ...params, target_time: parseFloat(e.target.value) })}
          required
        />
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
