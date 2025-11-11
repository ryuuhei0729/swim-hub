import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TeamRecordsAPI } from '../../api/teams/records'
import { createSupabaseMock } from '../utils/supabase-mock'

describe('TeamRecordsAPI', () => {
  let supabaseMock: ReturnType<typeof createSupabaseMock>
  let api: TeamRecordsAPI

  beforeEach(() => {
    vi.clearAllMocks()
    supabaseMock = createSupabaseMock()
    api = new TeamRecordsAPI(supabaseMock.client as any)
  })

  describe('list', () => {
    it('チーム大会一覧を取得できる', async () => {
      const competitions = [{ id: 'competition-1', team_id: 'team-1' }]
      supabaseMock.queueTable('competitions', [{ data: competitions }])

      const result = await api.list('team-1')

      expect(result).toEqual(competitions)
      const builder = supabaseMock.getBuilderHistory('competitions')[0]
      expect(builder.eq).toHaveBeenCalledWith('team_id', 'team-1')
      expect(builder.order).toHaveBeenCalledWith('date', { ascending: false })
    })

    it('取得時にエラーが発生した場合は例外を投げる', async () => {
      const error = new Error('fetch failed')
      supabaseMock.queueTable('competitions', [{ data: null, error }])

      await expect(api.list('team-1')).rejects.toThrow(error)
    })
  })

  describe('create', () => {
    it('チーム大会を作成できる', async () => {
      const input = {
        user_id: 'test-user-id',
        title: '大会',
        date: '2025-02-01',
        place: 'プール',
        pool_type: 0,
        team_id: 'team-1'
      }
      const created = { id: 'competition-1', ...input }

      supabaseMock.queueTable('competitions', [
        {
          data: created,
          configure: builder => {
            builder.insert.mockReturnValue(builder)
          }
        }
      ])

      const result = await api.create(input as any)

      expect(result).toEqual(created)
      const builder = supabaseMock.getBuilderHistory('competitions')[0]
      expect(builder.insert).toHaveBeenCalledWith(input)
    })

    it('作成時にエラーが発生した場合は例外を投げる', async () => {
      const error = new Error('insert failed')
      supabaseMock.queueTable('competitions', [{ data: null, error }])

      await expect(
        api.create({
          user_id: 'test-user-id',
          title: '大会',
          date: '2025-02-01',
          place: 'プール',
          pool_type: 0,
          team_id: 'team-1'
        } as any)
      ).rejects.toThrow(error)
    })
  })

  describe('update', () => {
    it('チーム大会を更新できる', async () => {
      const updated = { id: 'competition-1', title: '更新後タイトル' }

      supabaseMock.queueTable('competitions', [
        {
          data: updated,
          configure: builder => {
            builder.update.mockReturnValue(builder)
          }
        }
      ])

      const result = await api.update('competition-1', { title: '更新後タイトル' })

      expect(result).toEqual(updated)
      const builder = supabaseMock.getBuilderHistory('competitions')[0]
      expect(builder.update).toHaveBeenCalledWith({ title: '更新後タイトル' })
      expect(builder.eq).toHaveBeenCalledWith('id', 'competition-1')
    })

    it('更新時にエラーが発生した場合は例外を投げる', async () => {
      const error = new Error('update failed')
      supabaseMock.queueTable('competitions', [{ data: null, error }])

      await expect(api.update('competition-1', { title: 'NG' })).rejects.toThrow(error)
    })
  })

  describe('remove', () => {
    it('チーム大会を削除できる', async () => {
      supabaseMock.queueTable('competitions', [
        {
          data: null,
          configure: builder => {
            builder.delete.mockReturnValue(builder)
          }
        }
      ])

      await api.remove('competition-1')

      const builder = supabaseMock.getBuilderHistory('competitions')[0]
      expect(builder.delete).toHaveBeenCalled()
      expect(builder.eq).toHaveBeenCalledWith('id', 'competition-1')
    })

    it('削除時にエラーが発生した場合は例外を投げる', async () => {
      const error = new Error('delete failed')
      supabaseMock.queueTable('competitions', [{ data: null, error }])

      await expect(api.remove('competition-1')).rejects.toThrow(error)
    })
  })
})


