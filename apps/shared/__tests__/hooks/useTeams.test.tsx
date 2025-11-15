import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockSupabaseClient, createMockTeam } from '../../__mocks__/supabase'
import { TeamAnnouncementsAPI, TeamCoreAPI, TeamMembersAPI } from '../../api/teams'
import { useTeams } from '../../hooks/useTeams'

type CoreApiMock = {
  getMyTeams: ReturnType<typeof vi.fn>
  getTeam: ReturnType<typeof vi.fn>
  createTeam: ReturnType<typeof vi.fn>
  updateTeam: ReturnType<typeof vi.fn>
  deleteTeam: ReturnType<typeof vi.fn>
}

type MembersApiMock = {
  list: ReturnType<typeof vi.fn>
  join: ReturnType<typeof vi.fn>
  leave: ReturnType<typeof vi.fn>
  updateRole: ReturnType<typeof vi.fn>
  remove: ReturnType<typeof vi.fn>
}

type AnnouncementsApiMock = {
  list: ReturnType<typeof vi.fn>
  create: ReturnType<typeof vi.fn>
  update: ReturnType<typeof vi.fn>
  remove: ReturnType<typeof vi.fn>
}

describe('useTeams', () => {
  let mockClient: any
  let coreApiMock: CoreApiMock
  let membersApiMock: MembersApiMock
  let announcementsApiMock: AnnouncementsApiMock

  const createOptions = (overrides: Parameters<typeof useTeams>[1] = {}) => ({
    coreApi: coreApiMock as unknown as TeamCoreAPI,
    membersApi: membersApiMock as unknown as TeamMembersAPI,
    announcementsApi: announcementsApiMock as unknown as TeamAnnouncementsAPI,
    ...overrides,
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockClient = createMockSupabaseClient()
    coreApiMock = {
      getMyTeams: vi.fn(),
      getTeam: vi.fn(),
      createTeam: vi.fn(),
      updateTeam: vi.fn(),
      deleteTeam: vi.fn(),
    }
    membersApiMock = {
      list: vi.fn(),
      join: vi.fn(),
      leave: vi.fn(),
      updateRole: vi.fn(),
      remove: vi.fn(),
    }
    announcementsApiMock = {
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    }
  })

  describe('初期化', () => {
    it('should initialize with loading state', async () => {
      const mockTeams = [{ id: 'team-1', team: createMockTeam() }]
      coreApiMock.getMyTeams.mockResolvedValue(mockTeams)

      const { result } = renderHook(() => useTeams(mockClient, createOptions()))

      await act(async () => {
        expect(result.current.loading).toBe(true)
        expect(result.current.teams).toEqual([])
        expect(result.current.currentTeam).toBeNull()
        expect(result.current.error).toBeNull()
      })
    })

    it('should load teams on mount', async () => {
      const mockTeams = [{ id: 'team-1', team: createMockTeam() }]
      coreApiMock.getMyTeams.mockResolvedValue(mockTeams)

      const { result } = renderHook(() => useTeams(mockClient, createOptions()))

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(coreApiMock.getMyTeams).toHaveBeenCalled()
      expect(result.current.teams).toEqual(mockTeams)
    })
  })

  describe('特定チームのデータ取得', () => {
    it('should load team details when teamId is provided', async () => {
      const teamId = 'team-1'
      const mockTeam = createMockTeam()
      const membersResponse = [{ id: 'member-1', user: { name: 'テストユーザー' } }]
      const announcementsResponse = [{ id: 'ann-1', title: 'テストお知らせ' }]

      coreApiMock.getMyTeams.mockResolvedValue([])
      coreApiMock.getTeam.mockResolvedValue(mockTeam)
      membersApiMock.list.mockResolvedValue(membersResponse)
      announcementsApiMock.list.mockResolvedValue(announcementsResponse)

      const { result } = renderHook(() =>
        useTeams(mockClient, createOptions({ teamId }))
      )

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(coreApiMock.getTeam).toHaveBeenCalledWith(teamId)
      expect(membersApiMock.list).toHaveBeenCalledWith(teamId)
      expect(announcementsApiMock.list).toHaveBeenCalledWith(teamId)
      expect(result.current.currentTeam).toEqual(mockTeam)
      expect(result.current.members).toEqual(membersResponse)
      expect(result.current.announcements).toEqual(announcementsResponse)
    })

    it('should handle team access error', async () => {
      const teamId = 'team-1'
      const error = new Error('チームへのアクセス権限がありません')

      coreApiMock.getMyTeams.mockResolvedValue([])
      coreApiMock.getTeam.mockRejectedValue(error)

      const { result } = renderHook(() =>
        useTeams(mockClient, createOptions({ teamId }))
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
      
      coreApiMock.getMyTeams.mockResolvedValue([])
      coreApiMock.createTeam.mockResolvedValue(createdTeam)

      const { result } = renderHook(() => useTeams(mockClient, createOptions()))

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.createTeam(newTeam)
      })

      expect(coreApiMock.createTeam).toHaveBeenCalledWith(newTeam)
    })

    it('should join team', async () => {
      const inviteCode = 'ABC123'
      const membership = { id: 'membership-1', team_id: 'team-1' }
      
      coreApiMock.getMyTeams.mockResolvedValue([])
      membersApiMock.join.mockResolvedValue(membership)

      const { result } = renderHook(() => useTeams(mockClient, createOptions()))

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.joinTeam(inviteCode)
      })

      expect(membersApiMock.join).toHaveBeenCalledWith(inviteCode)
    })

    it('should leave team', async () => {
      const teamId = 'team-1'
      
      coreApiMock.getMyTeams.mockResolvedValue([])
      membersApiMock.leave.mockResolvedValue(undefined)

      const { result } = renderHook(() => useTeams(mockClient, createOptions()))

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      await act(async () => {
        await result.current.leaveTeam(teamId)
      })

      expect(membersApiMock.leave).toHaveBeenCalledWith(teamId)
    })
  })

  describe('リアルタイム購読', () => {
    it('should subscribe to realtime updates when teamId is provided', async () => {
      const teamId = 'team-1'

      coreApiMock.getMyTeams.mockResolvedValue([])
      coreApiMock.getTeam.mockResolvedValue(createMockTeam())
      membersApiMock.list.mockResolvedValue([])
      announcementsApiMock.list.mockResolvedValue([])

      const { result, unmount } = renderHook(() =>
        useTeams(mockClient, createOptions({ teamId }))
      )

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(mockClient.channel).toHaveBeenCalledWith(`team-announcements-${teamId}`)
      expect(mockClient.channel).toHaveBeenCalledWith(`team-members-${teamId}`)

      const [annChannel, memberChannel] = mockClient.channel.mock.results.map(
        (call: any) => call.value
      )

      expect(annChannel.subscribe).toHaveBeenCalled()
      expect(memberChannel.subscribe).toHaveBeenCalled()

      unmount()
      expect(mockClient.removeChannel).toHaveBeenCalledWith(annChannel)
      expect(mockClient.removeChannel).toHaveBeenCalledWith(memberChannel)
    })

    it('should not subscribe when realtime is disabled', async () => {
      const teamId = 'team-1'
      
      coreApiMock.getMyTeams.mockResolvedValue([])
      coreApiMock.getTeam.mockResolvedValue(createMockTeam())
      membersApiMock.list.mockResolvedValue([])
      announcementsApiMock.list.mockResolvedValue([])

      const { result } = renderHook(() =>
        useTeams(mockClient, createOptions({ teamId, enableRealtime: false }))
      )

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(mockClient.channel).not.toHaveBeenCalled()
    })

    it('should not subscribe when teamId is not provided', async () => {
      coreApiMock.getMyTeams.mockResolvedValue([])

      const { result } = renderHook(() => useTeams(mockClient, createOptions()))

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      expect(mockClient.channel).not.toHaveBeenCalled()
    })
  })

  describe('リフレッシュ', () => {
    it('should refresh data', async () => {
      const mockTeams = [{ id: 'team-1', team: createMockTeam() }]
      coreApiMock.getMyTeams.mockResolvedValue(mockTeams)

      const { result } = renderHook(() => useTeams(mockClient, createOptions()))

      await waitFor(() => {
        expect(result.current.loading).toBe(false)
      })

      // リフレッシュ実行
      await act(async () => {
        await result.current.refresh()
      })

      expect(coreApiMock.getMyTeams).toHaveBeenCalledTimes(2) // 初回 + リフレッシュ
    })
  })
})
