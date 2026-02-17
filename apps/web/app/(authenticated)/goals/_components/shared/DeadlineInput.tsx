'use client'

import React from 'react'
import Button from '@/components/ui/Button'
import DatePicker from '@/components/ui/DatePicker'
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
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <DatePicker
            label={label}
            value={value}
            onChange={onChange}
            popupPosition="top"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={handleSetGoalDeadline}
          className="whitespace-nowrap h-10"
        >
          目標の期限と揃える
        </Button>
      </div>
    </div>
  )
}
