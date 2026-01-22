import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockSupabaseClient, createMockRecordWithDetails, createMockRecord, createMockCompetition } from '../../__mocks__/supabase'
import type { MockSupabaseClient } from '../../__mocks__/types'
import { RecordAPI } from '../../api/records'
import { useRecordsQuery, useCreateRecordMutation, useUpdateRecordMutation, useDeleteRecordMutation } from '../../hooks/queries/records'
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

describe('useRecordsQuery', () => {
  let mockClient: MockSupabaseClient
  let mockApi: RecordAPI

  beforeEach(() => {
    vi.clearAllMocks()
    mockClient = createMockSupabaseClient()
    mockApi = new RecordAPI(mockClient)
  })

  it('大会記録一覧を取得できる', async () => {
    const mockRecord = createMockRecordWithDetails()
    vi.spyOn(mockApi, 'getRecords').mockResolvedValue([mockRecord])
    vi.spyOn(mockApi, 'getCompetitions').mockResolvedValue([])

    const { result } = renderHook(
      () => useRecordsQuery(mockClient, { api: mockApi }),
      { wrapper: createWrapper() }
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.records).toEqual([mockRecord])
    expect(mockApi.getRecords).toHaveBeenCalled()
  })

  it('日付範囲を指定して大会記録を取得できる', async () => {
    const mockRecord = createMockRecordWithDetails()
    vi.spyOn(mockApi, 'getRecords').mockResolvedValue([mockRecord])
    vi.spyOn(mockApi, 'getCompetitions').mockResolvedValue([])

    const { result } = renderHook(
      () => useRecordsQuery(mockClient, {
        startDate: '2025-01-01',
        endDate: '2025-01-31',
        api: mockApi
      }),
      { wrapper: createWrapper() }
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.records).toEqual([mockRecord])
    expect(mockApi.getRecords).toHaveBeenCalledWith('2025-01-01', '2025-01-31', undefined, 20, 0)
  })

  it('種目IDでフィルタリングできる', async () => {
    const mockRecord = createMockRecordWithDetails()
    vi.spyOn(mockApi, 'getRecords').mockResolvedValue([mockRecord])
    vi.spyOn(mockApi, 'getCompetitions').mockResolvedValue([])

    const { result } = renderHook(
      () => useRecordsQuery(mockClient, {
        styleId: 1,
        api: mockApi
      }),
      { wrapper: createWrapper() }
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(mockApi.getRecords).toHaveBeenCalledWith(undefined, undefined, 1, 20, 0)
  })
})

describe('useCreateRecordMutation', () => {
  let mockClient: MockSupabaseClient
  let mockApi: RecordAPI

  beforeEach(() => {
    vi.clearAllMocks()
    mockClient = createMockSupabaseClient()
    mockApi = new RecordAPI(mockClient)
  })

  it('大会記録を作成できる', async () => {
    const newRecord = {
      competition_id: 'competition-id',
      style_id: 1,
      time: 60.5,
      note: 'テスト記録',
      video_url: null,
      is_relaying: false,
    }
    const createdRecord = createMockRecordWithDetails(newRecord)
    vi.spyOn(mockApi, 'createRecord').mockResolvedValue(createdRecord)

    const { result } = renderHook(
      () => useCreateRecordMutation(mockClient, mockApi),
      { wrapper: createWrapper() }
    )

    await result.current.mutateAsync(newRecord)

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApi.createRecord).toHaveBeenCalledWith(newRecord)
  })
})

describe('useUpdateRecordMutation', () => {
  let mockClient: MockSupabaseClient
  let mockApi: RecordAPI

  beforeEach(() => {
    vi.clearAllMocks()
    mockClient = createMockSupabaseClient()
    mockApi = new RecordAPI(mockClient)
  })

  it('大会記録を更新できる', async () => {
    const updates = {
      time: 59.5,
      note: '更新された記録'
    }
    const updatedRecord = createMockRecord(updates)
    vi.spyOn(mockApi, 'updateRecord').mockResolvedValue(updatedRecord)

    const { result } = renderHook(
      () => useUpdateRecordMutation(mockClient, mockApi),
      { wrapper: createWrapper() }
    )

    await result.current.mutateAsync({ id: 'record-id', updates })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApi.updateRecord).toHaveBeenCalledWith('record-id', updates)
  })
})

describe('useDeleteRecordMutation', () => {
  let mockClient: MockSupabaseClient
  let mockApi: RecordAPI

  beforeEach(() => {
    vi.clearAllMocks()
    mockClient = createMockSupabaseClient()
    mockApi = new RecordAPI(mockClient)
  })

  it('大会記録を削除できる', async () => {
    vi.spyOn(mockApi, 'deleteRecord').mockResolvedValue(undefined)

    const { result } = renderHook(
      () => useDeleteRecordMutation(mockClient, mockApi),
      { wrapper: createWrapper() }
    )

    await result.current.mutateAsync('record-id')

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockApi.deleteRecord).toHaveBeenCalledWith('record-id')
  })
})

