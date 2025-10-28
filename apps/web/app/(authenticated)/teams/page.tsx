'use client'

import React, { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/contexts'
import { UsersIcon } from '@heroicons/react/24/outline'
import { TeamMembership, Team } from '@swim-hub/shared/types/database'

// Supabaseクエリ結果の型定義
interface TeamMembershipWithTeam extends TeamMembership {
  team: Team
}

export default function TeamsPage() {
  const [teams, setTeams] = useState<TeamMembershipWithTeam[]>([])
  const [loading, setLoading] = useState(true)
  const { user } = useAuth()
  const supabase = useMemo(() => createClient(), [])

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

      setTeams((data as TeamMembershipWithTeam[]) || [])
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
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            マイチーム
          </h1>
          <p className="text-gray-600">
            参加しているチームの一覧
          </p>
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
            設定ページからチームに参加または作成してください
          </p>
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
                  {membership.role === 'admin' && (
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
    </div>
  )
}
