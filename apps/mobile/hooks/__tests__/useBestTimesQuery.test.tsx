// =============================================================================
// useBestTimesQuery.test.ts - ベストタイム取得フックのユニットテスト
// =============================================================================

import { createMockCompetition, createMockRecord, createMockStyle, createMockSupabaseClient } from '@/__mocks__/supabase'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useBestTimesQuery } from '../useBestTimesQuery'

// React Queryのテスト用ラッパー
const createWrapper = () => {
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

describe('useBestTimesQuery', () => {
  let mockClient: any

  beforeEach(() => {
    vi.clearAllMocks()
    mockClient = createMockSupabaseClient({ userId: 'test-user-id' })
  })

  it('ベストタイムを取得できる', async () => {
    const mockRecord = createMockRecord({
      id: 'record-1',
      time: 60.5,
      pool_type: 1,
      is_relaying: false,
    })
    const mockStyle = createMockStyle({ id: 1, name_jp: '自由形', distance: 100 })
    const mockCompetition = createMockCompetition({ id: 'comp-1', title: 'テスト大会' })

    const mockData = [
      {
        ...mockRecord,
        styles: mockStyle,
        competitions: mockCompetition,
      },
    ]

    mockClient.from = vi.fn((table: string) => {
      const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        then: vi.fn((resolve: any) =>
          Promise.resolve({ data: mockData, error: null }).then(resolve)
        ),
      }
      return builder
    })

    const { result } = renderHook(
      () => useBestTimesQuery(mockClient, { userId: 'test-user-id' }),
      { wrapper: createWrapper() }
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toBeDefined()
    expect(result.current.data?.length).toBeGreaterThan(0)
  })

  it('種目・プール種別ごとの最速タイムを計算する', async () => {
    const mockRecords = [
      {
        ...createMockRecord({ id: 'record-1', time: 60.5, pool_type: 1, is_relaying: false }),
        styles: createMockStyle({ id: 1, name_jp: '自由形', distance: 100 }),
        competitions: createMockCompetition(),
      },
      {
        ...createMockRecord({ id: 'record-2', time: 58.0, pool_type: 1, is_relaying: false }),
        styles: createMockStyle({ id: 1, name_jp: '自由形', distance: 100 }),
        competitions: createMockCompetition(),
      },
    ]

    mockClient.from = vi.fn((table: string) => {
      const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        then: vi.fn((resolve: any) =>
          Promise.resolve({ data: mockRecords, error: null }).then(resolve)
        ),
      }
      return builder
    })

    const { result } = renderHook(
      () => useBestTimesQuery(mockClient, { userId: 'test-user-id' }),
      { wrapper: createWrapper() }
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    // 最速タイム（58.0秒）が返されることを確認
    const bestTime = result.current.data?.find(
      (bt) => bt.style.name_jp === '自由形' && bt.pool_type === 1
    )
    expect(bestTime?.time).toBe(58.0)
  })

  it('引き継ぎタイムを正しく処理する', async () => {
    const mockRecords = [
      {
        ...createMockRecord({ id: 'record-1', time: 60.5, pool_type: 1, is_relaying: false }),
        styles: createMockStyle({ id: 1, name_jp: '自由形', distance: 100 }),
        competitions: createMockCompetition(),
      },
      {
        ...createMockRecord({ id: 'record-2', time: 58.0, pool_type: 1, is_relaying: true }),
        styles: createMockStyle({ id: 1, name_jp: '自由形', distance: 100 }),
        competitions: createMockCompetition(),
      },
    ]

    mockClient.from = vi.fn((table: string) => {
      const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        then: vi.fn((resolve: any) =>
          Promise.resolve({ data: mockRecords, error: null }).then(resolve)
        ),
      }
      return builder
    })

    const { result } = renderHook(
      () => useBestTimesQuery(mockClient, { userId: 'test-user-id' }),
      { wrapper: createWrapper() }
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    // 引き継ぎなしのタイムに引き継ぎありのタイムが紐付けられることを確認
    const bestTime = result.current.data?.find(
      (bt) => bt.style.name_jp === '自由形' && bt.pool_type === 1 && !bt.is_relaying
    )
    expect(bestTime?.relayingTime).toBeDefined()
    expect(bestTime?.relayingTime?.time).toBe(58.0)
  })

  it('userIdが指定されていない場合、認証ユーザーIDを使用する', async () => {
    mockClient.auth.getUser = vi.fn().mockResolvedValue({
      data: { user: { id: 'auth-user-id' } },
      error: null,
    })

    mockClient.from = vi.fn((table: string) => {
      const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        then: vi.fn((resolve: any) =>
          Promise.resolve({ data: [], error: null }).then(resolve)
        ),
      }
      return builder
    })

    const { result } = renderHook(() => useBestTimesQuery(mockClient, {}), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockClient.auth.getUser).toHaveBeenCalled()
    expect(mockClient.from).toHaveBeenCalledWith('records')
  })

  it('認証されていない場合、エラーを返す', async () => {
    mockClient.auth.getUser = vi.fn().mockResolvedValue({
      data: { user: null },
      error: null,
    })

    const { result } = renderHook(() => useBestTimesQuery(mockClient, {}), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(result.current.error?.message).toBe('認証が必要です')
  })

  it('データが空の場合、空配列を返す', async () => {
    mockClient.from = vi.fn((table: string) => {
      const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        then: vi.fn((resolve: any) =>
          Promise.resolve({ data: [], error: null }).then(resolve)
        ),
      }
      return builder
    })

    const { result } = renderHook(
      () => useBestTimesQuery(mockClient, { userId: 'test-user-id' }),
      { wrapper: createWrapper() }
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual([])
  })
})
