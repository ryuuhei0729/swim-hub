'use client'

import React, { useState, useEffect, useRef } from 'react'
import { useAuth } from '@/contexts'
import { EnvelopeIcon, XMarkIcon } from '@heroicons/react/24/outline'
import Input, { validationHelpers } from '@/components/ui/Input'

const DUMMY_EMAIL_DOMAIN = '@ryuhei.love'

export default function EmailChangeSettings() {
  const { supabase, user } = useAuth()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)

  const currentEmail = user?.email || ''
  const isDummyEmail = currentEmail.endsWith(DUMMY_EMAIL_DOMAIN)

  // モーダルを開く時に状態をリセット
  const openModal = () => {
    setNewEmail('')
    setError(null)
    setSuccess(false)
    setIsModalOpen(true)
  }

  const closeModal = () => {
    setIsModalOpen(false)
  }

  // ESCキーとフォーカストラップ
  useEffect(() => {
    if (!isModalOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeModal()
      }
      if (e.key === 'Tab' && dialogRef.current) {
        const focusableElements = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, input, [tabindex]:not([tabindex="-1"])'
        )
        const firstElement = focusableElements[0]
        const lastElement = focusableElements[focusableElements.length - 1]

        if (e.shiftKey && document.activeElement === firstElement) {
          e.preventDefault()
          lastElement?.focus()
        } else if (!e.shiftKey && document.activeElement === lastElement) {
          e.preventDefault()
          firstElement?.focus()
        }
      }
    }

    const originalOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = originalOverflow
    }
  }, [isModalOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newEmail.trim() || loading) return

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      setError('有効なメールアドレスを入力してください')
      return
    }

    if (newEmail === currentEmail) {
      setError('現在と同じメールアドレスです')
      return
    }

    setLoading(true)
    setError(null)
    setSuccess(false)

    try {
      const { error: updateError } = await supabase.auth.updateUser({
        email: newEmail,
      }, {
        emailRedirectTo: `${window.location.origin}/api/auth/callback?redirect_to=/settings`,
      })

      if (updateError) {
        setError(updateError.message)
        return
      }

      setSuccess(true)
      setNewEmail('')
    } catch (err) {
      console.error('メールアドレス変更エラー:', err)
      setError('メールアドレスの変更に失敗しました。再度お試しください。')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* セクション: ボタンのみ表示 */}
      <div className="bg-white rounded-lg shadow p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0 pb-2 mb-4 border-b border-gray-200">
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900">
            メールアドレス
          </h2>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <EnvelopeIcon className="h-5 w-5 text-gray-400" />
            {isDummyEmail ? (
              <span className="text-gray-500">メールアドレス未登録</span>
            ) : (
              <span className="text-gray-700">{currentEmail}</span>
            )}
          </div>
          <button
            type="button"
            onClick={openModal}
            className="inline-flex items-center justify-center px-3 py-2 border border-gray-300 rounded-md shadow-sm text-xs sm:text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
          >
            {isDummyEmail ? '登録する' : '変更する'}
          </button>
        </div>
      </div>

      {/* モーダル */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="email-change-dialog-title"
        >
          {/* オーバーレイ */}
          <div
            className="fixed inset-0 bg-black/50 transition-opacity animate-in fade-in duration-200"
            onClick={closeModal}
            aria-hidden="true"
          />

          {/* ダイアログ */}
          <div
            ref={dialogRef}
            className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 animate-in zoom-in-95 fade-in duration-200"
          >
            {/* 閉じるボタン */}
            <button
              type="button"
              onClick={closeModal}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
              aria-label="ダイアログを閉じる"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>

            <div className="p-6">
              <h3
                id="email-change-dialog-title"
                className="text-lg font-semibold text-gray-900 mb-4"
              >
                {isDummyEmail ? 'メールアドレス登録' : 'メールアドレス変更'}
              </h3>

              {!isDummyEmail && (
                <p className="text-sm text-gray-600 mb-4">
                  現在のメールアドレス: <span className="font-medium">{currentEmail}</span>
                </p>
              )}

              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                  {error}
                </div>
              )}

              {success && (
                <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">
                  確認メールを送信しました。メール内のリンクをクリックして変更を完了してください。
                </div>
              )}

              {!success && (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <Input
                    type="email"
                    label={isDummyEmail ? '登録するメールアドレス' : '新しいメールアドレス'}
                    placeholder="example@gmail.com"
                    value={newEmail}
                    onChange={(e) => {
                      setNewEmail(e.target.value)
                      setError(null)
                    }}
                    validationRules={[validationHelpers.email()]}
                    validateOn="blur"
                    required
                  />
                  <div className="flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={closeModal}
                      className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors"
                    >
                      キャンセル
                    </button>
                    <button
                      type="submit"
                      disabled={loading || !newEmail.trim()}
                      className="inline-flex items-center justify-center px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {loading ? (
                        <>
                          <svg
                            className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                          >
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          送信中...
                        </>
                      ) : isDummyEmail ? (
                        '登録する'
                      ) : (
                        '変更する'
                      )}
                    </button>
                  </div>
                </form>
              )}

              {success && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors"
                  >
                    閉じる
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
