'use client'

import React from 'react'
import { 
  MegaphoneIcon, 
  UsersIcon, 
  ClockIcon, 
  TrophyIcon, 
  CogIcon,
  ClipboardDocumentCheckIcon,
  DocumentArrowUpIcon
} from '@heroicons/react/24/outline'

export type TeamAdminTabType = 'announcements' | 'members' | 'practices' | 'competitions' | 'attendance' | 'bulk-register' | 'settings'

export interface TeamAdminTab {
  id: TeamAdminTabType
  name: string
  icon: React.ComponentType<{ className?: string }>
}

export interface TeamAdminTabsProps {
  activeTab: TeamAdminTabType
  onTabChange: (tab: TeamAdminTabType) => void
  pendingCount?: number
}

const adminTabs: TeamAdminTab[] = [
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
  },
  {
    id: 'bulk-register',
    name: '一括登録',
    icon: DocumentArrowUpIcon
  },
  {
    id: 'settings',
    name: '設定',
    icon: CogIcon
  }
]

export default function TeamAdminTabs({ activeTab, onTabChange, pendingCount = 0 }: TeamAdminTabsProps) {
  return (
    <div className="bg-white rounded-lg shadow">
      {/* タブナビゲーション */}
      <div className="border-b border-gray-200 overflow-x-auto">
        <nav className="flex space-x-2 sm:space-x-4 md:space-x-8 px-2 sm:px-6" aria-label="Tabs">
          {adminTabs.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            const showBadge = tab.id === 'members' && pendingCount > 0
            
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`
                  flex items-center py-3 sm:py-4 px-1 border-b-2 font-medium text-xs sm:text-sm transition-colors duration-200 relative whitespace-nowrap
                  ${isActive
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }
                `}
              >
                <Icon className={`h-4 w-4 sm:h-5 sm:w-5 mr-1 sm:mr-2 shrink-0 ${isActive ? 'text-blue-600' : 'text-gray-400'}`} />
                <span className="hidden sm:inline">{tab.name}</span>
                {showBadge && (
                  <span className="ml-1 sm:ml-2 inline-flex items-center justify-center px-1.5 sm:px-2 py-0.5 text-xs font-bold leading-none text-white bg-red-600 rounded-full shrink-0">
                    {pendingCount}
                  </span>
                )}
              </button>
            )
          })}
        </nav>
      </div>
    </div>
  )
}


