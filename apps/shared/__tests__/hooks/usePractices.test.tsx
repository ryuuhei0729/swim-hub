import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockSupabaseClient, createMockPractice, createMockPracticeWithLogs } from '../../__mocks__/supabase'
import type { MockSupabaseClient } from '../../__mocks__/types'
import { PracticeAPI } from '../../api/practices'
import { usePracticesQuery, useCreatePracticeMutation, useUpdatePracticeMutation, useDeletePracticeMutation } from '../../hooks/queries/practices'
import React from 'react'

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

describe('usePracticesQuery', () => {
  let mockClient: MockSupabaseClient
  let mockApi: PracticeAPI

  beforeEach(() => {
    vi.clearAllMocks()
    mockClient = createMockSupabaseClient()
    mockApi = new PracticeAPI(mockClient)
  })

  it('練習記録一覧を取得できる', async () => {
    const mockPractice = createMockPracticeWithLogs()
    vi.spyOn(mockApi, 'getPractices').mockResolvedValue([mockPractice])

    const { result } = renderHook(
      () => usePracticesQuery(mockClient, { api: mockApi }),
      { wrapper: createWrapper() }
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual([mockPractice])
    expect(mockApi.getPractices).toHaveBeenCalled()
  })

  it('日付範囲を指定して練習記録を取得できる', async () => {
    const mockPractice = createMockPracticeWithLogs()
    vi.spyOn(mockApi, 'getPractices').mockResolvedValue([mockPractice])

    const { result } = renderHook(
      () => usePracticesQuery(mockClient, {
        startDate: '2025-01-01',
        endDate: '2025-01-31',
        api: mockApi
      }),
      { wrapper: createWrapper() }
    )

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(result.current.data).toEqual([mockPractice])
    expect(mockApi.getPractices).toHaveBeenCalledWith('2025-01-01', '2025-01-31', 20, 0)
  })

  it('エラー時にエラー状態を返す', async () => {
    const error = new Error('Database error')
    vi.spyOn(mockApi, 'getPractices').mockRejectedValue(error)

    const { result } = renderHook(
      () => usePracticesQuery(mockClient, { api: mockApi }),
      { wrapper: createWrapper() }
    )

    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(result.current.error).toEqual(error)
  })
})

describe('useCreatePracticeMutation', () => {
  let mockClient: MockSupabaseClient
  let mockApi: PracticeAPI

  beforeEach(() => {
    vi.clearAllMocks()
    mockClient = createMockSupabaseClient()
    mockApi = new PracticeAPI(mockClient)
  })

  it('練習記録を作成できる', async () => {
    const newPractice = {
      date: '2025-01-15',
      title: 'テスト練習',
      place: 'テストプール',
      note: 'テストメモ'
    }
    const createdPractice = createMockPractice(newPractice)
    vi.spyOn(mockApi, 'createPractice').mockResolvedValue(createdPractice)

    const { result } = renderHook(
      () => useCreatePracticeMutation(mockClient, mockApi),
      { wrapper: createWrapper() }
    )

    await result.current.mutateAsync(newPractice)

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApi.createPractice).toHaveBeenCalledWith(newPractice)
  })
})

describe('useUpdatePracticeMutation', () => {
  let mockClient: MockSupabaseClient
  let mockApi: PracticeAPI

  beforeEach(() => {
    vi.clearAllMocks()
    mockClient = createMockSupabaseClient()
    mockApi = new PracticeAPI(mockClient)
  })

  it('練習記録を更新できる', async () => {
    const updates = {
      date: '2025-01-16',
      place: '更新されたプール',
      note: '更新されたメモ'
    }
    const updatedPractice = createMockPractice(updates)
    vi.spyOn(mockApi, 'updatePractice').mockResolvedValue(updatedPractice)

    const { result } = renderHook(
      () => useUpdatePracticeMutation(mockClient, mockApi),
      { wrapper: createWrapper() }
    )

    await result.current.mutateAsync({ id: 'practice-id', updates })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApi.updatePractice).toHaveBeenCalledWith('practice-id', updates)
  })
})

describe('useDeletePracticeMutation', () => {
  let mockClient: MockSupabaseClient
  let mockApi: PracticeAPI

  beforeEach(() => {
    vi.clearAllMocks()
    mockClient = createMockSupabaseClient()
    mockApi = new PracticeAPI(mockClient)
  })

  it('練習記録を削除できる', async () => {
    vi.spyOn(mockApi, 'deletePractice').mockResolvedValue(undefined)

    const { result } = renderHook(
      () => useDeletePracticeMutation(mockClient, mockApi),
      { wrapper: createWrapper() }
    )

    await result.current.mutateAsync('practice-id')

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApi.deletePractice).toHaveBeenCalledWith('practice-id')
  })
})

