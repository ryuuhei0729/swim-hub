'use client'

import React, { useState } from 'react'
import { useAuth } from '@/contexts'
import { useCreateTeamMutation } from '@apps/shared/hooks/queries/teams'
import TeamCreateForm, { TeamCreateFormData } from '@/components/forms/TeamCreateForm'

export interface TeamCreateModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: (teamId: string) => void
}

export default function TeamCreateModal({
  isOpen,
  onClose,
  onSuccess
}: TeamCreateModalProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { user, supabase } = useAuth()
  const createTeamMutation = useCreateTeamMutation(supabase)

  // チーム作成処理
  const handleSubmit = async (data: TeamCreateFormData) => {
    if (!user) {
      setError('ログインが必要です')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const newTeam = await createTeamMutation.mutateAsync({
        name: data.name.trim(),
        description: data.description.trim() || null
      })

      
      // 成功時の処理
      if (onSuccess) {
        onSuccess(newTeam.id)
      }
      
      onClose()
    } catch (err) {
      console.error('チーム作成エラー:', err)
      console.error('エラーの詳細:', {
        message: err instanceof Error ? err.message : 'Unknown error',
        stack: err instanceof Error ? err.stack : undefined,
        name: err instanceof Error ? err.name : undefined,
        fullError: err
      })
      
      // より詳細なエラーメッセージを設定
      let errorMessage = 'チームの作成に失敗しました'
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

  return (
    <div>
      {/* エラー表示 */}
      {error && (
        <div className="fixed top-4 right-4 z-50 bg-red-50 border border-red-200 rounded-lg p-4 max-w-md">
          <div className="flex">
            <div className="shrink-0">
              <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">
                エラーが発生しました
              </h3>
              <div className="mt-2 text-sm text-red-700">
                <p>{error}</p>
              </div>
              <div className="mt-4">
                <button
                  onClick={() => setError(null)}
                  className="bg-red-100 px-3 py-2 rounded-md text-sm font-medium text-red-800 hover:bg-red-200"
                >
                  閉じる
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* チーム作成フォーム */}
      <TeamCreateForm
        isOpen={isOpen}
        onClose={handleClose}
        onSubmit={handleSubmit}
        isLoading={isLoading}
      />
    </div>
  )
}
