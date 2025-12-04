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
      expect(builder.eq).toHaveBeenCalledWith('status', 'approved')
      expect(builder.eq).toHaveBeenCalledWith('is_active', true)
    })

    it('未認証の場合はエラーとなる', async () => {
      supabaseMock = createSupabaseMock({ userId: '' })
      api = new TeamMembersAPI(supabaseMock.client as any)

      await expect(api.list('team-1')).rejects.toThrow('認証が必要です')
    })
  })

  describe('join', () => {
    it('招待コードを使ってチームに参加申請できる（承認待ち）', async () => {
      const membership = {
        id: 'membership-1',
        team_id: 'team-1',
        user_id: 'test-user-id',
        role: 'user',
        status: 'pending',
        joined_at: '2025-01-01T00:00:00.000Z',
        is_active: false,
        left_at: null
      }

      // 1. RPC関数でチームを取得（find_team_by_invite_code）
      const rpcMock = vi.fn().mockResolvedValue({
        data: { id: 'team-1', invite_code: 'CODE' },
        error: null
      })
      const rpcBuilder = {
        single: vi.fn().mockResolvedValue({ data: { id: 'team-1', invite_code: 'CODE' }, error: null })
      }
      rpcMock.mockReturnValue(rpcBuilder)
      supabaseMock.client.rpc = rpcMock
      // 2. team_membershipsテーブルへの2つのクエリを順番に設定
      //    - 1つ目: maybeSingle()で既存メンバーシップをチェック（存在しない場合はnull）
      //    - 2つ目: insert().select().single()で新しいメンバーシップを挿入
      supabaseMock.queueTable('team_memberships', [
        {
          // 1つ目: maybeSingle()用 - 既存メンバーシップがない場合
          data: null,
          error: null,
          configure: builder => {
            builder.maybeSingle.mockResolvedValue({ data: null, error: null })
          }
        },
        {
          // 2つ目: insert().select().single()用
          data: membership,
          configure: builder => {
            builder.insert.mockReturnValue(builder)
            builder.select.mockReturnValue(builder)
            builder.single.mockResolvedValue({ data: membership, error: null })
          }
        }
      ])

      const result = await api.join('CODE')

      expect(result).toEqual(membership)
      // maybeSingle()の呼び出しを確認
      const maybeSingleBuilder = supabaseMock.getBuilderHistory('team_memberships')[0]
      expect(maybeSingleBuilder.maybeSingle).toHaveBeenCalled()
      // insert()の呼び出しを確認
      const insertBuilder = supabaseMock.getBuilderHistory('team_memberships')[1]
      expect(insertBuilder.insert).toHaveBeenCalledTimes(1)
      const inserted = insertBuilder.insert.mock.calls[0][0]
      expect(inserted).toMatchObject({
        team_id: 'team-1',
        user_id: 'test-user-id',
        role: 'user',
        status: 'pending',
        is_active: false,
        left_at: null
      })
      expect(inserted.joined_at).toBeDefined()
    })

    it('招待コードが無効な場合はエラーとなる', async () => {
      const rpcMock = vi.fn().mockResolvedValue({
        data: null,
        error: null
      })
      const rpcBuilder = {
        single: vi.fn().mockResolvedValue({ data: null, error: null })
      }
      rpcMock.mockReturnValue(rpcBuilder)
      supabaseMock.client.rpc = rpcMock

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

  describe('listPending', () => {
    it('承認待ちのメンバーシップ一覧を取得できる', async () => {
      const pendingMembers = [
        { id: 'membership-1', team_id: 'team-1', user_id: 'user-1', status: 'pending' },
        { id: 'membership-2', team_id: 'team-1', user_id: 'user-2', status: 'pending' }
      ]

      supabaseMock.queueTable('team_memberships', [{ data: pendingMembers }])

      const result = await api.listPending('team-1')

      expect(result).toEqual(pendingMembers)
      const builder = supabaseMock.getBuilderHistory('team_memberships')[0]
      expect(builder.eq).toHaveBeenCalledWith('team_id', 'team-1')
      expect(builder.eq).toHaveBeenCalledWith('status', 'pending')
    })
  })

  describe('countPending', () => {
    it('承認待ちのメンバーシップ数を取得できる', async () => {
      supabaseMock.queueTable('team_memberships', [
        {
          data: null,
          error: null,
          configure: builder => {
            // select()が呼ばれたときにcountを含むレスポンスを返す
            builder.select.mockImplementation((columns, options) => {
              if (options && 'count' in options && options.count === 'exact') {
                // then()でcountを含むレスポンスを返す
                builder.then = (resolve: (value: { data: any; error: any; count?: number }) => any) => {
                  return Promise.resolve({ data: null, error: null, count: 3 }).then(resolve)
                }
              }
              return builder
            })
          }
        }
      ])

      const result = await api.countPending('team-1')

      expect(result).toBe(3)
      const builder = supabaseMock.getBuilderHistory('team_memberships')[0]
      expect(builder.eq).toHaveBeenCalledWith('team_id', 'team-1')
      expect(builder.eq).toHaveBeenCalledWith('status', 'pending')
    })
  })

  describe('approve', () => {
    it('承認待ちのメンバーシップを承認できる', async () => {
      const membership = {
        id: 'membership-1',
        team_id: 'team-1',
        user_id: 'user-1',
        status: 'pending'
      }

      const approvedMembership = {
        ...membership,
        status: 'approved',
        is_active: true
      }

      // 1つ目: メンバーシップを取得
      supabaseMock.queueTable('team_memberships', [
        {
          data: membership,
          configure: builder => {
            builder.single.mockResolvedValue({ data: membership, error: null })
          }
        },
        {
          // 2つ目: 更新
          data: approvedMembership,
          configure: builder => {
            builder.update.mockReturnValue(builder)
            builder.eq.mockReturnValue(builder)
            builder.select.mockReturnValue(builder)
            builder.single.mockResolvedValue({ data: approvedMembership, error: null })
          }
        }
      ])

      const result = await api.approve('membership-1')

      expect(result).toEqual(approvedMembership)
      const updateBuilder = supabaseMock.getBuilderHistory('team_memberships')[1]
      expect(updateBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'approved',
          is_active: true
        })
      )
    })

    it('承認待ちでないメンバーシップは承認できない', async () => {
      const membership = {
        id: 'membership-1',
        team_id: 'team-1',
        user_id: 'user-1',
        status: 'approved'
      }

      supabaseMock.queueTable('team_memberships', [
        {
          data: membership,
          configure: builder => {
            builder.single.mockResolvedValue({ data: membership, error: null })
          }
        }
      ])

      await expect(api.approve('membership-1')).rejects.toThrow('承認待ちのメンバーシップのみ承認できます')
    })
  })

  describe('reject', () => {
    it('承認待ちのメンバーシップを拒否できる', async () => {
      const membership = {
        id: 'membership-1',
        team_id: 'team-1',
        user_id: 'user-1',
        status: 'pending'
      }

      const rejectedMembership = {
        ...membership,
        status: 'rejected',
        is_active: false
      }

      // 1つ目: メンバーシップを取得
      supabaseMock.queueTable('team_memberships', [
        {
          data: membership,
          configure: builder => {
            builder.single.mockResolvedValue({ data: membership, error: null })
          }
        },
        {
          // 2つ目: 更新
          data: rejectedMembership,
          configure: builder => {
            builder.update.mockReturnValue(builder)
            builder.eq.mockReturnValue(builder)
            builder.select.mockReturnValue(builder)
            builder.single.mockResolvedValue({ data: rejectedMembership, error: null })
          }
        }
      ])

      const result = await api.reject('membership-1')

      expect(result).toEqual(rejectedMembership)
      const updateBuilder = supabaseMock.getBuilderHistory('team_memberships')[1]
      expect(updateBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'rejected',
          is_active: false
        })
      )
    })

    it('承認待ちでないメンバーシップは拒否できない', async () => {
      const membership = {
        id: 'membership-1',
        team_id: 'team-1',
        user_id: 'user-1',
        status: 'approved'
      }

      supabaseMock.queueTable('team_memberships', [
        {
          data: membership,
          configure: builder => {
            builder.single.mockResolvedValue({ data: membership, error: null })
          }
        }
      ])

      await expect(api.reject('membership-1')).rejects.toThrow('承認待ちのメンバーシップのみ拒否できます')
    })
  })

  describe('join - 再申請', () => {
    it('拒否されたメンバーシップは再申請できる', async () => {
      const rejectedMembership = {
        id: 'membership-1',
        team_id: 'team-1',
        user_id: 'test-user-id',
        status: 'rejected',
        is_active: false
      }

      const updatedMembership = {
        ...rejectedMembership,
        status: 'pending',
        is_active: false
      }

      // 1. RPC関数でチームを取得
      const rpcMock = vi.fn().mockResolvedValue({
        data: { id: 'team-1', invite_code: 'CODE' },
        error: null
      })
      const rpcBuilder = {
        single: vi.fn().mockResolvedValue({ data: { id: 'team-1', invite_code: 'CODE' }, error: null })
      }
      rpcMock.mockReturnValue(rpcBuilder)
      supabaseMock.client.rpc = rpcMock

      // 2. 既存メンバーシップを取得（拒否済み）
      supabaseMock.queueTable('team_memberships', [
        {
          data: rejectedMembership,
          configure: builder => {
            builder.maybeSingle.mockResolvedValue({ data: rejectedMembership, error: null })
          }
        },
        {
          // 3. 更新（pendingに変更）
          data: updatedMembership,
          configure: builder => {
            builder.update.mockReturnValue(builder)
            builder.eq.mockReturnValue(builder)
            builder.select.mockReturnValue(builder)
            builder.single.mockResolvedValue({ data: updatedMembership, error: null })
          }
        }
      ])

      const result = await api.join('CODE')

      expect(result).toEqual(updatedMembership)
      const updateBuilder = supabaseMock.getBuilderHistory('team_memberships')[1]
      expect(updateBuilder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'pending',
          is_active: false
        })
      )
    })
  })
})


