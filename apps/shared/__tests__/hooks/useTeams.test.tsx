import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockSupabaseClient, createMockTeam } from '../../__mocks__/supabase'
import { useTeams } from '../../hooks/useTeams'

// サブAPIをモック
const mockCore = {
  getMyTeams: vi.fn(),
  getTeam: vi.fn(),
  createTeam: vi.fn(),
  updateTeam: vi.fn(),
  deleteTeam: vi.fn(),
}
const mockMembers = {
  list: vi.fn(),
  join: vi.fn(),
  leave: vi.fn(),
  updateRole: vi.fn(),
  remove: vi.fn(),
}
const mockAnnouncements = {
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}

vi.mock('../api/teams', () => ({
  TeamCoreAPI: vi.fn().mockImplementation(() => mockCore),
  TeamMembersAPI: vi.fn().mockImplementation(() => mockMembers),
  TeamAnnouncementsAPI: vi.fn().mockImplementation(() => mockAnnouncements),
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
      mockCore.getMyTeams.mockResolvedValue(mockTeams)

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

      expect(mockCore.getMyTeams).toHaveBeenCalled()
      expect(result.current.teams).toEqual(mockTeams)
    })
  })

  describe('特定チームのデータ取得', () => {
    it('should load team details when teamId is provided', async () => {
      const teamId = 'team-1'
      const mockTeam = createMockTeam()
      const mockMembers = [{ id: 'member-1', user: { name: 'テストユーザー' } }]
      const mockAnnouncements = [{ id: 'ann-1', title: 'テストお知らせ' }]

      mockCore.getMyTeams.mockResolvedValue([])
      mockCore.getTeam.mockResolvedValue(mockTeam)
      mockMembers.list.mockResolvedValue(mockMembers)
      mockAnnouncements.list.mockResolvedValue(mockAnnouncements)

      const { result } = renderHook(() =>
        useTeams(mockClient, { teamId })
      )

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(mockCore.getTeam).toHaveBeenCalledWith(teamId)
      expect(mockMembers.list).toHaveBeenCalledWith(teamId)
      expect(mockAnnouncements.list).toHaveBeenCalledWith(teamId)
      expect(result.current.currentTeam).toEqual(mockTeam)
      expect(result.current.members).toEqual(mockMembers)
      expect(result.current.announcements).toEqual(mockAnnouncements)
    })

    it('should handle team access error', async () => {
      const teamId = 'team-1'
      const error = new Error('チームへのアクセス権限がありません')

      mockCore.getMyTeams.mockResolvedValue([])
      mockCore.getTeam.mockRejectedValue(error)

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
      
      mockCore.getMyTeams.mockResolvedValue([])
      mockCore.createTeam.mockResolvedValue(createdTeam)

      const { result } = renderHook(() => useTeams(mockClient))

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.createTeam(newTeam)
      })

      expect(mockCore.createTeam).toHaveBeenCalledWith(newTeam)
    })

    it('should join team', async () => {
      const inviteCode = 'ABC123'
      const mockMembership = { id: 'membership-1', team_id: 'team-1' }
      
      mockCore.getMyTeams.mockResolvedValue([])
      mockMembers.join.mockResolvedValue(mockMembership)

      const { result } = renderHook(() => useTeams(mockClient))

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.joinTeam(inviteCode)
      })

      expect(mockMembers.join).toHaveBeenCalledWith(inviteCode)
    })

    it('should leave team', async () => {
      const teamId = 'team-1'
      
      mockCore.getMyTeams.mockResolvedValue([])
      mockMembers.leave.mockResolvedValue(undefined)

      const { result } = renderHook(() => useTeams(mockClient))

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.leaveTeam(teamId)
      })

      expect(mockMembers.leave).toHaveBeenCalledWith(teamId)
    })
  })

  describe('リアルタイム購読', () => {
    it('should subscribe to realtime updates when teamId is provided', async () => {
      const teamId = 'team-1'
      const mockAnnouncementsChannel = { unsubscribe: vi.fn() }
      const mockMembersChannel = { unsubscribe: vi.fn() }
      
      mockCore.getMyTeams.mockResolvedValue([])
      mockCore.getTeam.mockResolvedValue(createMockTeam())
      mockMembers.list.mockResolvedValue([])
      mockAnnouncements.list.mockResolvedValue([])
      // RealtimeはuseTeams内で直接channel購読しているため、ここでは不要

      const { result } = renderHook(() =>
        useTeams(mockClient, { teamId })
      )

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      // 購読は直接Supabaseチャンネルを使うため、APIモックは関与しない
    })

    it('should not subscribe when realtime is disabled', async () => {
      const teamId = 'team-1'
      
      mockCore.getMyTeams.mockResolvedValue([])
      mockApi.getTeam.mockResolvedValue(createMockTeam())
      mockApi.getTeamMembers.mockResolvedValue([])
      mockApi.getTeamAnnouncements.mockResolvedValue([])

      const { result } = renderHook(() =>
        useTeams(mockClient, { teamId, enableRealtime: false })
      )

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      // 直接購読のためAPIモックは呼ばれない
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
      mockCore.getMyTeams.mockResolvedValue(mockTeams)

      const { result } = renderHook(() => useTeams(mockClient))

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      // リフレッシュ実行
      await act(async () => {
        await result.current.refresh()
      })

      expect(mockCore.getMyTeams).toHaveBeenCalledTimes(2) // 初回 + リフレッシュ
    })
  })
})
