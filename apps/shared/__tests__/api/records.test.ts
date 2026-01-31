import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockRecord, createMockSupabaseClient } from '../../__mocks__/supabase'
import { RecordAPI } from '../../api/records'

describe('RecordAPI', () => {
  let mockClient: any
  let api: RecordAPI

  beforeEach(() => {
    vi.clearAllMocks()
    mockClient = createMockSupabaseClient()
    api = new RecordAPI(mockClient)
  })

  describe('記録取得', () => {
    it('認証済みユーザーのとき記録一覧を取得できる', async () => {
      const mockRecord = createMockRecord()
      mockClient.from = vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: [mockRecord],
          error: null,
        }),
      }))

      const result = await api.getRecords()

      expect(mockClient.auth.getUser).toHaveBeenCalled()
      expect(mockClient.from).toHaveBeenCalledWith('records')
      expect(result).toEqual([mockRecord])
    })

    it('日付範囲を指定したとき該当期間の記録を取得できる', async () => {
      const mockRecord = createMockRecord()
      mockClient.from = vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({
              gte: vi.fn(() => ({
                lte: vi.fn().mockResolvedValue({
                  data: [mockRecord],
                  error: null,
                }),
              })),
            })),
          })),
        })),
      }))

      await api.getRecords('2025-01-01', '2025-01-31')

      expect(mockClient.from).toHaveBeenCalledWith('records')
    })

    it('種目を指定したとき該当種目の記録を取得できる', async () => {
      const mockRecord = createMockRecord()
      mockClient.from = vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({
                data: [mockRecord],
                error: null,
              }),
            })),
          })),
        })),
      }))

      await api.getRecords(undefined, undefined, 1)

      expect(mockClient.from).toHaveBeenCalledWith('records')
    })

    it('認証されていないときエラーになる', async () => {
      mockClient = createMockSupabaseClient({ userId: '' })
      api = new RecordAPI(mockClient)

      await expect(api.getRecords()).rejects.toThrow('認証が必要です')
    })
  })

  describe('記録作成', () => {
    it('認証済みユーザーのとき記録を作成できる', async () => {
      const newRecord = {
        competition_id: 'comp-1',
        style_id: 1,
        time: 60.5,
        video_url: null,
        note: 'テストメモ',
        is_relaying: false,
        pool_type: 0 as 0,
        reaction_time: null,
      }
      const createdRecord = createMockRecord(newRecord)

      mockClient.from = vi.fn(() => ({
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: createdRecord,
          error: null,
        }),
      })) as unknown as typeof mockClient.from

      const result = await api.createRecord(newRecord)

      expect(mockClient.from).toHaveBeenCalledWith('records')
      expect(result).toEqual(createdRecord)
    })

    it('認証されていないときエラーになる', async () => {
      mockClient = createMockSupabaseClient({ userId: '' })
      api = new RecordAPI(mockClient)

      await expect(
        api.createRecord({
          competition_id: 'comp-1',
          style_id: 1,
          time: 60.5,
          video_url: null,
          note: 'テストメモ',
          is_relaying: false,
          pool_type: 0 as 0,
          reaction_time: null,
        })
      ).rejects.toThrow('認証が必要です')
    })
  })

  describe('記録更新', () => {
    it('記録を更新できる', async () => {
      const updatedRecord = createMockRecord({ time: 59.0 })

      mockClient.from = vi.fn(() => ({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: updatedRecord,
          error: null,
        }),
      }))

      const result = await api.updateRecord('record-1', { time: 59.0 })

      expect(mockClient.from).toHaveBeenCalledWith('records')
      expect(result).toEqual(updatedRecord)
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

      await expect(api.updateRecord('record-1', { time: 59.0 })).rejects.toThrow(
        'Update failed'
      )
    })
  })

  describe('記録削除', () => {
    it('記録を削除できる', async () => {
      mockClient.from = vi.fn(() => ({
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
      }))

      await expect(api.deleteRecord('record-1')).resolves.toBeUndefined()

      expect(mockClient.from).toHaveBeenCalledWith('records')
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

      await expect(api.deleteRecord('record-1')).rejects.toThrow('Delete failed')
    })
  })

  describe('大会取得', () => {
    it('認証済みユーザーのとき大会一覧を取得できる', async () => {
      const mockCompetition = {
        id: 'comp-1',
        name: 'テスト大会',
        date: '2025-01-15',
        place: 'テストプール',
        pool_type: 'long',
      }

      mockClient.from = vi.fn(() => ({
        select: vi.fn(() => ({
          or: vi.fn(() => ({
            order: vi.fn().mockResolvedValue({
              data: [mockCompetition],
              error: null,
            }),
          })),
        })),
      }))

      const result = await api.getCompetitions()

      expect(mockClient.from).toHaveBeenCalledWith('competitions')
      expect(result).toEqual([mockCompetition])
    })
  })

  describe('大会作成', () => {
    it('大会を作成できる', async () => {
      const newCompetition = {
        title: '新規大会',
        date: '2025-02-01',
        place: 'プール',
        pool_type: 1,
        note: 'テストメモ',
      }
      const createdCompetition = {
        id: 'comp-2',
        ...newCompetition,
        user_id: 'test-user-id',
      }

      mockClient.from = vi.fn(() => ({
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: createdCompetition,
          error: null,
        }),
      }))

      const result = await api.createCompetition(newCompetition)

      expect(mockClient.from).toHaveBeenCalledWith('competitions')
      expect(result).toEqual(createdCompetition)
    })
  })

  describe('大会更新', () => {
    it('大会を更新できる', async () => {
      const updatedCompetition = {
        id: 'comp-1',
        name: '更新後大会名',
        date: '2025-01-15',
      }

      mockClient.from = vi.fn(() => ({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: updatedCompetition,
          error: null,
        }),
      }))

      const result = await api.updateCompetition('comp-1', { title: '更新後大会名' })

      expect(mockClient.from).toHaveBeenCalledWith('competitions')
      expect(result).toEqual(updatedCompetition)
    })
  })

  describe('大会削除', () => {
    it('大会を削除できる', async () => {
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

      await expect(api.deleteCompetition('comp-1')).resolves.toBeUndefined()

      expect(mockClient.from).toHaveBeenCalledWith('competitions')
    })
  })

  describe('記録件数取得', () => {
    it('記録の総件数を取得できる', async () => {
      mockClient.from = vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({
          count: 10,
          error: null,
        }),
      }))

      const result = await api.countRecords()

      expect(mockClient.from).toHaveBeenCalledWith('records')
      expect(result).toBe(10)
    })

    it('期間指定で記録件数を取得できる', async () => {
      const builder: any = {
        select: vi.fn(),
        eq: vi.fn(),
        gte: vi.fn(),
        lte: vi.fn(),
      }
      builder.select.mockReturnValue(builder)
      builder.eq.mockReturnValue(builder)
      builder.gte.mockReturnValue(builder)
      builder.lte.mockResolvedValue({
        count: 5,
        error: null,
      })
      mockClient.from = vi.fn().mockReturnValue(builder)

      const result = await api.countRecords('2025-01-01', '2025-01-31')

      expect(result).toBe(5)
    })

    it('種目指定で記録件数を取得できる', async () => {
      const builder: any = {
        select: vi.fn(),
        eq: vi.fn(),
        then: vi.fn(),
      }
      // チェーン対応：全てのメソッドがbuilder自身を返す
      builder.select.mockReturnValue(builder)
      builder.eq.mockReturnValue(builder)
      // thenableとして動作させる
      builder.then.mockImplementation((onFulfilled: any) =>
        Promise.resolve({ count: 3, error: null }).then(onFulfilled)
      )
      mockClient.from = vi.fn().mockReturnValue(builder)

      const result = await api.countRecords(undefined, undefined, 1)

      expect(result).toBe(3)
    })

    it('認証されていないときエラーになる', async () => {
      mockClient = createMockSupabaseClient({ userId: '' })
      api = new RecordAPI(mockClient)

      await expect(api.countRecords()).rejects.toThrow('認証が必要です')
    })

    it('countがnullの場合は0を返す', async () => {
      mockClient.from = vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({
          count: null,
          error: null,
        }),
      }))

      const result = await api.countRecords()

      expect(result).toBe(0)
    })
  })

  describe('記録取得（limit/offset付き）', () => {
    it('limitを指定して取得できる', async () => {
      const mockRecords = [createMockRecord()]
      const builder: any = {
        select: vi.fn(),
        eq: vi.fn(),
        order: vi.fn(),
        limit: vi.fn(),
        then: vi.fn()
      }
      builder.select.mockReturnValue(builder)
      builder.eq.mockReturnValue(builder)
      builder.order.mockReturnValue(builder)
      builder.limit.mockReturnValue(builder)
      builder.then.mockImplementation((onFulfilled: any) =>
        Promise.resolve({ data: mockRecords, error: null }).then(onFulfilled)
      )
      mockClient.from = vi.fn().mockReturnValue(builder)

      const result = await api.getRecords(undefined, undefined, undefined, 10)

      expect(builder.limit).toHaveBeenCalledWith(10)
      expect(result).toEqual(mockRecords)
    })

    it('limit/offsetを指定して取得できる', async () => {
      const mockRecords = [createMockRecord()]
      const builder: any = {
        select: vi.fn(),
        eq: vi.fn(),
        order: vi.fn(),
        range: vi.fn(),
        then: vi.fn()
      }
      builder.select.mockReturnValue(builder)
      builder.eq.mockReturnValue(builder)
      builder.order.mockReturnValue(builder)
      builder.range.mockReturnValue(builder)
      builder.then.mockImplementation((onFulfilled: any) =>
        Promise.resolve({ data: mockRecords, error: null }).then(onFulfilled)
      )
      mockClient.from = vi.fn().mockReturnValue(builder)

      const result = await api.getRecords(undefined, undefined, undefined, 10, 20)

      expect(builder.range).toHaveBeenCalledWith(20, 29)
      expect(result).toEqual(mockRecords)
    })
  })

  describe('スプリットタイム操作', () => {
    it('スプリットタイムを一括作成できる', async () => {
      const newSplitTimes = [
        { record_id: 'record-1', distance: 50, split_time: 15.0 },
        { record_id: 'record-1', distance: 100, split_time: 30.5 },
      ]
      const createdSplitTimes = newSplitTimes.map((st, i) => ({
        id: `split-${i + 1}`,
        ...st,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      }))

      mockClient.from = vi.fn(() => ({
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockResolvedValue({
          data: createdSplitTimes,
          error: null,
        }),
      }))

      const result = await api.createSplitTimes(newSplitTimes)

      expect(mockClient.from).toHaveBeenCalledWith('split_times')
      expect(result).toEqual(createdSplitTimes)
    })

    it('空配列を渡した場合は空配列を返す', async () => {
      const result = await api.createSplitTimes([])

      expect(result).toEqual([])
    })

    it('単一のスプリットタイムを作成できる', async () => {
      const newSplitTime = { record_id: 'record-1', distance: 50, split_time: 15.0 }
      const createdSplitTime = {
        id: 'split-1',
        ...newSplitTime,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      }

      mockClient.from = vi.fn(() => ({
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: createdSplitTime,
          error: null,
        }),
      }))

      const result = await api.createSplitTime(newSplitTime)

      expect(mockClient.from).toHaveBeenCalledWith('split_times')
      expect(result).toEqual(createdSplitTime)
    })

    it('スプリットタイムを置き換えできる', async () => {
      const newSplitTimes = [
        { distance: 50, split_time: 25.0 },
        { distance: 100, split_time: 55.0 },
      ]
      const createdSplitTimes = newSplitTimes.map((st, i) => ({
        id: `split-new-${i}`,
        record_id: 'record-1',
        ...st,
      }))

      // delete用のモック
      const deleteBuilder = {
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null }),
      }
      // insert用のモック
      const insertBuilder = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockResolvedValue({ data: createdSplitTimes, error: null }),
      }

      let callCount = 0
      mockClient.from = vi.fn(() => {
        callCount++
        return callCount === 1 ? deleteBuilder : insertBuilder
      })

      const result = await api.replaceSplitTimes('record-1', newSplitTimes)

      expect(result).toEqual(createdSplitTimes)
    })

    it('スプリットタイム置き換えで空配列の場合は削除のみ行う', async () => {
      const deleteBuilder = {
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null }),
      }
      mockClient.from = vi.fn(() => deleteBuilder)

      const result = await api.replaceSplitTimes('record-1', [])

      expect(deleteBuilder.delete).toHaveBeenCalled()
      expect(result).toEqual([])
    })
  })

  describe('ベストタイム取得', () => {
    it('ベストタイムを取得できる', async () => {
      const mockRecords = [
        {
          id: 'record-1',
          time: 55.0,
          created_at: '2025-01-15T00:00:00Z',
          pool_type: 0,
          is_relaying: false,
          style_id: 1,
          styles: { name_jp: '自由形100m', distance: 100 },
          competitions: { title: '大会1', date: '2025-01-15' },
        },
      ]
      const builder: any = {
        select: vi.fn(),
        eq: vi.fn(),
        order: vi.fn(),
        then: vi.fn(),
      }
      builder.select.mockReturnValue(builder)
      builder.eq.mockReturnValue(builder)
      builder.order.mockReturnValue(builder)
      builder.then.mockImplementation((onFulfilled: any) =>
        Promise.resolve({ data: mockRecords, error: null }).then(onFulfilled)
      )
      mockClient.from = vi.fn().mockReturnValue(builder)

      const result = await api.getBestTimes()

      expect(mockClient.from).toHaveBeenCalledWith('records')
      expect(result.length).toBeGreaterThan(0)
    })

    it('ユーザーIDを指定してベストタイムを取得できる', async () => {
      const mockRecords = [
        {
          id: 'record-1',
          time: 60.0,
          created_at: '2025-01-15T00:00:00Z',
          pool_type: 1,
          is_relaying: false,
          style_id: 2,
          styles: { name_jp: '背泳ぎ100m', distance: 100 },
          competitions: { title: '大会2', date: '2025-01-20' },
        },
      ]
      const builder: any = {
        select: vi.fn(),
        eq: vi.fn(),
        order: vi.fn(),
        then: vi.fn(),
      }
      builder.select.mockReturnValue(builder)
      builder.eq.mockReturnValue(builder)
      builder.order.mockReturnValue(builder)
      builder.then.mockImplementation((onFulfilled: any) =>
        Promise.resolve({ data: mockRecords, error: null }).then(onFulfilled)
      )
      mockClient.from = vi.fn().mockReturnValue(builder)

      const result = await api.getBestTimes('specific-user')

      expect(builder.eq).toHaveBeenCalledWith('user_id', 'specific-user')
      expect(result.length).toBeGreaterThan(0)
    })

    it('引き継ぎありのベストタイムを取得できる', async () => {
      const mockRecords = [
        {
          id: 'record-1',
          time: 55.0,
          created_at: '2025-01-15T00:00:00Z',
          pool_type: 0,
          is_relaying: true,
          style_id: 1,
          styles: { name_jp: '自由形100m', distance: 100 },
          competitions: { title: '大会1', date: '2025-01-15' },
        },
      ]
      const builder: any = {
        select: vi.fn(),
        eq: vi.fn(),
        order: vi.fn(),
        then: vi.fn(),
      }
      builder.select.mockReturnValue(builder)
      builder.eq.mockReturnValue(builder)
      builder.order.mockReturnValue(builder)
      builder.then.mockImplementation((onFulfilled: any) =>
        Promise.resolve({ data: mockRecords, error: null }).then(onFulfilled)
      )
      mockClient.from = vi.fn().mockReturnValue(builder)

      const result = await api.getBestTimes()

      expect(result.length).toBeGreaterThan(0)
    })

    it('認証されていないときエラーになる', async () => {
      mockClient = createMockSupabaseClient({ userId: '' })
      api = new RecordAPI(mockClient)

      await expect(api.getBestTimes()).rejects.toThrow('認証が必要です')
    })
  })

  describe('一括記録作成', () => {
    it('複数の記録を一括作成できる', async () => {
      const newRecords = [
        {
          style_id: 1,
          time: 60.5,
          pool_type: 0 as const,
          is_relaying: false,
          note: null,
        },
        {
          style_id: 2,
          time: 120.0,
          pool_type: 0 as const,
          is_relaying: false,
          note: null,
        },
      ]
      const createdRecords = newRecords.map((r, i) =>
        createMockRecord({ id: `record-${i}`, ...r })
      )

      mockClient.from = vi.fn(() => ({
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockResolvedValue({
          data: createdRecords,
          error: null,
        }),
      }))

      const result = await api.createBulkRecords(newRecords)

      expect(mockClient.from).toHaveBeenCalledWith('records')
      expect(result.created).toBe(2)
      expect(result.errors).toHaveLength(0)
    })

    it('認証されていないときエラーになる', async () => {
      mockClient = createMockSupabaseClient({ userId: '' })
      api = new RecordAPI(mockClient)

      await expect(
        api.createBulkRecords([
          {
            style_id: 1,
            time: 60.5,
            pool_type: 0,
            is_relaying: false,
            note: null,
          },
        ])
      ).rejects.toThrow('認証が必要です')
    })
  })
})

