'use client'

import React from 'react'
import { Button, Input } from '@/components/ui'
import { format } from 'date-fns'

interface DeadlineInputProps {
  value: string
  onChange: (value: string) => void
  goalCompetitionDate: string
  label?: string
}

/**
 * 期限入力コンポーネント（目標の期限と揃えるボタン付き）
 */
export default function DeadlineInput({
  value,
  onChange,
  goalCompetitionDate,
  label = '期限日（任意）'
}: DeadlineInputProps) {
  const handleSetGoalDeadline = () => {
    if (goalCompetitionDate) {
      onChange(format(new Date(goalCompetitionDate), 'yyyy-MM-dd'))
    }
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        {label}
      </label>
      <div className="flex gap-2 items-center">
        <div className="flex-1">
          <Input
            type="date"
            value={value}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={handleSetGoalDeadline}
          className="whitespace-nowrap"
        >
          目標の期限と揃える
        </Button>
      </div>
    </div>
  )
}
