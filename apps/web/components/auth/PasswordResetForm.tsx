'use client'

import { useState } from 'react'
import { useAuth } from '@/contexts'

interface PasswordResetFormProps {
  onSuccess?: () => void
}

export const PasswordResetForm: React.FC<PasswordResetFormProps> = ({ onSuccess }) => {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const { resetPassword } = useAuth()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setMessage(null)

    try {
      const { error } = await resetPassword(email)
      if (error) {
        setError('パスワードリセットメールの送信に失敗しました。')
      } else {
        setMessage('パスワードリセット用のメールを送信しました。メールを確認してください。')
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
          パスワードリセット
        </h2>
        <p className="text-sm text-gray-600">
          メールアドレスを入力してリセット用のリンクを受け取ってください
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
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            メールアドレス
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
              </svg>
            </div>
            <input
              type="email"
              id="email"
              required
              autoFocus
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-10 mt-1 block w-full rounded-lg border border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm py-3 px-3 transition duration-150 ease-in-out"
              placeholder="your@email.com"
            />
          </div>
        </div>

        <div className="mt-6">
          <button
            type="submit"
            disabled={loading}
            className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transform transition duration-150 ease-in-out hover:scale-[1.02] shadow-md"
          >
            {loading ? '送信中...' : 'リセットメールを送信'}
          </button>
        </div>
      </form>
    </div>
  )
}
