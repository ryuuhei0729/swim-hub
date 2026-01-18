'use client'

import React from 'react'
import { SWIM_STYLES } from '../constants'

interface StyleSelectorProps {
  value: string
  onChange: (value: string) => void
  required?: boolean
  disabled?: boolean
}

/**
 * 泳法選択コンポーネント
 */
export default function StyleSelector({
  value,
  onChange,
  required = false,
  disabled = false
}: StyleSelectorProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 border border-gray-300 rounded-md"
      required={required}
      disabled={disabled}
    >
      {SWIM_STYLES.map((style) => (
        <option key={style.value} value={style.value}>
          {style.label}
        </option>
      ))}
    </select>
  )
}
