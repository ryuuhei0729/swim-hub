'use client'

import React, { useState, useEffect } from 'react'
import type { ComponentType, SVGProps } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts'
import { 
  HomeIcon,
  ChartBarIcon,
  TrophyIcon,
  XMarkIcon,
  ChevronRightIcon,
  UsersIcon,
  UserIcon,
  ShieldCheckIcon,
  FlagIcon
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
    description: 'お知らせとスケジュール',
  },
  { 
    name: '練習履歴', 
    href: '/practice', 
    icon: ChartBarIcon,
    description: '練習内容とタイム記録',
  },
  { 
    name: '大会履歴', 
    href: '/competition', 
    icon: TrophyIcon,
    description: '大会結果とタイム記録',
  },
  { 
    name: '目標管理', 
    href: '/goals', 
    icon: FlagIcon,
    description: '目標設定と達成状況',
  },
  { 
    name: 'マイページ', 
    href: '/mypage', 
    icon: UserIcon,
    description: 'プロフィールとベストタイム',
  },
  { 
    name: 'チーム', 
    href: '/teams', 
    icon: UsersIcon,
    description: 'チームの参加・管理',
  },
]

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname()
  const { user, supabase } = useAuth()
  const [singleTeamId, setSingleTeamId] = useState<string | null>(null)
  const [adminTeamIds, setAdminTeamIds] = useState<string[]>([])
  const [singleAdminTeamId, setSingleAdminTeamId] = useState<string | null>(null)
  
  // ユーザーのチーム一覧を取得してチーム数をチェック
  useEffect(() => {
    if (!user || !supabase) return
    
    const loadTeams = async () => {
      try {
        const { data, error } = await supabase
          .from('team_memberships')
          .select('team_id, is_active')
          .eq('user_id', user.id)
          .eq('is_active', true)
        
        if (error) throw error
        
        // チームが1つだけの場合はIDを保存
        if (data && data.length === 1) {
          setSingleTeamId(data[0].team_id)
        } else {
          setSingleTeamId(null)
        }
      } catch (error) {
        console.error('チーム情報の取得に失敗:', error)
        setSingleTeamId(null)
      }
    }
    
    // 管理者権限を持つチーム一覧を取得
    const loadAdminTeams = async () => {
      try {
        const { data, error } = await supabase
          .from('team_memberships')
          .select('team_id')
          .eq('user_id', user.id)
          .eq('role', 'admin')
          .eq('is_active', true)
        
        if (error) throw error
        
        const adminIds = data?.map(m => m.team_id) || []
        setAdminTeamIds(adminIds)
        
        // 管理者権限のチームが1つだけの場合はIDを保存
        if (adminIds.length === 1) {
          setSingleAdminTeamId(adminIds[0])
        } else {
          setSingleAdminTeamId(null)
        }
      } catch (error) {
        console.error('管理者チーム情報の取得に失敗:', error)
        setAdminTeamIds([])
        setSingleAdminTeamId(null)
      }
    }
    
    loadTeams()
    loadAdminTeams()

    // リアルタイム購読: チームメンバーシップの変更を監視
    const channel = supabase
      .channel('sidebar-team-memberships')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'team_memberships',
          filter: `user_id=eq.${user.id}`
        },
        () => {
          // チームメンバーシップが変更されたら再取得
          loadTeams()
          loadAdminTeams()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user, supabase])

  return (
    <>
      {/* モバイル用オーバーレイ */}
      {isOpen && (
        <div 
          className="fixed top-16 inset-x-0 bottom-0 z-40 bg-black/40 lg:hidden"
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
            {baseNavigation.map((item) => {
              // チームの場合は、チームが1つだけの場合は直接チームページへ
              const href = (item.name === 'チーム' && singleTeamId) 
                ? `/teams/${singleTeamId}` 
                : item.href
              
              // アクティブ判定
              let isActive = pathname === item.href
              
              // チームの場合は特別処理
              if (item.name === 'チーム') {
                if (singleTeamId) {
                  // チームが1つの場合: チーム詳細ページ（/teams/[teamId]）にいる時はアクティブ
                  isActive = pathname.startsWith(`/teams/${singleTeamId}`) && !pathname.startsWith('/teams-admin')
                } else {
                  // チームが0個または2つ以上の場合: /teamsページにいる時はアクティブ
                  isActive = pathname === '/teams'
                }
              }
              
              return (
                <div key={item.name} className="group">
                  <Link
                    href={href}
                    className={`
                      group flex items-center px-3 py-3 text-sm font-medium rounded-lg transition-all duration-200 relative
                      ${isActive
                        ? 'bg-blue-50 text-blue-700 shadow-sm border-l-4 border-blue-500'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50 hover:shadow-sm'
                      }
                    `}
                    onClick={onClose}
                  >
                    <item.icon
                      className={`
                        mr-3 h-5 w-5 shrink-0 transition-colors duration-200
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
            
            {/* チーム管理（管理者専用） */}
            {adminTeamIds.length > 0 && (
              <div className="group">
                <Link
                  href={singleAdminTeamId ? `/teams-admin/${singleAdminTeamId}` : '/teams-admin'}
                  className={`
                    group flex items-center px-3 py-3 text-sm font-medium rounded-lg transition-all duration-200 relative
                    ${pathname.startsWith('/teams-admin')
                      ? 'bg-purple-50 text-purple-700 shadow-sm border-l-4 border-purple-500'
                      : 'text-purple-700 bg-purple-50/50 hover:text-purple-800 hover:bg-purple-100 hover:shadow-sm border-l-4 border-purple-300'
                    }
                  `}
                  onClick={onClose}
                >
                  <ShieldCheckIcon
                    className={`
                      mr-3 h-5 w-5 shrink-0 transition-colors duration-200
                      ${pathname.startsWith('/teams-admin') ? 'text-purple-600' : 'text-purple-500 group-hover:text-purple-600'}
                    `}
                    aria-hidden="true"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="truncate">チーム管理</span>
                      {!pathname.startsWith('/teams-admin') && (
                        <ChevronRightIcon className="h-4 w-4 text-purple-300 group-hover:text-purple-400 transition-colors duration-200" />
                      )}
                    </div>
                    <p className="text-xs text-purple-600 mt-1 truncate font-medium">
                      管理者専用
                    </p>
                  </div>
                </Link>
              </div>
            )}
          </div>
        </nav>

      </div>
    </>
  )
}
