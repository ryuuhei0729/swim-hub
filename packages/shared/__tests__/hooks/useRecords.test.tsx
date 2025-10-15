import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockSupabaseClient, createMockRecord } from '../../__mocks__/supabase'
import { useRecords } from '../../hooks/useRecords'

// RecordAPI をモック
const mockApi = {
  getRecords: vi.fn(),
  getCompetitions: vi.fn(),
  createRecord: vi.fn(),
  updateRecord: vi.fn(),
  deleteRecord: vi.fn(),
  subscribeToRecords: vi.fn(),
  subscribeToCompetitions: vi.fn(),
}

vi.mock('../api/records', () => ({
  RecordAPI: vi.fn().mockImplementation(() => mockApi),
}))

describe('useRecords', () => {
  let mockClient: any

  beforeEach(() => {
    vi.clearAllMocks()
    mockClient = createMockSupabaseClient()
  })

  describe('初期化', () => {
    it('should initialize with loading state', async () => {
      const mockRecords = [createMockRecord()]
      const mockCompetitions = [{ id: 'comp-1', name: 'テスト大会' }]
      
      mockApi.getRecords.mockResolvedValue(mockRecords)
      mockApi.getCompetitions.mockResolvedValue(mockCompetitions)

      const { result } = renderHook(() => useRecords(mockClient))

      await act(async () => {
        expect(result.current.loading).toBe(true)
        expect(result.current.records).toEqual([])
        expect(result.current.competitions).toEqual([])
        expect(result.current.error).toBeNull()
      })
    })

    it('should load records and competitions on mount', async () => {
      const mockRecords = [createMockRecord()]
      const mockCompetitions = [{ id: 'comp-1', name: 'テスト大会' }]
      
      mockApi.getRecords.mockResolvedValue(mockRecords)
      mockApi.getCompetitions.mockResolvedValue(mockCompetitions)

      const { result } = renderHook(() => useRecords(mockClient))

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(mockApi.getRecords).toHaveBeenCalled()
      expect(mockApi.getCompetitions).toHaveBeenCalled()
      expect(result.current.records).toEqual(mockRecords)
      expect(result.current.competitions).toEqual(mockCompetitions)
    })
  })

  describe('データ取得', () => {
    it('should fetch records with filters', async () => {
      const mockRecords = [createMockRecord()]
      const mockCompetitions = []
      
      mockApi.getRecords.mockResolvedValue(mockRecords)
      mockApi.getCompetitions.mockResolvedValue(mockCompetitions)

      const { result } = renderHook(() =>
        useRecords(mockClient, {
          startDate: '2025-01-01',
          endDate: '2025-01-31',
          styleId: 1,
        })
      )

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(mockApi.getRecords).toHaveBeenCalledWith('2025-01-01', '2025-01-31', 1)
    })

    it('should handle fetch error', async () => {
      const error = new Error('Fetch failed')
      mockApi.getRecords.mockRejectedValue(error)

      const { result } = renderHook(() => useRecords(mockClient))

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.error).toEqual(error)
      expect(result.current.records).toEqual([])
    })
  })

  describe('操作関数', () => {
    it('should create record', async () => {
      const newRecord = {
        competition_id: 'comp-1',
        style_id: 'style-1',
        time_seconds: 60.5,
        pool_type: 'long' as const,
        is_relay: false,
      }
      const createdRecord = createMockRecord(newRecord)
      
      mockApi.getRecords.mockResolvedValue([])
      mockApi.getCompetitions.mockResolvedValue([])
      mockApi.createRecord.mockResolvedValue(createdRecord)

      const { result } = renderHook(() => useRecords(mockClient))

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.createRecord(newRecord)
      })

      expect(mockApi.createRecord).toHaveBeenCalledWith(newRecord)
    })

    it('should update record', async () => {
      const recordId = 'record-1'
      const updates = { time_seconds: 59.0 }
      
      mockApi.getRecords.mockResolvedValue([])
      mockApi.getCompetitions.mockResolvedValue([])
      mockApi.updateRecord.mockResolvedValue(createMockRecord(updates))

      const { result } = renderHook(() => useRecords(mockClient))

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.updateRecord(recordId, updates)
      })

      expect(mockApi.updateRecord).toHaveBeenCalledWith(recordId, updates)
    })

    it('should delete record', async () => {
      const recordId = 'record-1'
      
      mockApi.getRecords.mockResolvedValue([])
      mockApi.getCompetitions.mockResolvedValue([])
      mockApi.deleteRecord.mockResolvedValue(undefined)

      const { result } = renderHook(() => useRecords(mockClient))

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.deleteRecord(recordId)
      })

      expect(mockApi.deleteRecord).toHaveBeenCalledWith(recordId)
    })
  })

  describe('リアルタイム購読', () => {
    it('should subscribe to realtime updates', async () => {
      const mockRecordsChannel = { unsubscribe: vi.fn() }
      const mockCompetitionsChannel = { unsubscribe: vi.fn() }
      
      mockApi.subscribeToRecords.mockReturnValue(mockRecordsChannel)
      mockApi.subscribeToCompetitions.mockReturnValue(mockCompetitionsChannel)
      mockApi.getRecords.mockResolvedValue([])
      mockApi.getCompetitions.mockResolvedValue([])

      const { result } = renderHook(() => useRecords(mockClient))

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(mockApi.subscribeToRecords).toHaveBeenCalled()
      expect(mockApi.subscribeToCompetitions).toHaveBeenCalled()
    })

    it('should not subscribe when realtime is disabled', async () => {
      mockApi.getRecords.mockResolvedValue([])
      mockApi.getCompetitions.mockResolvedValue([])

      const { result } = renderHook(() =>
        useRecords(mockClient, { enableRealtime: false })
      )

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(mockApi.subscribeToRecords).not.toHaveBeenCalled()
      expect(mockApi.subscribeToCompetitions).not.toHaveBeenCalled()
    })
  })

  describe('リフレッシュ', () => {
    it('should refresh data', async () => {
      const mockRecords = [createMockRecord()]
      const mockCompetitions = [{ id: 'comp-1', name: 'テスト大会' }]
      
      mockApi.getRecords.mockResolvedValue(mockRecords)
      mockApi.getCompetitions.mockResolvedValue(mockCompetitions)

      const { result } = renderHook(() => useRecords(mockClient))

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      // リフレッシュ実行
      await act(async () => {
        await result.current.refresh()
      })

      expect(mockApi.getRecords).toHaveBeenCalledTimes(2) // 初回 + リフレッシュ
      expect(mockApi.getCompetitions).toHaveBeenCalledTimes(2)
    })
  })
})
