'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/contexts'

interface UpdatePasswordFormProps {
  onSuccess?: () => void
}

export const UpdatePasswordForm: React.FC<UpdatePasswordFormProps> = ({ onSuccess }) => {
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const { updatePassword } = useAuth()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setMessage(null)

    if (newPassword !== confirmPassword) {
      setError('パスワードが一致しません。')
      setLoading(false)
      return
    }

    if (newPassword.length < 6) {
      setError('パスワードは6文字以上で入力してください。')
      setLoading(false)
      return
    }

    try {
      const { error } = await updatePassword(newPassword)
      if (error) {
        setError('パスワードの更新に失敗しました。')
      } else {
        setMessage('パスワードを正常に更新しました。')
        setNewPassword('')
        setConfirmPassword('')
        onSuccess?.()
      }
    } catch {
      setError('予期しないエラーが発生しました。')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-md w-full space-y-8 bg-white p-10 rounded-2xl shadow-xl transform transition-all duration-300">
      <div className="text-center">
        <h2 className="text-3xl font-extrabold text-gray-900 mb-2">
          パスワード変更
        </h2>
        <p className="text-sm text-gray-600">
          新しいパスワードを設定してください
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 rounded">
          {error}
        </div>
      )}

      {message && (
        <div className="mb-4 p-3 bg-green-100 text-green-700 rounded">
          {message}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-8 space-y-6">
        <div>
          <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-1">
            新しいパスワード
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
              </svg>
            </div>
            <input
              type="password"
              id="newPassword"
              required
              autoFocus
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="pl-10 mt-1 block w-full rounded-lg border border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm py-3 px-3 transition duration-150 ease-in-out"
              placeholder="新しいパスワード（6文字以上）"
              minLength={6}
            />
          </div>
        </div>

        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
            パスワード確認
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
              </svg>
            </div>
            <input
              type="password"
              id="confirmPassword"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="pl-10 mt-1 block w-full rounded-lg border border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm py-3 px-3 transition duration-150 ease-in-out"
              placeholder="パスワード確認"
              minLength={6}
            />
          </div>
        </div>

        <div className="mt-6">
          <button
            type="submit"
            disabled={loading}
            className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transform transition duration-150 ease-in-out hover:scale-[1.02] shadow-md"
          >
            {loading ? '更新中...' : 'パスワードを更新'}
          </button>
        </div>
      </form>

      <div className="text-center mt-6">
        <Link
          href="/login"
          className="text-sm text-gray-600 hover:text-indigo-600 transition duration-150 ease-in-out"
        >
          ログイン画面に戻る
        </Link>
      </div>
    </div>
  )
}
