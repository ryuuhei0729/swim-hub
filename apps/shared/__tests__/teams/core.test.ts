import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createMockQueryBuilder,
  createMockSupabaseClient,
  type MockQueryBuilder
} from '../../__mocks__/supabase'
import { TeamCoreAPI } from '../../api/teams/core'

type TableResponse = {
  data: any
  error?: unknown
  configure?: (builder: MockQueryBuilder) => void
}

const createSupabaseMock = (options: { userId?: string } = {}) => {
  const { userId } = options
  const client = createMockSupabaseClient({ userId })
  const tableQueues = new Map<string, TableResponse[]>()
  const builderHistory = new Map<string, MockQueryBuilder[]>()

  client.from = vi.fn((table: string) => {
    const queue = tableQueues.get(table) ?? []
    const response =
      queue.length > 0
        ? queue.shift()!
        : {
            data: [],
            error: null
          }

    const builder = createMockQueryBuilder(response.data, response.error ?? null)
    response.configure?.(builder)

    const history = builderHistory.get(table) ?? []
    history.push(builder)
    builderHistory.set(table, history)

    return builder
  })

  return {
    client,
    queueTable: (table: string, responses: TableResponse[]) => {
      tableQueues.set(table, [...responses])
    },
    getBuilderHistory: (table: string) => builderHistory.get(table) ?? []
  }
}

describe('TeamCoreAPI', () => {
  let supabaseMock: ReturnType<typeof createSupabaseMock>
  let api: TeamCoreAPI

  beforeEach(() => {
    vi.clearAllMocks()
    supabaseMock = createSupabaseMock()
    api = new TeamCoreAPI(supabaseMock.client as any)
  })

  describe('getMyTeams', () => {
    it('自身のチームメンバーシップ一覧を取得できる', async () => {
      const memberships = [{ id: 'membership-1', team_id: 'team-1', user_id: 'test-user-id' }]

      supabaseMock.queueTable('team_memberships', [{ data: memberships }])

      const result = await api.getMyTeams()

      expect(result).toEqual(memberships)
      const builder = supabaseMock.getBuilderHistory('team_memberships')[0]
      expect(builder.eq).toHaveBeenCalledWith('user_id', 'test-user-id')
      expect(builder.eq).toHaveBeenCalledWith('is_active', true)
    })

    it('未認証の場合はエラーとなる', async () => {
      supabaseMock = createSupabaseMock({ userId: '' })
      api = new TeamCoreAPI(supabaseMock.client as any)

      await expect(api.getMyTeams()).rejects.toThrow('認証が必要です')
    })
  })

  describe('getTeam', () => {
    it('チームの詳細を取得できる', async () => {
      const team = {
        id: 'team-1',
        name: 'テストチーム',
        team_memberships: []
      }

      supabaseMock.queueTable('team_memberships', [{ data: { id: 'membership-1' } }])
      supabaseMock.queueTable('teams', [{ data: team }])

      const result = await api.getTeam('team-1')

      expect(result).toEqual(team)
    })

    it('チームメンバーでない場合はエラーとなる', async () => {
      supabaseMock.queueTable('team_memberships', [{ data: null }])

      await expect(api.getTeam('team-1')).rejects.toThrow('チームへのアクセス権限がありません')
    })

    it('未認証の場合はエラーとなる', async () => {
      supabaseMock = createSupabaseMock({ userId: '' })
      api = new TeamCoreAPI(supabaseMock.client as any)

      await expect(api.getTeam('team-1')).rejects.toThrow('認証が必要です')
    })
  })

  describe('createTeam', () => {
    it('チームを作成できる', async () => {
      const input = {
        name: '新チーム',
        description: '説明',
        created_by: 'test-user-id'
      }
      const created = {
        id: 'team-1',
        invite_code: 'CODE',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
        ...input
      }

      supabaseMock.queueTable('teams', [
        {
          data: created,
          configure: builder => {
            builder.insert.mockReturnValue(builder)
          }
        }
      ])

      const result = await api.createTeam(input as any)

      expect(result).toEqual(created)
      const builder = supabaseMock.getBuilderHistory('teams')[0]
      expect(builder.insert).toHaveBeenCalledWith(input)
    })

    it('未認証の場合はエラーとなる', async () => {
      supabaseMock = createSupabaseMock({ userId: '' })
      api = new TeamCoreAPI(supabaseMock.client as any)

      await expect(api.createTeam({ name: '新チーム', description: '説明' } as any)).rejects.toThrow(
        '認証が必要です'
      )
    })
  })

  describe('updateTeam', () => {
    it('チーム情報を更新できる', async () => {
      const updated = {
        id: 'team-1',
        name: '更新後チーム',
        description: '更新後説明'
      }

      supabaseMock.queueTable('teams', [
        {
          data: updated,
          configure: builder => {
            builder.update.mockReturnValue(builder)
          }
        }
      ])

      const result = await api.updateTeam('team-1', { name: '更新後チーム' })

      expect(result).toEqual(updated)
      const builder = supabaseMock.getBuilderHistory('teams')[0]
      expect(builder.update).toHaveBeenCalledWith({ name: '更新後チーム' })
      expect(builder.eq).toHaveBeenCalledWith('id', 'team-1')
    })

    it('更新時にエラーが発生した場合は例外を投げる', async () => {
      const error = new Error('update failed')
      supabaseMock.queueTable('teams', [{ data: null, error }])

      await expect(api.updateTeam('team-1', { name: 'NG' })).rejects.toThrow(error)
    })
  })

  describe('deleteTeam', () => {
    it('チームを削除できる', async () => {
      supabaseMock.queueTable('teams', [
        {
          data: null,
          configure: builder => {
            builder.delete.mockReturnValue(builder)
          }
        }
      ])

      await api.deleteTeam('team-1')

      const builder = supabaseMock.getBuilderHistory('teams')[0]
      expect(builder.delete).toHaveBeenCalled()
      expect(builder.eq).toHaveBeenCalledWith('id', 'team-1')
    })

    it('削除時にエラーが発生した場合は例外を投げる', async () => {
      const error = new Error('delete failed')
      supabaseMock.queueTable('teams', [{ data: null, error }])

      await expect(api.deleteTeam('team-1')).rejects.toThrow(error)
    })
  })
})


