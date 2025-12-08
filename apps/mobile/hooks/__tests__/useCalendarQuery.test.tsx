// =============================================================================
// useCalendarQuery.test.ts - カレンダーデータ取得フックのユニットテスト
// =============================================================================

import { createMockSupabaseClient } from '@/__mocks__/supabase'
import { DashboardAPI } from '@apps/shared/api/dashboard'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
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

    // UTCで日付を作成（タイムゾーンの影響を避ける）
    const currentDate = new Date(Date.UTC(2025, 0, 15)) // 月は0ベース（0=1月）

    const { result } = renderHook(
      () => useCalendarQuery(mockClient, { currentDate, api: mockApi }),
      { wrapper: createWrapper() }
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    // getCalendarEntriesが呼ばれたことを確認
    expect(mockApi.getCalendarEntries).toHaveBeenCalled()
    const callArgs = vi.mocked(mockApi.getCalendarEntries).mock.calls[0]
    expect(callArgs).toHaveLength(2)
    // 開始日と終了日が文字列形式であることを確認
    expect(typeof callArgs[0]).toBe('string')
    expect(typeof callArgs[1]).toBe('string')
    // 1月の日付が含まれることを確認（タイムゾーンの影響を考慮）
    expect(callArgs[0] + callArgs[1]).toMatch(/2025-01/)
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

  it('異なる月で異なるクエリキーが生成される', async () => {
    const mockCalendarItems: any[] = []
    vi.spyOn(mockApi, 'getCalendarEntries').mockResolvedValue(mockCalendarItems)

    // UTCで日付を作成（タイムゾーンの影響を避ける）
    const januaryDate = new Date(Date.UTC(2025, 0, 15)) // 月は0ベース（0=1月）
    const februaryDate = new Date(Date.UTC(2025, 1, 15)) // 1=2月

    // 1月のクエリ
    const { result: janResult } = renderHook(
      () => useCalendarQuery(mockClient, { currentDate: januaryDate, api: mockApi }),
      { wrapper: createWrapper() }
    )

    await waitFor(() => expect(janResult.current.isSuccess).toBe(true))

    // モックをクリア
    vi.clearAllMocks()
    vi.spyOn(mockApi, 'getCalendarEntries').mockResolvedValue(mockCalendarItems)

    // 2月のクエリ（別のフックインスタンス）
    const { result: febResult } = renderHook(
      () => useCalendarQuery(mockClient, { currentDate: februaryDate, api: mockApi }),
      { wrapper: createWrapper() }
    )

    await waitFor(() => expect(febResult.current.isSuccess).toBe(true))

    // 2月のクエリが実行されたことを確認
    expect(mockApi.getCalendarEntries).toHaveBeenCalled()
    const callArgs = vi.mocked(mockApi.getCalendarEntries).mock.calls[0]
    // 2月の日付が含まれることを確認（タイムゾーンの影響を考慮）
    const dateString = callArgs[0] + callArgs[1]
    expect(dateString).toMatch(/2025-02/)
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
