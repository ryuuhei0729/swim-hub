'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts'
import { FullScreenLoading } from '@/components/ui/LoadingSpinner'

export default function AuthRedirect({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const isAuthenticated = !!user
  const router = useRouter()

  useEffect(() => {
    if (!loading && isAuthenticated) {
      router.push('/dashboard')
    }
  }, [isAuthenticated, loading, router])

  if (loading) {
    return <FullScreenLoading message="SwimHubを起動中..." />
  }

  if (isAuthenticated) {
    return null
  }

  return <>{children}</>
}
