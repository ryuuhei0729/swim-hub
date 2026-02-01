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
        { id: 'announcement-1', team_id: 'team-1', title: '連絡1', is_published: true, start_at: null, end_at: null },
        { id: 'announcement-2', team_id: 'team-1', title: '連絡2', is_published: false, start_at: null, end_at: null }
      ]

      supabaseMock.queueTable('team_memberships', [{ data: { id: 'membership-1' } }])
      supabaseMock.queueTable('announcements', [{ data: announcements }])

      const result = await api.list('team-1')

      expect(result).toEqual(announcements)
    })

    it('viewOnly=trueの場合は下書き（is_published=false）が除外される', async () => {
      const announcements = [
        { id: 'announcement-1', team_id: 'team-1', title: '公開済み', is_published: true, start_at: null, end_at: null },
        { id: 'announcement-2', team_id: 'team-1', title: '下書き', is_published: false, start_at: null, end_at: null },
        { id: 'announcement-3', team_id: 'team-1', title: '公開済み2', is_published: true, start_at: null, end_at: null },
      ]

      supabaseMock.queueTable('team_memberships', [{ data: { id: 'membership-1' } }])
      // viewOnly=trueの場合、is_published=trueのみが取得される
      supabaseMock.queueTable('announcements', [{ 
        data: announcements.filter(a => a.is_published === true),
        configure: builder => {
          // eq('is_published', true)が呼ばれることを確認
          builder.eq.mockImplementation((column: string, value: any) => {
            if (column === 'is_published' && value === true) {
              return builder
            }
            return builder
          })
        }
      }])

      const result = await api.list('team-1', true)

      // 公開済みのものだけが返される（下書きは除外される）
      expect(result).toHaveLength(2)
      expect(result.every(r => r.is_published === true)).toBe(true)
      expect(result.map(r => r.id)).toEqual(['announcement-1', 'announcement-3'])
    })

    it('viewOnly=trueの場合は表示期間でフィルタリングされる', async () => {
      const now = new Date()
      const futureDate = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString()
      const pastDate = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()

      const announcements = [
        { id: 'announcement-1', team_id: 'team-1', title: '表示中', is_published: true, start_at: null, end_at: null },
        { id: 'announcement-2', team_id: 'team-1', title: '期間内', is_published: true, start_at: pastDate, end_at: futureDate },
        { id: 'announcement-3', team_id: 'team-1', title: '期間外（終了済み）', is_published: true, start_at: null, end_at: pastDate },
      ]

      supabaseMock.queueTable('team_memberships', [{ data: { id: 'membership-1' } }])
      supabaseMock.queueTable('announcements', [{ data: announcements }])

      const result = await api.list('team-1', true)

      // 表示期間内のものだけが返される
      expect(result).toHaveLength(2)
      expect(result.map(r => r.id)).toEqual(['announcement-1', 'announcement-2'])
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
        start_at: null,
        end_at: null,
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

      const result = await api.create(input)

      expect(result).toEqual(created)
      const builder = supabaseMock.getBuilderHistory('announcements')[0]
      expect(builder.insert).toHaveBeenCalledWith({
        ...input,
        created_by: 'test-user-id'
      })
    })

    it('end_atが現在時刻より前の場合はエラー', async () => {
      const pastDate = new Date(Date.now() - 1000).toISOString()
      const input = {
        team_id: 'team-1',
        title: 'タイトル',
        content: '本文',
        is_published: true,
        start_at: null,
        end_at: pastDate,
        created_by: 'dummy'
      }

      supabaseMock.queueTable('team_memberships', [{ data: { role: 'admin' } }])

      await expect(api.create(input)).rejects.toThrow('表示終了日時は現在時刻より後の日時を指定してください')
    })

    it('end_atがstart_atより前の場合はエラー', async () => {
      const startDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      const endDate = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString()
      const input = {
        team_id: 'team-1',
        title: 'タイトル',
        content: '本文',
        is_published: true,
        start_at: startDate,
        end_at: endDate,
        created_by: 'dummy'
      }

      supabaseMock.queueTable('team_memberships', [{ data: { role: 'admin' } }])

      await expect(api.create(input)).rejects.toThrow('表示終了日時は表示開始日時より後の日時を指定してください')
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
          start_at: null,
          end_at: null,
          created_by: 'dummy'
        })
      ).rejects.toThrow('認証が必要です')
    })

    it('管理者以外はお知らせを作成できない', async () => {
      // requireTeamAdminは.eq('role', 'admin')でフィルタするため、
      // adminでない場合はnullが返る（該当データなし）
      supabaseMock.queueTable('team_memberships', [{ data: null }])

      await expect(
        api.create({
          team_id: 'team-1',
          title: 'タイトル',
          content: '本文',
          is_published: false,
          start_at: null,
          end_at: null,
          created_by: 'dummy'
        })
      ).rejects.toThrow('管理者権限が必要です')
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
        start_at: null,
        end_at: null
      }

      supabaseMock.queueTable('announcements', [
        { data: { team_id: 'team-1', start_at: null, end_at: null } },
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

    it('end_atが現在時刻より前の場合はエラー', async () => {
      const pastDate = new Date(Date.now() - 1000).toISOString()
      // バリデーション用の既存データ取得
      supabaseMock.queueTable('announcements', [
        { data: { start_at: null, end_at: null } }
      ])

      await expect(api.update('announcement-1', { end_at: pastDate })).rejects.toThrow(
        '表示終了日時は現在時刻より後の日時を指定してください'
      )
    })

    it('end_atがstart_atより前の場合はエラー', async () => {
      const startDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      const endDate = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString()
      // updateは複数のクエリを発行する:
      // 1. team_id取得用
      // 2. バリデーション用の既存データ取得
      supabaseMock.queueTable('announcements', [
        { data: { team_id: 'team-1' } },
        { data: { start_at: startDate, end_at: null } }
      ])
      supabaseMock.queueTable('team_memberships', [{ data: { role: 'admin' } }])

      await expect(api.update('announcement-1', { end_at: endDate })).rejects.toThrow(
        '表示終了日時は表示開始日時より後の日時を指定してください'
      )
    })

    it('対象のお知らせが存在しない場合はエラー', async () => {
      supabaseMock.queueTable('announcements', [{ data: null }])

      await expect(api.update('announcement-1', { title: '更新' })).rejects.toThrow(
        'お知らせが見つかりません'
      )
    })

    it('管理者以外はお知らせを更新できない', async () => {
      supabaseMock.queueTable('announcements', [{ data: { team_id: 'team-1' } }])
      // requireTeamAdminは.eq('role', 'admin')でフィルタするため、
      // adminでない場合はnullが返る（該当データなし）
      supabaseMock.queueTable('team_memberships', [{ data: null }])

      await expect(api.update('announcement-1', { title: '更新' })).rejects.toThrow(
        '管理者権限が必要です'
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
      // requireTeamAdminは.eq('role', 'admin')でフィルタするため、
      // adminでない場合はnullが返る（該当データなし）
      supabaseMock.queueTable('team_memberships', [{ data: null }])

      await expect(api.remove('announcement-1')).rejects.toThrow('管理者権限が必要です')
    })

    it('未認証の場合はエラーとなる', async () => {
      supabaseMock = createSupabaseMock({ userId: '' })
      api = new TeamAnnouncementsAPI(supabaseMock.client as any)

      await expect(api.remove('announcement-1')).rejects.toThrow('認証が必要です')
    })
  })
})


