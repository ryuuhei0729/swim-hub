'use client'

import React from 'react'

interface MemberGroupSorterProps {
  categories: string[]
  activeCategory: string | null
  onToggle: (category: string) => void
}

export const MemberGroupSorter: React.FC<MemberGroupSorterProps> = ({
  categories,
  activeCategory,
  onToggle,
}) => {
  if (categories.length === 0) return null

  return (
    <div className="mb-4 flex items-center gap-2 flex-wrap">
      <span className="text-xs font-medium text-gray-500">グループ表示:</span>
      {categories.map((category) => {
        const isActive = activeCategory === category
        return (
          <button
            key={category}
            type="button"
            onClick={() => onToggle(category)}
            className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
              isActive
                ? 'bg-blue-100 border-blue-300 text-blue-700 font-semibold'
                : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {category}
          </button>
        )
      })}
    </div>
  )
}
