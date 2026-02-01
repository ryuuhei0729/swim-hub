import { describe, expect, it, vi, beforeEach } from 'vitest'
import { waitFor, act } from '@testing-library/react'
import {
  createMockSupabaseClient,
  createMockTeam,
  createMockTeamMembershipWithUser,
} from '../../../__mocks__/supabase'
import { TeamCoreAPI, TeamMembersAPI, TeamAnnouncementsAPI } from '../../../api/teams'
import {
  useTeamsQuery,
  useCreateTeamMutation,
  useUpdateTeamMutation,
  useDeleteTeamMutation,
  useJoinTeamMutation,
  useLeaveTeamMutation,
  useUpdateMemberRoleMutation,
  useRemoveMemberMutation,
  useCreateAnnouncementMutation,
  useUpdateAnnouncementMutation,
  useDeleteAnnouncementMutation,
} from '../../../hooks/queries/teams'
import { renderQueryHook } from '../../utils/test-utils'
import type { TeamAnnouncement } from '../../../types'

// Team APIをモック化
vi.mock('../../../api/teams', () => ({
  TeamCoreAPI: vi.fn().mockImplementation(() => ({
    getMyTeams: vi.fn(),
    getTeam: vi.fn(),
    createTeam: vi.fn(),
    updateTeam: vi.fn(),
    deleteTeam: vi.fn(),
  })),
  TeamMembersAPI: vi.fn().mockImplementation(() => ({
    list: vi.fn(),
    join: vi.fn(),
    leave: vi.fn(),
    updateRole: vi.fn(),
    remove: vi.fn(),
  })),
  TeamAnnouncementsAPI: vi.fn().mockImplementation(() => ({
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  })),
}))

describe('Team Query Hooks', () => {
  let mockSupabase: ReturnType<typeof createMockSupabaseClient>
  let mockCoreApi: {
    getMyTeams: ReturnType<typeof vi.fn>
    getTeam: ReturnType<typeof vi.fn>
    createTeam: ReturnType<typeof vi.fn>
    updateTeam: ReturnType<typeof vi.fn>
    deleteTeam: ReturnType<typeof vi.fn>
  }
  let mockMembersApi: {
    list: ReturnType<typeof vi.fn>
    join: ReturnType<typeof vi.fn>
    leave: ReturnType<typeof vi.fn>
    updateRole: ReturnType<typeof vi.fn>
    remove: ReturnType<typeof vi.fn>
  }
  let mockAnnouncementsApi: {
    list: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    remove: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabase = createMockSupabaseClient()
    mockCoreApi = {
      getMyTeams: vi.fn(),
      getTeam: vi.fn(),
      createTeam: vi.fn(),
      updateTeam: vi.fn(),
      deleteTeam: vi.fn(),
    }
    mockMembersApi = {
      list: vi.fn(),
      join: vi.fn(),
      leave: vi.fn(),
      updateRole: vi.fn(),
      remove: vi.fn(),
    }
    mockAnnouncementsApi = {
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    }
  })

  describe('useTeamsQuery', () => {
    it('チーム一覧を取得できる', async () => {
      const mockTeams = [createMockTeamMembershipWithUser()]
      mockCoreApi.getMyTeams.mockResolvedValue(mockTeams)

      const { result } = renderQueryHook(() =>
        useTeamsQuery(mockSupabase as any, {
          enableRealtime: false,
          coreApi: mockCoreApi as unknown as TeamCoreAPI,
          membersApi: mockMembersApi as unknown as TeamMembersAPI,
          announcementsApi: mockAnnouncementsApi as unknown as TeamAnnouncementsAPI,
        })
      )

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.teams).toEqual(mockTeams)
    })

    it('teamId指定時にチーム詳細とメンバー・お知らせを取得できる', async () => {
      const mockTeams = [createMockTeamMembershipWithUser()]
      const mockTeam = { ...createMockTeam(), team_memberships: [] }
      const mockMembers = [createMockTeamMembershipWithUser()]
      const mockAnnouncements: TeamAnnouncement[] = [
        {
          id: 'ann-1',
          team_id: 'team-1',
          title: 'お知らせ1',
          content: '内容1',
          is_published: true,
          start_at: null,
          end_at: null,
          created_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
          created_by: 'user-1',
        },
      ]

      mockCoreApi.getMyTeams.mockResolvedValue(mockTeams)
      mockCoreApi.getTeam.mockResolvedValue(mockTeam)
      mockMembersApi.list.mockResolvedValue(mockMembers)
      mockAnnouncementsApi.list.mockResolvedValue(mockAnnouncements)

      const { result } = renderQueryHook(() =>
        useTeamsQuery(mockSupabase as any, {
          teamId: 'team-1',
          enableRealtime: false,
          coreApi: mockCoreApi as unknown as TeamCoreAPI,
          membersApi: mockMembersApi as unknown as TeamMembersAPI,
          announcementsApi: mockAnnouncementsApi as unknown as TeamAnnouncementsAPI,
        })
      )

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.teams).toEqual(mockTeams)
      expect(result.current.currentTeam).toEqual(mockTeam)
      expect(result.current.members).toEqual(mockMembers)
      expect(result.current.announcements).toEqual(mockAnnouncements)
    })

    it('初期データを使用できる', async () => {
      const initialTeams = [createMockTeamMembershipWithUser({ team_id: 'initial-team' })]

      const { result } = renderQueryHook(() =>
        useTeamsQuery(mockSupabase as any, {
          initialTeams,
          enableRealtime: false,
          coreApi: mockCoreApi as unknown as TeamCoreAPI,
          membersApi: mockMembersApi as unknown as TeamMembersAPI,
          announcementsApi: mockAnnouncementsApi as unknown as TeamAnnouncementsAPI,
        })
      )

      expect(result.current.teams).toEqual(initialTeams)
    })

    it('refetch関数でデータを再取得できる', async () => {
      const mockTeams = [createMockTeamMembershipWithUser()]
      mockCoreApi.getMyTeams.mockResolvedValue(mockTeams)

      const { result } = renderQueryHook(() =>
        useTeamsQuery(mockSupabase as any, {
          enableRealtime: false,
          coreApi: mockCoreApi as unknown as TeamCoreAPI,
          membersApi: mockMembersApi as unknown as TeamMembersAPI,
          announcementsApi: mockAnnouncementsApi as unknown as TeamAnnouncementsAPI,
        })
      )

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      // refetchを呼び出す
      await act(async () => {
        await result.current.refetch()
      })

      expect(mockCoreApi.getMyTeams).toHaveBeenCalledTimes(2)
    })
  })

  describe('useCreateTeamMutation', () => {
    it('チームを作成できる', async () => {
      const newTeam = { name: '新規チーム', description: '説明' }
      const createdTeam = createMockTeam({ id: 'new-team', ...newTeam })
      mockCoreApi.createTeam.mockResolvedValue(createdTeam)

      const { result } = renderQueryHook(() =>
        useCreateTeamMutation(mockSupabase as any, mockCoreApi as unknown as TeamCoreAPI)
      )

      let returnedData
      await act(async () => {
        returnedData = await result.current.mutateAsync(newTeam)
      })

      expect(mockCoreApi.createTeam).toHaveBeenCalledWith(newTeam)
      expect(returnedData).toEqual(createdTeam)
    })

    it('作成失敗時にエラーになる', async () => {
      mockCoreApi.createTeam.mockRejectedValue(new Error('Creation failed'))

      const { result } = renderQueryHook(() =>
        useCreateTeamMutation(mockSupabase as any, mockCoreApi as unknown as TeamCoreAPI)
      )

      await act(async () => {
        await expect(
          result.current.mutateAsync({ name: 'テスト', description: null })
        ).rejects.toThrow('Creation failed')
      })
    })
  })

  describe('useUpdateTeamMutation', () => {
    it('チームを更新できる', async () => {
      const updatedTeam = createMockTeam({ id: 'team-1', name: '更新後チーム' })
      mockCoreApi.updateTeam.mockResolvedValue(updatedTeam)

      const { result } = renderQueryHook(() =>
        useUpdateTeamMutation(mockSupabase as any, mockCoreApi as unknown as TeamCoreAPI)
      )

      let returnedData
      await act(async () => {
        returnedData = await result.current.mutateAsync({
          id: 'team-1',
          updates: { name: '更新後チーム' },
        })
      })

      expect(mockCoreApi.updateTeam).toHaveBeenCalledWith('team-1', { name: '更新後チーム' })
      expect(returnedData).toEqual(updatedTeam)
    })
  })

  describe('useDeleteTeamMutation', () => {
    it('チームを削除できる', async () => {
      mockCoreApi.deleteTeam.mockResolvedValue(undefined)

      const { result } = renderQueryHook(() =>
        useDeleteTeamMutation(mockSupabase as any, mockCoreApi as unknown as TeamCoreAPI)
      )

      await act(async () => {
        await result.current.mutateAsync('team-1')
      })

      expect(mockCoreApi.deleteTeam).toHaveBeenCalledWith('team-1')
    })
  })

  describe('useJoinTeamMutation', () => {
    it('招待コードでチームに参加できる', async () => {
      const membership = {
        id: 'membership-1',
        team_id: 'team-1',
        user_id: 'user-1',
        role: 'user' as const,
      }
      mockMembersApi.join.mockResolvedValue(membership)

      const { result } = renderQueryHook(() =>
        useJoinTeamMutation(mockSupabase as any, mockMembersApi as unknown as TeamMembersAPI)
      )

      let returnedData
      await act(async () => {
        returnedData = await result.current.mutateAsync('ABC123')
      })

      expect(mockMembersApi.join).toHaveBeenCalledWith('ABC123')
      expect(returnedData).toEqual(membership)
    })

    it('無効な招待コードでエラーになる', async () => {
      mockMembersApi.join.mockRejectedValue(new Error('Invalid invite code'))

      const { result } = renderQueryHook(() =>
        useJoinTeamMutation(mockSupabase as any, mockMembersApi as unknown as TeamMembersAPI)
      )

      await act(async () => {
        await expect(result.current.mutateAsync('INVALID')).rejects.toThrow(
          'Invalid invite code'
        )
      })
    })
  })

  describe('useLeaveTeamMutation', () => {
    it('チームから退出できる', async () => {
      mockMembersApi.leave.mockResolvedValue(undefined)

      const { result } = renderQueryHook(() =>
        useLeaveTeamMutation(mockSupabase as any, mockMembersApi as unknown as TeamMembersAPI)
      )

      await act(async () => {
        await result.current.mutateAsync('team-1')
      })

      expect(mockMembersApi.leave).toHaveBeenCalledWith('team-1')
    })
  })

  describe('useUpdateMemberRoleMutation', () => {
    it('メンバーのロールを更新できる', async () => {
      const updatedMembership = {
        id: 'membership-1',
        team_id: 'team-1',
        user_id: 'user-1',
        role: 'admin' as const,
      }
      mockMembersApi.updateRole.mockResolvedValue(updatedMembership)

      const { result } = renderQueryHook(() =>
        useUpdateMemberRoleMutation(mockSupabase as any, mockMembersApi as unknown as TeamMembersAPI)
      )

      await act(async () => {
        await result.current.mutateAsync({
          teamId: 'team-1',
          userId: 'user-1',
          role: 'admin',
        })
      })

      expect(mockMembersApi.updateRole).toHaveBeenCalledWith('team-1', 'user-1', 'admin')
    })
  })

  describe('useRemoveMemberMutation', () => {
    it('メンバーを削除できる', async () => {
      mockMembersApi.remove.mockResolvedValue(undefined)

      const { result } = renderQueryHook(() =>
        useRemoveMemberMutation(mockSupabase as any, mockMembersApi as unknown as TeamMembersAPI)
      )

      await act(async () => {
        await result.current.mutateAsync({
          teamId: 'team-1',
          userId: 'user-1',
        })
      })

      expect(mockMembersApi.remove).toHaveBeenCalledWith('team-1', 'user-1')
    })
  })

  describe('useCreateAnnouncementMutation', () => {
    it('お知らせを作成できる', async () => {
      const newAnnouncement = {
        team_id: 'team-1',
        title: '新規お知らせ',
        content: '内容',
        is_published: true,
        start_at: null,
        end_at: null,
        created_by: 'user-1',
      }
      const createdAnnouncement: TeamAnnouncement = {
        id: 'ann-1',
        ...newAnnouncement,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      }
      mockAnnouncementsApi.create.mockResolvedValue(createdAnnouncement)

      const { result } = renderQueryHook(() =>
        useCreateAnnouncementMutation(
          mockSupabase as any,
          mockAnnouncementsApi as unknown as TeamAnnouncementsAPI
        )
      )

      let returnedData
      await act(async () => {
        returnedData = await result.current.mutateAsync(newAnnouncement)
      })

      expect(mockAnnouncementsApi.create).toHaveBeenCalledWith(newAnnouncement)
      expect(returnedData).toEqual(createdAnnouncement)
    })
  })

  describe('useUpdateAnnouncementMutation', () => {
    it('お知らせを更新できる', async () => {
      const updatedAnnouncement: TeamAnnouncement = {
        id: 'ann-1',
        team_id: 'team-1',
        title: '更新後お知らせ',
        content: '更新内容',
        is_published: true,
        start_at: null,
        end_at: null,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-02T00:00:00Z',
        created_by: 'user-1',
      }
      mockAnnouncementsApi.update.mockResolvedValue(updatedAnnouncement)

      const { result } = renderQueryHook(() =>
        useUpdateAnnouncementMutation(
          mockSupabase as any,
          mockAnnouncementsApi as unknown as TeamAnnouncementsAPI
        )
      )

      await act(async () => {
        await result.current.mutateAsync({
          id: 'ann-1',
          input: { title: '更新後お知らせ', is_published: true },
        })
      })

      expect(mockAnnouncementsApi.update).toHaveBeenCalledWith('ann-1', {
        title: '更新後お知らせ',
        is_published: true,
      })
    })
  })

  describe('useDeleteAnnouncementMutation', () => {
    it('お知らせを削除できる', async () => {
      mockAnnouncementsApi.remove.mockResolvedValue(undefined)

      const { result } = renderQueryHook(() =>
        useDeleteAnnouncementMutation(
          mockSupabase as any,
          mockAnnouncementsApi as unknown as TeamAnnouncementsAPI
        )
      )

      await act(async () => {
        await result.current.mutateAsync('ann-1')
      })

      expect(mockAnnouncementsApi.remove).toHaveBeenCalledWith('ann-1')
    })
  })
})
