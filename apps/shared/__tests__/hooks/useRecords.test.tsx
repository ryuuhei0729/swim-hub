import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockSupabaseClient, createMockRecord } from '../../__mocks__/supabase'
import { RecordAPI } from '../../api/records'
import { useRecords } from '../../hooks/useRecords'
import { RecordInsert } from '../../types/database'

type RecordApiMock = {
  getRecords: ReturnType<typeof vi.fn>
  getCompetitions: ReturnType<typeof vi.fn>
  createRecord: ReturnType<typeof vi.fn>
  updateRecord: ReturnType<typeof vi.fn>
  deleteRecord: ReturnType<typeof vi.fn>
  subscribeToRecords: ReturnType<typeof vi.fn>
  subscribeToCompetitions: ReturnType<typeof vi.fn>
}

describe('useRecords', () => {
  let mockClient: any
  let recordApiMock: RecordApiMock
  let api: RecordAPI

  beforeEach(() => {
    vi.clearAllMocks()
    mockClient = createMockSupabaseClient()
    recordApiMock = {
      getRecords: vi.fn(),
      getCompetitions: vi.fn(),
      createRecord: vi.fn(),
      updateRecord: vi.fn(),
      deleteRecord: vi.fn(),
      subscribeToRecords: vi.fn(),
      subscribeToCompetitions: vi.fn(),
    }
    api = recordApiMock as unknown as RecordAPI
  })

  describe('初期化', () => {
    it('should initialize with loading state', async () => {
      const mockRecords = [createMockRecord()]
      const mockCompetitions = [{ id: 'comp-1', name: 'テスト大会' }]
      
      recordApiMock.getRecords.mockResolvedValue(mockRecords)
      recordApiMock.getCompetitions.mockResolvedValue(mockCompetitions)

      const { result } = renderHook(() => useRecords(mockClient, { api }))

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
      
      recordApiMock.getRecords.mockResolvedValue(mockRecords)
      recordApiMock.getCompetitions.mockResolvedValue(mockCompetitions)

      const { result } = renderHook(() => useRecords(mockClient, { api }))

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(recordApiMock.getRecords).toHaveBeenCalled()
      expect(recordApiMock.getCompetitions).toHaveBeenCalled()
      expect(result.current.records).toEqual(mockRecords)
      expect(result.current.competitions).toEqual(mockCompetitions)
    })
  })

  describe('データ取得', () => {
    it('should fetch records with filters', async () => {
      const mockRecords = [createMockRecord()]
      const mockCompetitions: any[] = []
      
      recordApiMock.getRecords.mockResolvedValue(mockRecords)
      recordApiMock.getCompetitions.mockResolvedValue(mockCompetitions)

      const { result } = renderHook(() =>
        useRecords(mockClient, {
          startDate: '2025-01-01',
          endDate: '2025-01-31',
          styleId: 1,
          api,
        })
      )

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(recordApiMock.getRecords).toHaveBeenCalledWith('2025-01-01', '2025-01-31', 1)
    })

    it('should handle fetch error', async () => {
      const error = new Error('Fetch failed')
      recordApiMock.getRecords.mockRejectedValue(error)

      const { result } = renderHook(() => useRecords(mockClient, { api }))

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.error).toEqual(error)
      expect(result.current.records).toEqual([])
    })
  })

  describe('操作関数', () => {
    it('should create record', async () => {
      const newRecord: Omit<RecordInsert, 'user_id'> = {
        competition_id: 'comp-1',
        style_id: 1,
        time: 60.5,
        video_url: null,
        note: null,
        is_relaying: false,
      }
      const createdRecord = createMockRecord({
        ...newRecord,
        style_id: newRecord.style_id,
        time: newRecord.time,
        is_relaying: newRecord.is_relaying,
      })
      
      recordApiMock.getRecords.mockResolvedValue([])
      recordApiMock.getCompetitions.mockResolvedValue([])
      recordApiMock.createRecord.mockResolvedValue(createdRecord)

      const { result } = renderHook(() => useRecords(mockClient, { api }))

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.createRecord(newRecord)
      })

      expect(recordApiMock.createRecord).toHaveBeenCalledWith(newRecord)
    })

    it('should update record', async () => {
      const recordId = 'record-1'
      const updates = { time_seconds: 59.0 }
      
      recordApiMock.getRecords.mockResolvedValue([])
      recordApiMock.getCompetitions.mockResolvedValue([])
      recordApiMock.updateRecord.mockResolvedValue(createMockRecord(updates))

      const { result } = renderHook(() => useRecords(mockClient, { api }))

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.updateRecord(recordId, updates)
      })

      expect(recordApiMock.updateRecord).toHaveBeenCalledWith(recordId, updates)
    })

    it('should delete record', async () => {
      const recordId = 'record-1'
      
      recordApiMock.getRecords.mockResolvedValue([])
      recordApiMock.getCompetitions.mockResolvedValue([])
      recordApiMock.deleteRecord.mockResolvedValue(undefined)

      const { result } = renderHook(() => useRecords(mockClient, { api }))

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.deleteRecord(recordId)
      })

      expect(recordApiMock.deleteRecord).toHaveBeenCalledWith(recordId)
    })
  })

  describe('リアルタイム購読', () => {
    it('should subscribe to realtime updates', async () => {
      const mockRecordsChannel = { unsubscribe: vi.fn() }
      const mockCompetitionsChannel = { unsubscribe: vi.fn() }
      
      recordApiMock.subscribeToRecords.mockReturnValue(mockRecordsChannel)
      recordApiMock.subscribeToCompetitions.mockReturnValue(mockCompetitionsChannel)
      recordApiMock.getRecords.mockResolvedValue([])
      recordApiMock.getCompetitions.mockResolvedValue([])

      const { result, unmount } = renderHook(() => useRecords(mockClient, { api }))

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(recordApiMock.subscribeToRecords).toHaveBeenCalled()
      expect(recordApiMock.subscribeToCompetitions).toHaveBeenCalled()

      unmount()
      expect(mockClient.removeChannel).toHaveBeenCalledWith(mockRecordsChannel)
      expect(mockClient.removeChannel).toHaveBeenCalledWith(mockCompetitionsChannel)
    })

    it('should not subscribe when realtime is disabled', async () => {
      recordApiMock.getRecords.mockResolvedValue([])
      recordApiMock.getCompetitions.mockResolvedValue([])

      const { result } = renderHook(() =>
        useRecords(mockClient, { enableRealtime: false, api })
      )

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(recordApiMock.subscribeToRecords).not.toHaveBeenCalled()
      expect(recordApiMock.subscribeToCompetitions).not.toHaveBeenCalled()
    })
  })

  describe('リフレッシュ', () => {
    it('should refresh data', async () => {
      const mockRecords = [createMockRecord()]
      const mockCompetitions = [{ id: 'comp-1', name: 'テスト大会' }]
      
      recordApiMock.getRecords.mockResolvedValue(mockRecords)
      recordApiMock.getCompetitions.mockResolvedValue(mockCompetitions)

      const { result } = renderHook(() => useRecords(mockClient, { api }))

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      // リフレッシュ実行
      await act(async () => {
        await result.current.refresh()
      })

      expect(recordApiMock.getRecords).toHaveBeenCalledTimes(2) // 初回 + リフレッシュ
      expect(recordApiMock.getCompetitions).toHaveBeenCalledTimes(2)
    })
  })
})
