'use client'

import React, { useState } from 'react'
import { ChevronDownIcon, ChevronRightIcon, ArrowsRightLeftIcon } from '@heroicons/react/24/outline'
import { GroupCard } from './GroupCard'
import type { TeamGroupWithCount } from '../hooks/useTeamGroups'

interface CategorySectionProps {
  category: string | null
  groups: TeamGroupWithCount[]
  onGroupClick: (group: TeamGroupWithCount) => void
  onEditGroup: (group: TeamGroupWithCount) => void
  onDeleteGroup: (group: TeamGroupWithCount) => void
  onManageMembers: (group: TeamGroupWithCount) => void
  onBulkAssign?: (category: string) => void
}

export const CategorySection: React.FC<CategorySectionProps> = ({
  category,
  groups,
  onGroupClick,
  onEditGroup,
  onDeleteGroup,
  onManageMembers,
  onBulkAssign,
}) => {
  const [isExpanded, setIsExpanded] = useState(true)

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* カテゴリヘッダー */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50">
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 hover:text-gray-900 transition-colors text-left"
          aria-expanded={isExpanded}
        >
          {isExpanded ? (
            <ChevronDownIcon className="h-4 w-4 text-gray-500" />
          ) : (
            <ChevronRightIcon className="h-4 w-4 text-gray-500" />
          )}
          <span className="text-sm font-semibold text-gray-800">
            {category || '未分類'}
          </span>
          <span className="text-xs text-gray-500">
            ({groups.length}グループ)
          </span>
        </button>
        {category && onBulkAssign && (
          <button
            type="button"
            onClick={() => onBulkAssign(category)}
            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50 hover:text-gray-800 transition-colors"
          >
            <ArrowsRightLeftIcon className="h-3.5 w-3.5" />
            一括振り分け
          </button>
        )}
      </div>

      {/* グループリスト */}
      {isExpanded && (
        <div className="p-3 space-y-2">
          {groups.map((group) => (
            <GroupCard
              key={group.id}
              group={group}
              onClick={onGroupClick}
              onEdit={onEditGroup}
              onDelete={onDeleteGroup}
              onManageMembers={onManageMembers}
            />
          ))}
        </div>
      )}
    </div>
  )
}
