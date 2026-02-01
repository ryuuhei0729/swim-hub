import { describe, expect, it, vi, beforeEach } from 'vitest'
import { waitFor, act } from '@testing-library/react'
import {
  createMockSupabaseClient,
  createMockRecordWithDetails,
  createMockRecord,
  createMockCompetition,
} from '../../../__mocks__/supabase'
import { RecordAPI } from '../../../api/records'
import {
  useRecordsQuery,
  useRecordsCountQuery,
  useBestTimesQuery,
  useCreateRecordMutation,
  useUpdateRecordMutation,
  useDeleteRecordMutation,
  useCreateCompetitionMutation,
  useUpdateCompetitionMutation,
  useDeleteCompetitionMutation,
  useCreateSplitTimesMutation,
  useReplaceSplitTimesMutation,
} from '../../../hooks/queries/records'
import { renderQueryHook } from '../../utils/test-utils'

// RecordAPIをモック化
vi.mock('../../../api/records', () => ({
  RecordAPI: vi.fn().mockImplementation(() => ({
    getRecords: vi.fn(),
    countRecords: vi.fn(),
    getCompetitions: vi.fn(),
    createRecord: vi.fn(),
    updateRecord: vi.fn(),
    deleteRecord: vi.fn(),
    createCompetition: vi.fn(),
    updateCompetition: vi.fn(),
    deleteCompetition: vi.fn(),
    getBestTimes: vi.fn(),
    createSplitTimes: vi.fn(),
    replaceSplitTimes: vi.fn(),
    subscribeToRecords: vi.fn(() => ({ unsubscribe: vi.fn() })),
    subscribeToCompetitions: vi.fn(() => ({ unsubscribe: vi.fn() })),
  })),
}))

// GoalAPIをモック化
vi.mock('../../../api/goals', () => ({
  GoalAPI: vi.fn().mockImplementation(() => ({
    updateAllMilestoneStatuses: vi.fn(),
  })),
}))

describe('Record Query Hooks', () => {
  let mockSupabase: ReturnType<typeof createMockSupabaseClient>
  let mockApi: {
    getRecords: ReturnType<typeof vi.fn>
    countRecords: ReturnType<typeof vi.fn>
    getCompetitions: ReturnType<typeof vi.fn>
    createRecord: ReturnType<typeof vi.fn>
    updateRecord: ReturnType<typeof vi.fn>
    deleteRecord: ReturnType<typeof vi.fn>
    createCompetition: ReturnType<typeof vi.fn>
    updateCompetition: ReturnType<typeof vi.fn>
    deleteCompetition: ReturnType<typeof vi.fn>
    getBestTimes: ReturnType<typeof vi.fn>
    createSplitTimes: ReturnType<typeof vi.fn>
    replaceSplitTimes: ReturnType<typeof vi.fn>
    subscribeToRecords: ReturnType<typeof vi.fn>
    subscribeToCompetitions: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabase = createMockSupabaseClient()
    mockApi = {
      getRecords: vi.fn(),
      countRecords: vi.fn(),
      getCompetitions: vi.fn(),
      createRecord: vi.fn(),
      updateRecord: vi.fn(),
      deleteRecord: vi.fn(),
      createCompetition: vi.fn(),
      updateCompetition: vi.fn(),
      deleteCompetition: vi.fn(),
      getBestTimes: vi.fn(),
      createSplitTimes: vi.fn(),
      replaceSplitTimes: vi.fn(),
      subscribeToRecords: vi.fn(() => ({ unsubscribe: vi.fn() })),
      subscribeToCompetitions: vi.fn(() => ({ unsubscribe: vi.fn() })),
    }
  })

  describe('useRecordsQuery', () => {
    it('記録一覧と大会一覧を取得できる', async () => {
      const mockRecords = [createMockRecordWithDetails()]
      const mockCompetitions = [createMockCompetition()]
      mockApi.getRecords.mockResolvedValue(mockRecords)
      mockApi.getCompetitions.mockResolvedValue(mockCompetitions)

      const { result } = renderQueryHook(() =>
        useRecordsQuery(mockSupabase as any, {
          enableRealtime: false,
          api: mockApi as unknown as RecordAPI,
        })
      )

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.records).toEqual(mockRecords)
      expect(result.current.competitions).toEqual(mockCompetitions)
    })

    it('日付範囲を指定して取得できる', async () => {
      mockApi.getRecords.mockResolvedValue([])
      mockApi.getCompetitions.mockResolvedValue([])

      const { result } = renderQueryHook(() =>
        useRecordsQuery(mockSupabase as any, {
          startDate: '2025-01-01',
          endDate: '2025-01-31',
          enableRealtime: false,
          api: mockApi as unknown as RecordAPI,
        })
      )

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(mockApi.getRecords).toHaveBeenCalledWith('2025-01-01', '2025-01-31', undefined, 20, 0)
    })

    it('種目IDでフィルタできる', async () => {
      mockApi.getRecords.mockResolvedValue([])
      mockApi.getCompetitions.mockResolvedValue([])

      const { result } = renderQueryHook(() =>
        useRecordsQuery(mockSupabase as any, {
          styleId: 1,
          enableRealtime: false,
          api: mockApi as unknown as RecordAPI,
        })
      )

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(mockApi.getRecords).toHaveBeenCalledWith(
        undefined,
        undefined,
        1,
        20,
        0
      )
    })

    it('初期データを使用できる', async () => {
      const initialRecords = [createMockRecordWithDetails({ id: 'initial-1' })]
      const initialCompetitions = [createMockCompetition({ id: 'comp-initial' })]

      const { result } = renderQueryHook(() =>
        useRecordsQuery(mockSupabase as any, {
          initialRecords,
          initialCompetitions,
          enableRealtime: false,
          api: mockApi as unknown as RecordAPI,
        })
      )

      expect(result.current.records).toEqual(initialRecords)
      expect(result.current.competitions).toEqual(initialCompetitions)
    })
  })

  describe('useRecordsCountQuery', () => {
    it('記録件数を取得できる', async () => {
      mockApi.countRecords.mockResolvedValue(100)

      const { result } = renderQueryHook(() =>
        useRecordsCountQuery(mockSupabase as any, {
          api: mockApi as unknown as RecordAPI,
        })
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toBe(100)
    })

    it('フィルタ条件付きで件数を取得できる', async () => {
      mockApi.countRecords.mockResolvedValue(25)

      const { result } = renderQueryHook(() =>
        useRecordsCountQuery(mockSupabase as any, {
          startDate: '2025-01-01',
          endDate: '2025-01-31',
          styleId: 1,
          api: mockApi as unknown as RecordAPI,
        })
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(mockApi.countRecords).toHaveBeenCalledWith('2025-01-01', '2025-01-31', 1)
    })
  })

  describe('useBestTimesQuery', () => {
    it('ベストタイムを取得できる', async () => {
      const mockBestTimes = [
        { style_id: 1, pool_type: 0, time: 55.5 },
        { style_id: 2, pool_type: 1, time: 120.3 },
      ]
      mockApi.getBestTimes.mockResolvedValue(mockBestTimes)

      const { result } = renderQueryHook(() =>
        useBestTimesQuery(mockSupabase as any, {
          api: mockApi as unknown as RecordAPI,
        })
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toEqual(mockBestTimes)
    })

    it('ユーザーIDを指定して取得できる', async () => {
      mockApi.getBestTimes.mockResolvedValue([])

      const { result } = renderQueryHook(() =>
        useBestTimesQuery(mockSupabase as any, {
          userId: 'specific-user',
          api: mockApi as unknown as RecordAPI,
        })
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(mockApi.getBestTimes).toHaveBeenCalledWith('specific-user')
    })
  })

  describe('useCreateRecordMutation', () => {
    it('記録を作成できる', async () => {
      const newRecord = {
        competition_id: 'comp-1',
        style_id: 1,
        time: 60.5,
        pool_type: 0 as const,
        is_relaying: false,
        note: null,
        video_url: null,
        reaction_time: null,
      }
      const createdRecord = createMockRecord({ id: 'new-record', ...newRecord })
      mockApi.createRecord.mockResolvedValue(createdRecord)

      const { result } = renderQueryHook(() =>
        useCreateRecordMutation(mockSupabase as any, mockApi as unknown as RecordAPI)
      )

      let returnedData
      await act(async () => {
        returnedData = await result.current.mutateAsync(newRecord)
      })

      expect(mockApi.createRecord).toHaveBeenCalledWith(newRecord)
      expect(returnedData).toEqual(createdRecord)
    })
  })

  describe('useUpdateRecordMutation', () => {
    it('記録を更新できる', async () => {
      const updatedRecord = createMockRecord({ id: 'record-1', time: 59.0 })
      mockApi.updateRecord.mockResolvedValue(updatedRecord)

      const { result } = renderQueryHook(() =>
        useUpdateRecordMutation(mockSupabase as any, mockApi as unknown as RecordAPI)
      )

      let returnedData
      await act(async () => {
        returnedData = await result.current.mutateAsync({
          id: 'record-1',
          updates: { time: 59.0 },
        })
      })

      expect(mockApi.updateRecord).toHaveBeenCalledWith('record-1', { time: 59.0 })
      expect(returnedData).toEqual(updatedRecord)
    })
  })

  describe('useDeleteRecordMutation', () => {
    it('記録を削除できる', async () => {
      mockApi.deleteRecord.mockResolvedValue(undefined)

      const { result } = renderQueryHook(() =>
        useDeleteRecordMutation(mockSupabase as any, mockApi as unknown as RecordAPI)
      )

      await act(async () => {
        await result.current.mutateAsync('record-1')
      })

      expect(mockApi.deleteRecord).toHaveBeenCalledWith('record-1')
    })
  })

  describe('useCreateCompetitionMutation', () => {
    it('大会を作成できる', async () => {
      const newCompetition = {
        title: '新規大会',
        date: '2025-03-01',
        place: '会場',
        pool_type: 1,
        note: null,
      }
      const createdCompetition = createMockCompetition({ id: 'new-comp', ...newCompetition })
      mockApi.createCompetition.mockResolvedValue(createdCompetition)

      const { result } = renderQueryHook(() =>
        useCreateCompetitionMutation(mockSupabase as any, mockApi as unknown as RecordAPI)
      )

      let returnedData
      await act(async () => {
        returnedData = await result.current.mutateAsync(newCompetition)
      })

      expect(mockApi.createCompetition).toHaveBeenCalledWith(newCompetition)
      expect(returnedData).toEqual(createdCompetition)
    })
  })

  describe('useUpdateCompetitionMutation', () => {
    it('大会を更新できる', async () => {
      const updatedCompetition = createMockCompetition({ id: 'comp-1', title: '更新後大会' })
      mockApi.updateCompetition.mockResolvedValue(updatedCompetition)

      const { result } = renderQueryHook(() =>
        useUpdateCompetitionMutation(mockSupabase as any, mockApi as unknown as RecordAPI)
      )

      await act(async () => {
        await result.current.mutateAsync({
          id: 'comp-1',
          updates: { title: '更新後大会' },
        })
      })

      expect(mockApi.updateCompetition).toHaveBeenCalledWith('comp-1', { title: '更新後大会' })
    })
  })

  describe('useDeleteCompetitionMutation', () => {
    it('大会を削除できる', async () => {
      mockApi.deleteCompetition.mockResolvedValue(undefined)

      const { result } = renderQueryHook(() =>
        useDeleteCompetitionMutation(mockSupabase as any, mockApi as unknown as RecordAPI)
      )

      await act(async () => {
        await result.current.mutateAsync('comp-1')
      })

      expect(mockApi.deleteCompetition).toHaveBeenCalledWith('comp-1')
    })
  })

  describe('useCreateSplitTimesMutation', () => {
    it('スプリットタイムを作成できる', async () => {
      const splitTimes = [
        { distance: 50, split_time: 25.0 },
        { distance: 100, split_time: 55.0 },
      ]
      const createdSplitTimes = splitTimes.map((st, i) => ({
        id: `split-${i}`,
        record_id: 'record-1',
        ...st,
      }))
      mockApi.createSplitTimes.mockResolvedValue(createdSplitTimes)

      const { result } = renderQueryHook(() =>
        useCreateSplitTimesMutation(mockSupabase as any, mockApi as unknown as RecordAPI)
      )

      await act(async () => {
        await result.current.mutateAsync({
          recordId: 'record-1',
          splitTimes,
        })
      })

      expect(mockApi.createSplitTimes).toHaveBeenCalledWith([
        { record_id: 'record-1', distance: 50, split_time: 25.0 },
        { record_id: 'record-1', distance: 100, split_time: 55.0 },
      ])
    })

    it('空配列の場合は空配列を返す', async () => {
      const { result } = renderQueryHook(() =>
        useCreateSplitTimesMutation(mockSupabase as any, mockApi as unknown as RecordAPI)
      )

      await act(async () => {
        const response = await result.current.mutateAsync({
          recordId: 'record-1',
          splitTimes: [],
        })
        expect(response).toEqual([])
      })

      expect(mockApi.createSplitTimes).not.toHaveBeenCalled()
    })
  })

  describe('useReplaceSplitTimesMutation', () => {
    it('スプリットタイムを置き換えできる', async () => {
      const splitTimes = [
        { distance: 50, split_time: 24.0 },
        { distance: 100, split_time: 54.0 },
      ]
      const replacedSplitTimes = splitTimes.map((st, i) => ({
        id: `split-new-${i}`,
        record_id: 'record-1',
        ...st,
      }))
      mockApi.replaceSplitTimes.mockResolvedValue(replacedSplitTimes)

      const { result } = renderQueryHook(() =>
        useReplaceSplitTimesMutation(mockSupabase as any, mockApi as unknown as RecordAPI)
      )

      await act(async () => {
        await result.current.mutateAsync({
          recordId: 'record-1',
          splitTimes,
        })
      })

      expect(mockApi.replaceSplitTimes).toHaveBeenCalledWith('record-1', splitTimes)
    })
  })
})
