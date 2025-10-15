import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockRecord, createMockSupabaseClient } from '../__mocks__/supabase'
import { RecordAPI } from './records'

describe('RecordAPI', () => {
  let mockClient: any
  let api: RecordAPI

  beforeEach(() => {
    vi.clearAllMocks()
    mockClient = createMockSupabaseClient()
    api = new RecordAPI(mockClient)
  })

  describe('getRecords', () => {
    it('should fetch records for authenticated user', async () => {
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

    it('should filter by date range', async () => {
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

    it('should filter by style', async () => {
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

    it('should throw error if not authenticated', async () => {
      mockClient = createMockSupabaseClient({ userId: '' })
      api = new RecordAPI(mockClient)

      await expect(api.getRecords()).rejects.toThrow('認証が必要です')
    })
  })

  describe('createRecord', () => {
    it('should create record for authenticated user', async () => {
      const newRecord = {
        competition_id: 'comp-1',
        style_id: 'style-1',
        time_seconds: 60.5,
        pool_type: 'long' as const,
        is_relay: false,
      }
      const createdRecord = createMockRecord(newRecord)

      mockClient.from = vi.fn(() => ({
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: createdRecord,
          error: null,
        }),
      }))

      const result = await api.createRecord(newRecord)

      expect(mockClient.from).toHaveBeenCalledWith('records')
      expect(result).toEqual(createdRecord)
    })

    it('should throw error if not authenticated', async () => {
      mockClient = createMockSupabaseClient({ userId: '' })
      api = new RecordAPI(mockClient)

      await expect(
        api.createRecord({
          competition_id: 'comp-1',
          style_id: 'style-1',
          time_seconds: 60.5,
          pool_type: 'long',
          is_relay: false,
        })
      ).rejects.toThrow('認証が必要です')
    })
  })

  describe('updateRecord', () => {
    it('should update record', async () => {
      const updatedRecord = createMockRecord({ time_seconds: 59.0 })

      mockClient.from = vi.fn(() => ({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: updatedRecord,
          error: null,
        }),
      }))

      const result = await api.updateRecord('record-1', { time_seconds: 59.0 })

      expect(mockClient.from).toHaveBeenCalledWith('records')
      expect(result).toEqual(updatedRecord)
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

      await expect(api.updateRecord('record-1', { time_seconds: 59.0 })).rejects.toThrow(
        'Update failed'
      )
    })
  })

  describe('deleteRecord', () => {
    it('should delete record', async () => {
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

    it('should throw error if delete fails', async () => {
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

  describe('getCompetitions', () => {
    it('should fetch competitions for authenticated user', async () => {
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

  describe('createCompetition', () => {
    it('should create competition', async () => {
      const newCompetition = {
        name: '新規大会',
        date: '2025-02-01',
        place: 'プール',
        pool_type: 'long' as const,
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

  describe('updateCompetition', () => {
    it('should update competition', async () => {
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

      const result = await api.updateCompetition('comp-1', { name: '更新後大会名' })

      expect(mockClient.from).toHaveBeenCalledWith('competitions')
      expect(result).toEqual(updatedCompetition)
    })
  })

  describe('deleteCompetition', () => {
    it('should delete competition', async () => {
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

