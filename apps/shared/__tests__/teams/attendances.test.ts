import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createMockQueryBuilder,
  createMockSupabaseClient,
  type MockQueryBuilder
} from '../../__mocks__/supabase'
import { TeamAttendancesAPI } from '../../api/teams/attendances'

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

describe('TeamAttendancesAPI', () => {
  let supabaseMock: ReturnType<typeof createSupabaseMock>
  let api: TeamAttendancesAPI

  beforeEach(() => {
    vi.clearAllMocks()
    supabaseMock = createSupabaseMock()
    api = new TeamAttendancesAPI(supabaseMock.client as any)
  })

  describe('listByTeam', () => {
    it('チーム全体の出欠一覧を取得できる', async () => {
      const teamAttendance = [
        { id: 'att-1', practice_id: 'practice-1', competition_id: null },
        { id: 'att-2', practice_id: null, competition_id: 'competition-1' }
      ]

      supabaseMock.queueTable('team_memberships', [{ data: { id: 'membership-1' } }])
      supabaseMock.queueTable('practices', [{ data: [{ id: 'practice-1' }] }])
      supabaseMock.queueTable('competitions', [{ data: [{ id: 'competition-1' }] }])
      supabaseMock.queueTable('team_attendance', [
        { data: [teamAttendance[0]] },
        { data: [teamAttendance[1]] }
      ])

      const result = await api.listByTeam('team-1')

      expect(result).toEqual(teamAttendance)
    })

    it('チームメンバーでない場合はエラーとなる', async () => {
      supabaseMock.queueTable('team_memberships', [{ data: null }])

      await expect(api.listByTeam('team-1')).rejects.toThrow('チームへのアクセス権限がありません')
    })

    it('未認証の場合はエラーとなる', async () => {
      supabaseMock = createSupabaseMock({ userId: '' })
      api = new TeamAttendancesAPI(supabaseMock.client as any)

      await expect(api.listByTeam('team-1')).rejects.toThrow('認証が必要です')
    })
  })

  describe('listByPractice', () => {
    it('チーム練習の出欠一覧を取得できる', async () => {
      const attendance = [{ id: 'att-1', practice_id: 'practice-1', competition_id: null }]

      supabaseMock.queueTable('practices', [{ data: { team_id: 'team-1' } }])
      supabaseMock.queueTable('team_memberships', [{ data: { id: 'membership-1' } }])
      supabaseMock.queueTable('team_attendance', [{ data: attendance }])

      const result = await api.listByPractice('practice-1')

      expect(result).toEqual(attendance)
    })

    it('チーム練習でない場合はエラーとなる', async () => {
      supabaseMock.queueTable('practices', [{ data: { team_id: null } }])

      await expect(api.listByPractice('practice-1')).rejects.toThrow('チーム練習ではありません')
    })

    it('未認証の場合はエラーとなる', async () => {
      supabaseMock = createSupabaseMock({ userId: '' })
      api = new TeamAttendancesAPI(supabaseMock.client as any)

      await expect(api.listByPractice('practice-1')).rejects.toThrow('認証が必要です')
    })
  })

  describe('listByCompetition', () => {
    it('チーム大会の出欠一覧を取得できる', async () => {
      const attendance = [{ id: 'att-1', practice_id: null, competition_id: 'competition-1' }]

      supabaseMock.queueTable('competitions', [{ data: { team_id: 'team-1' } }])
      supabaseMock.queueTable('team_memberships', [{ data: { id: 'membership-1' } }])
      supabaseMock.queueTable('team_attendance', [{ data: attendance }])

      const result = await api.listByCompetition('competition-1')

      expect(result).toEqual(attendance)
    })

    it('チーム大会でない場合はエラーとなる', async () => {
      supabaseMock.queueTable('competitions', [{ data: { team_id: null } }])

      await expect(api.listByCompetition('competition-1')).rejects.toThrow('チーム大会ではありません')
    })

    it('未認証の場合はエラーとなる', async () => {
      supabaseMock = createSupabaseMock({ userId: '' })
      api = new TeamAttendancesAPI(supabaseMock.client as any)

      await expect(api.listByCompetition('competition-1')).rejects.toThrow('認証が必要です')
    })
  })

  describe('upsert', () => {
    it('出欠情報を登録または更新できる', async () => {
      const input = {
        practice_id: 'practice-1',
        competition_id: null,
        user_id: 'member-1',
        status: 'present' as const,
        note: null
      }
      const upserted = { id: 'attendance-1', ...input }

      supabaseMock.queueTable('practices', [{ data: { team_id: 'team-1' } }])
      supabaseMock.queueTable('team_memberships', [{ data: { id: 'membership-1' } }])
      supabaseMock.queueTable('team_attendance', [
        {
          data: upserted,
          configure: builder => {
            builder.upsert.mockReturnValue(builder)
          }
        }
      ])

      const result = await api.upsert(input)

      expect(result).toEqual(upserted)
      const builder = supabaseMock.getBuilderHistory('team_attendance')[0]
      expect(builder.upsert).toHaveBeenCalledWith(input)
    })

    it('チーム対象が特定できない場合はエラーとなる', async () => {
      await expect(
        api.upsert({
          practice_id: null,
          competition_id: null,
          user_id: 'member-1',
          status: 'present' as const,
          note: null
        })
      ).rejects.toThrow('チーム対象が特定できません')
    })

    it('メンバーでない場合はエラーとなる', async () => {
      supabaseMock.queueTable('practices', [{ data: { team_id: 'team-1' } }])
      supabaseMock.queueTable('team_memberships', [{ data: null }])

      await expect(
        api.upsert({
          practice_id: 'practice-1',
          competition_id: null,
          user_id: 'member-1',
          status: 'present' as const,
          note: null
        })
      ).rejects.toThrow('チームへのアクセス権限がありません')
    })

    it('未認証の場合はエラーとなる', async () => {
      supabaseMock = createSupabaseMock({ userId: '' })
      api = new TeamAttendancesAPI(supabaseMock.client as any)

      await expect(
        api.upsert({
          practice_id: 'practice-1',
          competition_id: null,
          user_id: 'member-1',
          status: 'present' as const,
          note: null
        })
      ).rejects.toThrow('認証が必要です')
    })
  })

  describe('update', () => {
    it('既存の出欠情報を更新できる', async () => {
      const updates = { note: '更新メモ' }
      const current = { practice_id: 'practice-1', competition_id: null }
      const updated = {
        id: 'attendance-1',
        practice_id: 'practice-1',
        competition_id: null,
        user_id: 'member-1',
        status: 'other' as const,
        note: '更新メモ'
      }

      supabaseMock.queueTable('team_attendance', [
        { data: current },
        {
          data: updated,
          configure: builder => {
            builder.update.mockReturnValue(builder)
          }
        }
      ])
      supabaseMock.queueTable('practices', [{ data: { team_id: 'team-1' } }])
      supabaseMock.queueTable('team_memberships', [{ data: { id: 'membership-1' } }])

      const result = await api.update('attendance-1', updates)

      expect(result).toEqual(updated)
      const builder = supabaseMock.getBuilderHistory('team_attendance')[1]
      expect(builder.update).toHaveBeenCalledWith(updates)
      expect(builder.eq).toHaveBeenCalledWith('id', 'attendance-1')
    })

    it('対象の出欠情報が存在しない場合はエラーとなる', async () => {
      supabaseMock.queueTable('team_attendance', [{ data: null }])

      await expect(api.update('attendance-1', { status: 'present' as const })).rejects.toThrow(
        'チーム対象が特定できません'
      )
    })

    it('チーム対象が特定できない場合はエラーとなる', async () => {
      supabaseMock.queueTable('team_attendance', [{ data: { practice_id: 'practice-1' } }])
      supabaseMock.queueTable('practices', [{ data: { team_id: null } }])

      await expect(api.update('attendance-1', { status: 'present' as const })).rejects.toThrow(
        'チーム対象が特定できません'
      )
    })

    it('メンバーでない場合はエラーとなる', async () => {
      supabaseMock.queueTable('team_attendance', [{ data: { practice_id: 'practice-1' } }])
      supabaseMock.queueTable('practices', [{ data: { team_id: 'team-1' } }])
      supabaseMock.queueTable('team_memberships', [{ data: null }])

      await expect(api.update('attendance-1', { status: 'present' as const })).rejects.toThrow(
        'チームへのアクセス権限がありません'
      )
    })

    it('未認証の場合はエラーとなる', async () => {
      supabaseMock = createSupabaseMock({ userId: '' })
      api = new TeamAttendancesAPI(supabaseMock.client as any)

      await expect(api.update('attendance-1', { status: 'present' as const })).rejects.toThrow('認証が必要です')
    })
  })
})


