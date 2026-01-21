import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockSupabaseClient, createMockTeam, createMockTeamMembershipWithUser } from '../../__mocks__/supabase'
import type { MockSupabaseClient } from '../../__mocks__/types'
import { TeamCoreAPI, TeamMembersAPI, TeamAnnouncementsAPI } from '../../api/teams'
import { useTeamsQuery, useCreateTeamMutation, useUpdateTeamMutation, useDeleteTeamMutation } from '../../hooks/queries/teams'
import React from 'react'

// React Queryのテスト用ラッパー
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('useTeamsQuery', () => {
  let mockClient: MockSupabaseClient
  let mockCoreApi: TeamCoreAPI
  let mockMembersApi: TeamMembersAPI
  let mockAnnouncementsApi: TeamAnnouncementsAPI

  beforeEach(() => {
    vi.clearAllMocks()
    mockClient = createMockSupabaseClient()
    mockCoreApi = new TeamCoreAPI(mockClient)
    mockMembersApi = new TeamMembersAPI(mockClient)
    mockAnnouncementsApi = new TeamAnnouncementsAPI(mockClient)
  })

  it('チーム一覧を取得できる', async () => {
    const mockMembership = createMockTeamMembershipWithUser()
    vi.spyOn(mockCoreApi, 'getMyTeams').mockResolvedValue([mockMembership])

    const { result } = renderHook(
      () => useTeamsQuery(mockClient, {
        coreApi: mockCoreApi,
        membersApi: mockMembersApi,
        announcementsApi: mockAnnouncementsApi
      }),
      { wrapper: createWrapper() }
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.teams).toEqual([mockMembership])
    expect(mockCoreApi.getMyTeams).toHaveBeenCalled()
  })

  it('teamIdを指定してチーム詳細を取得できる', async () => {
    const mockTeam = createMockTeam()
    vi.spyOn(mockCoreApi, 'getMyTeams').mockResolvedValue([])
    vi.spyOn(mockCoreApi, 'getTeam').mockResolvedValue({
      ...mockTeam,
      team_memberships: []
    })
    vi.spyOn(mockMembersApi, 'list').mockResolvedValue([])
    vi.spyOn(mockAnnouncementsApi, 'list').mockResolvedValue([])

    const { result } = renderHook(
      () => useTeamsQuery(mockClient, {
        teamId: mockTeam.id,
        coreApi: mockCoreApi,
        membersApi: mockMembersApi,
        announcementsApi: mockAnnouncementsApi
      }),
      { wrapper: createWrapper() }
    )

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.currentTeam).toBeTruthy()
    expect(mockCoreApi.getTeam).toHaveBeenCalledWith(mockTeam.id)
  })
})

describe('useCreateTeamMutation', () => {
  let mockClient: MockSupabaseClient
  let mockCoreApi: TeamCoreAPI

  beforeEach(() => {
    vi.clearAllMocks()
    mockClient = createMockSupabaseClient()
    mockCoreApi = new TeamCoreAPI(mockClient)
  })

  it('チームを作成できる', async () => {
    const newTeam = {
      name: 'テストチーム',
      description: 'テストチームの説明',
    }
    const createdTeam = createMockTeam(newTeam)
    vi.spyOn(mockCoreApi, 'createTeam').mockResolvedValue(createdTeam)

    const { result } = renderHook(
      () => useCreateTeamMutation(mockClient, mockCoreApi),
      { wrapper: createWrapper() }
    )

    await result.current.mutateAsync(newTeam)

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockCoreApi.createTeam).toHaveBeenCalledWith(newTeam)
  })
})

describe('useUpdateTeamMutation', () => {
  let mockClient: MockSupabaseClient
  let mockCoreApi: TeamCoreAPI

  beforeEach(() => {
    vi.clearAllMocks()
    mockClient = createMockSupabaseClient()
    mockCoreApi = new TeamCoreAPI(mockClient)
  })

  it('チームを更新できる', async () => {
    const updates = {
      name: '更新されたチーム名'
    }
    const updatedTeam = createMockTeam(updates)
    vi.spyOn(mockCoreApi, 'updateTeam').mockResolvedValue(updatedTeam)

    const { result } = renderHook(
      () => useUpdateTeamMutation(mockClient, mockCoreApi),
      { wrapper: createWrapper() }
    )

    await result.current.mutateAsync({ id: 'team-id', updates })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockCoreApi.updateTeam).toHaveBeenCalledWith('team-id', updates)
  })
})

describe('useDeleteTeamMutation', () => {
  let mockClient: MockSupabaseClient
  let mockCoreApi: TeamCoreAPI

  beforeEach(() => {
    vi.clearAllMocks()
    mockClient = createMockSupabaseClient()
    mockCoreApi = new TeamCoreAPI(mockClient)
  })

  it('チームを削除できる', async () => {
    vi.spyOn(mockCoreApi, 'deleteTeam').mockResolvedValue(undefined)

    const { result } = renderHook(
      () => useDeleteTeamMutation(mockClient, mockCoreApi),
      { wrapper: createWrapper() }
    )

    await result.current.mutateAsync('team-id')

    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(mockCoreApi.deleteTeam).toHaveBeenCalledWith('team-id')
  })
})

