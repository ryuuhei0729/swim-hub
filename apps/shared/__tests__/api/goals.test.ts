import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createMockQueryBuilder,
  createMockSupabaseClient,
  createMockCompetition,
  createMockStyle,
} from '../../__mocks__/supabase'
import { GoalAPI } from '../../api/goals'
import type { Goal, Milestone, MilestoneRepsTimeParams, MilestoneSetParams, MilestoneTimeParams } from '../../types/goals'

// テストデータのファクトリー
const createMockGoal = (overrides = {}): Goal => ({
  id: 'goal-1',
  user_id: 'test-user-id',
  competition_id: 'comp-1',
  style_id: 1,
  target_time: 60,
  start_time: 70,
  status: 'active',
  achieved_at: null,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
  ...overrides,
})

const createMockMilestone = (overrides = {}): Milestone => ({
  id: 'milestone-1',
  goal_id: 'goal-1',
  title: 'テストマイルストーン',
  type: 'time',
  params: {
    distance: 100,
    target_time: 60,
    style: 'Fr',
    swim_category: 'Swim' as const,
  },
  deadline: null,
  status: 'not_started',
  achieved_at: null,
  reflection_done: false,
  reflection_note: null,
  created_at: '2025-01-01T00:00:00Z',
  updated_at: '2025-01-01T00:00:00Z',
  ...overrides,
})

describe('GoalAPI', () => {
  let mockClient: any
  let api: GoalAPI

  beforeEach(() => {
    vi.clearAllMocks()
    mockClient = createMockSupabaseClient()
    api = new GoalAPI(mockClient)
  })

  describe('createGoal', () => {
    it('既存の大会IDで目標を作成できる', async () => {
      const mockGoal = createMockGoal()

      mockClient.from = vi.fn((table: string) => {
        if (table === 'records') {
          // ベストタイム取得
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { time: 65 },
              error: null
            })
          }
        }
        if (table === 'goals') {
          return {
            insert: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: mockGoal,
              error: null
            })
          }
        }
        return createMockQueryBuilder()
      })

      const result = await api.createGoal({
        userId: 'test-user-id',
        competitionId: 'comp-1',
        styleId: 1,
        targetTime: 60
      })

      expect(result).toEqual(mockGoal)
    })

    it('新規大会と一緒に目標を作成できる', async () => {
      const mockCompetition = createMockCompetition()
      const mockGoal = createMockGoal()

      mockClient.from = vi.fn((table: string) => {
        if (table === 'competitions') {
          return {
            insert: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: mockCompetition,
              error: null
            })
          }
        }
        if (table === 'records') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { code: 'PGRST116' }
            })
          }
        }
        if (table === 'goals') {
          return {
            insert: vi.fn().mockReturnThis(),
            select: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: mockGoal,
              error: null
            })
          }
        }
        return createMockQueryBuilder()
      })

      const result = await api.createGoal({
        userId: 'test-user-id',
        styleId: 1,
        targetTime: 60,
        competitionData: {
          title: 'テスト大会',
          date: '2025-03-01',
          place: 'テスト会場',
          poolType: 1
        }
      })

      expect(result).toEqual(mockGoal)
    })

    it('未認証の場合はエラーを投げる', async () => {
      mockClient = createMockSupabaseClient({ userId: '' })
      api = new GoalAPI(mockClient)

      await expect(api.createGoal({
        userId: 'test-user-id',
        competitionId: 'comp-1',
        styleId: 1,
        targetTime: 60
      })).rejects.toThrow('認証が必要です')
    })

    it('大会IDも大会情報もない場合はエラーを投げる', async () => {
      await expect(api.createGoal({
        userId: 'test-user-id',
        styleId: 1,
        targetTime: 60
      })).rejects.toThrow('大会IDまたは大会情報が必要です')
    })
  })

  describe('getGoals', () => {
    it('目標一覧を取得できる', async () => {
      const mockGoals = [createMockGoal()]

      mockClient.from = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: mockGoals.map(g => ({ ...g, competition: {}, style: {} })),
          error: null
        })
      })

      const result = await api.getGoals()

      expect(result).toHaveLength(1)
    })

    it('ステータスでフィルタできる', async () => {
      const mockGoals = [createMockGoal({ status: 'achieved' })]

      const builder: any = {
        select: vi.fn(),
        eq: vi.fn(),
        order: vi.fn(),
        then: vi.fn()
      }
      // チェーン対応：全てのメソッドがbuilder自身を返す
      builder.select.mockReturnValue(builder)
      builder.eq.mockReturnValue(builder)
      builder.order.mockReturnValue(builder)
      // thenableとして動作させる
      builder.then.mockImplementation((onFulfilled: any) =>
        Promise.resolve({ data: mockGoals.map(g => ({ ...g, competition: {}, style: {} })), error: null }).then(onFulfilled)
      )
      mockClient.from = vi.fn().mockReturnValue(builder)

      await api.getGoals({ status: 'achieved' })

      expect(builder.eq).toHaveBeenCalledWith('status', 'achieved')
    })

    it('未認証の場合はエラーを投げる', async () => {
      mockClient = createMockSupabaseClient({ userId: '' })
      api = new GoalAPI(mockClient)

      await expect(api.getGoals()).rejects.toThrow('認証が必要です')
    })
  })

  describe('getGoalWithMilestones', () => {
    it('目標とマイルストーンを取得できる', async () => {
      const mockGoal = createMockGoal()
      const mockMilestone = createMockMilestone()

      mockClient.from = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            ...mockGoal,
            competition: createMockCompetition(),
            style: createMockStyle(),
            milestones: [mockMilestone]
          },
          error: null
        })
      })

      const result = await api.getGoalWithMilestones('goal-1')

      expect(result).not.toBeNull()
      expect(result?.milestones).toHaveLength(1)
    })

    it('存在しない目標の場合はnullを返す', async () => {
      mockClient.from = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { code: 'PGRST116' }
        })
      })

      const result = await api.getGoalWithMilestones('invalid-id')

      expect(result).toBeNull()
    })
  })

  describe('updateGoal', () => {
    it('目標を更新できる', async () => {
      const updatedGoal = createMockGoal({ target_time: 55 })

      mockClient.from = vi.fn().mockReturnValue({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: updatedGoal,
          error: null
        })
      })

      const result = await api.updateGoal('goal-1', { targetTime: 55 })

      expect(result.target_time).toBe(55)
    })

    it('達成済みに変更すると achieved_at が設定される', async () => {
      const achievedGoal = createMockGoal({ status: 'achieved', achieved_at: '2025-01-15T00:00:00Z' })

      const builder = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: achievedGoal,
          error: null
        })
      }
      mockClient.from = vi.fn().mockReturnValue(builder)

      await api.updateGoal('goal-1', { status: 'achieved' })

      expect(builder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'achieved',
          achieved_at: expect.any(String)
        })
      )
    })
  })

  describe('deleteGoal', () => {
    it('目標を削除できる', async () => {
      mockClient.from = vi.fn().mockReturnValue({
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null })
      })

      await expect(api.deleteGoal('goal-1')).resolves.not.toThrow()
    })

    it('削除エラーの場合は例外を投げる', async () => {
      const error = new Error('削除失敗')
      mockClient.from = vi.fn().mockReturnValue({
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error })
      })

      await expect(api.deleteGoal('goal-1')).rejects.toThrow(error)
    })
  })

  describe('calculateGoalProgress', () => {
    it('進捗率を計算できる', async () => {
      const mockGoal = createMockGoal({ start_time: 70, target_time: 60 })

      mockClient.from = vi.fn((table: string) => {
        if (table === 'goals') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: mockGoal,
              error: null
            })
          }
        }
        if (table === 'records') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { time: 65 }, // 5秒短縮（目標10秒短縮の50%達成）
              error: null
            })
          }
        }
        return createMockQueryBuilder()
      })

      const progress = await api.calculateGoalProgress('goal-1')

      expect(progress).toBe(50) // (70-65)/(70-60) * 100 = 50%
    })

    it('初期タイムがない場合は0を返す', async () => {
      const mockGoal = createMockGoal({ start_time: null })

      mockClient.from = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: mockGoal,
          error: null
        })
      })

      const progress = await api.calculateGoalProgress('goal-1')

      expect(progress).toBe(0)
    })

    it('未認証の場合はエラーを投げる', async () => {
      mockClient = createMockSupabaseClient({ userId: '' })
      api = new GoalAPI(mockClient)

      await expect(api.calculateGoalProgress('goal-1')).rejects.toThrow('認証が必要です')
    })
  })

  describe('createMilestone', () => {
    it('マイルストーンを作成できる', async () => {
      const mockMilestone = createMockMilestone()

      mockClient.from = vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: mockMilestone,
          error: null
        })
      })

      const result = await api.createMilestone({
        goalId: 'goal-1',
        title: 'テストマイルストーン',
        type: 'time',
        params: { distance: 100, target_time: 60, style: 'Fr', swim_category: 'Swim' as const }
      })

      expect(result).toEqual(mockMilestone)
    })
  })

  describe('getMilestones', () => {
    it('マイルストーン一覧を取得できる', async () => {
      const mockMilestones = [createMockMilestone()]

      mockClient.from = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: mockMilestones,
          error: null
        })
      })

      const result = await api.getMilestones('goal-1')

      expect(result).toEqual(mockMilestones)
    })

    it('ステータスでフィルタできる', async () => {
      const builder: any = {
        select: vi.fn(),
        eq: vi.fn(),
        in: vi.fn(),
        order: vi.fn(),
        then: vi.fn()
      }
      // チェーン対応：全てのメソッドがbuilder自身を返す
      builder.select.mockReturnValue(builder)
      builder.eq.mockReturnValue(builder)
      builder.in.mockReturnValue(builder)
      builder.order.mockReturnValue(builder)
      // thenableとして動作させる
      builder.then.mockImplementation((onFulfilled: any) =>
        Promise.resolve({ data: [], error: null }).then(onFulfilled)
      )
      mockClient.from = vi.fn().mockReturnValue(builder)

      await api.getMilestones('goal-1', { status: ['in_progress', 'achieved'] })

      expect(builder.in).toHaveBeenCalledWith('status', ['in_progress', 'achieved'])
    })

    it('期限でフィルタできる', async () => {
      const builder: any = {
        select: vi.fn(),
        eq: vi.fn(),
        or: vi.fn(),
        order: vi.fn(),
        then: vi.fn()
      }
      // チェーン対応：全てのメソッドがbuilder自身を返す
      builder.select.mockReturnValue(builder)
      builder.eq.mockReturnValue(builder)
      builder.or.mockReturnValue(builder)
      builder.order.mockReturnValue(builder)
      // thenableとして動作させる
      builder.then.mockImplementation((onFulfilled: any) =>
        Promise.resolve({ data: [], error: null }).then(onFulfilled)
      )
      mockClient.from = vi.fn().mockReturnValue(builder)

      await api.getMilestones('goal-1', { deadlineAfter: '2025-01-01' })

      expect(builder.or).toHaveBeenCalledWith('deadline.gte.2025-01-01,deadline.is.null')
    })
  })

  describe('updateMilestone', () => {
    it('マイルストーンを更新できる', async () => {
      const updatedMilestone = createMockMilestone({ title: '更新済み' })

      mockClient.from = vi.fn().mockReturnValue({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: updatedMilestone,
          error: null
        })
      })

      const result = await api.updateMilestone('milestone-1', { title: '更新済み' })

      expect(result.title).toBe('更新済み')
    })

    it('内省メモを保存するとreflection_doneがtrueになる', async () => {
      const builder = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: createMockMilestone({ reflection_done: true, reflection_note: 'メモ' }),
          error: null
        })
      }
      mockClient.from = vi.fn().mockReturnValue(builder)

      await api.updateMilestone('milestone-1', { reflectionNote: 'メモ' })

      expect(builder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          reflection_note: 'メモ',
          reflection_done: true
        })
      )
    })
  })

  describe('deleteMilestone', () => {
    it('マイルストーンを削除できる', async () => {
      mockClient.from = vi.fn().mockReturnValue({
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null })
      })

      await expect(api.deleteMilestone('milestone-1')).resolves.not.toThrow()
    })
  })

  describe('getExpiredGoals', () => {
    it('期限切れの目標を取得できる', async () => {
      const mockGoal = createMockGoal()
      const pastDate = '2024-01-01'

      vi.useFakeTimers()
      vi.setSystemTime(new Date('2025-01-15'))

      mockClient.from = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        lt: vi.fn().mockResolvedValue({
          data: [{
            ...mockGoal,
            competition: createMockCompetition({ date: pastDate }),
            style: createMockStyle(),
            milestones: []
          }],
          error: null
        })
      })

      const result = await api.getExpiredGoals()

      expect(result).toHaveLength(1)

      vi.useRealTimers()
    })

    it('未認証の場合はエラーを投げる', async () => {
      mockClient = createMockSupabaseClient({ userId: '' })
      api = new GoalAPI(mockClient)

      await expect(api.getExpiredGoals()).rejects.toThrow('認証が必要です')
    })
  })

  describe('getExpiredMilestones', () => {
    it('期限切れのマイルストーンを取得できる', async () => {
      const mockMilestones = [createMockMilestone({ deadline: '2024-01-01' })]

      vi.useFakeTimers()
      vi.setSystemTime(new Date('2025-01-15'))

      mockClient.from = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        not: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
        neq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: mockMilestones,
          error: null
        })
      })

      const result = await api.getExpiredMilestones()

      expect(result).toEqual(mockMilestones)

      vi.useRealTimers()
    })

    it('未認証の場合はエラーを投げる', async () => {
      mockClient = createMockSupabaseClient({ userId: '' })
      api = new GoalAPI(mockClient)

      await expect(api.getExpiredMilestones()).rejects.toThrow('認証が必要です')
    })
  })

  describe('checkMilestoneAchievement', () => {
    it('time型の達成判定ができる', async () => {
      const milestone = createMockMilestone({
        type: 'time',
        params: { distance: 100, target_time: 60, style: 'Fr' }
      })

      mockClient.from = vi.fn((table: string) => {
        if (table === 'milestones') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: milestone,
              error: null
            })
          }
        }
        if (table === 'practice_logs') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({
              data: [{
                id: 'log-1',
                practice_times: [{ time: 59 }]
              }],
              error: null
            })
          }
        }
        return createMockQueryBuilder([])
      })

      const result = await api.checkMilestoneAchievement('milestone-1')

      expect(result.achieved).toBe(true)
      expect(result.achievementData?.achievedValue.time).toBe(59)
    })

    it('未認証の場合はエラーを投げる', async () => {
      mockClient = createMockSupabaseClient({ userId: '' })
      api = new GoalAPI(mockClient)

      await expect(api.checkMilestoneAchievement('milestone-1')).rejects.toThrow('認証が必要です')
    })
  })

  describe('updateMilestoneStatus', () => {
    it('ステータスを更新できる', async () => {
      const updatedMilestone = createMockMilestone({ status: 'achieved' })

      mockClient.from = vi.fn().mockReturnValue({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: updatedMilestone,
          error: null
        })
      })

      const result = await api.updateMilestoneStatus('milestone-1', 'achieved')

      expect(result.status).toBe('achieved')
    })

    it('achievedAtを設定できる', async () => {
      const builder = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: createMockMilestone({ status: 'achieved', achieved_at: '2025-01-15T00:00:00Z' }),
          error: null
        })
      }
      mockClient.from = vi.fn().mockReturnValue(builder)

      await api.updateMilestoneStatus('milestone-1', 'achieved', '2025-01-15T00:00:00Z')

      expect(builder.update).toHaveBeenCalledWith({
        status: 'achieved',
        achieved_at: '2025-01-15T00:00:00Z'
      })
    })
  })
})

describe('GoalAPI - マイルストーン状態遷移', () => {
  let mockClient: any
  let api: GoalAPI

  beforeEach(() => {
    vi.clearAllMocks()
    mockClient = createMockSupabaseClient()
    api = new GoalAPI(mockClient)
  })

  describe('hasRecordsForMilestone', () => {
    describe('time型のマイルストーン', () => {
      const milestone: Milestone = {
        id: 'milestone-1',
        goal_id: 'goal-1',
        title: '100m自由形を60秒で',
        type: 'time',
        params: {
          distance: 100,
          target_time: 60,
          style: 'Fr' // スタイルコード（'Fr', 'Ba', 'Br', 'Fly', 'IM'のいずれか）
        } as MilestoneTimeParams,
        deadline: null,
        status: 'not_started',
        achieved_at: null,
        reflection_done: false,
        reflection_note: null,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      }

      it('練習記録が存在する場合、trueを返す', async () => {
        // practice_logsにレコードが存在する場合
        mockClient.from = vi.fn((table: string) => {
          if (table === 'practice_logs') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              limit: vi.fn().mockResolvedValue({
                data: [{
                  id: 'log-1',
                  practice_times: [{ id: 'time-1' }]
                }],
                error: null
              })
            }
          }
          // recordsテーブルのクエリ（レコードなし）
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({
              data: [],
              error: null
            })
          }
        })

        // プライベートメソッドをテストするため、updateAllMilestoneStatusesを通じて間接的にテスト
        // 実際には、hasRecordsForMilestoneは内部で呼ばれるため、updateAllMilestoneStatusesの動作で確認
        mockClient.from = vi.fn((table: string) => {
          if (table === 'milestones') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              in: vi.fn().mockResolvedValue({
                data: [milestone],
                error: null
              })
            }
          }
          if (table === 'practice_logs') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              limit: vi.fn().mockResolvedValue({
                data: [{
                  id: 'log-1',
                  practice_times: [{ id: 'time-1' }]
                }],
                error: null
              })
            }
          }
          // recordsテーブル
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({
              data: [],
              error: null
            })
          }
        })

        // checkMilestoneAchievementのモック
        vi.spyOn(api, 'checkMilestoneAchievement').mockResolvedValue({
          achieved: false,
          achievementData: undefined
        })

        // updateMilestoneStatusのモック
        vi.spyOn(api, 'updateMilestoneStatus').mockResolvedValue({
          ...milestone,
          status: 'in_progress'
        })

        await api.updateAllMilestoneStatuses('test-user-id')

        // レコードが存在するため、in_progressに変更される
        expect(api.updateMilestoneStatus).toHaveBeenCalledWith(milestone.id, 'in_progress')
      })

      it('レコードが存在しない場合、ステータスが変更されない', async () => {
        mockClient.from = vi.fn((table: string) => {
          if (table === 'milestones') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              in: vi.fn().mockResolvedValue({
                data: [milestone],
                error: null
              })
            }
          }
          if (table === 'practice_logs') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              limit: vi.fn().mockResolvedValue({
                data: [],
                error: null
              })
            }
          }
          // recordsテーブル
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({
              data: [],
              error: null
            })
          }
        })

        // checkMilestoneAchievementのモック
        vi.spyOn(api, 'checkMilestoneAchievement').mockResolvedValue({
          achieved: false,
          achievementData: undefined
        })

        // updateMilestoneStatusのモック
        vi.spyOn(api, 'updateMilestoneStatus').mockResolvedValue(milestone)

        await api.updateAllMilestoneStatuses('test-user-id')

        // レコードが存在しないため、ステータスは変更されない
        expect(api.updateMilestoneStatus).not.toHaveBeenCalledWith(milestone.id, 'in_progress')
      })
    })

    describe('reps_time型のマイルストーン', () => {
      const milestone: Milestone = {
        id: 'milestone-2',
        goal_id: 'goal-1',
        title: '100m自由形×4本の平均タイム',
        type: 'reps_time',
        params: {
          distance: 100,
          reps: 4,
          sets: 1,
          target_average_time: 65,
          style: 'freestyle',
          swim_category: 'Swim',
          circle: 1
        } as MilestoneRepsTimeParams,
        deadline: null,
        status: 'not_started',
        achieved_at: null,
        reflection_done: false,
        reflection_note: null,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      }

      it('レコードが存在する場合、in_progressに変更される', async () => {
        mockClient.from = vi.fn((table: string) => {
          if (table === 'milestones') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              in: vi.fn().mockResolvedValue({
                data: [milestone],
                error: null
              })
            }
          }
          if (table === 'practice_logs') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              gte: vi.fn().mockReturnThis(),
              limit: vi.fn().mockResolvedValue({
                data: [{
                  id: 'log-1',
                  practice_times: [{ id: 'time-1' }]
                }],
                error: null
              })
            }
          }
          return createMockQueryBuilder([])
        })

        // checkMilestoneAchievementのモック
        vi.spyOn(api, 'checkMilestoneAchievement').mockResolvedValue({
          achieved: false,
          achievementData: undefined
        })

        // updateMilestoneStatusのモック
        vi.spyOn(api, 'updateMilestoneStatus').mockResolvedValue({
          ...milestone,
          status: 'in_progress'
        })

        await api.updateAllMilestoneStatuses('test-user-id')

        // レコードが存在するため、in_progressに変更される
        expect(api.updateMilestoneStatus).toHaveBeenCalledWith(milestone.id, 'in_progress')
      })

      it('レコードが存在しない場合、ステータスが変更されない', async () => {
        mockClient.from = vi.fn((table: string) => {
          if (table === 'milestones') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              in: vi.fn().mockResolvedValue({
                data: [milestone],
                error: null
              })
            }
          }
          if (table === 'practice_logs') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              gte: vi.fn().mockReturnThis(),
              limit: vi.fn().mockResolvedValue({
                data: [],
                error: null
              })
            }
          }
          return createMockQueryBuilder([])
        })

        // checkMilestoneAchievementのモック
        vi.spyOn(api, 'checkMilestoneAchievement').mockResolvedValue({
          achieved: false,
          achievementData: undefined
        })

        // updateMilestoneStatusのモック
        vi.spyOn(api, 'updateMilestoneStatus').mockResolvedValue(milestone)

        await api.updateAllMilestoneStatuses('test-user-id')

        // レコードが存在しないため、ステータスは変更されない
        expect(api.updateMilestoneStatus).not.toHaveBeenCalledWith(milestone.id, 'in_progress')
      })
    })

    describe('set型のマイルストーン', () => {
      const milestone: Milestone = {
        id: 'milestone-3',
        goal_id: 'goal-1',
        title: '100m自由形×4本×3セット',
        type: 'set',
        params: {
          distance: 100,
          reps: 4,
          sets: 3,
          style: 'freestyle',
          swim_category: 'Swim',
          circle: 1
        } as MilestoneSetParams,
        deadline: null,
        status: 'not_started',
        achieved_at: null,
        reflection_done: false,
        reflection_note: null,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      }

      it('レコードが存在する場合、in_progressに変更される', async () => {
        mockClient.from = vi.fn((table: string) => {
          if (table === 'milestones') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              in: vi.fn().mockResolvedValue({
                data: [milestone],
                error: null
              })
            }
          }
          if (table === 'practice_logs') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              gte: vi.fn().mockReturnThis(),
              limit: vi.fn().mockResolvedValue({
                data: [{ id: 'log-1' }],
                error: null
              })
            }
          }
          return createMockQueryBuilder([])
        })

        // checkMilestoneAchievementのモック
        vi.spyOn(api, 'checkMilestoneAchievement').mockResolvedValue({
          achieved: false,
          achievementData: undefined
        })

        // updateMilestoneStatusのモック
        vi.spyOn(api, 'updateMilestoneStatus').mockResolvedValue({
          ...milestone,
          status: 'in_progress'
        })

        await api.updateAllMilestoneStatuses('test-user-id')

        // レコードが存在するため、in_progressに変更される
        expect(api.updateMilestoneStatus).toHaveBeenCalledWith(milestone.id, 'in_progress')
      })

      it('レコードが存在しない場合、ステータスが変更されない', async () => {
        mockClient.from = vi.fn((table: string) => {
          if (table === 'milestones') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              in: vi.fn().mockResolvedValue({
                data: [milestone],
                error: null
              })
            }
          }
          if (table === 'practice_logs') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              gte: vi.fn().mockReturnThis(),
              limit: vi.fn().mockResolvedValue({
                data: [],
                error: null
              })
            }
          }
          return createMockQueryBuilder([])
        })

        // checkMilestoneAchievementのモック
        vi.spyOn(api, 'checkMilestoneAchievement').mockResolvedValue({
          achieved: false,
          achievementData: undefined
        })

        // updateMilestoneStatusのモック
        vi.spyOn(api, 'updateMilestoneStatus').mockResolvedValue(milestone)

        await api.updateAllMilestoneStatuses('test-user-id')

        // レコードが存在しないため、ステータスは変更されない
        expect(api.updateMilestoneStatus).not.toHaveBeenCalledWith(milestone.id, 'in_progress')
      })
    })
  })

  describe('updateAllMilestoneStatuses - 達成済みマイルストーン', () => {
    it('達成済みのマイルストーンはステータスが更新される', async () => {
      const achievedMilestone: Milestone = {
        id: 'milestone-achieved',
        goal_id: 'goal-1',
        title: '100m自由形を60秒で',
        type: 'time',
        params: {
          distance: 100,
          target_time: 60,
          style: 'freestyle'
        } as MilestoneTimeParams,
        deadline: null,
        status: 'in_progress',
        achieved_at: null,
        reflection_done: false,
        reflection_note: null,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z'
      }

      mockClient.from = vi.fn((table: string) => {
        if (table === 'milestones') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            in: vi.fn().mockResolvedValue({
              data: [achievedMilestone],
              error: null
            })
          }
        }
        return createMockSupabaseClient().from(table)
      })

      // checkMilestoneAchievementのモック（達成済み）
      vi.spyOn(api, 'checkMilestoneAchievement').mockResolvedValue({
        achieved: true,
        achievementData: {
          practiceLogId: 'log-1',
          achievedValue: { time: 59, target_time: 60 }
        }
      })

      // updateMilestoneStatusのモック
      vi.spyOn(api, 'updateMilestoneStatus').mockResolvedValue({
        ...achievedMilestone,
        status: 'achieved'
      })

      await api.updateAllMilestoneStatuses('test-user-id')

      // 達成済みのため、achievedに変更される
      expect(api.updateMilestoneStatus).toHaveBeenCalledWith(
        achievedMilestone.id,
        'achieved',
        expect.any(String)
      )
    })
  })
})
