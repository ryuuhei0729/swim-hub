'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/contexts'

interface AuthFormProps {
  mode?: 'signin' | 'signup'
  onSuccess?: () => void
}

export const AuthForm: React.FC<AuthFormProps> = ({ 
  mode = 'signin', 
  onSuccess 
}) => {
  const [formMode, setFormMode] = useState(mode)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const { signIn, signUp } = useAuth()

  type AuthError = {
    status?: number
    message?: string
    error_description?: string
    error?: string
  }

  const formatAuthError = (err: unknown, action: 'signin' | 'signup'): string => {
    const errorObj: AuthError =
      err && typeof err === 'object' ? (err as AuthError) : {}
    const status = typeof errorObj.status === 'number' ? errorObj.status : undefined
    const statusText = status ? ` [status: ${status}]` : ''
    const errMsg =
      (typeof errorObj.message === 'string' ? errorObj.message : null) ||
      (typeof errorObj.error_description === 'string' ? errorObj.error_description : null) ||
      (typeof errorObj.error === 'string' ? errorObj.error : null) ||
      '不明なエラーが発生しました。'

    // エラーメッセージの日本語化と補足ヒント
    if (typeof errMsg === 'string') {
      const msg = errMsg.toLowerCase()
      
      // ログイン認証エラーの処理（OWASP準拠）
      if (action === 'signin') {
        // 認証関連エラーは全て同じメッセージで統一（アカウント列挙攻撃を防止）
        if (msg.includes('invalid') && (msg.includes('credentials') || msg.includes('email'))) {
          return `メールアドレスまたはパスワードが正しくありません。入力内容を確認してから再度お試しください。`
        }
        if (msg.includes('email not confirmed')) {
          return `メールアドレスまたはパスワードが正しくありません。入力内容を確認してから再度お試しください。`
        }
        if (msg.includes('too many requests')) {
          return `ログイン試行回数が上限に達しました。しばらく時間をおいてから再度お試しください。`
        }
      }
      
      // サインアップエラーの処理（OWASP準拠）
      if (action === 'signup') {
        if (msg.includes('user already registered')) {
          return `アカウントの作成に失敗しました。入力内容を確認してから再度お試しください。`
        }
        // パスワード強度エラーの検出を拡張
        const weakPwdRegex = /\b(pass(word)?).*(weak|too short|at least|characters)\b/i
        if (
          msg.includes('password') && msg.includes('weak') ||
          msg.includes('too short') ||
          (msg.includes('at least') && msg.includes('characters')) ||
          (msg.includes('minimum') && msg.includes('characters')) ||
          weakPwdRegex.test(errMsg)
        ) {
          return `パスワードが弱すぎます。より強力なパスワードを設定してください。`
        }
      }
      
      // 共通エラーの処理
      if (msg.includes('captcha')) {
        return `Captcha認証が必要です。Captchaを完了してから再度お試しください。`
      }
      if (msg.includes('rate limit') || status === 429) {
        return `リクエスト制限に達しました。しばらく時間をおいてから再度お試しください。`
      }
      if (msg.includes('network') || msg.includes('connection')) {
        return `ネットワークエラーが発生しました。インターネット接続を確認してから再度お試しください。`
      }
    }
    
    // デフォルトのエラーメッセージ
    if (action === 'signin' && process.env.NODE_ENV !== 'development') {
      // 署名情報を隠すため、プロダクションでは非開示の汎用文言を返す
      return 'ログインに失敗しました。入力内容を確認してから再度お試しください。'
    }
    return process.env.NODE_ENV === 'development'
      ? `エラーが発生しました: ${errMsg}${statusText}`
      : 'エラーが発生しました。時間をおいて再度お試しください。'
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setMessage(null)

    try {
      if (formMode === 'signin') {
        const { error } = await signIn(email, password)
        if (error) {
          setError(formatAuthError(error, 'signin'))
        } else {
          onSuccess?.()
        }
      } else {
        const { error } = await signUp(email, password, name)
        if (error) {
          setError(formatAuthError(error, 'signup'))
        } else {
          setMessage('確認メールを送信しました。メールを確認してアカウントを有効化してください。')
        }
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
          {formMode === 'signin' ? 'ログイン' : 'アカウント作成'}
        </h2>
        <p className="text-sm text-gray-600">
          {formMode === 'signin' ? 'SwimHubへようこそ' : '新しいアカウントを作成'}
        </p>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">
          <div className="flex items-start">
            <svg className="w-5 h-5 text-red-400 mt-0.5 mr-3 shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <div className="whitespace-pre-line text-sm leading-relaxed">
              {error}
            </div>
          </div>
        </div>
      )}

      {message && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 text-green-700 rounded-lg">
          <div className="flex items-start">
            <svg className="w-5 h-5 text-green-400 mt-0.5 mr-3 shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <div className="whitespace-pre-line text-sm leading-relaxed">
              {message}
            </div>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-8 space-y-6" data-testid="auth-form">
        <div className="space-y-5">
          {formMode === 'signup' && (
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                名前
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                  </svg>
                </div>
                <input
                  type="text"
                  id="name"
                  data-testid="signup-name-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="pl-10 mt-1 block w-full rounded-lg border border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm py-3 px-3 transition duration-150 ease-in-out"
                  placeholder="山田太郎"
                />
              </div>
            </div>
          )}

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
                data-testid="email-input"
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

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              パスワード
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                </svg>
              </div>
              <input
                type="password"
                id="password"
                data-testid="password-input"
                required
                autoComplete={formMode === 'signin' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-10 mt-1 block w-full rounded-lg border border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm py-3 px-3 transition duration-150 ease-in-out"
                placeholder="パスワード"
                minLength={6}
              />
            </div>
          </div>
        </div>

        {formMode === 'signin' && (
          <div className="flex items-center justify-between mt-6">
            <div className="flex items-center">
              <input
                id="remember-me"
                name="remember-me"
                data-testid="remember-me-checkbox"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded transition duration-150 ease-in-out"
              />
              <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-900">
                ログイン状態を保持
              </label>
            </div>
          </div>
        )}

        <div className="mt-6">
          <button
            type="submit"
            disabled={loading}
            className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transform transition duration-150 ease-in-out hover:scale-[1.02] shadow-md"
            data-testid={formMode === 'signin' ? 'login-button' : 'signup-button'}
          >
            {loading ? '処理中...' : formMode === 'signin' ? 'ログイン' : 'アカウント作成'}
          </button>
        </div>
      </form>

      <div className="text-center mt-6">
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setFormMode(formMode === 'signin' ? 'signup' : 'signin')}
            className="text-indigo-600 hover:text-indigo-800 text-sm font-medium transition duration-150 ease-in-out"
            data-testid="toggle-auth-mode-button"
          >
            {formMode === 'signin' 
              ? 'アカウントをお持ちでない方はこちら' 
              : 'すでにアカウントをお持ちの方はこちら'
            }
          </button>
          {formMode === 'signin' && (
            <div>
              <Link
                href="/reset-password"
                className="text-sm text-gray-600 hover:text-indigo-600 transition duration-150 ease-in-out"
              >
                パスワードを忘れた方はこちら
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
