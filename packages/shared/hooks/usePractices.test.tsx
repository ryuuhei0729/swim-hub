import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockSupabaseClient, createMockPractice } from '../__mocks__/supabase'
import { usePractices } from './usePractices'

// PracticeAPI をモック
const mockApi = {
  getPractices: vi.fn(),
  createPractice: vi.fn(),
  updatePractice: vi.fn(),
  deletePractice: vi.fn(),
  createPracticeLog: vi.fn(),
  updatePracticeLog: vi.fn(),
  deletePracticeLog: vi.fn(),
  createPracticeTimes: vi.fn(),
  replacePracticeTimes: vi.fn(),
  createPracticeTime: vi.fn(),
  deletePracticeTime: vi.fn(),
  subscribeToPractices: vi.fn(),
}

vi.mock('../api/practices', () => ({
  PracticeAPI: vi.fn().mockImplementation(() => mockApi),
}))

describe('usePractices', () => {
  let mockClient: any

  beforeEach(() => {
    vi.clearAllMocks()
    mockClient = createMockSupabaseClient()
  })

  describe('初期化', () => {
    it('should initialize with loading state', async () => {
      const mockPractices = [createMockPractice()]
      mockApi.getPractices.mockResolvedValue(mockPractices)

      const { result } = renderHook(() => usePractices(mockClient))

      await act(async () => {
        expect(result.current.loading).toBe(true)
        expect(result.current.practices).toEqual([])
        expect(result.current.error).toBeNull()
      })
    })

    it('should load practices on mount', async () => {
      const mockPractices = [createMockPractice()]
      mockApi.getPractices.mockResolvedValue(mockPractices)

      const { result } = renderHook(() => usePractices(mockClient))

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(mockApi.getPractices).toHaveBeenCalled()
      expect(result.current.practices).toEqual(mockPractices)
    })
  })

  describe('データ取得', () => {
    it('should fetch practices with date range', async () => {
      const mockPractices = [createMockPractice()]
      mockApi.getPractices.mockResolvedValue(mockPractices)

      const { result } = renderHook(() =>
        usePractices(mockClient, {
          startDate: '2025-01-01',
          endDate: '2025-01-31',
        })
      )

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(mockApi.getPractices).toHaveBeenCalledWith('2025-01-01', '2025-01-31')
    })

    it('should handle fetch error', async () => {
      const error = new Error('Fetch failed')
      mockApi.getPractices.mockRejectedValue(error)

      const { result } = renderHook(() => usePractices(mockClient))

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.error).toEqual(error)
      expect(result.current.practices).toEqual([])
    })
  })

  describe('操作関数', () => {
    it('should create practice', async () => {
      const newPractice = {
        date: '2025-01-15',
        place: 'テストプール',
        memo: 'テスト練習',
        note: 'テスト練習のメモ',
      }
      const createdPractice = createMockPractice(newPractice)
      
      mockApi.getPractices.mockResolvedValue([])
      mockApi.createPractice.mockResolvedValue(createdPractice)

      const { result } = renderHook(() => usePractices(mockClient))

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.createPractice(newPractice)
      })

      expect(mockApi.createPractice).toHaveBeenCalledWith(newPractice)
      expect(mockApi.getPractices).toHaveBeenCalledTimes(2) // 初回 + 再取得
    })

    it('should update practice', async () => {
      const practiceId = 'practice-1'
      const updates = { place: '更新後プール' }
      
      mockApi.getPractices.mockResolvedValue([])
      mockApi.updatePractice.mockResolvedValue(createMockPractice(updates))

      const { result } = renderHook(() => usePractices(mockClient))

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.updatePractice(practiceId, updates)
      })

      expect(mockApi.updatePractice).toHaveBeenCalledWith(practiceId, updates)
    })

    it('should delete practice', async () => {
      const practiceId = 'practice-1'
      
      mockApi.getPractices.mockResolvedValue([])
      mockApi.deletePractice.mockResolvedValue(undefined)

      const { result } = renderHook(() => usePractices(mockClient))

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.deletePractice(practiceId)
      })

      expect(mockApi.deletePractice).toHaveBeenCalledWith(practiceId)
    })
  })

  describe('リアルタイム購読', () => {
    it('should subscribe to realtime updates', async () => {
      const mockChannel = { unsubscribe: vi.fn() }
      mockApi.subscribeToPractices.mockReturnValue(mockChannel)
      mockApi.getPractices.mockResolvedValue([])

      const { result } = renderHook(() => usePractices(mockClient))

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(mockApi.subscribeToPractices).toHaveBeenCalled()
    })

    it('should not subscribe when realtime is disabled', async () => {
      mockApi.getPractices.mockResolvedValue([])

      const { result } = renderHook(() =>
        usePractices(mockClient, { enableRealtime: false })
      )

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(mockApi.subscribeToPractices).not.toHaveBeenCalled()
    })
  })

  describe('リフレッシュ', () => {
    it('should refresh data', async () => {
      const mockPractices = [createMockPractice()]
      mockApi.getPractices.mockResolvedValue(mockPractices)

      const { result } = renderHook(() => usePractices(mockClient))

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      // リフレッシュ実行
      await act(async () => {
        await result.current.refresh()
      })

      expect(mockApi.getPractices).toHaveBeenCalledTimes(2) // 初回 + リフレッシュ
    })
  })
})
