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
})

