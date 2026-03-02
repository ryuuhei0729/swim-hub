'use client'

import React from 'react'
import { PencilIcon, TrashIcon, UsersIcon } from '@heroicons/react/24/outline'
import type { TeamGroupWithCount } from '../hooks/useTeamGroups'

interface GroupCardProps {
  group: TeamGroupWithCount
  onClick: (group: TeamGroupWithCount) => void
  onEdit: (group: TeamGroupWithCount) => void
  onDelete: (group: TeamGroupWithCount) => void
  onManageMembers: (group: TeamGroupWithCount) => void
}

export const GroupCard: React.FC<GroupCardProps> = ({
  group,
  onClick,
  onEdit,
  onDelete,
  onManageMembers,
}) => {
  return (
    <div className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg hover:border-blue-300 hover:bg-blue-50/30 transition-colors">
      <button
        type="button"
        onClick={() => onClick(group)}
        className="flex-1 min-w-0 text-left"
        aria-label={`${group.name} のメンバー一覧を表示`}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-900 truncate">{group.name}</span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs text-gray-500 bg-gray-100 rounded-full">
            <UsersIcon className="h-3 w-3" />
            {group.member_count}
          </span>
        </div>
      </button>
      <div className="flex items-center gap-1 ml-2 shrink-0">
        <button
          type="button"
          onClick={() => onManageMembers(group)}
          className="p-1.5 text-gray-400 hover:text-blue-600 rounded-md hover:bg-blue-50 transition-colors"
          title="メンバー編集"
          aria-label={`${group.name} のメンバーを編集`}
        >
          <UsersIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => onEdit(group)}
          className="p-1.5 text-gray-400 hover:text-gray-600 rounded-md hover:bg-gray-100 transition-colors"
          title="編集"
          aria-label={`${group.name} を編集`}
        >
          <PencilIcon className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => onDelete(group)}
          className="p-1.5 text-gray-400 hover:text-red-600 rounded-md hover:bg-red-50 transition-colors"
          title="削除"
          aria-label={`${group.name} を削除`}
        >
          <TrashIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
