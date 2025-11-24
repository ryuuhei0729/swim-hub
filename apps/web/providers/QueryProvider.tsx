'use client'

// =============================================================================
// QueryProvider - React Queryのプロバイダーコンポーネント
// =============================================================================

import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from '@/lib/react-query'

interface QueryProviderProps {
  children: React.ReactNode
}

/**
 * React Queryのプロバイダーコンポーネント
 * AuthProviderの内側に配置して、認証済みユーザーのみReact Queryを使用可能にする
 */
export function QueryProvider({ children }: QueryProviderProps) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}

