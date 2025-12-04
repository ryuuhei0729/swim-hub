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

export default function TeamAdminTabs({ activeTab, onTabChange }: TeamAdminTabsProps) {
  return (
    <div className="bg-white rounded-lg shadow">
      {/* タブナビゲーション */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8 px-6" aria-label="Tabs">
          {adminTabs.map((tab) => {
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


