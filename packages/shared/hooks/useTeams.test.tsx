import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockSupabaseClient, createMockTeam } from '../__mocks__/supabase'
import { useTeams } from './useTeams'

// TeamAPI をモック
const mockApi = {
  getMyTeams: vi.fn(),
  getTeam: vi.fn(),
  getTeamMembers: vi.fn(),
  getTeamAnnouncements: vi.fn(),
  createTeam: vi.fn(),
  joinTeam: vi.fn(),
  leaveTeam: vi.fn(),
  subscribeToAnnouncements: vi.fn(),
  subscribeToMembers: vi.fn(),
}

vi.mock('../api/teams', () => ({
  TeamAPI: vi.fn().mockImplementation(() => mockApi),
}))

describe('useTeams', () => {
  let mockClient: any

  beforeEach(() => {
    vi.clearAllMocks()
    mockClient = createMockSupabaseClient()
  })

  describe('初期化', () => {
    it('should initialize with loading state', async () => {
      const mockTeams = [{ id: 'team-1', team: createMockTeam() }]
      mockApi.getMyTeams.mockResolvedValue(mockTeams)

      const { result } = renderHook(() => useTeams(mockClient))

      await act(async () => {
        expect(result.current.loading).toBe(true)
        expect(result.current.teams).toEqual([])
        expect(result.current.currentTeam).toBeNull()
        expect(result.current.error).toBeNull()
      })
    })

    it('should load teams on mount', async () => {
      const mockTeams = [{ id: 'team-1', team: createMockTeam() }]
      mockApi.getMyTeams.mockResolvedValue(mockTeams)

      const { result } = renderHook(() => useTeams(mockClient))

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(mockApi.getMyTeams).toHaveBeenCalled()
      expect(result.current.teams).toEqual(mockTeams)
    })
  })

  describe('特定チームのデータ取得', () => {
    it('should load team details when teamId is provided', async () => {
      const teamId = 'team-1'
      const mockTeam = createMockTeam()
      const mockMembers = [{ id: 'member-1', user: { name: 'テストユーザー' } }]
      const mockAnnouncements = [{ id: 'ann-1', title: 'テストお知らせ' }]

      mockApi.getMyTeams.mockResolvedValue([])
      mockApi.getTeam.mockResolvedValue(mockTeam)
      mockApi.getTeamMembers.mockResolvedValue(mockMembers)
      mockApi.getTeamAnnouncements.mockResolvedValue(mockAnnouncements)

      const { result } = renderHook(() =>
        useTeams(mockClient, { teamId })
      )

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(mockApi.getTeam).toHaveBeenCalledWith(teamId)
      expect(mockApi.getTeamMembers).toHaveBeenCalledWith(teamId)
      expect(mockApi.getTeamAnnouncements).toHaveBeenCalledWith(teamId)
      expect(result.current.currentTeam).toEqual(mockTeam)
      expect(result.current.members).toEqual(mockMembers)
      expect(result.current.announcements).toEqual(mockAnnouncements)
    })

    it('should handle team access error', async () => {
      const teamId = 'team-1'
      const error = new Error('チームへのアクセス権限がありません')

      mockApi.getMyTeams.mockResolvedValue([])
      mockApi.getTeam.mockRejectedValue(error)

      const { result } = renderHook(() =>
        useTeams(mockClient, { teamId })
      )

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(result.current.error).toEqual(error)
    })
  })

  describe('操作関数', () => {
    it('should create team', async () => {
      const newTeam = {
        name: '新規チーム',
        description: 'チームの説明',
      }
      const createdTeam = createMockTeam(newTeam)
      
      mockApi.getMyTeams.mockResolvedValue([])
      mockApi.createTeam.mockResolvedValue(createdTeam)

      const { result } = renderHook(() => useTeams(mockClient))

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.createTeam(newTeam)
      })

      expect(mockApi.createTeam).toHaveBeenCalledWith(newTeam)
    })

    it('should join team', async () => {
      const inviteCode = 'ABC123'
      const mockMembership = { id: 'membership-1', team_id: 'team-1' }
      
      mockApi.getMyTeams.mockResolvedValue([])
      mockApi.joinTeam.mockResolvedValue(mockMembership)

      const { result } = renderHook(() => useTeams(mockClient))

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.joinTeam(inviteCode)
      })

      expect(mockApi.joinTeam).toHaveBeenCalledWith(inviteCode)
    })

    it('should leave team', async () => {
      const teamId = 'team-1'
      
      mockApi.getMyTeams.mockResolvedValue([])
      mockApi.leaveTeam.mockResolvedValue(undefined)

      const { result } = renderHook(() => useTeams(mockClient))

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.leaveTeam(teamId)
      })

      expect(mockApi.leaveTeam).toHaveBeenCalledWith(teamId)
    })
  })

  describe('リアルタイム購読', () => {
    it('should subscribe to realtime updates when teamId is provided', async () => {
      const teamId = 'team-1'
      const mockAnnouncementsChannel = { unsubscribe: vi.fn() }
      const mockMembersChannel = { unsubscribe: vi.fn() }
      
      mockApi.getMyTeams.mockResolvedValue([])
      mockApi.getTeam.mockResolvedValue(createMockTeam())
      mockApi.getTeamMembers.mockResolvedValue([])
      mockApi.getTeamAnnouncements.mockResolvedValue([])
      mockApi.subscribeToAnnouncements.mockReturnValue(mockAnnouncementsChannel)
      mockApi.subscribeToMembers.mockReturnValue(mockMembersChannel)

      const { result } = renderHook(() =>
        useTeams(mockClient, { teamId })
      )

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(mockApi.subscribeToAnnouncements).toHaveBeenCalledWith(teamId, expect.any(Function))
      expect(mockApi.subscribeToMembers).toHaveBeenCalledWith(teamId, expect.any(Function))
    })

    it('should not subscribe when realtime is disabled', async () => {
      const teamId = 'team-1'
      
      mockApi.getMyTeams.mockResolvedValue([])
      mockApi.getTeam.mockResolvedValue(createMockTeam())
      mockApi.getTeamMembers.mockResolvedValue([])
      mockApi.getTeamAnnouncements.mockResolvedValue([])

      const { result } = renderHook(() =>
        useTeams(mockClient, { teamId, enableRealtime: false })
      )

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(mockApi.subscribeToAnnouncements).not.toHaveBeenCalled()
      expect(mockApi.subscribeToMembers).not.toHaveBeenCalled()
    })

    it('should not subscribe when teamId is not provided', async () => {
      mockApi.getMyTeams.mockResolvedValue([])

      const { result } = renderHook(() => useTeams(mockClient))

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(mockApi.subscribeToAnnouncements).not.toHaveBeenCalled()
      expect(mockApi.subscribeToMembers).not.toHaveBeenCalled()
    })
  })

  describe('リフレッシュ', () => {
    it('should refresh data', async () => {
      const mockTeams = [{ id: 'team-1', team: createMockTeam() }]
      mockApi.getMyTeams.mockResolvedValue(mockTeams)

      const { result } = renderHook(() => useTeams(mockClient))

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      // リフレッシュ実行
      await act(async () => {
        await result.current.refresh()
      })

      expect(mockApi.getMyTeams).toHaveBeenCalledTimes(2) // 初回 + リフレッシュ
    })
  })
})
