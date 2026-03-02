'use client'

import React, { type ReactNode } from 'react'
import { useDroppable } from '@dnd-kit/core'

interface DroppableGroupZoneProps {
  groupId: string
  groupName: string
  children: ReactNode
  memberCount: number
}

export const DroppableGroupZone: React.FC<DroppableGroupZoneProps> = ({
  groupId,
  groupName,
  children,
  memberCount,
}) => {
  const { isOver, setNodeRef } = useDroppable({ id: groupId })

  return (
    <div
      ref={setNodeRef}
      className={`rounded-lg border-2 border-dashed transition-colors ${
        isOver
          ? 'border-blue-400 bg-blue-50'
          : 'border-gray-200 bg-gray-50/50'
      }`}
    >
      <div className="flex items-center justify-between px-2 py-1.5 sm:px-3 sm:py-2">
        <span className="text-[11px] sm:text-xs font-semibold text-gray-700">{groupName}</span>
        <span className="text-[11px] sm:text-xs text-gray-400">{memberCount}人</span>
      </div>
      <div className="px-1.5 pb-1.5 sm:px-2 sm:pb-2 min-h-[32px] sm:min-h-[40px] flex flex-wrap gap-1 sm:gap-1.5">
        {children}
      </div>
    </div>
  )
}
