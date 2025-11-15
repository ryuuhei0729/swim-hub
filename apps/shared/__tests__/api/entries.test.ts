import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockQueryBuilder, createMockSupabaseClient } from '../../__mocks__/supabase'
import { EntryAPI } from '../../api/entries'

describe('EntryAPI', () => {
  let mockClient: any
  let api: EntryAPI

  beforeEach(() => {
    vi.clearAllMocks()
    mockClient = createMockSupabaseClient()
    api = new EntryAPI(mockClient)
  })

  describe('getEntriesByUser', () => {
    it('should fetch entries for authenticated user', async () => {
      const mockEntries = [
        {
          id: 'entry-1',
          user_id: 'test-user-id',
          competition_id: 'comp-1',
          style_id: 1,
          entry_time: 60.5,
          note: 'テストエントリー',
          competition: { id: 'comp-1', title: 'テスト大会' },
          style: { id: 1, name_jp: '自由形' },
          user: { id: 'test-user-id', name: 'テストユーザー' },
          team: null,
          created_at: '2025-01-15T10:00:00Z',
          updated_at: '2025-01-15T10:00:00Z',
        },
      ]

      mockClient.from = vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: mockEntries,
          error: null,
        }),
      }))

      const result = await api.getEntriesByUser()

      expect(mockClient.from).toHaveBeenCalledWith('entries')
      expect(result).toEqual(mockEntries)
    })

    it('should throw error if not authenticated', async () => {
      mockClient = createMockSupabaseClient({ userId: '' })
      api = new EntryAPI(mockClient)

      await expect(api.getEntriesByUser()).rejects.toThrow('認証が必要です')
    })

    it('should handle database errors', async () => {
      const dbError = new Error('Database connection failed')
      
      mockClient.from = vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: null,
          error: dbError,
        }),
      }))

      await expect(api.getEntriesByUser()).rejects.toThrow(dbError)
    })

    it('should return empty array when no entries found', async () => {
      mockClient.from = vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: [],
          error: null,
        }),
      }))

      const result = await api.getEntriesByUser()

      expect(result).toEqual([])
    })

    it('should only fetch entries for the authenticated user', async () => {
      const mockEntries = [
        {
          id: 'entry-1',
          user_id: 'test-user-id',
          competition_id: 'comp-1',
          style_id: 1,
          entry_time: 60.5,
          note: 'テストエントリー',
          competition: { id: 'comp-1', title: 'テスト大会' },
          style: { id: 1, name_jp: '自由形' },
          user: { id: 'test-user-id', name: 'テストユーザー' },
          team: null,
          created_at: '2025-01-15T10:00:00Z',
          updated_at: '2025-01-15T10:00:00Z',
        },
      ]

      const mockQueryBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: mockEntries,
          error: null,
        }),
      }

      mockClient.from = vi.fn(() => mockQueryBuilder)

      await api.getEntriesByUser()

      // 認証されたユーザーのIDでフィルタリングされていることを確認
      expect(mockQueryBuilder.eq).toHaveBeenCalledWith('user_id', 'test-user-id')
    })
  })

  describe('getEntriesByCompetition', () => {
    it('should fetch entries for a specific competition', async () => {
      const mockEntries = [
        {
          id: 'entry-1',
          user_id: 'test-user-id',
          competition_id: 'comp-1',
          style_id: 1,
          entry_time: 60.5,
          note: 'テストエントリー',
          competition: { id: 'comp-1', title: 'テスト大会' },
          style: { id: 1, name_jp: '自由形' },
          user: { id: 'test-user-id', name: 'テストユーザー' },
          team: null,
          created_at: '2025-01-15T10:00:00Z',
          updated_at: '2025-01-15T10:00:00Z',
        },
      ]

      mockClient.from = vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: mockEntries,
          error: null,
        }),
      }))

      const result = await api.getEntriesByCompetition('comp-1')

      expect(mockClient.from).toHaveBeenCalledWith('entries')
      expect(result).toEqual(mockEntries)
    })

    it('should throw error if not authenticated', async () => {
      mockClient = createMockSupabaseClient({ userId: '' })
      api = new EntryAPI(mockClient)

      await expect(api.getEntriesByCompetition('comp-1')).rejects.toThrow('認証が必要です')
    })
  })

  describe('getEntriesByTeam', () => {
    it('should fetch entries for team members', async () => {
      const mockMembership = {
        id: 'membership-1',
        team_id: 'team-1',
        user_id: 'test-user-id',
      }

      const mockEntries = [
        {
          id: 'entry-1',
          user_id: 'test-user-id',
          team_id: 'team-1',
          competition_id: 'comp-1',
          style_id: 1,
          entry_time: 60.5,
          note: 'テストエントリー',
          competition: { id: 'comp-1', title: 'テスト大会' },
          style: { id: 1, name_jp: '自由形' },
          user: { id: 'test-user-id', name: 'テストユーザー' },
          team: { id: 'team-1', name: 'テストチーム' },
          created_at: '2025-01-15T10:00:00Z',
          updated_at: '2025-01-15T10:00:00Z',
        },
      ]

      // メンバーシップ確認のモック
      mockClient.from = vi.fn((table: string) => {
        if (table === 'team_memberships') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: mockMembership,
              error: null,
            }),
          }
        } else if (table === 'entries') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({
              data: mockEntries,
              error: null,
            }),
          }
        }
        return createMockQueryBuilder()
      })

      const result = await api.getEntriesByTeam('team-1')

      expect(result).toEqual(mockEntries)
    })

    it('should throw error if user is not team member', async () => {
      mockClient.from = vi.fn((table: string) => {
        if (table === 'team_memberships') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          }
        }
        return createMockQueryBuilder()
      })

      await expect(api.getEntriesByTeam('team-1')).rejects.toThrow('チームへのアクセス権限がありません')
    })
  })

  describe('getEntry', () => {
    it('should fetch entry if user is the owner', async () => {
      const mockEntry = {
        id: 'entry-1',
        user_id: 'test-user-id',
        team_id: null,
        competition_id: 'comp-1',
        style_id: 1,
        entry_time: 60.5,
        note: 'テストエントリー',
        competition: { id: 'comp-1', title: 'テスト大会' },
        style: { id: 1, name_jp: '自由形' },
        user: { id: 'test-user-id', name: 'テストユーザー' },
        team: null,
        created_at: '2025-01-15T10:00:00Z',
        updated_at: '2025-01-15T10:00:00Z',
      }

      mockClient.from = vi.fn((table: string) => {
        if (table === 'entries') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: mockEntry,
              error: null,
            }),
          }
        }
        return createMockQueryBuilder()
      })

      const result = await api.getEntry('entry-1')

      expect(result).toEqual(mockEntry)
    })

    it('should fetch entry if user is team admin', async () => {
      const mockEntry = {
        id: 'entry-1',
        user_id: 'other-user-id',
        team_id: 'team-1',
        competition_id: 'comp-1',
        style_id: 1,
        entry_time: 60.5,
        note: 'テストエントリー',
        competition: { id: 'comp-1', title: 'テスト大会' },
        style: { id: 1, name_jp: '自由形' },
        user: { id: 'other-user-id', name: '他のユーザー' },
        team: { id: 'team-1', name: 'テストチーム' },
        created_at: '2025-01-15T10:00:00Z',
        updated_at: '2025-01-15T10:00:00Z',
      }

      const mockMembership = {
        role: 'admin',
      }

      mockClient.from = vi.fn((table: string) => {
        if (table === 'entries') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: mockEntry,
              error: null,
            }),
          }
        } else if (table === 'team_memberships') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: mockMembership,
              error: null,
            }),
          }
        }
        return createMockQueryBuilder()
      })

      const result = await api.getEntry('entry-1')

      expect(result).toEqual(mockEntry)
    })

    it('should throw error if user is not owner and not team admin', async () => {
      const mockEntry = {
        id: 'entry-1',
        user_id: 'other-user-id',
        team_id: 'team-1',
        competition_id: 'comp-1',
        style_id: 1,
        entry_time: 60.5,
        note: 'テストエントリー',
        competition: { id: 'comp-1', title: 'テスト大会' },
        style: { id: 1, name_jp: '自由形' },
        user: { id: 'other-user-id', name: '他のユーザー' },
        team: { id: 'team-1', name: 'テストチーム' },
        created_at: '2025-01-15T10:00:00Z',
        updated_at: '2025-01-15T10:00:00Z',
      }

      mockClient.from = vi.fn((table: string) => {
        if (table === 'entries') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: mockEntry,
              error: null,
            }),
          }
        } else if (table === 'team_memberships') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          }
        }
        return createMockQueryBuilder()
      })

      await expect(api.getEntry('entry-1')).rejects.toThrow('アクセスが拒否されました')
    })

    it('should throw error if user is team member but not admin', async () => {
      const mockEntry = {
        id: 'entry-1',
        user_id: 'other-user-id',
        team_id: 'team-1',
        competition_id: 'comp-1',
        style_id: 1,
        entry_time: 60.5,
        note: 'テストエントリー',
        competition: { id: 'comp-1', title: 'テスト大会' },
        style: { id: 1, name_jp: '自由形' },
        user: { id: 'other-user-id', name: '他のユーザー' },
        team: { id: 'team-1', name: 'テストチーム' },
        created_at: '2025-01-15T10:00:00Z',
        updated_at: '2025-01-15T10:00:00Z',
      }

      const mockMembership = {
        role: 'user', // adminではない
      }

      mockClient.from = vi.fn((table: string) => {
        if (table === 'entries') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: mockEntry,
              error: null,
            }),
          }
        } else if (table === 'team_memberships') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: mockMembership,
              error: null,
            }),
          }
        }
        return createMockQueryBuilder()
      })

      await expect(api.getEntry('entry-1')).rejects.toThrow('アクセスが拒否されました')
    })

    it('should throw error if not authenticated', async () => {
      mockClient = createMockSupabaseClient({ userId: '' })
      api = new EntryAPI(mockClient)

      await expect(api.getEntry('entry-1')).rejects.toThrow('認証が必要です')
    })

    it('should handle database errors when fetching entry', async () => {
      const dbError = new Error('Database connection failed')
      
      mockClient.from = vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: dbError,
        }),
      }))

      await expect(api.getEntry('entry-1')).rejects.toThrow(dbError)
    })

    it('should handle team membership query errors gracefully', async () => {
      const mockEntry = {
        id: 'entry-1',
        user_id: 'other-user-id',
        team_id: 'team-1',
        competition_id: 'comp-1',
        style_id: 1,
        entry_time: 60.5,
        note: 'テストエントリー',
        competition: { id: 'comp-1', title: 'テスト大会' },
        style: { id: 1, name_jp: '自由形' },
        user: { id: 'other-user-id', name: '他のユーザー' },
        team: { id: 'team-1', name: 'テストチーム' },
        created_at: '2025-01-15T10:00:00Z',
        updated_at: '2025-01-15T10:00:00Z',
      }

      const membershipError = new Error('Membership query failed')

      mockClient.from = vi.fn((table: string) => {
        if (table === 'entries') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: mockEntry,
              error: null,
            }),
          }
        } else if (table === 'team_memberships') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: null,
              error: membershipError,
            }),
          }
        }
        return createMockQueryBuilder()
      })

      await expect(api.getEntry('entry-1')).rejects.toThrow('アクセスが拒否されました')
    })
  })

  describe('createTeamEntry', () => {
    it('should create team entry if user is team admin', async () => {
      const mockEntry = {
        id: 'entry-1',
        user_id: 'other-user-id',
        team_id: 'team-1',
        competition_id: 'comp-1',
        style_id: 1,
        entry_time: 60.5,
        note: 'テストエントリー',
        created_at: '2025-01-15T10:00:00Z',
        updated_at: '2025-01-15T10:00:00Z',
      }

      const mockMembership = {
        id: 'membership-1',
        role: 'admin',
      }

      mockClient.from = vi.fn((table: string) => {
        if (table === 'team_memberships') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: mockMembership,
              error: null,
            }),
          }
        } else if (table === 'entries') {
          return {
            insert: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: mockEntry,
              error: null,
            }),
          }
        }
        return createMockQueryBuilder()
      })

      const entryData = {
        competition_id: 'comp-1',
        style_id: 1,
        entry_time: 60.5,
        note: 'テストエントリー',
      }

      const result = await api.createTeamEntry('team-1', 'other-user-id', entryData)

      expect(result).toEqual(mockEntry)
    })

    it('should create team entry if user creates their own entry', async () => {
      const mockEntry = {
        id: 'entry-1',
        user_id: 'test-user-id',
        team_id: 'team-1',
        competition_id: 'comp-1',
        style_id: 1,
        entry_time: 60.5,
        note: 'テストエントリー',
        created_at: '2025-01-15T10:00:00Z',
        updated_at: '2025-01-15T10:00:00Z',
      }

      const mockMembership = {
        id: 'membership-1',
        role: 'user', // 一般メンバー
      }

      mockClient.from = vi.fn((table: string) => {
        if (table === 'team_memberships') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: mockMembership,
              error: null,
            }),
          }
        } else if (table === 'entries') {
          return {
            insert: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: mockEntry,
              error: null,
            }),
          }
        }
        return createMockQueryBuilder()
      })

      const entryData = {
        competition_id: 'comp-1',
        style_id: 1,
        entry_time: 60.5,
        note: 'テストエントリー',
      }

      const result = await api.createTeamEntry('team-1', 'test-user-id', entryData)

      expect(result).toEqual(mockEntry)
    })

    it('should throw error if non-admin user tries to create entry for other user', async () => {
      const mockMembership = {
        id: 'membership-1',
        role: 'user', // 一般メンバー
      }

      mockClient.from = vi.fn((table: string) => {
        if (table === 'team_memberships') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: mockMembership,
              error: null,
            }),
          }
        }
        return createMockQueryBuilder()
      })

      const entryData = {
        competition_id: 'comp-1',
        style_id: 1,
        entry_time: 60.5,
        note: 'テストエントリー',
      }

      await expect(api.createTeamEntry('team-1', 'other-user-id', entryData))
        .rejects.toThrow('自分のエントリーのみ作成可能です')
    })

    it('should throw error if user is not team member', async () => {
      mockClient.from = vi.fn((table: string) => {
        if (table === 'team_memberships') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          }
        }
        return createMockQueryBuilder()
      })

      const entryData = {
        competition_id: 'comp-1',
        style_id: 1,
        entry_time: 60.5,
        note: 'テストエントリー',
      }

      await expect(api.createTeamEntry('team-1', 'test-user-id', entryData))
        .rejects.toThrow('チームへのアクセス権限がありません')
    })

    it('should throw error if not authenticated', async () => {
      mockClient = createMockSupabaseClient({ userId: '' })
      api = new EntryAPI(mockClient)

      const entryData = {
        competition_id: 'comp-1',
        style_id: 1,
        entry_time: 60.5,
        note: 'テストエントリー',
      }

      await expect(api.createTeamEntry('team-1', 'test-user-id', entryData))
        .rejects.toThrow('認証が必要です')
    })

    it('should handle database errors when creating entry', async () => {
      const mockMembership = {
        id: 'membership-1',
        role: 'admin',
      }

      const dbError = new Error('Database connection failed')

      mockClient.from = vi.fn((table: string) => {
        if (table === 'team_memberships') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: mockMembership,
              error: null,
            }),
          }
        } else if (table === 'entries') {
          return {
            insert: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: null,
              error: dbError,
            }),
          }
        }
        return createMockQueryBuilder()
      })

      const entryData = {
        competition_id: 'comp-1',
        style_id: 1,
        entry_time: 60.5,
        note: 'テストエントリー',
      }

      await expect(api.createTeamEntry('team-1', 'other-user-id', entryData))
        .rejects.toThrow(dbError)
    })
  })

  describe('updateEntry', () => {
    it('should update entry if user is the owner', async () => {
      const existingEntry = {
        id: 'entry-1',
        user_id: 'test-user-id',
        team_id: null,
        competition_id: 'comp-1',
        style_id: 1,
        entry_time: 60.5,
        note: 'テストエントリー',
        competition: { id: 'comp-1', title: 'テスト大会' },
        created_at: '2025-01-15T10:00:00Z',
        updated_at: '2025-01-15T10:00:00Z',
      }

      const updatedEntry = {
        ...existingEntry,
        note: '更新されたエントリー',
        entry_time: 59.0,
      }

      // 初回の取得用のモック
      const fetchMock = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: existingEntry, error: null }),
      }

      // 更新用のモック
      const updateMock = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: updatedEntry, error: null }),
      }

      mockClient.from = vi.fn((table: string) => {
        if (table === 'entries') {
          // 初回はfetchMock、2回目はupdateMockを返す
          if (mockClient.from.mock.calls.length === 1) {
            return fetchMock
          } else {
            return updateMock
          }
        }
        return createMockQueryBuilder()
      })

      const updates = {
        note: '更新されたエントリー',
        entry_time: 59.0,
      }

      const result = await api.updateEntry('entry-1', updates)

      expect(result).toEqual(updatedEntry)
    })

    it('should update entry if user is team admin', async () => {
      const existingEntry = {
        id: 'entry-1',
        user_id: 'other-user-id',
        team_id: 'team-1',
        competition_id: 'comp-1',
        style_id: 1,
        entry_time: 60.5,
        note: 'テストエントリー',
        competition: { id: 'comp-1', title: 'テスト大会' },
        created_at: '2025-01-15T10:00:00Z',
        updated_at: '2025-01-15T10:00:00Z',
      }

      const updatedEntry = {
        ...existingEntry,
        note: '更新されたエントリー',
        entry_time: 59.0,
      }

      const mockMembership = {
        role: 'admin',
      }

      // 初回の取得用のモック
      const fetchMock = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: existingEntry, error: null }),
      }

      // 更新用のモック
      const updateMock = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: updatedEntry, error: null }),
      }

      // チームメンバーシップ確認用のモック
      const membershipMock = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: mockMembership, error: null }),
      }

      mockClient.from = vi.fn((table: string) => {
        if (table === 'entries') {
          // 初回はfetchMock、2回目はupdateMockを返す
          if (mockClient.from.mock.calls.length === 1) {
            return fetchMock
          } else {
            return updateMock
          }
        } else if (table === 'team_memberships') {
          return membershipMock
        }
        return createMockQueryBuilder()
      })

      const updates = {
        note: '更新されたエントリー',
        entry_time: 59.0,
      }

      const result = await api.updateEntry('entry-1', updates)

      expect(result).toEqual(updatedEntry)
    })

    it('should throw error if user is not owner and not team admin', async () => {
      const existingEntry = {
        id: 'entry-1',
        user_id: 'other-user-id',
        team_id: 'team-1',
        competition_id: 'comp-1',
        style_id: 1,
        entry_time: 60.5,
        note: 'テストエントリー',
        competition: { id: 'comp-1', title: 'テスト大会' },
        created_at: '2025-01-15T10:00:00Z',
        updated_at: '2025-01-15T10:00:00Z',
      }

      mockClient.from = vi.fn((table: string) => {
        if (table === 'entries') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: existingEntry,
              error: null,
            }),
          }
        } else if (table === 'team_memberships') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          }
        }
        return createMockQueryBuilder()
      })

      const updates = {
        note: '更新されたエントリー',
      }

      await expect(api.updateEntry('entry-1', updates)).rejects.toThrow('アクセスが拒否されました')
    })

    it('should throw error if user is team member but not admin', async () => {
      const existingEntry = {
        id: 'entry-1',
        user_id: 'other-user-id',
        team_id: 'team-1',
        competition_id: 'comp-1',
        style_id: 1,
        entry_time: 60.5,
        note: 'テストエントリー',
        competition: { id: 'comp-1', title: 'テスト大会' },
        created_at: '2025-01-15T10:00:00Z',
        updated_at: '2025-01-15T10:00:00Z',
      }

      const mockMembership = {
        role: 'user', // adminではない
      }

      mockClient.from = vi.fn((table: string) => {
        if (table === 'entries') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: existingEntry,
              error: null,
            }),
          }
        } else if (table === 'team_memberships') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: mockMembership,
              error: null,
            }),
          }
        }
        return createMockQueryBuilder()
      })

      const updates = {
        note: '更新されたエントリー',
      }

      await expect(api.updateEntry('entry-1', updates)).rejects.toThrow('アクセスが拒否されました')
    })

    it('should throw error if trying to update competition_id', async () => {
      const existingEntry = {
        id: 'entry-1',
        user_id: 'test-user-id',
        team_id: null,
        competition_id: 'comp-1',
        style_id: 1,
        entry_time: 60.5,
        note: 'テストエントリー',
        competition: { id: 'comp-1', title: 'テスト大会' },
        created_at: '2025-01-15T10:00:00Z',
        updated_at: '2025-01-15T10:00:00Z',
      }

      mockClient.from = vi.fn((table: string) => {
        if (table === 'entries') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: existingEntry,
              error: null,
            }),
          }
        }
        return createMockQueryBuilder()
      })

      const updates = {
        competition_id: 'comp-2', // 禁止されたフィールド
        note: '更新されたエントリー',
      }

      await expect(api.updateEntry('entry-1', updates)).rejects.toThrow('competition_idの更新は許可されていません')
    })

    it('should throw error if trying to update user_id', async () => {
      const existingEntry = {
        id: 'entry-1',
        user_id: 'test-user-id',
        team_id: null,
        competition_id: 'comp-1',
        style_id: 1,
        entry_time: 60.5,
        note: 'テストエントリー',
        competition: { id: 'comp-1', title: 'テスト大会' },
        created_at: '2025-01-15T10:00:00Z',
        updated_at: '2025-01-15T10:00:00Z',
      }

      mockClient.from = vi.fn((table: string) => {
        if (table === 'entries') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: existingEntry,
              error: null,
            }),
          }
        }
        return createMockQueryBuilder()
      })

      const updates = {
        user_id: 'other-user-id', // 禁止されたフィールド
        note: '更新されたエントリー',
      }

      await expect(api.updateEntry('entry-1', updates)).rejects.toThrow('user_idの更新は許可されていません')
    })

    it('should throw error if entry not found', async () => {
      mockClient.from = vi.fn((table: string) => {
        if (table === 'entries') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          }
        }
        return createMockQueryBuilder()
      })

      const updates = {
        note: '更新されたエントリー',
      }

      await expect(api.updateEntry('entry-1', updates)).rejects.toThrow('エントリーが見つかりません')
    })

    it('should throw error if not authenticated', async () => {
      mockClient = createMockSupabaseClient({ userId: '' })
      api = new EntryAPI(mockClient)

      const updates = {
        note: '更新されたエントリー',
      }

      await expect(api.updateEntry('entry-1', updates)).rejects.toThrow('認証が必要です')
    })

    it('should handle database errors when fetching entry', async () => {
      const dbError = new Error('Database connection failed')
      
      mockClient.from = vi.fn((table: string) => {
        if (table === 'entries') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: null,
              error: dbError,
            }),
          }
        }
        return createMockQueryBuilder()
      })

      const updates = {
        note: '更新されたエントリー',
      }

      await expect(api.updateEntry('entry-1', updates)).rejects.toThrow(dbError)
    })
  })

  describe('deleteEntry', () => {
    it('should delete entry if user is the owner', async () => {
      const existingEntry = {
        user_id: 'test-user-id',
        team_id: null,
      }

      mockClient.from = vi.fn((table: string) => {
        if (table === 'entries') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn()
              .mockResolvedValueOnce({ data: existingEntry, error: null }) // 初回取得
              .mockResolvedValueOnce({ data: null, error: null }), // 削除後
            delete: vi.fn().mockReturnThis(),
          }
        }
        return createMockQueryBuilder()
      })

      await api.deleteEntry('entry-1')

      // 削除が実行されたことを確認
      expect(mockClient.from).toHaveBeenCalledWith('entries')
    })

    it('should delete entry if user is team admin', async () => {
      const existingEntry = {
        user_id: 'other-user-id',
        team_id: 'team-1',
      }

      const mockMembership = {
        role: 'admin',
      }

      mockClient.from = vi.fn((table: string) => {
        if (table === 'entries') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn()
              .mockResolvedValueOnce({ data: existingEntry, error: null }) // 初回取得
              .mockResolvedValueOnce({ data: null, error: null }), // 削除後
            delete: vi.fn().mockReturnThis(),
          }
        } else if (table === 'team_memberships') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: mockMembership,
              error: null,
            }),
          }
        }
        return createMockQueryBuilder()
      })

      await api.deleteEntry('entry-1')

      // 削除が実行されたことを確認
      expect(mockClient.from).toHaveBeenCalledWith('entries')
    })

    it('should throw error if user is not owner and not team admin', async () => {
      const existingEntry = {
        user_id: 'other-user-id',
        team_id: 'team-1',
      }

      mockClient.from = vi.fn((table: string) => {
        if (table === 'entries') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: existingEntry,
              error: null,
            }),
          }
        } else if (table === 'team_memberships') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          }
        }
        return createMockQueryBuilder()
      })

      await expect(api.deleteEntry('entry-1')).rejects.toThrow('アクセスが拒否されました')
    })

    it('should throw error if user is team member but not admin', async () => {
      const existingEntry = {
        user_id: 'other-user-id',
        team_id: 'team-1',
      }

      const mockMembership = {
        role: 'user', // adminではない
      }

      mockClient.from = vi.fn((table: string) => {
        if (table === 'entries') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: existingEntry,
              error: null,
            }),
          }
        } else if (table === 'team_memberships') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: mockMembership,
              error: null,
            }),
          }
        }
        return createMockQueryBuilder()
      })

      await expect(api.deleteEntry('entry-1')).rejects.toThrow('アクセスが拒否されました')
    })

    it('should throw error if entry not found', async () => {
      mockClient.from = vi.fn((table: string) => {
        if (table === 'entries') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          }
        }
        return createMockQueryBuilder()
      })

      await expect(api.deleteEntry('entry-1')).rejects.toThrow('エントリーが見つかりません')
    })

    it('should throw error if not authenticated', async () => {
      mockClient = createMockSupabaseClient({ userId: '' })
      api = new EntryAPI(mockClient)

      await expect(api.deleteEntry('entry-1')).rejects.toThrow('認証が必要です')
    })

    it('should handle database errors when fetching entry', async () => {
      const dbError = new Error('Database connection failed')
      
      mockClient.from = vi.fn((table: string) => {
        if (table === 'entries') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: null,
              error: dbError,
            }),
          }
        }
        return createMockQueryBuilder()
      })

      await expect(api.deleteEntry('entry-1')).rejects.toThrow(dbError)
    })

    it('should handle database errors when deleting entry', async () => {
      const existingEntry = {
        user_id: 'test-user-id',
        team_id: null,
      }

      const deleteError = new Error('Delete operation failed')

      mockClient.from = vi.fn((table: string) => {
        if (table === 'entries') {
          const mockBuilder = {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: existingEntry,
              error: null,
            }),
            delete: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: null,
                error: deleteError,
              }),
            }),
          }
          return mockBuilder
        }
        return createMockQueryBuilder()
      })

      await expect(api.deleteEntry('entry-1')).rejects.toThrow(deleteError)
    })
  })

  describe('deleteEntriesByCompetition', () => {
    it('should delete entries if user is team admin', async () => {
      const mockCompetition = {
        team_id: 'team-1',
      }

      const mockMembership = {
        role: 'admin',
      }

      mockClient.from = vi.fn((table: string) => {
        if (table === 'competitions') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: mockCompetition,
              error: null,
            }),
          }
        } else if (table === 'team_memberships') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: mockMembership,
              error: null,
            }),
          }
        } else if (table === 'entries') {
          return {
            delete: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          }
        }
        return createMockQueryBuilder()
      })

      await api.deleteEntriesByCompetition('comp-1')

      // 削除が実行されたことを確認
      expect(mockClient.from).toHaveBeenCalledWith('entries')
    })

    it('should throw error if user is not team admin', async () => {
      const mockCompetition = {
        team_id: 'team-1',
      }

      const mockMembership = {
        role: 'user', // adminではない
      }

      mockClient.from = vi.fn((table: string) => {
        if (table === 'competitions') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: mockCompetition,
              error: null,
            }),
          }
        } else if (table === 'team_memberships') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: mockMembership,
              error: null,
            }),
          }
        }
        return createMockQueryBuilder()
      })

      await expect(api.deleteEntriesByCompetition('comp-1')).rejects.toThrow('管理者権限が必要です')
    })

    it('should throw error if user is not team member', async () => {
      const mockCompetition = {
        team_id: 'team-1',
      }

      mockClient.from = vi.fn((table: string) => {
        if (table === 'competitions') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: mockCompetition,
              error: null,
            }),
          }
        } else if (table === 'team_memberships') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          }
        }
        return createMockQueryBuilder()
      })

      await expect(api.deleteEntriesByCompetition('comp-1')).rejects.toThrow('管理者権限が必要です')
    })

    it('should throw error if competition is not a team competition', async () => {
      const mockCompetition = {
        team_id: null, // 個人大会
      }

      mockClient.from = vi.fn((table: string) => {
        if (table === 'competitions') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: mockCompetition,
              error: null,
            }),
          }
        }
        return createMockQueryBuilder()
      })

      await expect(api.deleteEntriesByCompetition('comp-1')).rejects.toThrow('チーム大会ではありません')
    })

    it('should throw error if competition not found', async () => {
      mockClient.from = vi.fn((table: string) => {
        if (table === 'competitions') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          }
        }
        return createMockQueryBuilder()
      })

      await expect(api.deleteEntriesByCompetition('comp-1')).rejects.toThrow('チーム大会ではありません')
    })

    it('should throw error if not authenticated', async () => {
      mockClient = createMockSupabaseClient({ userId: '' })
      api = new EntryAPI(mockClient)

      await expect(api.deleteEntriesByCompetition('comp-1')).rejects.toThrow('認証が必要です')
    })

    it('should handle database errors when fetching competition', async () => {
      const dbError = new Error('Database connection failed')
      
      mockClient.from = vi.fn((table: string) => {
        if (table === 'competitions') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: null,
              error: dbError,
            }),
          }
        }
        return createMockQueryBuilder()
      })

      await expect(api.deleteEntriesByCompetition('comp-1')).rejects.toThrow(dbError)
    })

    it('should handle database errors when deleting entries', async () => {
      const mockCompetition = {
        team_id: 'team-1',
      }

      const mockMembership = {
        role: 'admin',
      }

      const deleteError = new Error('Delete operation failed')

      mockClient.from = vi.fn((table: string) => {
        if (table === 'competitions') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: mockCompetition,
              error: null,
            }),
          }
        } else if (table === 'team_memberships') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: mockMembership,
              error: null,
            }),
          }
        } else if (table === 'entries') {
          return {
            delete: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({
              data: null,
              error: deleteError,
            }),
          }
        }
        return createMockQueryBuilder()
      })

      await expect(api.deleteEntriesByCompetition('comp-1')).rejects.toThrow(deleteError)
    })
  })

  describe('createPersonalEntry', () => {
    it('should create personal entry for authenticated user', async () => {
      const mockEntry = {
        id: 'entry-1',
        user_id: 'test-user-id',
        team_id: null,
        competition_id: 'comp-1',
        style_id: 1,
        entry_time: 60.5,
        note: 'テストエントリー',
        created_at: '2025-01-15T10:00:00Z',
        updated_at: '2025-01-15T10:00:00Z',
      }

      mockClient.from = vi.fn(() => ({
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: mockEntry,
          error: null,
        }),
      }))

      const entryData = {
        competition_id: 'comp-1',
        style_id: 1,
        entry_time: 60.5,
        note: 'テストエントリー',
      }

      const result = await api.createPersonalEntry(entryData)

      expect(result).toEqual(mockEntry)
    })

    it('should throw error if not authenticated', async () => {
      mockClient = createMockSupabaseClient({ userId: '' })
      api = new EntryAPI(mockClient)

      const entryData = {
        competition_id: 'comp-1',
        style_id: 1,
        entry_time: 60.5,
        note: 'テストエントリー',
      }

      await expect(api.createPersonalEntry(entryData)).rejects.toThrow('認証が必要です')
    })
  })
})
