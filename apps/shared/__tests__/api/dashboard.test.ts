import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockSupabaseClient } from '../../__mocks__/supabase'
import { DashboardAPI } from '../../api/dashboard'

describe('DashboardAPI', () => {
  let mockClient: any
  let api: DashboardAPI

  beforeEach(() => {
    vi.clearAllMocks()
    mockClient = createMockSupabaseClient()
    api = new DashboardAPI(mockClient)
  })

  describe('getCalendarEntries', () => {
    it('should fetch calendar entries for date range', async () => {
      const mockPractices = [
        {
          id: 'practice-1',
          date: '2025-01-15',
          place: 'テストプール',
          practice_logs: [],
        },
      ]

      const mockRecords = [
        {
          id: 'record-1',
          competition_id: 'comp-1',
          time_seconds: 60.5,
        },
      ]

      const mockCompetitions = [
        {
          id: 'comp-1',
          name: 'テスト大会',
          date: '2025-01-20',
        },
      ]

      let callCount = 0
      mockClient.from = vi.fn(() => {
        callCount++
        const data =
          callCount === 1
            ? mockPractices
            : callCount === 2
              ? mockRecords
              : mockCompetitions

        const queryMock: any = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          lte: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
        }

        queryMock.then = (resolve: (value: { data: unknown; error: null }) => unknown) =>
          Promise.resolve({ data, error: null }).then(resolve)

        return queryMock
      })

      const result = await api.getCalendarEntries('2025-01-01', '2025-01-31')

      expect(result).toBeDefined()
      expect(Array.isArray(result)).toBe(true)
    })

    it('should throw error if not authenticated', async () => {
      mockClient = createMockSupabaseClient({ userId: '' })
      api = new DashboardAPI(mockClient)

      await expect(api.getCalendarEntries('2025-01-01', '2025-01-31')).rejects.toThrow(
        '認証が必要です'
      )
    })
  })
})

