'use client'

import React, { useState, useMemo } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/contexts'
import TeamJoinForm from '@/components/forms/TeamJoinForm'

export interface TeamJoinModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (teamId: string) => void
}

export default function TeamJoinModal({ isOpen, onClose, onSuccess }: TeamJoinModalProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { user } = useAuth()
  const supabase = useMemo(() => createClient(), [])

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

      // 既に参加しているかチェック
      const { data: existingMembership, error: membershipError } = await supabase
        .from('team_memberships')
        .select('id, is_active')
        .eq('team_id', (team as any).id)
        .eq('user_id', user.id)
        .single()

      if (membershipError && membershipError.code !== 'PGRST116') {
        throw membershipError
      }

      if (existingMembership) {
        if ((existingMembership as any).is_active) {
          throw new Error('既にこのチームに参加しています')
        } else {
          // 非アクティブなメンバーシップを復活
          const { error: updateError } = await (supabase
            .from('team_memberships') as any)
            .update({ 
              is_active: true,
              joined_at: new Date().toISOString().split('T')[0] // 今日の日付
            })
            .eq('id', (existingMembership as any).id)

          if (updateError) throw updateError
        }
      } else {
        // 新しいメンバーシップを作成
        const { error: insertError } = await (supabase
          .from('team_memberships') as any)
          .insert({
            team_id: (team as any).id,
            user_id: user.id,
            role: 'user',
            is_active: true,
            joined_at: new Date().toISOString().split('T')[0] // 今日の日付
          })

        if (insertError) throw insertError
      }

      // 成功時の処理
      onSuccess((team as any).id)
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
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
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
