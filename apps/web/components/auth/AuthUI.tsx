'use client'

/**
 * Supabase Auth UIを使用したGoogle認証コンポーネント
 * Qiita記事: https://qiita.com/kaho_eng/items/a37ff001ea9eae226183
 * を参考に実装
 * 
 * 重要: supabase.tsから統一されたBrowser Clientを使用することで、
 * PKCE code verifierが確実にCookieに保存・読み取りされます。
 */

import { supabase } from '@/lib/supabase'
import { useState } from 'react'

export const AuthUI: React.FC = () => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Google認証ボタンのハンドラー
  // supabase.tsから統一されたBrowser Clientを使用することで、
  // PKCE code verifierが確実にCookieに保存・読み取りされます
  const handleGoogleAuth = async () => {
    if (!supabase) {
      setError('Supabaseクライアントが初期化されていません')
      return
    }

    setLoading(true)
    setError(null)

    try {
      // 重要: redirectToは必ずwindow.location.originを直接使用する
      // 環境変数を使うと、PKCE code verifier Cookieが保存されない
      if (typeof window === 'undefined') {
        setError('ブラウザ環境で実行してください')
        setLoading(false)
        return
      }
      const redirectTo = `${window.location.origin}/api/auth/callback?redirect_to=/dashboard`

      // デバッグ: signInWithOAuth前のCookie状態を確認
      if (typeof window !== 'undefined' && typeof document !== 'undefined') {
        const beforeCookies = document.cookie.split('; ')
        console.log('OAuth開始前 - 検出されたCookie数:', beforeCookies.length)
        console.log('OAuth開始前 - すべてのCookie名:', beforeCookies.map(c => c.split('=')[0]).join(', '))
      }

      const { data, error: authError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          scopes: 'https://www.googleapis.com/auth/calendar',
          queryParams: {
            access_type: 'offline',
            prompt: 'consent'
          }
        }
      })

      if (authError) {
        console.error('OAuth signInWithOAuth error:', authError)
        setError('Google認証に失敗しました。再度お試しください。')
        setLoading(false)
        return
      }

      // デバッグ: code-verifierがCookieに保存されているか確認
      // signInWithOAuthは同期的にCookieを保存するため、即座に確認可能
      if (typeof window !== 'undefined' && typeof document !== 'undefined') {
        // 少し待ってからCookieを確認（@supabase/ssrがCookieを設定する時間を確保）
        await new Promise(resolve => setTimeout(resolve, 100))
        const allCookies = document.cookie.split('; ')
        const codeVerifierCookie = allCookies.find(c => c.includes('code-verifier') || c.includes('pkce'))
        console.log('OAuth開始後 - 検出されたCookie数:', allCookies.length)
        console.log('OAuth開始後 - code-verifier/pkce Cookie:', codeVerifierCookie ? codeVerifierCookie.split('=')[0] : '見つかりません')
        console.log('OAuth開始後 - すべてのCookie名:', allCookies.map(c => c.split('=')[0]).join(', '))
        
        if (!codeVerifierCookie) {
          console.error('❌ PKCE code verifier Cookieが保存されていません！')
          console.error('Supabase client:', supabase ? '存在' : '存在しない')
          console.error('redirectTo:', redirectTo)
        } else {
          console.log('✅ PKCE code verifier Cookieが保存されました:', codeVerifierCookie.split('=')[0])
        }
      }

      // OAuthプロバイダーにリダイレクト（data.urlが存在する場合）
      if (data.url && typeof window !== 'undefined') {
        window.location.href = data.url
      }
    } catch (err) {
      console.error('Google認証エラー:', err)
      setError('Google認証に失敗しました。再度お試しください。')
      setLoading(false)
    }
  }

  return (
    <div className="max-w-md w-full space-y-8 bg-white p-10 rounded-2xl shadow-xl transform transition-all duration-300">
      <div className="text-center">
        <h2 className="text-3xl font-extrabold text-gray-900 mb-2">
          SwimHubへようこそ
        </h2>
        <p className="text-sm text-gray-600">
          ログインまたはアカウント作成
        </p>
      </div>
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">
          <p className="text-sm">{error}</p>
        </div>
      )}
      <button
        type="button"
        onClick={handleGoogleAuth}
        disabled={loading}
        className="w-full flex items-center justify-center gap-3 py-3 px-4 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition duration-150 ease-in-out"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        {loading ? '認証中...' : 'Googleでログイン'}
      </button>
    </div>
  )
}
