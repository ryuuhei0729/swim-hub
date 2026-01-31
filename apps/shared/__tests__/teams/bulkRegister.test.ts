import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TeamBulkRegisterAPI } from '../../api/teams/bulkRegister'
import { createSupabaseMock } from '../utils/supabase-mock'

describe('TeamBulkRegisterAPI', () => {
  let supabaseMock: ReturnType<typeof createSupabaseMock>
  let api: TeamBulkRegisterAPI

  beforeEach(() => {
    vi.clearAllMocks()
    supabaseMock = createSupabaseMock()
    api = new TeamBulkRegisterAPI(supabaseMock.client as any)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('bulkRegister', () => {
    it('練習のみを一括登録できる', async () => {
      const adminMembership = { role: 'admin' }
      const createdPractices = [{ id: 'practice-1' }, { id: 'practice-2' }]

      supabaseMock.queueTable('team_memberships', [
        {
          data: adminMembership,
          configure: builder => {
            builder.single.mockResolvedValue({ data: adminMembership, error: null })
          }
        }
      ])

      supabaseMock.queueTable('practices', [
        {
          data: createdPractices,
          configure: builder => {
            builder.insert.mockReturnValue(builder)
            builder.select.mockResolvedValue({ data: createdPractices, error: null })
          }
        }
      ])

      const result = await api.bulkRegister('team-1', {
        practices: [
          { date: '2024-01-15', title: '朝練', place: 'プールA' },
          { date: '2024-01-16', title: '夕練', place: 'プールB' }
        ],
        competitions: []
      })

      expect(result.success).toBe(true)
      expect(result.practicesCreated).toBe(2)
      expect(result.competitionsCreated).toBe(0)
      expect(result.errors).toHaveLength(0)

      const builder = supabaseMock.getBuilderHistory('practices')[0]
      expect(builder.insert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            date: '2024-01-15',
            title: '朝練',
            place: 'プールA',
            team_id: 'team-1',
            user_id: 'test-user-id'
          })
        ])
      )
    })

    it('大会のみを一括登録できる', async () => {
      const adminMembership = { role: 'admin' }
      const createdCompetitions = [{ id: 'competition-1' }]

      supabaseMock.queueTable('team_memberships', [
        {
          data: adminMembership,
          configure: builder => {
            builder.single.mockResolvedValue({ data: adminMembership, error: null })
          }
        }
      ])

      supabaseMock.queueTable('competitions', [
        {
          data: createdCompetitions,
          configure: builder => {
            builder.insert.mockReturnValue(builder)
            builder.select.mockResolvedValue({ data: createdCompetitions, error: null })
          }
        }
      ])

      const result = await api.bulkRegister('team-1', {
        practices: [],
        competitions: [
          {
            title: '春季大会',
            date: '2024-03-20',
            end_date: '2024-03-21',
            place: '市民プール',
            pool_type: 1,
            note: '2日間開催'
          }
        ]
      })

      expect(result.success).toBe(true)
      expect(result.practicesCreated).toBe(0)
      expect(result.competitionsCreated).toBe(1)
      expect(result.errors).toHaveLength(0)

      const builder = supabaseMock.getBuilderHistory('competitions')[0]
      expect(builder.insert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            title: '春季大会',
            date: '2024-03-20',
            end_date: '2024-03-21',
            place: '市民プール',
            pool_type: 1,
            team_id: 'team-1',
            user_id: 'test-user-id',
            entry_status: 'before'
          })
        ])
      )
    })

    it('練習と大会の両方を一括登録できる', async () => {
      const adminMembership = { role: 'admin' }
      const createdPractices = [{ id: 'practice-1' }]
      const createdCompetitions = [{ id: 'competition-1' }]

      supabaseMock.queueTable('team_memberships', [
        {
          data: adminMembership,
          configure: builder => {
            builder.single.mockResolvedValue({ data: adminMembership, error: null })
          }
        }
      ])

      supabaseMock.queueTable('practices', [
        {
          data: createdPractices,
          configure: builder => {
            builder.insert.mockReturnValue(builder)
            builder.select.mockResolvedValue({ data: createdPractices, error: null })
          }
        }
      ])

      supabaseMock.queueTable('competitions', [
        {
          data: createdCompetitions,
          configure: builder => {
            builder.insert.mockReturnValue(builder)
            builder.select.mockResolvedValue({ data: createdCompetitions, error: null })
          }
        }
      ])

      const result = await api.bulkRegister('team-1', {
        practices: [{ date: '2024-01-15' }],
        competitions: [{ date: '2024-03-20', pool_type: 0 }]
      })

      expect(result.success).toBe(true)
      expect(result.practicesCreated).toBe(1)
      expect(result.competitionsCreated).toBe(1)
      expect(result.errors).toHaveLength(0)
    })

    it('空の入力で正常に完了する', async () => {
      const adminMembership = { role: 'admin' }

      supabaseMock.queueTable('team_memberships', [
        {
          data: adminMembership,
          configure: builder => {
            builder.single.mockResolvedValue({ data: adminMembership, error: null })
          }
        }
      ])

      const result = await api.bulkRegister('team-1', {
        practices: [],
        competitions: []
      })

      expect(result.success).toBe(true)
      expect(result.practicesCreated).toBe(0)
      expect(result.competitionsCreated).toBe(0)
      expect(result.errors).toHaveLength(0)
    })

    it('練習の登録エラーを記録する', async () => {
      const adminMembership = { role: 'admin' }

      supabaseMock.queueTable('team_memberships', [
        {
          data: adminMembership,
          configure: builder => {
            builder.single.mockResolvedValue({ data: adminMembership, error: null })
          }
        }
      ])

      supabaseMock.queueTable('practices', [
        {
          data: null,
          configure: builder => {
            builder.insert.mockReturnValue(builder)
            builder.select.mockResolvedValue({
              data: null,
              error: { message: 'データベースエラー' }
            })
          }
        }
      ])

      const result = await api.bulkRegister('team-1', {
        practices: [{ date: '2024-01-15' }],
        competitions: []
      })

      expect(result.success).toBe(false)
      expect(result.practicesCreated).toBe(0)
      expect(result.errors).toContain('練習の登録に失敗しました: データベースエラー')
    })

    it('大会の登録エラーを記録する', async () => {
      const adminMembership = { role: 'admin' }

      supabaseMock.queueTable('team_memberships', [
        {
          data: adminMembership,
          configure: builder => {
            builder.single.mockResolvedValue({ data: adminMembership, error: null })
          }
        }
      ])

      supabaseMock.queueTable('competitions', [
        {
          data: null,
          configure: builder => {
            builder.insert.mockReturnValue(builder)
            builder.select.mockResolvedValue({
              data: null,
              error: { message: '制約違反' }
            })
          }
        }
      ])

      const result = await api.bulkRegister('team-1', {
        practices: [],
        competitions: [{ date: '2024-03-20', pool_type: 0 }]
      })

      expect(result.success).toBe(false)
      expect(result.competitionsCreated).toBe(0)
      expect(result.errors).toContain('大会の登録に失敗しました: 制約違反')
    })

    it('未認証の場合はエラーとなる', async () => {
      supabaseMock = createSupabaseMock({ userId: '' })
      api = new TeamBulkRegisterAPI(supabaseMock.client as any)

      await expect(
        api.bulkRegister('team-1', { practices: [], competitions: [] })
      ).rejects.toThrow('認証が必要です')
    })

    it('管理者でない場合はエラーとなる', async () => {
      // 管理者チェック時にデータが見つからない（role='admin'でフィルタするため）
      supabaseMock.queueTable('team_memberships', [
        {
          data: null,
          configure: builder => {
            builder.single.mockResolvedValue({ data: null, error: null })
          }
        }
      ])

      await expect(
        api.bulkRegister('team-1', { practices: [], competitions: [] })
      ).rejects.toThrow('管理者権限が必要です')
    })

    it('nullのタイトルや場所を正しく処理する', async () => {
      const adminMembership = { role: 'admin' }
      const createdPractices = [{ id: 'practice-1' }]

      supabaseMock.queueTable('team_memberships', [
        {
          data: adminMembership,
          configure: builder => {
            builder.single.mockResolvedValue({ data: adminMembership, error: null })
          }
        }
      ])

      supabaseMock.queueTable('practices', [
        {
          data: createdPractices,
          configure: builder => {
            builder.insert.mockReturnValue(builder)
            builder.select.mockResolvedValue({ data: createdPractices, error: null })
          }
        }
      ])

      await api.bulkRegister('team-1', {
        practices: [{ date: '2024-01-15', title: null, place: undefined, note: '' }],
        competitions: []
      })

      const builder = supabaseMock.getBuilderHistory('practices')[0]
      expect(builder.insert).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            title: null,
            place: null,
            note: null
          })
        ])
      )
    })
  })
})
