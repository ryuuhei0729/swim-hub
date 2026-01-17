'use client'

import React from 'react'
import { Button, Input } from '@/components/ui'
import { parseISO, isValid, format } from 'date-fns'

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
      // YYYY-MM-DD形式の文字列はそのまま使用（タイムゾーンシフトを避ける）
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/
      if (dateRegex.test(goalCompetitionDate)) {
        onChange(goalCompetitionDate)
      } else {
        // それ以外の形式の場合はparseISOで安全にパース
        const parsedDate = parseISO(goalCompetitionDate)
        if (isValid(parsedDate)) {
          onChange(format(parsedDate, 'yyyy-MM-dd'))
        }
      }
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
