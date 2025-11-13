'use client'

import React, { useState } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { useAuth } from '@/contexts'
import TeamJoinForm from '@/components/forms/TeamJoinForm'
import { Team, TeamMembership, TeamMembershipInsert } from '@apps/shared/types/database'
import { format } from 'date-fns'

export interface TeamJoinModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (teamId: string) => void
}

// Supabaseクエリから返される型
type TeamSelectResult = Pick<Team, 'id' | 'name' | 'description' | 'invite_code'>
type TeamMembershipSelectResult = Pick<TeamMembership, 'id' | 'is_active'>

export default function TeamJoinModal({ isOpen, onClose, onSuccess }: TeamJoinModalProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { user, supabase } = useAuth()

  const handleSubmit = async (inviteId: string) => {
    if (!user) {
      setError('ログインが必要です')
      return
    }

    try {
      setIsLoading(true)
      setError(null)

      // 招待コードでチームを検索
      const { data: team, error: teamError } = await supabase
        .from('teams')
        .select('id, name, description, invite_code')
        .eq('invite_code', inviteId)
        .single()

      if (teamError) {
        if (teamError.code === 'PGRST116') {
          throw new Error('招待コードが正しくありません')
        }
        throw teamError
      }

      if (!team) {
        throw new Error('チームが見つかりません')
      }

      const teamData = team as TeamSelectResult

      // 既に参加しているかチェック
      const { data: existingMembership, error: membershipError } = await supabase
        .from('team_memberships')
        .select('id, is_active')
        .eq('team_id', teamData.id)
        .eq('user_id', user.id)
        .single()

      if (membershipError && membershipError.code !== 'PGRST116') {
        throw membershipError
      }

      if (existingMembership) {
        const membershipData = existingMembership as TeamMembershipSelectResult
        
        if (membershipData.is_active) {
          throw new Error('既にこのチームに参加しています')
        } else {
          // 非アクティブなメンバーシップを復活（Server Route経由）
          const res = await fetch('/api/team-memberships/reactivate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: membershipData.id, joinedAt: format(new Date(), 'yyyy-MM-dd') })
          })
          if (!res.ok) {
            const { error } = await res.json().catch(() => ({ error: 'Unknown error' }))
            throw new Error(error)
          }
        }
      } else {
        // 新しいメンバーシップを作成
        const insertData: TeamMembershipInsert = {
          team_id: teamData.id,
          user_id: user.id,
          role: 'user',
          member_type: null,
          group_name: null,
          is_active: true,
          joined_at: format(new Date(), 'yyyy-MM-dd'), // 今日の日付
          left_at: null
        }

        const res = await fetch('/api/team-memberships/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(insertData)
        })
        if (!res.ok) {
          const { error } = await res.json().catch(() => ({ error: 'Unknown error' }))
          throw new Error(error)
        }
      }

      // 成功時の処理
      onSuccess(teamData.id)
      onClose()
    } catch (err) {
      console.error('チーム参加エラー:', err)
      
      // より詳細なエラーメッセージを設定
      let errorMessage = 'チームの参加に失敗しました'
      if (err instanceof Error) {
        errorMessage = err.message
      } else if (err && typeof err === 'object' && 'message' in err) {
        errorMessage = String(err.message)
      }
      
      setError(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-gray-600/50 overflow-y-auto h-full w-full z-50" data-testid="team-join-modal">
      <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white" data-testid="team-join-dialog">
        <div className="mt-3">
          {/* ヘッダー */}
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900">
              チームに参加
            </h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 focus:outline-none focus:text-gray-600"
              disabled={isLoading}
              data-testid="team-join-close-button"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          {/* フォーム */}
          <TeamJoinForm
            onSubmit={handleSubmit}
            isLoading={isLoading}
            error={error}
          />
        </div>
      </div>
    </div>
  )
}
