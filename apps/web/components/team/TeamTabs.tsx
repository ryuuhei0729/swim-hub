'use client'

import React from 'react'
import { 
  UsersIcon, 
  ClockIcon, 
  TrophyIcon, 
  ClipboardDocumentCheckIcon
} from '@heroicons/react/24/outline'

export type TeamTabType = 'members' | 'practices' | 'competitions' | 'attendance'

export interface TeamTab {
  id: TeamTabType
  name: string
  icon: React.ComponentType<{ className?: string }>
}

export interface TeamTabsProps {
  activeTab: TeamTabType
  onTabChange: (tab: TeamTabType) => void
  isAdmin?: boolean
}

const tabs: TeamTab[] = [
  {
    id: 'members',
    name: 'メンバー',
    icon: UsersIcon
  },
  {
    id: 'practices',
    name: '練習',
    icon: ClockIcon
  },
  {
    id: 'competitions',
    name: '大会',
    icon: TrophyIcon
  },
  {
    id: 'attendance',
    name: '出欠',
    icon: ClipboardDocumentCheckIcon
  }
]

export default function TeamTabs({ activeTab, onTabChange }: TeamTabsProps) {
  // 一般ページは閲覧専用のため、全てのタブを表示（isAdminは使用しない）
  const visibleTabs = tabs

  return (
    <div className="bg-white rounded-lg shadow">
      {/* タブナビゲーション */}
      <div className="border-b border-gray-200 overflow-x-auto">
        <nav className="flex space-x-2 sm:space-x-4 md:space-x-8 px-2 sm:px-6" aria-label="Tabs">
          {visibleTabs.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`
                  flex items-center py-3 sm:py-4 px-1 border-b-2 font-medium text-xs sm:text-sm transition-colors duration-200 whitespace-nowrap
                  ${isActive
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }
                `}
              >
                <Icon className={`h-4 w-4 sm:h-5 sm:w-5 mr-1 sm:mr-2 shrink-0 ${isActive ? 'text-blue-600' : 'text-gray-400'}`} />
                <span className="hidden sm:inline">{tab.name}</span>
              </button>
            )
          })}
        </nav>
      </div>
    </div>
  )
}
