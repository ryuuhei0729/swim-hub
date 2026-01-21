import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createMockQueryBuilder,
  createMockSupabaseClient,
} from '../../__mocks__/supabase'
import { GoalAPI } from '../../api/goals'
import type { Milestone, MilestoneRepsTimeParams, MilestoneSetParams, MilestoneTimeParams } from '../../types/goals'

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
