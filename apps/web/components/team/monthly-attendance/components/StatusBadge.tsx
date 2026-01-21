'use client'

import React from 'react'

interface StatusBadgeProps {
  status: 'has_unanswered' | 'all_answered' | null
}

export const StatusBadge = React.memo(({ status }: StatusBadgeProps) => {
  if (status === null) return null

  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
      status === 'has_unanswered'
        ? 'bg-yellow-100 text-yellow-800'
        : 'bg-green-100 text-green-800'
    }`}>
      {status === 'has_unanswered' ? '未回答あり' : '全て回答済み'}
    </span>
  )
})

StatusBadge.displayName = 'StatusBadge'

export const getStatusBadge = (status: 'open' | 'closed' | null | undefined) => {
  switch (status) {
    case 'open':
      return <span className="text-xs px-2 py-0.5 rounded-full bg-blue-200 text-blue-800">提出受付中</span>
    case 'closed':
      return <span className="text-xs px-2 py-0.5 rounded-full bg-red-200 text-red-800">提出締切</span>
    default:
      return <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 text-gray-700">未設定</span>
  }
}
