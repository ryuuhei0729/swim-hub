'use client'

import React from 'react'
import { 
  MegaphoneIcon, 
  UsersIcon, 
  ClockIcon, 
  TrophyIcon, 
  ClipboardDocumentCheckIcon
} from '@heroicons/react/24/outline'

export type TeamTabType = 'announcements' | 'members' | 'practices' | 'competitions' | 'attendance'

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
    id: 'announcements',
    name: 'お知らせ',
    icon: MegaphoneIcon
  },
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
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8 px-6" aria-label="Tabs">
          {visibleTabs.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`
                  flex items-center py-4 px-1 border-b-2 font-medium text-sm transition-colors duration-200
                  ${isActive
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }
                `}
              >
                <Icon className={`h-5 w-5 mr-2 ${isActive ? 'text-blue-600' : 'text-gray-400'}`} />
                {tab.name}
              </button>
            )
          })}
        </nav>
      </div>
    </div>
  )
}
