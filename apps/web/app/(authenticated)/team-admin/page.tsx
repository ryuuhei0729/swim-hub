'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/contexts'

export default function TeamAdminPage() {
  const [teams, setTeams] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const { user } = useAuth()
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
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
              description
            )
          `)
          .eq('user_id', user.id)
          .eq('role', 'ADMIN')
          .eq('is_active', true)

        if (error) throw error

        setTeams(data || [])
      } catch (error) {
        console.error('チーム情報の取得に失敗:', error)
      } finally {
        setLoading(false)
      }
    }

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

  if (teams.length === 0) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            チーム統合管理
          </h1>
          <p className="text-gray-600">
            管理者権限のあるチームがありません。
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">
          チーム統合管理
        </h1>
        <p className="text-gray-600 mb-6">
          チームの練習・大会・スケジュールを一括管理できます
        </p>

        <div className="space-y-4">
          {teams.map((membership) => (
            <div key={membership.team_id} className="border rounded-lg p-4">
              <h3 className="text-lg font-semibold text-gray-900">
                {membership.team?.name}
              </h3>
              {membership.team?.description && (
                <p className="text-sm text-gray-600 mt-1">
                  {membership.team.description}
                </p>
              )}
              <div className="mt-4">
                <p className="text-sm text-gray-500">
                  ※ チーム管理機能は実装中です
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
