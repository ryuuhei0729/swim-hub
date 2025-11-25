'use client'

// =============================================================================
// QueryProvider - React Queryのプロバイダーコンポーネント
// =============================================================================

import React from 'react'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { createQueryClient } from '@/lib/react-query'

let browserQueryClient: QueryClient | undefined = undefined

function getQueryClient() {
  if (typeof window === 'undefined') {
    // Server: always make a new query client
    return createQueryClient()
  } else {
    // Browser: make a new query client if we don't already have one
    // This is to make sure we only ever have one query client per app
    if (!browserQueryClient) {
      browserQueryClient = createQueryClient()
    }
    return browserQueryClient
  }
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

