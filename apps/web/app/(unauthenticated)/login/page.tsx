'use client'

import { useEffect, useRef, Suspense} from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AuthForm, AuthUI } from '@/components/auth'
import { useAuth } from '@/contexts'
import { FullScreenLoading } from '@/components/ui/LoadingSpinner'

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
  const error = searchParams.get('error')
  // Auth UIを使用するかどうか（URLパラメータで切り替え可能）
  const useAuthUI = searchParams.get('ui') === 'auth-ui'

  useEffect(() => {
    if (!loading && isAuthenticated && !hasRedirectedRef.current) {
      hasRedirectedRef.current = true
      // URLパラメータからリダイレクト先を取得
      const redirectTo = searchParams.get('redirect_to') || '/dashboard'
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
            // URLパラメータからリダイレクト先を取得
            const redirectTo = searchParams.get('redirect_to') || '/dashboard'
            router.push(redirectTo)
          }}
        />
      )}
    </div>
  )
}
