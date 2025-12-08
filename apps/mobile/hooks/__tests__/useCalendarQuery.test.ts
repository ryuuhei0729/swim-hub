// =============================================================================
// useCalendarQuery.test.ts - カレンダーデータ取得フックのユニットテスト
// =============================================================================

import { createMockSupabaseClient } from '@/__mocks__/supabase'
import { DashboardAPI } from '@apps/shared/api/dashboard'
import { QueryClient } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useCalendarQuery } from '../useCalendarQuery'

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

describe('useCalendarQuery', () => {
  let mockClient: any
  let mockApi: DashboardAPI

  beforeEach(() => {
    vi.clearAllMocks()
    mockClient = createMockSupabaseClient()
    mockApi = new DashboardAPI(mockClient)
  })

  it('カレンダーエントリーを取得できる', async () => {
    const mockCalendarItems = [
      {
        id: 'item-1',
        type: 'practice' as const,
        date: '2025-01-15',
        title: 'テスト練習',
        place: 'テストプール',
      },
    ]

    vi.spyOn(mockApi, 'getCalendarEntries').mockResolvedValue(mockCalendarItems)

    const currentDate = new Date('2025-01-15')

    const { result } = renderHook(
      () => useCalendarQuery(mockClient, { currentDate, api: mockApi }),
      { wrapper: createWrapper() }
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual(mockCalendarItems)
    expect(mockApi.getCalendarEntries).toHaveBeenCalled()
  })

  it('指定された月の開始日・終了日でクエリを実行する', async () => {
    const mockCalendarItems: any[] = []
    vi.spyOn(mockApi, 'getCalendarEntries').mockResolvedValue(mockCalendarItems)

    const currentDate = new Date('2025-01-15')

    const { result } = renderHook(
      () => useCalendarQuery(mockClient, { currentDate, api: mockApi }),
      { wrapper: createWrapper() }
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    // 1月の開始日（2025-01-01）と終了日（2025-01-31）で呼ばれることを確認
    expect(mockApi.getCalendarEntries).toHaveBeenCalledWith('2025-01-01', '2025-01-31')
  })

  it('APIが提供されていない場合、新しいAPIインスタンスを作成する', async () => {
    const mockCalendarItems: any[] = []
    const apiSpy = vi.spyOn(DashboardAPI.prototype, 'getCalendarEntries').mockResolvedValue(mockCalendarItems)

    const currentDate = new Date('2025-01-15')

    const { result } = renderHook(
      () => useCalendarQuery(mockClient, { currentDate }),
      { wrapper: createWrapper() }
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(apiSpy).toHaveBeenCalled()
  })

  it('異なる月でクエリキーが変わる', async () => {
    const mockCalendarItems: any[] = []
    vi.spyOn(mockApi, 'getCalendarEntries').mockResolvedValue(mockCalendarItems)

    const januaryDate = new Date('2025-01-15')
    const februaryDate = new Date('2025-02-15')

    const { result: janResult, rerender } = renderHook(
      ({ date }) => useCalendarQuery(mockClient, { currentDate: date, api: mockApi }),
      {
        wrapper: createWrapper(),
        initialProps: { date: januaryDate },
      }
    )

    await waitFor(() => expect(janResult.current.isSuccess).toBe(true))

    // 2月に変更
    rerender({ date: februaryDate })

    await waitFor(() => {
      // 2月の開始日・終了日で呼ばれることを確認
      expect(mockApi.getCalendarEntries).toHaveBeenCalledWith('2025-02-01', '2025-02-28')
    })
  })

  it('エラーが発生した場合、エラー状態を返す', async () => {
    const error = new Error('カレンダー取得エラー')
    vi.spyOn(mockApi, 'getCalendarEntries').mockRejectedValue(error)

    const currentDate = new Date('2025-01-15')

    const { result } = renderHook(
      () => useCalendarQuery(mockClient, { currentDate, api: mockApi }),
      { wrapper: createWrapper() }
    )

    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(result.current.error).toBe(error)
  })
})
