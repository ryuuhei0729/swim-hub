import React, { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, type RenderHookOptions, type RenderHookResult } from '@testing-library/react'

/**
 * テスト用のQueryClientを作成
 */
export const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        staleTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  })

/**
 * テスト用のラッパーコンポーネント
 */
export const createWrapper = (queryClient?: QueryClient) => {
  const client = queryClient ?? createTestQueryClient()
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

/**
 * React Query フックをテストするためのヘルパー
 */
export function renderQueryHook<TResult, TProps>(
  hook: (props: TProps) => TResult,
  options?: Omit<RenderHookOptions<TProps>, 'wrapper'> & { queryClient?: QueryClient }
): RenderHookResult<TResult, TProps> & { queryClient: QueryClient } {
  const queryClient = options?.queryClient ?? createTestQueryClient()
  const result = renderHook(hook, {
    ...options,
    wrapper: createWrapper(queryClient),
  })
  return { ...result, queryClient }
}
