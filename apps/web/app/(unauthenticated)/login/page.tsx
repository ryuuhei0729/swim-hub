'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AuthForm } from '@/components/auth'
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
  const { user, session, isLoading } = useAuth()
  const isAuthenticated = !!user && !!session
  const router = useRouter()
  const searchParams = useSearchParams()
  const [hasRedirected, setHasRedirected] = useState(false)

  useEffect(() => {
    if (!isLoading && isAuthenticated && !hasRedirected) {
      setHasRedirected(true)
      // URLパラメータからリダイレクト先を取得
      const redirectTo = searchParams.get('redirect_to') || '/dashboard'
      router.push(redirectTo)
    }
  }, [isAuthenticated, isLoading, router, hasRedirected, searchParams])

  if (isLoading) {
    return <FullScreenLoading message="認証情報を確認中..." />
  }

  if (isAuthenticated) {
    return null
  }

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-blue-50 to-indigo-100">
      <AuthForm 
        mode="signin" 
        onSuccess={() => {
          // URLパラメータからリダイレクト先を取得
          const redirectTo = searchParams.get('redirect_to') || '/dashboard'
          router.push(redirectTo)
        }}
      />
    </div>
  )
}
