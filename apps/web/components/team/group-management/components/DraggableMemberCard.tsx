'use client'

import React from 'react'
import { useDraggable } from '@dnd-kit/core'
import Avatar from '@/components/ui/Avatar'

interface DraggableMemberCardProps {
  userId: string
  userName: string
  avatarUrl: string | null
}

export const DraggableMemberCard: React.FC<DraggableMemberCardProps> = ({
  userId,
  userName,
  avatarUrl,
}) => {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: userId,
  })

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{ touchAction: 'none' }}
      className={`flex items-center gap-1 sm:gap-2 px-1.5 py-1 sm:px-2.5 sm:py-1.5 bg-white border border-gray-200 rounded-md cursor-grab active:cursor-grabbing select-none transition-opacity ${
        isDragging ? 'opacity-30' : 'hover:border-blue-300 hover:bg-blue-50/30'
      }`}
    >
      <div className="hidden sm:block">
        <Avatar avatarUrl={avatarUrl} userName={userName} size="sm" />
      </div>
      <span className="text-[11px] sm:text-xs font-medium text-gray-800 truncate">{userName}</span>
    </div>
  )
}
