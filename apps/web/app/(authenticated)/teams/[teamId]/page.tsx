'use client'

import React, { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/contexts'
import { TeamAnnouncements } from '@/components/team'

export default function TeamDetailPage() {
  const params = useParams()
  const teamId = params.teamId as string
  const [team, setTeam] = useState<any>(null)
  const [membership, setMembership] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const { user } = useAuth()
  const supabase = createClient()

  useEffect(() => {
    const loadTeam = async () => {
      if (!user) return
      
      try {
        setLoading(true)
        
        // チーム情報を取得
        const { data: teamData, error: teamError } = await supabase
          .from('teams')
          .select('*')
          .eq('id', teamId)
          .single()

        if (teamError) throw teamError

        // メンバーシップ情報を取得
        const { data: membershipData, error: membershipError } = await supabase
          .from('team_memberships')
          .select('*')
          .eq('team_id', teamId)
          .eq('user_id', user.id)
          .single()

        if (membershipError && membershipError.code !== 'PGRST116') {
          throw membershipError
        }

        setTeam(teamData)
        setMembership(membershipData)
      } catch (error) {
        console.error('チーム情報の取得に失敗:', error)
      } finally {
        setLoading(false)
      }
    }

    loadTeam()
  }, [user, teamId])

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

  if (!team) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            チームが見つかりません
          </h1>
          <p className="text-gray-600">
            指定されたチームは存在しないか、アクセス権限がありません。
          </p>
        </div>
      </div>
    )
  }

  const isAdmin = membership?.role === 'ADMIN'

  return (
    <div className="space-y-6">
      {/* チームヘッダー */}
      <div className="bg-white rounded-lg shadow p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          {team.name}
        </h1>
        {team.description && (
          <p className="text-gray-600 mb-4">{team.description}</p>
        )}
        {isAdmin && (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
            管理者
          </span>
        )}
      </div>

      {/* お知らせセクション */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          お知らせ
        </h2>
        <TeamAnnouncements 
          teamId={teamId}
          isAdmin={isAdmin}
          viewOnly={false}
        />
      </div>
    </div>
  )
}
