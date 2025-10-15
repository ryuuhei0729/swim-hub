import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockSupabaseClient, createMockTeam } from '../__mocks__/supabase'
import { TeamAPI } from './teams'

describe('TeamAPI', () => {
  let mockClient: any
  let api: TeamAPI

  beforeEach(() => {
    vi.clearAllMocks()
    mockClient = createMockSupabaseClient()
    api = new TeamAPI(mockClient)
  })

  describe('getMyTeams', () => {
    it('should fetch teams for authenticated user', async () => {
      const mockTeamMembership = {
        id: 'membership-1',
        team_id: 'team-1',
        user_id: 'test-user-id',
        team: createMockTeam(),
      }

      mockClient.from = vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: [mockTeamMembership],
          error: null,
        }),
      }))

      const result = await api.getMyTeams()

      expect(mockClient.from).toHaveBeenCalledWith('team_memberships')
      expect(result).toEqual([mockTeamMembership])
    })

    it('should throw error if not authenticated', async () => {
      mockClient = createMockSupabaseClient({ userId: '' })
      api = new TeamAPI(mockClient)

      await expect(api.getMyTeams()).rejects.toThrow('認証が必要です')
    })
  })

  describe('getTeam', () => {
    it('should fetch team details if user is member', async () => {
      const mockTeam = createMockTeam()

      // First call for membership check
      const fromMock = vi.fn()
      let callCount = 0
      fromMock.mockImplementation(() => {
        callCount++
        if (callCount === 1) {
          // Membership check
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { id: 'membership-1' },
              error: null,
            }),
          }
        } else {
          // Team fetch
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: mockTeam,
              error: null,
            }),
          }
        }
      })

      mockClient.from = fromMock

      const result = await api.getTeam('team-1')

      expect(result).toEqual(mockTeam)
    })

    it('should throw error if user is not a member', async () => {
      mockClient.from = vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
      }))

      await expect(api.getTeam('team-1')).rejects.toThrow('チームへのアクセス権限がありません')
    })
  })

  describe('createTeam', () => {
    it('should create team', async () => {
      const newTeam = {
        name: '新規チーム',
        description: 'チームの説明',
      }
      const createdTeam = createMockTeam(newTeam)

      mockClient.from = vi.fn(() => ({
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: createdTeam,
          error: null,
        }),
      }))

      const result = await api.createTeam(newTeam)

      expect(mockClient.from).toHaveBeenCalledWith('teams')
      expect(result).toEqual(createdTeam)
    })
  })

  describe('joinTeam', () => {
    it('should join team with invite code', async () => {
      const mockTeam = createMockTeam()
      const mockMembership = {
        id: 'membership-1',
        team_id: 'team-1',
        user_id: 'test-user-id',
      }

      let callCount = 0
      mockClient.from = vi.fn(() => {
        callCount++
        if (callCount === 1) {
          // Team lookup
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({
                  data: mockTeam,
                  error: null,
                }),
              })),
            })),
          }
        } else if (callCount === 2) {
          // Existing membership check
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  single: vi.fn().mockResolvedValue({
                    data: null,
                    error: null,
                  }),
                })),
              })),
            })),
          }
        } else {
          // Membership insert
          return {
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({
                  data: mockMembership,
                  error: null,
                }),
              })),
            })),
          }
        }
      })

      const result = await api.joinTeam('ABC123')

      expect(result).toEqual(mockMembership)
    })
  })
})

