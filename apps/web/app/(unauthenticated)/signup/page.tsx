'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { AuthForm } from '@/components/auth'
import { useAuth } from '@/contexts'

export default function SignupPage() {
  const { isAuthenticated, isLoading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.push('/dashboard')
    }
  }, [isAuthenticated, isLoading, router])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (isAuthenticated) {
    return null
  }

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-blue-50 to-indigo-100">
      <AuthForm 
        mode="signup" 
        onSuccess={() => {
          // メール認証の案内メッセージは表示しない
        }}
      />
    </div>
  )
}
