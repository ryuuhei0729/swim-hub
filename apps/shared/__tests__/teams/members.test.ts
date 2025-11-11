import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TeamMembersAPI } from '../../api/teams/members'
import { createSupabaseMock } from '../utils/supabase-mock'

describe('TeamMembersAPI', () => {
  let supabaseMock: ReturnType<typeof createSupabaseMock>
  let api: TeamMembersAPI

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'))
    supabaseMock = createSupabaseMock()
    api = new TeamMembersAPI(supabaseMock.client as any)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('list', () => {
    it('チームメンバー一覧を取得できる', async () => {
      const members = [{ id: 'membership-1', team_id: 'team-1', user_id: 'test-user-id' }]

      supabaseMock.queueTable('team_memberships', [{ data: members }])

      const result = await api.list('team-1')

      expect(result).toEqual(members)
      const builder = supabaseMock.getBuilderHistory('team_memberships')[0]
      expect(builder.eq).toHaveBeenCalledWith('team_id', 'team-1')
      expect(builder.eq).toHaveBeenCalledWith('is_active', true)
    })

    it('未認証の場合はエラーとなる', async () => {
      supabaseMock = createSupabaseMock({ userId: '' })
      api = new TeamMembersAPI(supabaseMock.client as any)

      await expect(api.list('team-1')).rejects.toThrow('認証が必要です')
    })
  })

  describe('join', () => {
    it('招待コードを使ってチームに参加できる', async () => {
      const membership = {
        id: 'membership-1',
        team_id: 'team-1',
        user_id: 'test-user-id',
        role: 'user',
        joined_at: '2025-01-01T00:00:00.000Z',
        is_active: true,
        left_at: null
      }

      supabaseMock.queueTable('teams', [{ data: { id: 'team-1', invite_code: 'CODE' } }])
      supabaseMock.queueTable('team_memberships', [
        {
          data: membership,
          configure: builder => {
            builder.insert.mockReturnValue(builder)
          }
        }
      ])

      const result = await api.join('CODE')

      expect(result).toEqual(membership)
      const builder = supabaseMock.getBuilderHistory('team_memberships')[0]
      expect(builder.insert).toHaveBeenCalledTimes(1)
      const inserted = builder.insert.mock.calls[0][0]
      expect(inserted).toMatchObject({
        team_id: 'team-1',
        user_id: 'test-user-id',
        role: 'user',
        is_active: true,
        left_at: null
      })
      expect(inserted.joined_at).toEqual(new Date('2025-01-01T00:00:00Z').toISOString())
    })

    it('招待コードが無効な場合はエラーとなる', async () => {
      supabaseMock.queueTable('teams', [{ data: null }])

      await expect(api.join('INVALID')).rejects.toThrow('招待コードが無効です')
    })

    it('未認証の場合はエラーとなる', async () => {
      supabaseMock = createSupabaseMock({ userId: '' })
      api = new TeamMembersAPI(supabaseMock.client as any)

      await expect(api.join('CODE')).rejects.toThrow('認証が必要です')
    })
  })

  describe('leave', () => {
    it('自身のチームメンバーシップを退会できる', async () => {
      supabaseMock.queueTable('team_memberships', [
        {
          data: null,
          configure: builder => {
            builder.update.mockReturnValue(builder)
          }
        }
      ])

      await api.leave('team-1')

      const builder = supabaseMock.getBuilderHistory('team_memberships')[0]
      expect(builder.update).toHaveBeenCalled()
      const updateArg = builder.update.mock.calls[0][0]
      expect(updateArg.is_active).toBe(false)
      expect(updateArg.left_at).toEqual(new Date('2025-01-01T00:00:00Z').toISOString())
      expect(builder.eq).toHaveBeenCalledWith('team_id', 'team-1')
      expect(builder.eq).toHaveBeenCalledWith('user_id', 'test-user-id')
    })

    it('未認証の場合はエラーとなる', async () => {
      supabaseMock = createSupabaseMock({ userId: '' })
      api = new TeamMembersAPI(supabaseMock.client as any)

      await expect(api.leave('team-1')).rejects.toThrow('認証が必要です')
    })
  })

  describe('updateRole', () => {
    it('メンバーのロールを更新できる', async () => {
      const updated = {
        id: 'membership-1',
        team_id: 'team-1',
        user_id: 'member-1',
        role: 'admin'
      }

      supabaseMock.queueTable('team_memberships', [
        {
          data: updated,
          configure: builder => {
            builder.update.mockReturnValue(builder)
          }
        }
      ])

      const result = await api.updateRole('team-1', 'member-1', 'admin')

      expect(result).toEqual(updated)
      const builder = supabaseMock.getBuilderHistory('team_memberships')[0]
      expect(builder.update).toHaveBeenCalledWith({ role: 'admin' })
      expect(builder.eq).toHaveBeenCalledWith('team_id', 'team-1')
      expect(builder.eq).toHaveBeenCalledWith('user_id', 'member-1')
    })

    it('更新時にエラーが発生した場合は例外を投げる', async () => {
      const error = new Error('update failed')
      supabaseMock.queueTable('team_memberships', [{ data: null, error }])

      await expect(api.updateRole('team-1', 'member-1', 'admin')).rejects.toThrow(error)
    })
  })

  describe('remove', () => {
    it('指定メンバーを退会させることができる', async () => {
      supabaseMock.queueTable('team_memberships', [
        {
          data: null,
          configure: builder => {
            builder.update.mockReturnValue(builder)
          }
        }
      ])

      await api.remove('team-1', 'member-1')

      const builder = supabaseMock.getBuilderHistory('team_memberships')[0]
      expect(builder.update).toHaveBeenCalled()
      expect(builder.eq).toHaveBeenCalledWith('team_id', 'team-1')
      expect(builder.eq).toHaveBeenCalledWith('user_id', 'member-1')
    })

    it('退会処理でエラーが発生した場合は例外を投げる', async () => {
      const error = new Error('remove failed')
      supabaseMock.queueTable('team_memberships', [{ data: null, error }])

      await expect(api.remove('team-1', 'member-1')).rejects.toThrow(error)
    })
  })
})


