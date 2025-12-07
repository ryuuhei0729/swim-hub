// =============================================================================
// QueryProvider - React Queryのプロバイダーコンポーネント
// =============================================================================

import React from 'react'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { createQueryClient } from '@apps/shared/lib/react-query'

let queryClient: QueryClient | undefined = undefined

/**
 * QueryClientを取得する関数
 * React Nativeではシングルトンインスタンスを返す
 */
export function getQueryClient() {
  if (!queryClient) {
    queryClient = createQueryClient()
  }
  return queryClient
}

interface QueryProviderProps {
  children: React.ReactNode
}

/**
 * React Queryのプロバイダーコンポーネント
 * AuthProviderの内側に配置して、認証済みユーザーのみReact Queryを使用可能にする
 */
export default function QueryProvider({ children }: QueryProviderProps) {
  const queryClient = getQueryClient()

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}
