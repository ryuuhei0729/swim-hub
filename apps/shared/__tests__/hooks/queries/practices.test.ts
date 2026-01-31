import { describe, expect, it, vi, beforeEach } from 'vitest'
import { waitFor, act } from '@testing-library/react'
import { createMockSupabaseClient, createMockPracticeWithLogs, createMockPractice } from '../../../__mocks__/supabase'
import { PracticeAPI } from '../../../api/practices'
import {
  usePracticesQuery,
  usePracticesCountQuery,
  usePracticeByIdQuery,
  useCreatePracticeMutation,
  useUpdatePracticeMutation,
  useDeletePracticeMutation,
  usePracticeTagsQuery,
} from '../../../hooks/queries/practices'
import { renderQueryHook } from '../../utils/test-utils'

// PracticeAPIをモック化
vi.mock('../../../api/practices', () => ({
  PracticeAPI: vi.fn().mockImplementation(() => ({
    getPractices: vi.fn(),
    countPractices: vi.fn(),
    getPracticeById: vi.fn(),
    createPractice: vi.fn(),
    updatePractice: vi.fn(),
    deletePractice: vi.fn(),
    getPracticeTags: vi.fn(),
    subscribeToPractices: vi.fn(() => ({ unsubscribe: vi.fn() })),
  })),
}))

// GoalAPIをモック化
vi.mock('../../../api/goals', () => ({
  GoalAPI: vi.fn().mockImplementation(() => ({
    updateAllMilestoneStatuses: vi.fn(),
  })),
}))

describe('Practice Query Hooks', () => {
  let mockSupabase: ReturnType<typeof createMockSupabaseClient>
  let mockApi: {
    getPractices: ReturnType<typeof vi.fn>
    countPractices: ReturnType<typeof vi.fn>
    getPracticeById: ReturnType<typeof vi.fn>
    createPractice: ReturnType<typeof vi.fn>
    updatePractice: ReturnType<typeof vi.fn>
    deletePractice: ReturnType<typeof vi.fn>
    getPracticeTags: ReturnType<typeof vi.fn>
    subscribeToPractices: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabase = createMockSupabaseClient()
    mockApi = {
      getPractices: vi.fn(),
      countPractices: vi.fn(),
      getPracticeById: vi.fn(),
      createPractice: vi.fn(),
      updatePractice: vi.fn(),
      deletePractice: vi.fn(),
      getPracticeTags: vi.fn(),
      subscribeToPractices: vi.fn(() => ({ unsubscribe: vi.fn() })),
    }
  })

  describe('usePracticesQuery', () => {
    it('練習一覧を取得できる', async () => {
      const mockPractices = [createMockPracticeWithLogs()]
      mockApi.getPractices.mockResolvedValue(mockPractices)

      const { result } = renderQueryHook(() =>
        usePracticesQuery(mockSupabase as any, {
          enableRealtime: false,
          api: mockApi as unknown as PracticeAPI,
        })
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toEqual(mockPractices)
      expect(mockApi.getPractices).toHaveBeenCalled()
    })

    it('日付範囲を指定して取得できる', async () => {
      const mockPractices = [createMockPracticeWithLogs()]
      mockApi.getPractices.mockResolvedValue(mockPractices)

      const { result } = renderQueryHook(() =>
        usePracticesQuery(mockSupabase as any, {
          startDate: '2025-01-01',
          endDate: '2025-01-31',
          enableRealtime: false,
          api: mockApi as unknown as PracticeAPI,
        })
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(mockApi.getPractices).toHaveBeenCalledWith('2025-01-01', '2025-01-31', 20, 0)
    })

    it('ページングを指定して取得できる', async () => {
      const mockPractices = [createMockPracticeWithLogs()]
      mockApi.getPractices.mockResolvedValue(mockPractices)

      const { result } = renderQueryHook(() =>
        usePracticesQuery(mockSupabase as any, {
          page: 2,
          pageSize: 10,
          enableRealtime: false,
          api: mockApi as unknown as PracticeAPI,
        })
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      // page=2, pageSize=10 -> offset=10
      expect(mockApi.getPractices).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        10,
        10
      )
    })

    it('初期データを使用できる', async () => {
      const initialData = [createMockPracticeWithLogs({ id: 'initial-1' })]

      const { result } = renderQueryHook(() =>
        usePracticesQuery(mockSupabase as any, {
          initialData,
          enableRealtime: false,
          api: mockApi as unknown as PracticeAPI,
        })
      )

      // 初期データがすぐに利用可能
      expect(result.current.data).toEqual(initialData)
    })

    it('APIエラー時にエラー状態になる', async () => {
      mockApi.getPractices.mockRejectedValue(new Error('API Error'))

      const { result } = renderQueryHook(() =>
        usePracticesQuery(mockSupabase as any, {
          enableRealtime: false,
          api: mockApi as unknown as PracticeAPI,
        })
      )

      await waitFor(() => {
        expect(result.current.isError).toBe(true)
      })

      expect(result.current.error?.message).toBe('API Error')
    })
  })

  describe('usePracticesCountQuery', () => {
    it('練習件数を取得できる', async () => {
      mockApi.countPractices.mockResolvedValue(42)

      const { result } = renderQueryHook(() =>
        usePracticesCountQuery(mockSupabase as any, {
          api: mockApi as unknown as PracticeAPI,
        })
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toBe(42)
    })

    it('日付範囲を指定して件数を取得できる', async () => {
      mockApi.countPractices.mockResolvedValue(10)

      const { result } = renderQueryHook(() =>
        usePracticesCountQuery(mockSupabase as any, {
          startDate: '2025-01-01',
          endDate: '2025-01-31',
          api: mockApi as unknown as PracticeAPI,
        })
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(mockApi.countPractices).toHaveBeenCalledWith('2025-01-01', '2025-01-31')
    })
  })

  describe('usePracticeByIdQuery', () => {
    it('IDで練習を取得できる', async () => {
      const mockPractice = createMockPracticeWithLogs({ id: 'practice-123' })
      mockApi.getPracticeById.mockResolvedValue(mockPractice)

      const { result } = renderQueryHook(() =>
        usePracticeByIdQuery(mockSupabase as any, 'practice-123', {
          enableRealtime: false,
          api: mockApi as unknown as PracticeAPI,
        })
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toEqual(mockPractice)
      expect(mockApi.getPracticeById).toHaveBeenCalledWith('practice-123')
    })

    it('存在しない練習の場合はnullを返す', async () => {
      mockApi.getPracticeById.mockResolvedValue(null)

      const { result } = renderQueryHook(() =>
        usePracticeByIdQuery(mockSupabase as any, 'non-existent', {
          enableRealtime: false,
          api: mockApi as unknown as PracticeAPI,
        })
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toBeNull()
    })
  })

  describe('useCreatePracticeMutation', () => {
    it('練習を作成できる', async () => {
      const newPractice = { date: '2025-02-01', title: '新規練習', place: null, note: null }
      const createdPractice = createMockPractice({ id: 'new-1', ...newPractice })
      mockApi.createPractice.mockResolvedValue(createdPractice)

      const { result } = renderQueryHook(() =>
        useCreatePracticeMutation(mockSupabase as any, mockApi as unknown as PracticeAPI)
      )

      let returnedData
      await act(async () => {
        returnedData = await result.current.mutateAsync(newPractice)
      })

      expect(mockApi.createPractice).toHaveBeenCalledWith(newPractice)
      expect(returnedData).toEqual(createdPractice)
    })

    it('作成失敗時にエラーになる', async () => {
      mockApi.createPractice.mockRejectedValue(new Error('Creation failed'))

      const { result } = renderQueryHook(() =>
        useCreatePracticeMutation(mockSupabase as any, mockApi as unknown as PracticeAPI)
      )

      await act(async () => {
        await expect(
          result.current.mutateAsync({ date: '2025-02-01', title: null, place: null, note: null })
        ).rejects.toThrow('Creation failed')
      })
    })
  })

  describe('useUpdatePracticeMutation', () => {
    it('練習を更新できる', async () => {
      const updatedPractice = createMockPractice({ id: 'practice-1', title: '更新後' })
      mockApi.updatePractice.mockResolvedValue(updatedPractice)

      const { result } = renderQueryHook(() =>
        useUpdatePracticeMutation(mockSupabase as any, mockApi as unknown as PracticeAPI)
      )

      let returnedData
      await act(async () => {
        returnedData = await result.current.mutateAsync({
          id: 'practice-1',
          updates: { title: '更新後' },
        })
      })

      expect(mockApi.updatePractice).toHaveBeenCalledWith('practice-1', { title: '更新後' })
      expect(returnedData).toEqual(updatedPractice)
    })
  })

  describe('useDeletePracticeMutation', () => {
    it('練習を削除できる', async () => {
      mockApi.deletePractice.mockResolvedValue(undefined)
      mockApi.getPracticeById.mockResolvedValue(createMockPractice())

      const { result } = renderQueryHook(() =>
        useDeletePracticeMutation(mockSupabase as any, mockApi as unknown as PracticeAPI)
      )

      await act(async () => {
        await result.current.mutateAsync('practice-1')
      })

      expect(mockApi.deletePractice).toHaveBeenCalledWith('practice-1')
    })
  })

  describe('usePracticeTagsQuery', () => {
    it('練習タグ一覧を取得できる', async () => {
      const mockTags = [
        { id: 'tag-1', name: 'タグ1', color: '#ff0000', user_id: 'user-1' },
        { id: 'tag-2', name: 'タグ2', color: '#00ff00', user_id: 'user-1' },
      ]
      mockApi.getPracticeTags.mockResolvedValue(mockTags)

      const { result } = renderQueryHook(() =>
        usePracticeTagsQuery(mockSupabase as any, mockApi as unknown as PracticeAPI)
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toEqual(mockTags)
    })
  })
})
