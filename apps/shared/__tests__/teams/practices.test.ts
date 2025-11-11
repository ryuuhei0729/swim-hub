import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createMockQueryBuilder,
  createMockSupabaseClient,
  type MockQueryBuilder
} from '../../__mocks__/supabase'
import { TeamPracticesAPI } from '../../api/teams/practices'

type TableResponse = {
  data: any
  error?: unknown
  configure?: (builder: MockQueryBuilder) => void
}

const createSupabaseMock = () => {
  const client = createMockSupabaseClient()
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

describe('TeamPracticesAPI', () => {
  let supabaseMock: ReturnType<typeof createSupabaseMock>
  let api: TeamPracticesAPI

  beforeEach(() => {
    vi.clearAllMocks()
    supabaseMock = createSupabaseMock()
    api = new TeamPracticesAPI(supabaseMock.client as any)
  })

  describe('list', () => {
    it('チーム練習一覧を取得できる', async () => {
      const practices = [{ id: 'practice-1', team_id: 'team-1' }]
      supabaseMock.queueTable('practices', [{ data: practices }])

      const result = await api.list('team-1')

      expect(result).toEqual(practices)
      const builder = supabaseMock.getBuilderHistory('practices')[0]
      expect(builder.eq).toHaveBeenCalledWith('team_id', 'team-1')
      expect(builder.order).toHaveBeenCalledWith('date', { ascending: false })
    })

    it('取得時にエラーが発生した場合は例外を投げる', async () => {
      const error = new Error('fetch failed')
      supabaseMock.queueTable('practices', [{ data: null, error }])

      await expect(api.list('team-1')).rejects.toThrow(error)
    })
  })

  describe('create', () => {
    it('チーム練習を作成できる', async () => {
      const input = {
        user_id: 'test-user-id',
        date: '2025-01-01',
        place: 'プール',
        note: null,
        team_id: 'team-1'
      }
      const created = { id: 'practice-1', ...input }

      supabaseMock.queueTable('practices', [
        {
          data: created,
          configure: builder => {
            builder.insert.mockReturnValue(builder)
          }
        }
      ])

      const result = await api.create(input as any)

      expect(result).toEqual(created)
      const builder = supabaseMock.getBuilderHistory('practices')[0]
      expect(builder.insert).toHaveBeenCalledWith(input)
    })

    it('作成時にエラーが発生した場合は例外を投げる', async () => {
      const error = new Error('insert failed')
      supabaseMock.queueTable('practices', [{ data: null, error }])

      await expect(
        api.create({
          user_id: 'test-user-id',
          date: '2025-01-01',
          place: 'プール',
          note: null,
          team_id: 'team-1'
        } as any)
      ).rejects.toThrow(error)
    })
  })

  describe('update', () => {
    it('チーム練習を更新できる', async () => {
      const updated = { id: 'practice-1', note: '更新後メモ' }

      supabaseMock.queueTable('practices', [
        {
          data: updated,
          configure: builder => {
            builder.update.mockReturnValue(builder)
          }
        }
      ])

      const result = await api.update('practice-1', { note: '更新後メモ' })

      expect(result).toEqual(updated)
      const builder = supabaseMock.getBuilderHistory('practices')[0]
      expect(builder.update).toHaveBeenCalledWith({ note: '更新後メモ' })
      expect(builder.eq).toHaveBeenCalledWith('id', 'practice-1')
    })

    it('更新時にエラーが発生した場合は例外を投げる', async () => {
      const error = new Error('update failed')
      supabaseMock.queueTable('practices', [{ data: null, error }])

      await expect(api.update('practice-1', { note: 'NG' })).rejects.toThrow(error)
    })
  })

  describe('remove', () => {
    it('チーム練習を削除できる', async () => {
      supabaseMock.queueTable('practices', [
        {
          data: null,
          configure: builder => {
            builder.delete.mockReturnValue(builder)
          }
        }
      ])

      await api.remove('practice-1')

      const builder = supabaseMock.getBuilderHistory('practices')[0]
      expect(builder.delete).toHaveBeenCalled()
      expect(builder.eq).toHaveBeenCalledWith('id', 'practice-1')
    })

    it('削除時にエラーが発生した場合は例外を投げる', async () => {
      const error = new Error('delete failed')
      supabaseMock.queueTable('practices', [{ data: null, error }])

      await expect(api.remove('practice-1')).rejects.toThrow(error)
    })
  })
})


