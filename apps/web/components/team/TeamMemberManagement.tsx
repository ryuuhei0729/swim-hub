'use client'

import React, { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthProvider'
import { Avatar } from '@/components/ui'
import { 
  StarIcon
} from '@heroicons/react/24/outline'

export interface TeamMember {
  id: string
  user_id: string
  role: 'admin' | 'user'
  is_active: boolean
  joined_at: string
  users: {
    id: string
    name: string
    birthday?: string
    bio?: string
    profile_image_path?: string | null
  }
}

export interface TeamMemberManagementProps {
  teamId: string
  currentUserId: string
  isCurrentUserAdmin: boolean
  onMembershipChange?: () => void
  onMemberClick: (member: TeamMember) => void
}

export default function TeamMemberManagement({ 
  teamId, 
  currentUserId, 
  isCurrentUserAdmin: _isCurrentUserAdmin,
  onMembershipChange: _onMembershipChange,
  onMemberClick
}: TeamMemberManagementProps) {
  const { supabase } = useAuth()
  const [members, setMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadMembers = async () => {
    try {
      setLoading(true)
      setError(null)
      
      const { data, error } = await supabase
        .from('team_memberships')
        .select(`
          id,
          user_id,
          role,
          is_active,
          joined_at,
          users!team_memberships_user_id_fkey (
            id,
            name,
            birthday,
            bio,
            profile_image_path
          )
        `)
        .eq('team_id', teamId)
        .eq('is_active', true)
        .order('role', { ascending: false }) // adminを先に表示

      if (error) throw error
      setMembers((data ?? []) as unknown as TeamMember[])
    } catch (err) {
      console.error('メンバー情報の取得に失敗:', err)
      setError('メンバー情報の取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadMembers()
  }, [teamId])


  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-32 mb-4"></div>
          <div className="space-y-3">
            {[...Array(3)].map((_, index) => (
              <div key={index} className="flex items-center space-x-3 p-3 border border-gray-200 rounded-lg">
                <div className="h-10 w-10 bg-gray-200 rounded-full"></div>
                <div className="flex-1">
                  <div className="h-4 bg-gray-200 rounded w-32 mb-2"></div>
                  <div className="h-3 bg-gray-200 rounded w-20"></div>
                </div>
                <div className="h-8 bg-gray-200 rounded w-16"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow p-6" data-testid="team-member-management">
      {/* ヘッダー */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">
          メンバー管理
        </h2>
        <div className="flex items-center space-x-4 text-sm text-gray-600">
          <span data-testid="team-member-count-total">総メンバー: <span className="font-medium text-gray-900">{members.length}人</span></span>
          <span data-testid="team-member-count-admin">管理者: <span className="font-medium text-yellow-600">{members.filter(m => m.role === 'admin').length}人</span></span>
          <span data-testid="team-member-count-user">ユーザー: <span className="font-medium text-gray-700">{members.filter(m => m.role === 'user').length}人</span></span>
        </div>
      </div>

      {/* エラー表示 */}
      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-4" data-testid="team-member-management-error">
          <div className="flex">
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">
                エラーが発生しました
              </h3>
              <div className="mt-2 text-sm text-red-700">
                <p>{error}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* メンバー一覧 */}
      <div className="space-y-3">
        {members.map((member) => (
          <div 
            key={member.id}
            onClick={() => onMemberClick(member)}
            className={`flex items-center justify-between p-4 border rounded-lg transition-all duration-200 cursor-pointer ${
              member.user_id === currentUserId 
                ? 'border-blue-200 bg-blue-50' 
                : 'border-gray-200 hover:bg-gray-50 hover:shadow-sm'
            }`}
            data-testid={`team-member-item-${member.id}`}
          >
            <div className="flex items-center space-x-3 flex-1">
              {/* ユーザーアイコン */}
              <div className="shrink-0">
                <Avatar
                  avatarUrl={member.users?.profile_image_path || null}
                  userName={member.users?.name || 'Unknown User'}
                  size="md"
                />
              </div>
              
              {/* ユーザー情報 */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-2 mb-1">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {member.users?.name || 'Unknown User'}
                  </p>
                  {member.role === 'admin' && (
                    <StarIcon className="h-4 w-4 text-yellow-500" />
                  )}
                  {member.user_id === currentUserId && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                      あなた
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* 権限表示 */}
            <div className="flex items-center space-x-2">
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                member.role === 'admin' 
                  ? 'bg-yellow-100 text-yellow-800' 
                  : 'bg-gray-100 text-gray-800'
              }`}>
                {member.role === 'admin' ? '管理者' : 'ユーザー'}
              </span>
              
              {/* 詳細ボタン */}
              <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </div>
        ))}
        
        {members.length === 0 && (
          <div className="text-center py-8" data-testid="team-member-empty-state">
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
    </div>
  )
}
