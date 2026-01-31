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
        swim_category: 'Swim' as const,
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
          swim_category: 'Swim' as const,
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
          swim_category: 'Swim' as const,
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

  describe('練習記録件数取得', () => {
    it('期間内の練習記録件数を取得できる', async () => {
      mockClient.from = vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockResolvedValue({
          count: 5,
          error: null,
        }),
      }))

      const result = await api.countPractices('2025-01-01', '2025-01-31')

      expect(mockClient.from).toHaveBeenCalledWith('practices')
      expect(result).toBe(5)
    })

    it('認証されていないときエラーになる', async () => {
      mockClient = createMockSupabaseClient({ userId: '' })
      api = new PracticeAPI(mockClient)

      await expect(api.countPractices('2025-01-01', '2025-01-31')).rejects.toThrow('認証が必要です')
    })

    it('countがnullの場合は0を返す', async () => {
      mockClient.from = vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockResolvedValue({
          count: null,
          error: null,
        }),
      }))

      const result = await api.countPractices('2025-01-01', '2025-01-31')

      expect(result).toBe(0)
    })
  })

  describe('練習記録取得（ID指定）', () => {
    it('IDで練習記録を取得できる', async () => {
      const mockPractice = createMockPractice()
      mockClient.from = vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: mockPractice,
          error: null,
        }),
      }))

      const result = await api.getPracticeById('practice-1')

      expect(mockClient.from).toHaveBeenCalledWith('practices')
      expect(result).toEqual(mockPractice)
    })

    it('存在しない場合はnullを返す', async () => {
      mockClient.from = vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { code: 'PGRST116' },
        }),
      }))

      const result = await api.getPracticeById('non-existent')

      expect(result).toBeNull()
    })

    it('認証されていないときエラーになる', async () => {
      mockClient = createMockSupabaseClient({ userId: '' })
      api = new PracticeAPI(mockClient)

      await expect(api.getPracticeById('practice-1')).rejects.toThrow('認証が必要です')
    })

    it('その他のエラーの場合は例外を投げる', async () => {
      const error = new Error('Unknown error')
      mockClient.from = vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error,
        }),
      }))

      await expect(api.getPracticeById('practice-1')).rejects.toThrow('Unknown error')
    })
  })

  describe('練習記録取得（limit/offset付き）', () => {
    it('limitを指定して取得できる', async () => {
      const mockPractices = [createMockPractice()]
      const builder: any = {
        select: vi.fn(),
        eq: vi.fn(),
        gte: vi.fn(),
        lte: vi.fn(),
        order: vi.fn(),
        limit: vi.fn(),
        then: vi.fn()
      }
      builder.select.mockReturnValue(builder)
      builder.eq.mockReturnValue(builder)
      builder.gte.mockReturnValue(builder)
      builder.lte.mockReturnValue(builder)
      builder.order.mockReturnValue(builder)
      builder.limit.mockReturnValue(builder)
      builder.then.mockImplementation((onFulfilled: any) =>
        Promise.resolve({ data: mockPractices, error: null }).then(onFulfilled)
      )
      mockClient.from = vi.fn().mockReturnValue(builder)

      const result = await api.getPractices('2025-01-01', '2025-01-31', 10)

      expect(builder.limit).toHaveBeenCalledWith(10)
      expect(result).toEqual(mockPractices)
    })

    it('limit/offsetを指定して取得できる', async () => {
      const mockPractices = [createMockPractice()]
      const builder: any = {
        select: vi.fn(),
        eq: vi.fn(),
        gte: vi.fn(),
        lte: vi.fn(),
        order: vi.fn(),
        range: vi.fn(),
        then: vi.fn()
      }
      builder.select.mockReturnValue(builder)
      builder.eq.mockReturnValue(builder)
      builder.gte.mockReturnValue(builder)
      builder.lte.mockReturnValue(builder)
      builder.order.mockReturnValue(builder)
      builder.range.mockReturnValue(builder)
      builder.then.mockImplementation((onFulfilled: any) =>
        Promise.resolve({ data: mockPractices, error: null }).then(onFulfilled)
      )
      mockClient.from = vi.fn().mockReturnValue(builder)

      const result = await api.getPractices('2025-01-01', '2025-01-31', 10, 20)

      expect(builder.range).toHaveBeenCalledWith(20, 29)
      expect(result).toEqual(mockPractices)
    })
  })

  describe('練習タイム操作', () => {
    it('練習タイムを作成できる', async () => {
      const newTime = {
        user_id: 'test-user-id',
        practice_log_id: 'log-1',
        set_number: 1,
        rep_number: 1,
        time: 25.5,
      }
      const createdTime = { id: 'time-1', ...newTime }

      mockClient.from = vi.fn(() => ({
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: createdTime,
          error: null,
        }),
      }))

      const result = await api.createPracticeTime(newTime)

      expect(mockClient.from).toHaveBeenCalledWith('practice_times')
      expect(result).toEqual(createdTime)
    })

    it('複数の練習タイムを作成できる', async () => {
      const newTimes = [
        { user_id: 'test-user-id', practice_log_id: 'log-1', set_number: 1, rep_number: 1, time: 25.5 },
        { user_id: 'test-user-id', practice_log_id: 'log-1', set_number: 1, rep_number: 2, time: 26.0 },
      ]
      const createdTimes = newTimes.map((t, i) => ({ id: `time-${i}`, ...t }))

      mockClient.from = vi.fn(() => ({
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockResolvedValue({
          data: createdTimes,
          error: null,
        }),
      }))

      const result = await api.createPracticeTimes(newTimes)

      expect(mockClient.from).toHaveBeenCalledWith('practice_times')
      expect(result).toEqual(createdTimes)
    })

    it('空配列の場合は空配列を返す', async () => {
      const result = await api.createPracticeTimes([])
      expect(result).toEqual([])
    })

    it('練習タイムを置き換えできる', async () => {
      const newTimes = [
        { set_number: 1, rep_number: 1, time: 24.5 },
        { set_number: 1, rep_number: 2, time: 25.0 },
      ]
      const createdTimes = newTimes.map((t, i) => ({
        id: `time-${i}`,
        practice_log_id: 'log-1',
        ...t,
      }))

      // delete用のモック
      const deleteBuilder = {
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null }),
      }
      // insert用のモック
      const insertBuilder = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockResolvedValue({ data: createdTimes, error: null }),
      }

      let callCount = 0
      mockClient.from = vi.fn(() => {
        callCount++
        return callCount === 1 ? deleteBuilder : insertBuilder
      })

      const result = await api.replacePracticeTimes('log-1', newTimes)

      expect(result).toEqual(createdTimes)
    })

    it('練習タイム置き換えで空配列の場合は削除のみ行う', async () => {
      const deleteBuilder = {
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null }),
      }
      mockClient.from = vi.fn(() => deleteBuilder)

      const result = await api.replacePracticeTimes('log-1', [])

      expect(deleteBuilder.delete).toHaveBeenCalled()
      expect(result).toEqual([])
    })

    it('練習タイムを削除できる', async () => {
      mockClient.from = vi.fn(() => ({
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
      }))

      await expect(api.deletePracticeTime('time-1')).resolves.toBeUndefined()

      expect(mockClient.from).toHaveBeenCalledWith('practice_times')
    })
  })

  describe('練習タグ操作', () => {
    it('練習タグ一覧を取得できる', async () => {
      const mockTags = [
        { id: 'tag-1', name: 'タグ1', color: '#ff0000', user_id: 'user-1' },
        { id: 'tag-2', name: 'タグ2', color: '#00ff00', user_id: 'user-1' },
      ]
      mockClient.from = vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: mockTags,
          error: null,
        }),
      }))

      const result = await api.getPracticeTags()

      expect(mockClient.from).toHaveBeenCalledWith('practice_tags')
      expect(result).toEqual(mockTags)
    })

    it('練習タグを作成できる', async () => {
      const createdTag = {
        id: 'tag-1',
        name: '新規タグ',
        color: '#ff0000',
        user_id: 'test-user-id',
      }
      mockClient.from = vi.fn(() => ({
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: createdTag,
          error: null,
        }),
      }))

      const result = await api.createPracticeTag('新規タグ', '#ff0000')

      expect(mockClient.from).toHaveBeenCalledWith('practice_tags')
      expect(result).toEqual(createdTag)
    })

    it('認証されていないとき練習タグ作成でエラーになる', async () => {
      mockClient = createMockSupabaseClient({ userId: '' })
      api = new PracticeAPI(mockClient)

      await expect(api.createPracticeTag('タグ', '#fff')).rejects.toThrow('認証が必要です')
    })

    it('練習タグを更新できる', async () => {
      const updatedTag = {
        id: 'tag-1',
        name: '更新後タグ',
        color: '#00ff00',
        user_id: 'test-user-id',
      }
      mockClient.from = vi.fn(() => ({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: updatedTag,
          error: null,
        }),
      }))

      const result = await api.updatePracticeTag('tag-1', '更新後タグ', '#00ff00')

      expect(mockClient.from).toHaveBeenCalledWith('practice_tags')
      expect(result).toEqual(updatedTag)
    })

    it('練習タグを削除できる', async () => {
      mockClient.from = vi.fn(() => ({
        delete: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          })),
        })),
      }))

      await expect(api.deletePracticeTag('tag-1')).resolves.toBeUndefined()

      expect(mockClient.from).toHaveBeenCalledWith('practice_tags')
    })
  })

  describe('ユニークな場所取得', () => {
    it('ユニークな場所一覧を取得できる', async () => {
      const mockPlaces = [
        { place: 'プールA' },
        { place: 'プールB' },
        { place: null },
      ]
      mockClient.from = vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        not: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: mockPlaces,
          error: null,
        }),
      }))

      const result = await api.getUniquePlaces()

      expect(mockClient.from).toHaveBeenCalledWith('practices')
      expect(result).toEqual(['プールA', 'プールB'])
    })

    it('認証されていないときエラーになる', async () => {
      mockClient = createMockSupabaseClient({ userId: '' })
      api = new PracticeAPI(mockClient)

      await expect(api.getUniquePlaces()).rejects.toThrow('認証が必要です')
    })
  })
})

