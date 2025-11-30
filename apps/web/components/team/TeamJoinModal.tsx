'use client'

import React, { useState } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { useAuth } from '@/contexts'
import TeamJoinForm from '@/components/forms/TeamJoinForm'
import { joinTeam } from '@/app/(authenticated)/teams/_actions/actions'

export interface TeamJoinModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (teamId: string) => void
}

export default function TeamJoinModal({ isOpen, onClose, onSuccess }: TeamJoinModalProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { user } = useAuth()

  const handleSubmit = async (inviteId: string) => {
    if (!user) {
      setError('ログインが必要です')
      return
    }

    try {
      setIsLoading(true)
      setError(null)

      // Server Action経由でチームに参加（既存メンバーシップチェックと再アクティブ化も含む）
      const result = await joinTeam(inviteId)
      
      if (!result.success) {
        throw new Error(result.error || 'チームの参加に失敗しました')
      }

      // 成功時の処理（team_idを取得するために、membershipから取得）
      const teamId = result.membership?.team_id
      if (teamId) {
        onSuccess(teamId)
        onClose()
      } else {
        throw new Error('チームIDの取得に失敗しました')
      }
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

  // モーダルクローズ時の処理
  const handleClose = () => {
    if (isLoading) return // ローディング中はクローズできない
    
    setError(null)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" data-testid="team-join-modal">
      <div className="flex items-center justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        {/* オーバーレイ */}
        <div 
          className="fixed inset-0 bg-black/40 transition-opacity" 
          onClick={handleClose}
        />

        {/* モーダルコンテンツ */}
        <div className="relative inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full" data-testid="team-join-dialog">
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            {/* ヘッダー */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">
                チームに参加
              </h3>
              <button
                type="button"
                onClick={handleClose}
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
    </div>
  )
}
