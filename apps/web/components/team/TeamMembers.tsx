'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts'
import { TeamMembersAPI } from '@apps/shared/api/teams/members'
import { TeamMembershipWithUser } from '@apps/shared/types/database'
import { Avatar } from '@/components/ui'
import { 
  UserPlusIcon, 
  UserMinusIcon,
  StarIcon
} from '@heroicons/react/24/outline'

export interface TeamMembersProps {
  teamId: string
  isAdmin?: boolean
}

export default function TeamMembers({ teamId, isAdmin = false }: TeamMembersProps) {
  const router = useRouter()
  const [members, setMembers] = useState<TeamMembershipWithUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showInviteModal, setShowInviteModal] = useState(false)
  const [inviteCode, setInviteCode] = useState('')
  
  const { supabase } = useAuth()
  const api = useMemo(() => new TeamMembersAPI(supabase), [supabase])

  // メンバー一覧を取得
  useEffect(() => {
    const loadMembers = async () => {
      try {
        setLoading(true)
        setError(null)
        
        const membersData = await api.list(teamId)
        setMembers(membersData)
      } catch (err) {
        console.error('メンバー情報の取得に失敗:', err)
        setError('メンバー情報の取得に失敗しました')
      } finally {
        setLoading(false)
      }
    }

    loadMembers()
  }, [teamId, api])

  // 招待コードを取得
  const loadInviteCode = async () => {
    try {
      const { data, error } = await supabase
        .from('teams')
        .select('invite_code')
        .eq('id', teamId)
        .single<{ invite_code: string }>()

      if (error) throw error
      setInviteCode(data?.invite_code || '')
    } catch (err) {
      console.error('招待コードの取得に失敗:', err)
    }
  }

  const handleInviteClick = () => {
    loadInviteCode()
    setShowInviteModal(true)
  }

  const handleCopyInviteCode = () => {
    navigator.clipboard.writeText(inviteCode)
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-32 mb-4"></div>
          <div className="space-y-3">
            {[...Array(3)].map((_, index) => (
              <div key={index} className="flex items-center space-x-3">
                <div className="h-10 w-10 bg-gray-200 rounded-full"></div>
                <div className="flex-1">
                  <div className="h-4 bg-gray-200 rounded w-24 mb-2"></div>
                  <div className="h-3 bg-gray-200 rounded w-32"></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="text-center py-8">
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={() => router.refresh()}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
          >
            再試行
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-900">
          メンバー ({members.length}人)
        </h2>
        {isAdmin && (
          <button
            onClick={handleInviteClick}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <UserPlusIcon className="h-5 w-5 mr-2" />
            メンバー招待
          </button>
        )}
      </div>

      {/* メンバー一覧 */}
      <div className="space-y-4">
        {members.map((member) => (
          <div 
            key={member.id}
            className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors duration-200"
          >
            <div className="flex items-center space-x-3">
              <div className="shrink-0">
                <Avatar
                  avatarUrl={member.users?.profile_image_path || null}
                  userName={member.users?.name || 'Unknown User'}
                  size="md"
                />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <p className="text-sm font-medium text-gray-900">
                    {member.users?.name || 'Unknown User'}
                  </p>
                  {member.role === 'admin' && (
                    <StarIcon className="h-4 w-4 text-yellow-500" title="管理者" />
                  )}
                </div>
                <p className="text-sm text-gray-500">
                  参加日: {new Date(member.joined_at + 'T00:00:00').toLocaleDateString('ja-JP')}
                </p>
              </div>
            </div>
            
            {isAdmin && member.role === 'user' && (
              <button
                className="text-red-600 hover:text-red-800 p-2"
                title="メンバーを削除"
              >
                <UserMinusIcon className="h-5 w-5" />
              </button>
            )}
          </div>
        ))}
        
        {members.length === 0 && (
          <div className="text-center py-8">
            <Avatar
              avatarUrl={null}
              userName="?"
              size="lg"
              className="mx-auto mb-4 opacity-50"
            />
            <p className="text-gray-600">メンバーがいません</p>
          </div>
        )}
      </div>

      {/* 招待モーダル */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div 
              className="fixed inset-0 bg-black/40 transition-opacity" 
              onClick={() => setShowInviteModal(false)}
            />
            
            <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <h3 className="text-lg font-medium text-gray-900 mb-4">
                  チームに招待
                </h3>
                <p className="text-sm text-gray-600 mb-4">
                  この招待コードを共有してメンバーを招待できます
                </p>
                
                <div className="bg-gray-50 p-4 rounded-lg mb-4">
                  <p className="text-sm text-gray-600 mb-2">招待コード:</p>
                  <p className="text-lg font-mono font-bold text-gray-900 break-all">
                    {inviteCode}
                  </p>
                </div>
              </div>
              
              <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
                <button
                  onClick={handleCopyInviteCode}
                  className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-blue-600 text-base font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 sm:ml-3 sm:w-auto sm:text-sm"
                >
                  コピー
                </button>
                <button
                  onClick={() => setShowInviteModal(false)}
                  className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
                >
                  閉じる
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}