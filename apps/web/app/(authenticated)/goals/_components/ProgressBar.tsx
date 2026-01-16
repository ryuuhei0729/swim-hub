'use client'

import React from 'react'

interface ProgressBarProps {
  progress: number // 0-100
  className?: string
}

/**
 * 達成率プログレスバーコンポーネント
 */
export default function ProgressBar({ progress, className = '' }: ProgressBarProps) {
  const clampedProgress = Math.min(Math.max(progress, 0), 100)

  return (
    <div className={`w-full bg-gray-200 rounded-full h-2 ${className}`}>
      <div
        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
        style={{ width: `${clampedProgress}%` }}
      />
    </div>
  )
}
