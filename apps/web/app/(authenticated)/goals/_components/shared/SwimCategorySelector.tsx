'use client'

import React from 'react'
import { SWIM_CATEGORIES } from '../constants'

interface SwimCategorySelectorProps {
  value: 'Swim' | 'Pull' | 'Kick'
  onChange: (value: 'Swim' | 'Pull' | 'Kick') => void
  required?: boolean
  disabled?: boolean
}

/**
 * Swim/Pull/Kick選択コンポーネント
 */
export default function SwimCategorySelector({
  value,
  onChange,
  required = false,
  disabled = false
}: SwimCategorySelectorProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as 'Swim' | 'Pull' | 'Kick')}
      className="w-full px-3 py-2 border border-gray-300 rounded-md"
      required={required}
      disabled={disabled}
    >
      {SWIM_CATEGORIES.map((category) => (
        <option key={category.value} value={category.value}>
          {category.label}
        </option>
      ))}
    </select>
  )
}
