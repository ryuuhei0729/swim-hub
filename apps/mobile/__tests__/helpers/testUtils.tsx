// =============================================================================
// テストヘルパー - モバイルアプリ
// =============================================================================

import React from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/**
 * React Queryのテスト用ラッパー
 * 各テストでQueryClientProviderを提供
 */
export const createQueryWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

