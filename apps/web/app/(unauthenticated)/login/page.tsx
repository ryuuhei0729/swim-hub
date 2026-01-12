'use client'

import { useEffect, useRef, Suspense} from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AuthForm, AuthUI } from '@/components/auth'
import { useAuth } from '@/contexts'
import { FullScreenLoading } from '@/components/ui/LoadingSpinner'
import { getSafeRedirectUrl } from '@/utils'

export default function LoginPage() {
  return (
    <Suspense fallback={<FullScreenLoading message="認証情報を確認中..." />}>
      <LoginPageContent />
    </Suspense>
  )
}

function LoginPageContent() {
  const { user, session, loading } = useAuth()
  const isAuthenticated = !!user && !!session
  const router = useRouter()
  const searchParams = useSearchParams()
  const hasRedirectedRef = useRef(false)
  const rawError = searchParams.get('error')
  // Auth UIを使用するかどうか（URLパラメータで切り替え可能）
  const useAuthUI = searchParams.get('ui') === 'auth-ui'

  // エラーマップ: 既知のエラーコードを安全なメッセージにマッピング
  const errorMap: Record<string, string> = {
    'access_denied': 'アクセスが拒否されました',
    'invalid_request': '無効なリクエストです',
    'server_error': 'サーバーエラーが発生しました',
    'temporarily_unavailable': '一時的に利用できません',
    'invalid_grant': '認証情報が無効です',
    'invalid_client': 'クライアント情報が無効です',
    'unauthorized_client': '認証されていないクライアントです',
    'unsupported_response_type': 'サポートされていないレスポンスタイプです',
    'invalid_scope': '無効なスコープです',
    'session_not_found': 'セッションが見つかりません',
    'email_not_confirmed': 'メールアドレスが確認されていません',
    'invalid_credentials': 'メールアドレスまたはパスワードが正しくありません',
    'user_not_found': 'ユーザーが見つかりません',
    'email_already_exists': 'このメールアドレスは既に登録されています',
    'weak_password': 'パスワードが弱すぎます',
    'password_too_short': 'パスワードが短すぎます',
    'password_too_long': 'パスワードが長すぎます',
    'invalid_email': '無効なメールアドレスです',
    'invalid_phone': '無効な電話番号です',
    'phone_not_found': '電話番号が見つかりません',
    'invalid_otp': '認証コードが正しくありません',
    'expired_otp': '認証コードの有効期限が切れています',
    'too_many_requests': 'リクエストが多すぎます。しばらく待ってから再度お試しください',
    'rate_limit_exceeded': 'リクエスト制限を超えました。しばらく待ってから再度お試しください',
  }

  // エラーコードを安全なメッセージに変換
  const error = rawError ? (errorMap[rawError] || '認証エラーが発生しました') : null

  useEffect(() => {
    if (!loading && isAuthenticated && !hasRedirectedRef.current) {
      hasRedirectedRef.current = true
      // URLパラメータからリダイレクト先を取得（安全に検証）
      const redirectTo = getSafeRedirectUrl(searchParams.get('redirect_to'))
      router.push(redirectTo)
    }
  }, [isAuthenticated, loading, router, searchParams])

  if (loading) {
    return <FullScreenLoading message="認証情報を確認中..." />
  }

  if (isAuthenticated) {
    return null
  }

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-blue-50">
      {error && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 w-full max-w-md px-4">
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
            <p className="text-sm font-medium">認証エラーが発生しました</p>
            <p className="text-xs mt-1">{error}</p>
          </div>
        </div>
      )}
      {useAuthUI ? (
        <AuthUI />
      ) : (
        <AuthForm 
          mode="signin" 
          onSuccess={() => {
            // URLパラメータからリダイレクト先を取得（安全に検証）
            const redirectTo = getSafeRedirectUrl(searchParams.get('redirect_to'))
            router.push(redirectTo)
          }}
        />
      )}
    </div>
  )
}
