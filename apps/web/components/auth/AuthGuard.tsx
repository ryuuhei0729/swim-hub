'use client'

import { useAuth } from '@/contexts'
import { FullScreenLoading } from '@/components/ui/LoadingSpinner'

interface AuthGuardProps {
  children: React.ReactNode
}

export const AuthGuard: React.FC<AuthGuardProps> = ({ children }) => {
  const { isLoading, isAuthenticated } = useAuth()

  // 認証状態の確認中はローディング画面を表示
  if (isLoading) {
    return <FullScreenLoading message="認証情報を確認中..." />
  }

  // ミドルウェアがリダイレクトするので、基本的には認証済みのユーザーしかここには来ない
  // 万が一の状態変化に備えて、未認証の場合は何も表示しない
  if (!isAuthenticated) {
    return null
  }

  return <>{children}</>
}
