import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
    createMockPractice,
    createMockPracticeLog,
    createMockSupabaseClient,
} from '../__mocks__/supabase'
import { PracticeAPI } from './practices'

describe('PracticeAPI', () => {
  let mockClient: any
  let api: PracticeAPI

  beforeEach(() => {
    vi.clearAllMocks()
    mockClient = createMockSupabaseClient()
    api = new PracticeAPI(mockClient)
  })

  describe('getPractices', () => {
    it('should fetch practices for authenticated user', async () => {
      const mockPractice = createMockPractice()
      mockClient.from = vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: [mockPractice],
          error: null,
        }),
      }))

      const result = await api.getPractices('2025-01-01', '2025-01-31')

      expect(mockClient.auth.getUser).toHaveBeenCalled()
      expect(mockClient.from).toHaveBeenCalledWith('practices')
      expect(result).toEqual([mockPractice])
    })

    it('should throw error if not authenticated', async () => {
      mockClient = createMockSupabaseClient({ userId: '' })
      api = new PracticeAPI(mockClient)

      await expect(api.getPractices('2025-01-01', '2025-01-31')).rejects.toThrow('認証が必要です')
    })

    it('should throw error if query fails', async () => {
      const error = new Error('Database error')
      mockClient.from = vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: null,
          error,
        }),
      }))

      await expect(api.getPractices('2025-01-01', '2025-01-31')).rejects.toThrow('Database error')
    })
  })

  describe('getPracticesByDate', () => {
    it('should fetch practices for specific date', async () => {
      const mockPractice = createMockPractice({ date: '2025-01-15' })
      mockClient.from = vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        then: (resolve: Function) =>
          Promise.resolve({ data: [mockPractice], error: null }).then(resolve),
      }))

      const result = await api.getPracticesByDate('2025-01-15')

      expect(mockClient.from).toHaveBeenCalledWith('practices')
      expect(result).toEqual([mockPractice])
    })
  })

  describe('createPractice', () => {
    it('should create practice for authenticated user', async () => {
      const newPractice = {
        date: '2025-01-15',
        place: 'テストプール',
        memo: 'テスト練習',
      }
      const createdPractice = createMockPractice(newPractice)

      mockClient.from = vi.fn(() => ({
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: createdPractice,
          error: null,
        }),
      }))

      const result = await api.createPractice(newPractice)

      expect(mockClient.from).toHaveBeenCalledWith('practices')
      expect(result).toEqual(createdPractice)
    })

    it('should throw error if not authenticated', async () => {
      mockClient = createMockSupabaseClient({ userId: '' })
      api = new PracticeAPI(mockClient)

      await expect(
        api.createPractice({ date: '2025-01-15', place: 'プール' })
      ).rejects.toThrow('認証が必要です')
    })
  })

  describe('updatePractice', () => {
    it('should update practice', async () => {
      const updatedPractice = createMockPractice({ place: '更新後プール' })

      mockClient.from = vi.fn(() => ({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: updatedPractice,
          error: null,
        }),
      }))

      const result = await api.updatePractice('practice-1', { place: '更新後プール' })

      expect(mockClient.from).toHaveBeenCalledWith('practices')
      expect(result).toEqual(updatedPractice)
    })

    it('should throw error if update fails', async () => {
      const error = new Error('Update failed')
      mockClient.from = vi.fn(() => ({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error,
        }),
      }))

      await expect(api.updatePractice('practice-1', { place: '更新後' })).rejects.toThrow(
        'Update failed'
      )
    })
  })

  describe('deletePractice', () => {
    it('should delete practice', async () => {
      mockClient.from = vi.fn(() => ({
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
      }))

      await expect(api.deletePractice('practice-1')).resolves.toBeUndefined()

      expect(mockClient.from).toHaveBeenCalledWith('practices')
    })

    it('should throw error if delete fails', async () => {
      const error = new Error('Delete failed')
      mockClient.from = vi.fn(() => ({
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({
          data: null,
          error,
        }),
      }))

      await expect(api.deletePractice('practice-1')).rejects.toThrow('Delete failed')
    })
  })

  describe('createPracticeLog', () => {
    it('should create practice log', async () => {
      const newLog = {
        practice_id: 'practice-1',
        distance: 100,
        rep_count: 4,
        set_count: 2,
        circle_time: 90,
        style: 'freestyle',
      }
      const createdLog = createMockPracticeLog(newLog)

      mockClient.from = vi.fn(() => ({
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: createdLog,
          error: null,
        }),
      }))

      const result = await api.createPracticeLog(newLog)

      expect(mockClient.from).toHaveBeenCalledWith('practice_logs')
      expect(result).toEqual(createdLog)
    })
  })

  describe('createPracticeLogs', () => {
    it('should create multiple practice logs', async () => {
      const newLogs = [
        {
          practice_id: 'practice-1',
          distance: 100,
          rep_count: 4,
          set_count: 2,
          circle_time: 90,
          style: 'freestyle',
        },
        {
          practice_id: 'practice-1',
          distance: 200,
          rep_count: 2,
          set_count: 1,
          circle_time: 180,
          style: 'backstroke',
        },
      ]
      const createdLogs = newLogs.map((log, i) =>
        createMockPracticeLog({ ...log, id: `log-${i + 1}` })
      )

      mockClient.from = vi.fn(() => ({
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockResolvedValue({
          data: createdLogs,
          error: null,
        }),
      }))

      const result = await api.createPracticeLogs(newLogs)

      expect(mockClient.from).toHaveBeenCalledWith('practice_logs')
      expect(result).toHaveLength(2)
    })
  })

  describe('updatePracticeLog', () => {
    it('should update practice log', async () => {
      const updatedLog = createMockPracticeLog({ distance: 200 })

      mockClient.from = vi.fn(() => ({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: updatedLog,
          error: null,
        }),
      }))

      const result = await api.updatePracticeLog('log-1', { distance: 200 })

      expect(mockClient.from).toHaveBeenCalledWith('practice_logs')
      expect(result).toEqual(updatedLog)
    })
  })

  describe('deletePracticeLog', () => {
    it('should delete practice log', async () => {
      mockClient.from = vi.fn(() => ({
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
      }))

      await expect(api.deletePracticeLog('log-1')).resolves.toBeUndefined()

      expect(mockClient.from).toHaveBeenCalledWith('practice_logs')
    })
  })
})

