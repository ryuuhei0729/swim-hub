import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createMockPractice,
  createMockPracticeLog,
  createMockSupabaseClient,
} from '../../__mocks__/supabase'
import { PracticeAPI } from '../../api/practices'

describe('PracticeAPI', () => {
  let mockClient: any
  let api: PracticeAPI

  beforeEach(() => {
    vi.clearAllMocks()
    mockClient = createMockSupabaseClient()
    api = new PracticeAPI(mockClient)
  })

  describe('練習記録取得', () => {
    it('認証済みユーザーのとき練習記録一覧を取得できる', async () => {
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

    it('認証されていないときエラーになる', async () => {
      mockClient = createMockSupabaseClient({ userId: '' })
      api = new PracticeAPI(mockClient)

      await expect(api.getPractices('2025-01-01', '2025-01-31')).rejects.toThrow('認証が必要です')
    })

    it('クエリが失敗したときエラーが発生する', async () => {
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

  describe('練習記録取得（日付指定）', () => {
    it('日付を指定したとき該当日の練習記録を取得できる', async () => {
      const mockPractice = createMockPractice({ date: '2025-01-15' })
      mockClient.from = vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        then: (resolve: any) =>
          Promise.resolve({ data: [mockPractice], error: null }).then(resolve),
      }))

      const result = await api.getPracticesByDate('2025-01-15')

      expect(mockClient.from).toHaveBeenCalledWith('practices')
      expect(result).toEqual([mockPractice])
    })
  })

  describe('練習記録作成', () => {
    it('認証済みユーザーのとき練習記録を作成できる', async () => {
      const newPractice = {
        date: '2025-01-15',
        title: 'テスト練習',
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

      const result = await api.createPractice({ ...newPractice, note: 'テストメモ' })

      expect(mockClient.from).toHaveBeenCalledWith('practices')
      expect(result).toEqual(createdPractice)
    })

    it('認証されていないときエラーになる', async () => {
      mockClient = createMockSupabaseClient({ userId: '' })
      api = new PracticeAPI(mockClient)

      await expect(
        api.createPractice({ date: '2025-01-15', title: 'テスト練習', place: 'プール', note: 'テストメモ' })
      ).rejects.toThrow('認証が必要です')
    })
  })

  describe('練習記録更新', () => {
    it('練習記録を更新できる', async () => {
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

    it('更新が失敗したときエラーが発生する', async () => {
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

  describe('練習記録削除', () => {
    it('練習記録を削除できる', async () => {
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

    it('削除が失敗したときエラーが発生する', async () => {
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

  describe('練習ログ作成', () => {
    it('練習ログを作成できる', async () => {
      const newLog = {
        practice_id: 'practice-1',
        distance: 100,
        rep_count: 4,
        set_count: 2,
        circle_time: 90,
        style: 'freestyle',
        note: 'テストメモ',
        circle: 1,
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

  describe('練習ログ一括作成', () => {
    it('複数の練習ログを作成できる', async () => {
      const newLogs = [
        {
          practice_id: 'practice-1',
          distance: 100,
          rep_count: 4,
          set_count: 2,
          circle_time: 90,
          style: 'freestyle',
          note: 'テストメモ1',
          circle: 1,
        },
        {
          practice_id: 'practice-1',
          distance: 200,
          rep_count: 2,
          set_count: 1,
          circle_time: 180,
          style: 'backstroke',
          note: 'テストメモ2',
          circle: 2,
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

  describe('練習ログ更新', () => {
    it('練習ログを更新できる', async () => {
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

  describe('練習ログ削除', () => {
    it('練習ログを削除できる', async () => {
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

