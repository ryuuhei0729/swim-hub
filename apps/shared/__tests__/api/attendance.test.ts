import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createMockQueryBuilder,
  createMockSupabaseClient,
  type MockQueryBuilder
} from '../../__mocks__/supabase'
import { AttendanceAPI } from '../../api/attendance'
import {
  type AttendanceStatus,
  type TeamAttendance,
  type TeamAttendanceInsert,
  type TeamAttendanceUpdate
} from '../../types'

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
  }) as unknown as typeof client.from

  return {
    client,
    queueTable: (table: string, responses: TableResponse[]) => {
      tableQueues.set(table, [...responses])
    },
    getBuilderHistory: (table: string) => builderHistory.get(table) ?? []
  }
}

const createAttendanceRow = (
  overrides: Partial<TeamAttendance> & {
    user?: Record<string, unknown>
    practice?: Record<string, unknown>
    competition?: Record<string, unknown>
  } = {}
) => ({
  id: 'attendance-1',
  practice_id: overrides.practice_id ?? 'practice-1',
  competition_id: overrides.competition_id ?? null,
  user_id: overrides.user_id ?? 'member-1',
  status: overrides.status ?? ('present' as AttendanceStatus),
  note: overrides.note ?? null,
  created_at: overrides.created_at ?? '2025-01-01T00:00:00Z',
  updated_at: overrides.updated_at ?? '2025-01-01T00:00:00Z',
  user: overrides.user ?? {
    id: 'member-1',
    name: 'メンバー'
  },
  practice: overrides.practice ?? {
    id: 'practice-1',
    team_id: 'team-1'
  },
  competition: overrides.competition ?? null
})

describe('AttendanceAPI', () => {
  let supabaseMock: ReturnType<typeof createSupabaseMock>
  let api: AttendanceAPI

  beforeEach(() => {
    vi.clearAllMocks()
    supabaseMock = createSupabaseMock()
    api = new AttendanceAPI(supabaseMock.client as any)
  })

  describe('練習出欠取得', () => {
    it('チーム練習のとき出欠一覧を取得できる', async () => {
      const attendanceRow = createAttendanceRow()

      supabaseMock.queueTable('practices', [{ data: { team_id: 'team-1' } }])
      supabaseMock.queueTable('team_memberships', [{ data: { id: 'membership-1' } }])
      supabaseMock.queueTable('team_attendance', [{ data: [attendanceRow] }])

      const result = await api.getAttendanceByPractice('practice-1')

      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        ...attendanceRow,
        team_id: 'team-1'
      })
    })

    it('未認証の場合はエラーとなる', async () => {
      supabaseMock = createSupabaseMock({ userId: '' })
      api = new AttendanceAPI(supabaseMock.client as any)

      await expect(api.getAttendanceByPractice('practice-1')).rejects.toThrow('認証が必要です')
    })

    it('チーム練習でない場合はエラーとなる', async () => {
      supabaseMock.queueTable('practices', [{ data: { team_id: null } }])

      await expect(api.getAttendanceByPractice('practice-1')).rejects.toThrow(
        'チーム練習ではありません'
      )
    })

    it('チームメンバーでない場合はエラーとなる', async () => {
      supabaseMock.queueTable('practices', [{ data: { team_id: 'team-1' } }])
      supabaseMock.queueTable('team_memberships', [{ data: null }])

      await expect(api.getAttendanceByPractice('practice-1')).rejects.toThrow(
        'チームへのアクセス権限がありません'
      )
    })
  })

  describe('大会出欠取得', () => {
    it('チーム大会のとき出欠一覧を取得できる', async () => {
      const attendanceRow = createAttendanceRow({
        practice_id: null,
        competition_id: 'competition-1',
        competition: {
          id: 'competition-1',
          team_id: 'team-1'
        }
      })

      supabaseMock.queueTable('competitions', [{ data: { team_id: 'team-1' } }])
      supabaseMock.queueTable('team_memberships', [{ data: { id: 'membership-1' } }])
      supabaseMock.queueTable('team_attendance', [{ data: [attendanceRow] }])

      const result = await api.getAttendanceByCompetition('competition-1')

      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        ...attendanceRow,
        team_id: 'team-1'
      })
    })

    it('チーム大会でない場合はエラーとなる', async () => {
      supabaseMock.queueTable('competitions', [{ data: { team_id: null } }])

      await expect(api.getAttendanceByCompetition('competition-1')).rejects.toThrow(
        'チーム大会ではありません'
      )
    })

    it('チームメンバーでない場合はエラーとなる', async () => {
      supabaseMock.queueTable('competitions', [{ data: { team_id: 'team-1' } }])
      supabaseMock.queueTable('team_memberships', [{ data: null }])

      await expect(api.getAttendanceByCompetition('competition-1')).rejects.toThrow(
        'チームへのアクセス権限がありません'
      )
    })
  })

  describe('updateMyAttendance', () => {
    it('自分の出欠情報を更新できる', async () => {
      const updates: TeamAttendanceUpdate = { status: 'absent' }
      const existingAttendance = {
        user_id: 'test-user-id',
        practice_id: 'practice-1',
        competition_id: null
      }
      const updatedAttendance: TeamAttendance = {
        id: 'attendance-1',
        practice_id: 'practice-1',
        competition_id: null,
        user_id: 'test-user-id',
        status: 'absent',
        note: null,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-02T00:00:00Z'
      }

      supabaseMock.queueTable('team_attendance', [
        { data: existingAttendance },
        { data: updatedAttendance }
      ])
      supabaseMock.queueTable('practices', [{ data: { attendance_status: 'open' } }])

      const result = await api.updateMyAttendance('attendance-1', updates)

      expect(result).toEqual(updatedAttendance)

      const builderHistory = supabaseMock.getBuilderHistory('team_attendance')
      expect(builderHistory[1].update).toHaveBeenCalledWith(updates)
      expect(builderHistory[1].eq).toHaveBeenCalledWith('id', 'attendance-1')
    })

    it('自分以外の出欠情報は更新できない', async () => {
      supabaseMock.queueTable('team_attendance', [
        { data: { user_id: 'other-user', practice_id: 'practice-1', competition_id: null } }
      ])

      await expect(
        api.updateMyAttendance('attendance-1', { status: 'present' })
      ).rejects.toThrow('自分の出欠情報のみ更新可能です')
    })

    it('出欠提出期間外は更新できない', async () => {
      supabaseMock.queueTable('team_attendance', [
        { data: { user_id: 'test-user-id', practice_id: 'practice-1', competition_id: null } }
      ])
      supabaseMock.queueTable('practices', [{ data: { attendance_status: 'closed' } }])

      await expect(
        api.updateMyAttendance('attendance-1', { status: 'present' })
      ).rejects.toThrow('出欠提出期間外です')
    })
  })

  describe('createAttendance', () => {
    const baseInsert: TeamAttendanceInsert = {
      practice_id: 'practice-1',
      competition_id: null,
      user_id: 'member-1',
      status: 'present',
      note: null
    }

    it('管理者は出欠情報を作成できる', async () => {
      const createdAttendance: TeamAttendance = {
        id: 'attendance-1',
        practice_id: 'practice-1',
        competition_id: null,
        user_id: 'member-1',
        status: 'present',
        note: null,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      }

      supabaseMock.queueTable('practices', [{ data: { team_id: 'team-1' } }])
      supabaseMock.queueTable('team_memberships', [{ data: { role: 'admin' } }])
      supabaseMock.queueTable('team_attendance', [
        {
          data: createdAttendance,
          configure: builder => {
            builder.insert.mockReturnValue(builder)
          }
        }
      ])

      const result = await api.createAttendance(baseInsert)

      expect(result).toEqual(createdAttendance)
      const builder = supabaseMock.getBuilderHistory('team_attendance')[0]
      expect(builder.insert).toHaveBeenCalledWith(baseInsert)
    })

    it('チーム情報が取得できない場合はエラーとなる', async () => {
      supabaseMock.queueTable('practices', [{ data: null }])

      await expect(api.createAttendance(baseInsert)).rejects.toThrow('チーム情報が見つかりません')
    })

    it('管理者でない場合はエラーとなる', async () => {
      supabaseMock.queueTable('practices', [{ data: { team_id: 'team-1' } }])
      supabaseMock.queueTable('team_memberships', [{ data: null }])

      await expect(api.createAttendance(baseInsert)).rejects.toThrow('管理者権限が必要です')
    })
  })

  describe('updateAttendance', () => {
    it('管理者は出欠情報を更新できる', async () => {
      const updates: TeamAttendanceUpdate = { note: '更新メモ' }
      const existingAttendance = {
        practice_id: 'practice-1',
        competition_id: null
      }
      const updatedAttendance: TeamAttendance = {
        id: 'attendance-1',
        practice_id: 'practice-1',
        competition_id: null,
        user_id: 'member-1',
        status: 'other',
        note: '更新メモ',
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-02T00:00:00Z'
      }

      supabaseMock.queueTable('team_attendance', [
        { data: existingAttendance },
        {
          data: updatedAttendance,
          configure: builder => {
            builder.update.mockReturnValue(builder)
          }
        }
      ])
      supabaseMock.queueTable('practices', [{ data: { team_id: 'team-1' } }])
      supabaseMock.queueTable('team_memberships', [{ data: { role: 'admin' } }])

      const result = await api.updateAttendance('attendance-1', updates)

      expect(result).toEqual(updatedAttendance)
      const builderHistory = supabaseMock.getBuilderHistory('team_attendance')
      expect(builderHistory[1].update).toHaveBeenCalledWith(updates)
      expect(builderHistory[1].eq).toHaveBeenCalledWith('id', 'attendance-1')
    })

    it('出欠情報が存在しない場合はエラーとなる', async () => {
      supabaseMock.queueTable('team_attendance', [{ data: null }])

      await expect(api.updateAttendance('attendance-1', { status: 'present' })).rejects.toThrow(
        '出欠情報が見つかりません'
      )
    })

    it('チーム情報が取得できない場合はエラーとなる', async () => {
      supabaseMock.queueTable('team_attendance', [{ data: { practice_id: 'practice-1', competition_id: null } }])
      supabaseMock.queueTable('practices', [{ data: null }])

      await expect(api.updateAttendance('attendance-1', { status: 'present' })).rejects.toThrow(
        'チーム情報が見つかりません'
      )
    })

    it('管理者でない場合はエラーとなる', async () => {
      supabaseMock.queueTable('team_attendance', [{ data: { practice_id: 'practice-1', competition_id: null } }])
      supabaseMock.queueTable('practices', [{ data: { team_id: 'team-1' } }])
      supabaseMock.queueTable('team_memberships', [{ data: null }])

      await expect(api.updateAttendance('attendance-1', { status: 'present' })).rejects.toThrow(
        '管理者権限が必要です'
      )
    })
  })

  describe('ヘルパーメソッド', () => {
    it('getStatusLabel は各ステータスのラベルを返す', () => {
      expect(api.getStatusLabel('present')).toBe('出席')
      expect(api.getStatusLabel('absent')).toBe('欠席')
      expect(api.getStatusLabel('other')).toBe('その他')
      expect(api.getStatusLabel(null)).toBe('未回答')
      expect(api.getStatusLabel(undefined as unknown as AttendanceStatus)).toBe('未回答')
    })

    it('getStatusOptions は固定の選択肢を返す', () => {
      expect(api.getStatusOptions()).toEqual([
        { value: null, label: '未回答' },
        { value: 'present', label: '出席' },
        { value: 'absent', label: '欠席' },
        { value: 'other', label: 'その他' }
      ])
    })

    it('canSubmitAttendance は練習の提出状況を判定する', async () => {
      // 未来の日付 + open → true
      const futureDate = new Date()
      futureDate.setDate(futureDate.getDate() + 1)
      supabaseMock.queueTable('practices', [{ 
        data: { 
          attendance_status: 'open',
          date: futureDate.toISOString().split('T')[0]
        } 
      }])
      expect(await api.canSubmitAttendance('practice-1', null)).toBe(true)

      // closed → false
      supabaseMock.queueTable('practices', [{ 
        data: { 
          attendance_status: 'closed',
          date: futureDate.toISOString().split('T')[0]
        } 
      }])
      expect(await api.canSubmitAttendance('practice-1', null)).toBe(false)
    })

    it('canSubmitAttendance は大会の提出状況を判定する', async () => {
      // 未来の日付 + open → true
      const futureDate = new Date()
      futureDate.setDate(futureDate.getDate() + 1)
      supabaseMock.queueTable('competitions', [{ 
        data: { 
          attendance_status: 'open',
          date: futureDate.toISOString().split('T')[0]
        } 
      }])
      expect(await api.canSubmitAttendance(null, 'competition-1')).toBe(true)

      // closed → false
      supabaseMock.queueTable('competitions', [{ 
        data: { 
          attendance_status: 'closed',
          date: futureDate.toISOString().split('T')[0]
        } 
      }])
      expect(await api.canSubmitAttendance(null, 'competition-1')).toBe(false)
    })

    it('canSubmitAttendance は過去の日付の場合は提出不可（openでもfalse）', async () => {
      // 過去の日付 + open → false（自動的に締切扱い）
      const pastDate = new Date()
      pastDate.setDate(pastDate.getDate() - 1)
      
      supabaseMock.queueTable('practices', [{ 
        data: { 
          attendance_status: 'open',
          date: pastDate.toISOString().split('T')[0]
        } 
      }])
      expect(await api.canSubmitAttendance('practice-1', null)).toBe(false)

      supabaseMock.queueTable('competitions', [{ 
        data: { 
          attendance_status: 'open',
          date: pastDate.toISOString().split('T')[0]
        } 
      }])
      expect(await api.canSubmitAttendance(null, 'competition-1')).toBe(false)
    })

    it('canSubmitAttendance は今日の日付の場合は提出可能（openの場合）', async () => {
      // 今日の日付 + open → true
      // 実装では eventDateObj < today の場合にfalseを返すため、
      // eventDateObj >= today の場合はtrueを返す
      // タイムゾーンの問題を避けるため、ローカル時間で今日の日付を取得
      // 実装では new Date(eventDate) でパースし、setHours(0,0,0,0) でローカル時間の00:00:00に設定
      // テストでも同じ方法で日付を生成する
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      // YYYY-MM-DD形式の文字列を生成（ローカル時間で）
      const year = today.getFullYear()
      const month = String(today.getMonth() + 1).padStart(2, '0')
      const day = String(today.getDate()).padStart(2, '0')
      const todayStr = `${year}-${month}-${day}`
      
      supabaseMock.queueTable('practices', [{ 
        data: { 
          attendance_status: 'open',
          date: todayStr
        } 
      }])
      expect(await api.canSubmitAttendance('practice-1', null)).toBe(true)

      supabaseMock.queueTable('competitions', [{ 
        data: { 
          attendance_status: 'open',
          date: todayStr
        } 
      }])
      expect(await api.canSubmitAttendance(null, 'competition-1')).toBe(true)
    })

    it('canSubmitAttendance は未来の日付の場合は提出可能（openの場合）', async () => {
      // 未来の日付 + open → true
      const futureDate = new Date()
      futureDate.setDate(futureDate.getDate() + 7)
      const futureStr = futureDate.toISOString().split('T')[0]
      
      supabaseMock.queueTable('practices', [{ 
        data: { 
          attendance_status: 'open',
          date: futureStr
        } 
      }])
      expect(await api.canSubmitAttendance('practice-1', null)).toBe(true)

      supabaseMock.queueTable('competitions', [{ 
        data: { 
          attendance_status: 'open',
          date: futureStr
        } 
      }])
      expect(await api.canSubmitAttendance(null, 'competition-1')).toBe(true)
    })

    it('canSubmitAttendance は過去の日付 + closed の場合は提出不可', async () => {
      // 過去の日付 + closed → false
      const pastDate = new Date()
      pastDate.setDate(pastDate.getDate() - 1)
      
      supabaseMock.queueTable('practices', [{ 
        data: { 
          attendance_status: 'closed',
          date: pastDate.toISOString().split('T')[0]
        } 
      }])
      expect(await api.canSubmitAttendance('practice-1', null)).toBe(false)
    })

    it('canSubmitAttendance はIDが無い場合は false を返す', async () => {
      expect(await api.canSubmitAttendance(null, null)).toBe(false)
    })

    it('getAttendanceStatusLabel は提出ステータスのラベルを返す', () => {
      expect(api.getAttendanceStatusLabel('open')).toBe('提出受付中')
      expect(api.getAttendanceStatusLabel('closed')).toBe('提出締切')
      expect(api.getAttendanceStatusLabel(null)).toBe('未設定')
      expect(api.getAttendanceStatusLabel(undefined as unknown as 'open')).toBe('未設定')
    })
  })
})


