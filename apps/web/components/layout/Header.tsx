'use client'

import React, { useState, useRef, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts'
import { useUserQuery } from '@apps/shared/hooks'
import { Avatar } from '@/components/ui'
import { 
  Bars3Icon, 
  ChevronDownIcon,
  Cog6ToothIcon,
  ArrowRightOnRectangleIcon,
  UserIcon
} from '@heroicons/react/24/outline'

interface HeaderProps {
  onMenuClick: () => void
}

export default function Header({ onMenuClick }: HeaderProps) {
  const { user, supabase, signOut } = useAuth()
  const { profile } = useUserQuery(supabase, { userId: user?.id })
  const router = useRouter()
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)

  const handleLogout = async () => {
    await signOut()
    router.push('/login')
    setIsUserMenuOpen(false)
  }

  const handleProfileClick = () => {
    router.push('/mypage')
    setIsUserMenuOpen(false)
  }

  // ユーザーメニューの外側クリックで閉じる
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])


  return (
    <header className="bg-white shadow-sm border-b border-gray-200 fixed top-0 left-0 right-0 z-40">
      <div className="flex items-center justify-between px-2 py-2 sm:px-4 sm:py-3 lg:pl-4 lg:pr-8">
        {/* 左側：メニューボタンとロゴ */}
        <div className="flex items-center">
          <button
            type="button"
            className="inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-primary-500 transition-colors duration-200 lg:hidden"
            onClick={onMenuClick}
          >
            <span className="sr-only">メニューを開く</span>
            <Bars3Icon className="h-6 w-6" aria-hidden="true" />
          </button>
          
          {/* ロゴ・タイトル */}
          <div className="flex items-center ml-4 lg:ml-4">
            <Link href="/dashboard" className="flex items-center hover:opacity-80 transition-opacity">
              <div className="w-10 h-10 flex items-center justify-center mr-2">
                <Image src="/favicon.png" alt="SwimHub" width={40} height={40} className="w-full h-full object-contain" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-gray-900 sm:text-2xl">
                  SwimHub
                </h1>
              </div>
            </Link>
          </div>
        </div>

        {/* 右側：ユーザー情報 */}
        <div className="flex items-center space-x-2">
          {/* ユーザー情報ドロップダウン */}
          <div className="relative" ref={userMenuRef}>
            <button
              type="button"
              className="flex items-center space-x-2 p-2 text-sm rounded-full hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors duration-200"
              onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
            >
              <div className="hidden sm:block text-right">
                <div className="text-sm font-medium text-gray-900 truncate max-w-32">
                  {profile?.name || user?.email?.split('@')[0] || 'ユーザー'}
                </div>
              </div>
              <div className="relative">
                <Avatar
                  avatarUrl={profile?.profile_image_path || null}
                  userName={profile?.name || user?.email?.split('@')[0] || 'ユーザー'}
                  size="md"
                />
              </div>
              <ChevronDownIcon 
                className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${
                  isUserMenuOpen ? 'rotate-180' : ''
                }`} 
              />
            </button>

            {/* ドロップダウンメニュー */}
            {isUserMenuOpen && (
              <div className="absolute right-0 mt-2 w-56 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 divide-y divide-gray-100 focus:outline-none z-50">
                <div className="px-4 py-3">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {profile?.name || user?.email?.split('@')[0] || 'ユーザー'}
                  </p>
                  <p className="text-sm text-gray-500 truncate">
                    {user?.email}
                  </p>
                </div>
                <div className="py-1">
                  <button
                    onClick={handleProfileClick}
                    className="group flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors duration-200"
                  >
                    <UserIcon className="mr-3 h-4 w-4 text-gray-400 group-hover:text-gray-500" />
                    プロフィール
                  </button>
                  <button
                    onClick={() => {
                      router.push('/mypage')
                      setIsUserMenuOpen(false)
                    }}
                    className="group flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors duration-200"
                  >
                    <Cog6ToothIcon className="mr-3 h-4 w-4 text-gray-400 group-hover:text-gray-500" />
                    設定
                  </button>
                </div>
                <div className="py-1">
                  <button
                    onClick={handleLogout}
                    className="group flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors duration-200"
                  >
                    <ArrowRightOnRectangleIcon className="mr-3 h-4 w-4 text-gray-400 group-hover:text-gray-500" />
                    ログアウト
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
