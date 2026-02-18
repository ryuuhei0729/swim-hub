'use client'

import React, { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import { useAuth } from '@/contexts'
import ConfirmDialog from '@/components/ui/ConfirmDialog'

export default function AccountDeleteSettings() {
  const { session, signOut } = useAuth()
  const router = useRouter()
  const [showConfirm, setShowConfirm] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleDeleteAccount = useCallback(async () => {
    setIsDeleting(true)
    setError(null)

    try {
      const response = await fetch('/api/account/delete', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
        },
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({})) as { error?: string }
        throw new Error(data.error || 'アカウントの削除に失敗しました')
      }

      // ローカルセッション・キャッシュをクリア
      await signOut()

      // ログイン画面にリダイレクト
      router.push('/login')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました')
      setIsDeleting(false)
    }
  }, [session, signOut, router])

  return (
    <>
      <div className="bg-white rounded-lg shadow p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-2">
          <ExclamationTriangleIcon className="h-5 w-5 text-red-600" />
          <h2 className="text-lg font-semibold text-gray-900">
            アカウント削除
          </h2>
        </div>
        <p className="text-sm text-gray-600 mb-4">
          アカウントを削除すると、すべての個人データ（練習記録、大会記録、画像など）が完全に削除され、復元できません。チームの練習・大会データはチームに残ります。
        </p>
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
            {error}
          </div>
        )}
        <button
          type="button"
          onClick={() => setShowConfirm(true)}
          disabled={isDeleting}
          className="px-4 py-2 text-sm font-medium text-red-600 bg-white border border-red-300 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
          tabIndex={0}
          role="button"
          aria-label="アカウントを削除する"
        >
          {isDeleting ? '削除中...' : 'アカウントを削除する'}
        </button>
      </div>

      <ConfirmDialog
        isOpen={showConfirm}
        onConfirm={() => {
          setShowConfirm(false)
          handleDeleteAccount()
        }}
        onCancel={() => setShowConfirm(false)}
        title="アカウントを完全に削除しますか？"
        message="この操作は取り消せません。すべての練習記録、大会記録、画像データが永久に削除されます。チームの練習・大会データはチームに残ります。"
        confirmLabel="削除する"
        cancelLabel="キャンセル"
        variant="danger"
      />
    </>
  )
}
