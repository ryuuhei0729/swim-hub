import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TeamAnnouncementsAPI } from '../../api/teams/announcements'
import { createSupabaseMock } from '../utils/supabase-mock'

describe('TeamAnnouncementsAPI', () => {
  let supabaseMock: ReturnType<typeof createSupabaseMock>
  let api: TeamAnnouncementsAPI

  beforeEach(() => {
    vi.clearAllMocks()
    supabaseMock = createSupabaseMock()
    api = new TeamAnnouncementsAPI(supabaseMock.client as any)
  })

  describe('list', () => {
    it('チームお知らせ一覧を取得できる', async () => {
      const announcements = [
        { id: 'announcement-1', team_id: 'team-1', title: '連絡1' },
        { id: 'announcement-2', team_id: 'team-1', title: '連絡2' }
      ]

      supabaseMock.queueTable('team_memberships', [{ data: { id: 'membership-1' } }])
      supabaseMock.queueTable('announcements', [{ data: announcements }])

      const result = await api.list('team-1')

      expect(result).toEqual(announcements)
    })

    it('未認証の場合はエラーとなる', async () => {
      supabaseMock = createSupabaseMock({ userId: '' })
      api = new TeamAnnouncementsAPI(supabaseMock.client as any)

      await expect(api.list('team-1')).rejects.toThrow('認証が必要です')
    })

    it('チームメンバーでない場合はエラーとなる', async () => {
      supabaseMock.queueTable('team_memberships', [{ data: null }])

      await expect(api.list('team-1')).rejects.toThrow('チームへのアクセス権限がありません')
    })
  })

  describe('create', () => {
    it('管理者はお知らせを作成できる', async () => {
      const input = {
        team_id: 'team-1',
        title: '新しいお知らせ',
        content: '内容です',
        is_published: true,
        published_at: '2025-01-01T00:00:00Z'
      }

      const createInput = {
        ...input,
        created_by: 'another-user'
      }

      const created = { id: 'announcement-1', ...input, created_by: 'test-user-id' }

      supabaseMock.queueTable('team_memberships', [{ data: { role: 'admin' } }])
      supabaseMock.queueTable('announcements', [
        {
          data: created,
          configure: builder => {
            builder.insert.mockReturnValue(builder)
          }
        }
      ])

      const result = await api.create(createInput)

      expect(result).toEqual(created)
      const builder = supabaseMock.getBuilderHistory('announcements')[0]
      expect(builder.insert).toHaveBeenCalledWith({
        ...createInput,
        created_by: 'test-user-id'
      })
    })

    it('未認証の場合はエラーとなる', async () => {
      supabaseMock = createSupabaseMock({ userId: '' })
      api = new TeamAnnouncementsAPI(supabaseMock.client as any)

      await expect(
        api.create({
          team_id: 'team-1',
          title: 'タイトル',
          content: '本文',
          is_published: false,
          published_at: null,
          created_by: 'dummy'
        })
      ).rejects.toThrow('認証が必要です')
    })

    it('管理者以外はお知らせを作成できない', async () => {
      supabaseMock.queueTable('team_memberships', [{ data: { role: 'user' } }])

      await expect(
        api.create({
          team_id: 'team-1',
          title: 'タイトル',
          content: '本文',
          is_published: false,
          published_at: null,
          created_by: 'dummy'
        })
      ).rejects.toThrow('お知らせの作成権限がありません')
    })
  })

  describe('update', () => {
    it('管理者はお知らせを更新できる', async () => {
      const updated = {
        id: 'announcement-1',
        team_id: 'team-1',
        title: '更新後タイトル',
        content: '更新後コンテンツ',
        is_published: true,
        published_at: '2025-01-02T00:00:00Z'
      }

      supabaseMock.queueTable('announcements', [
        { data: { team_id: 'team-1' } },
        {
          data: updated,
          configure: builder => {
            builder.update.mockReturnValue(builder)
          }
        }
      ])
      supabaseMock.queueTable('team_memberships', [{ data: { role: 'admin' } }])

      const result = await api.update('announcement-1', {
        title: '更新後タイトル',
        content: '更新後コンテンツ'
      })

      expect(result).toEqual(updated)
      const builder = supabaseMock.getBuilderHistory('announcements')[1]
      expect(builder.update).toHaveBeenCalledWith({
        title: '更新後タイトル',
        content: '更新後コンテンツ'
      })
      expect(builder.eq).toHaveBeenCalledWith('id', 'announcement-1')
    })

    it('対象のお知らせが存在しない場合はエラー', async () => {
      supabaseMock.queueTable('announcements', [{ data: null }])

      await expect(api.update('announcement-1', { title: '更新' })).rejects.toThrow(
        'お知らせが見つかりません'
      )
    })

    it('管理者以外はお知らせを更新できない', async () => {
      supabaseMock.queueTable('announcements', [{ data: { team_id: 'team-1' } }])
      supabaseMock.queueTable('team_memberships', [{ data: { role: 'user' } }])

      await expect(api.update('announcement-1', { title: '更新' })).rejects.toThrow(
        'お知らせの更新権限がありません'
      )
    })

    it('未認証の場合はエラーとなる', async () => {
      supabaseMock = createSupabaseMock({ userId: '' })
      api = new TeamAnnouncementsAPI(supabaseMock.client as any)

      await expect(api.update('announcement-1', { title: '更新' })).rejects.toThrow('認証が必要です')
    })
  })

  describe('remove', () => {
    it('管理者はお知らせを削除できる', async () => {
      supabaseMock.queueTable('announcements', [
        { data: { team_id: 'team-1' } },
        {
          data: null,
          configure: builder => {
            builder.delete.mockReturnValue(builder)
          }
        }
      ])
      supabaseMock.queueTable('team_memberships', [{ data: { role: 'admin' } }])

      await api.remove('announcement-1')

      const builder = supabaseMock.getBuilderHistory('announcements')[1]
      expect(builder.delete).toHaveBeenCalled()
      expect(builder.eq).toHaveBeenCalledWith('id', 'announcement-1')
    })

    it('対象のお知らせが存在しない場合はエラー', async () => {
      supabaseMock.queueTable('announcements', [{ data: null }])

      await expect(api.remove('announcement-1')).rejects.toThrow('お知らせが見つかりません')
    })

    it('管理者以外はお知らせを削除できない', async () => {
      supabaseMock.queueTable('announcements', [{ data: { team_id: 'team-1' } }])
      supabaseMock.queueTable('team_memberships', [{ data: { role: 'user' } }])

      await expect(api.remove('announcement-1')).rejects.toThrow('お知らせの削除権限がありません')
    })

    it('未認証の場合はエラーとなる', async () => {
      supabaseMock = createSupabaseMock({ userId: '' })
      api = new TeamAnnouncementsAPI(supabaseMock.client as any)

      await expect(api.remove('announcement-1')).rejects.toThrow('認証が必要です')
    })
  })
})


