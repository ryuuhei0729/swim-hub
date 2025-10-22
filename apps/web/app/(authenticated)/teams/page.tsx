'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/contexts'
import { PlusIcon, UsersIcon, UserPlusIcon } from '@heroicons/react/24/outline'
import TeamCreateModal from '@/components/team/TeamCreateModal'
import TeamJoinModal from '@/components/team/TeamJoinModal'

export default function TeamsPage() {
  const [teams, setTeams] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false)
  const { user } = useAuth()
  const supabase = createClient()

  const loadTeams = async () => {
    if (!user) return
    
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('team_memberships')
        .select(`
          *,
          team:teams (
            id,
            name,
            description,
            created_at
          )
        `)
        .eq('user_id', user.id)
        .eq('is_active', true)

      if (error) throw error

      setTeams(data || [])
    } catch (error) {
      console.error('チーム情報の取得に失敗:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadTeams()
  }, [user])

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              マイチーム
            </h1>
            <p className="text-gray-600">
              参加しているチームの一覧
            </p>
          </div>
          <div className="flex space-x-3">
            <button
              onClick={() => setIsJoinModalOpen(true)}
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <UserPlusIcon className="h-5 w-5 mr-2" />
              チームに参加
            </button>
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <PlusIcon className="h-5 w-5 mr-2" />
              新規作成
            </button>
          </div>
        </div>
      </div>

      {/* チーム一覧 */}
      {teams.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <UsersIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">
            参加中のチームがありません
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            新しくチームを作成するか、既存のチームに参加しましょう
          </p>
          <div className="mt-6 flex justify-center space-x-3">
            <button
              onClick={() => setIsJoinModalOpen(true)}
              className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <UserPlusIcon className="h-5 w-5 mr-2" />
              チームに参加
            </button>
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <PlusIcon className="h-5 w-5 mr-2" />
              チームを作成
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {teams.map((membership) => (
            <Link
              key={membership.team_id}
              href={`/teams/${membership.team_id}`}
              className="bg-white overflow-hidden shadow rounded-lg hover:shadow-md transition-shadow duration-200"
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <UsersIcon className="h-10 w-10 text-blue-600" />
                  {membership.role === 'ADMIN' && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      管理者
                    </span>
                  )}
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  {membership.team?.name}
                </h3>
                {membership.team?.description && (
                  <p className="text-sm text-gray-500 line-clamp-2">
                    {membership.team.description}
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* チーム作成モーダル */}
      <TeamCreateModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={(teamId) => {
          // チーム一覧を再読み込み
          loadTeams()
        }}
      />

      {/* チーム参加モーダル */}
      <TeamJoinModal
        isOpen={isJoinModalOpen}
        onClose={() => setIsJoinModalOpen(false)}
        onSuccess={(teamId) => {
          // チーム一覧を再読み込み
          loadTeams()
        }}
      />
    </div>
  )
}
