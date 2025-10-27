'use client'

import React, { useState, useEffect } from 'react'
import type { ComponentType, SVGProps } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/contexts'
import { 
  HomeIcon,
  ChartBarIcon,
  TrophyIcon,
  XMarkIcon,
  ChevronRightIcon,
  UsersIcon,
  CogIcon
} from '@heroicons/react/24/outline'

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
}

interface NavigationItem {
  name: string
  href: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
  badge?: number
  description?: string
}

const baseNavigation: NavigationItem[] = [
  { 
    name: 'ダッシュボード', 
    href: '/dashboard', 
    icon: HomeIcon, 
    description: 'システム概要と最新情報',
  },
  { 
    name: '練習管理', 
    href: '/practice', 
    icon: ChartBarIcon,
    description: '練習内容とタイム記録',
  },
  { 
    name: '大会管理', 
    href: '/competition', 
    icon: TrophyIcon,
    description: '大会結果とエントリー',
  },
  { 
    name: 'チーム管理', 
    href: '/teams', 
    icon: UsersIcon,
    description: 'チームの作成・参加・管理',
  },
]

const adminNavigation: NavigationItem = {
  name: '統合管理', 
  href: '/team-admin', 
  icon: CogIcon,
  description: 'チームの練習・大会一括管理',
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname()
  const { user } = useAuth()
  const [hasAdminTeams, setHasAdminTeams] = useState(false)
  const [singleTeamId, setSingleTeamId] = useState<string | null>(null)
  const supabase = createClient()
  
  // ユーザーのチーム一覧を取得して管理者権限とチーム数をチェック
  useEffect(() => {
    const loadTeams = async () => {
      if (!user) return
      
      try {
        const { data, error } = await supabase
          .from('team_memberships')
          .select('team_id, role, is_active')
          .eq('user_id', user.id)
          .eq('is_active', true)
        
        if (error) throw error
        
        const hasAdmin = data?.some((membership: any) => 
          membership.role === 'ADMIN'
        ) || false
        
        setHasAdminTeams(hasAdmin)
        
        // チームが1つだけの場合はIDを保存
        if (data?.length === 1) {
          setSingleTeamId((data[0] as any).team_id)
        } else {
          setSingleTeamId(null)
        }
      } catch (error) {
        console.error('チーム情報の取得に失敗:', error)
      }
    }
    
    loadTeams()
  }, [user])
  
  // 管理者権限がある場合のみ統合管理を追加
  const filteredNavigation = hasAdminTeams 
    ? [...baseNavigation, adminNavigation]
    : baseNavigation

  return (
    <>
      {/* モバイル用オーバーレイ */}
      {isOpen && (
        <div 
          className="fixed top-16 inset-x-0 bottom-0 z-40 bg-gray-600 bg-opacity-75 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* サイドバー */}
      <div className={`
        fixed top-16 bottom-0 left-0 z-50 w-72 bg-white shadow-xl transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:fixed lg:w-64
        ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* モバイル用ヘッダー */}
        <div className="flex items-center justify-between h-16 px-4 border-b border-gray-200 lg:hidden">
          <div className="flex items-center">
            <div className="w-8 h-8 flex items-center justify-center mr-1">
              <Image src="/favicon.png" alt="SwimHub" width={32} height={32} className="w-full h-full object-contain" />
            </div>
            <span className="text-lg font-semibold text-gray-900">メニュー</span>
          </div>
          <button
            type="button"
            className="p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors duration-200"
            onClick={onClose}
          >
            <span className="sr-only">サイドバーを閉じる</span>
            <XMarkIcon className="h-6 w-6" aria-hidden="true" />
          </button>
        </div>


        {/* ナビゲーション */}
        <nav className="mt-6 px-3 pb-6">
          <div className="space-y-2">
            {filteredNavigation.map((item) => {
              const isActive = pathname === item.href
              // チーム管理の場合は、チームが1つだけの場合は直接チームページへ
              const href = (item.name === 'チーム管理' && singleTeamId) 
                ? `/teams/${singleTeamId}` 
                : item.href
              const isActiveTeam = (item.name === 'チーム管理' && singleTeamId && pathname.startsWith('/teams/'))
              
              return (
                <div key={item.name} className="group">
                  <Link
                    href={href}
                    className={`
                      group flex items-center px-3 py-3 text-sm font-medium rounded-lg transition-all duration-200 relative
                      ${isActive || isActiveTeam
                        ? 'bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 shadow-sm border-l-4 border-blue-500'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50 hover:shadow-sm'
                      }
                    `}
                    onClick={onClose}
                  >
                    <item.icon
                      className={`
                        mr-3 h-5 w-5 flex-shrink-0 transition-colors duration-200
                        ${isActive ? 'text-blue-600' : 'text-gray-400 group-hover:text-gray-600'}
                      `}
                      aria-hidden="true"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="truncate">{item.name}</span>
                        <div className="flex items-center space-x-2">
                          {item.badge && (
                            <span className="inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-white bg-red-500 rounded-full">
                              {item.badge > 9 ? '9+' : item.badge}
                            </span>
                          )}
                          {!isActive && (
                            <ChevronRightIcon className="h-4 w-4 text-gray-300 group-hover:text-gray-400 transition-colors duration-200" />
                          )}
                        </div>
                      </div>
                      {item.description && (
                        <p className="text-xs text-gray-500 mt-1 truncate">
                          {item.description}
                        </p>
                      )}
                    </div>
                  </Link>
                </div>
              )
            })}
          </div>
        </nav>

      </div>
    </>
  )
}
