import { describe, expect, it, vi, beforeEach } from 'vitest'
import { waitFor, act } from '@testing-library/react'
import {
  createMockSupabaseClient,
  createMockCompetition,
  createMockStyle,
} from '../../../__mocks__/supabase'
import { GoalAPI } from '../../../api/goals'
import { RecordAPI } from '../../../api/records'
import {
  useGoalsQuery,
  useGoalDetailQuery,
  goalKeys,
} from '../../../hooks/queries/goals'
import { renderQueryHook, createTestQueryClient } from '../../utils/test-utils'
import type { Goal, GoalWithMilestones } from '../../../types'

// APIをモック化
vi.mock('../../../api/goals', () => ({
  GoalAPI: vi.fn().mockImplementation(() => ({
    getGoals: vi.fn(),
    getGoalWithMilestones: vi.fn(),
  })),
}))

vi.mock('../../../api/records', () => ({
  RecordAPI: vi.fn().mockImplementation(() => ({
    getCompetitions: vi.fn(),
  })),
}))

// フィクスチャデータ
const createMockGoal = (overrides: Partial<Goal> = {}): Goal => ({
  id: 'goal-1',
  user_id: 'test-user-id',
  competition_id: 'comp-1',
  style_id: 1,
  target_time: 55.0,
  start_time: 60.0,
  status: 'active',
  achieved_at: null,
  created_at: '2025-01-15T10:00:00Z',
  updated_at: '2025-01-15T10:00:00Z',
  ...overrides,
})

const createMockGoalWithMilestones = (
  overrides: Partial<GoalWithMilestones> = {}
): GoalWithMilestones => ({
  ...createMockGoal(),
  competition: createMockCompetition(),
  style: createMockStyle(),
  milestones: [
    {
      id: 'milestone-1',
      goal_id: 'goal-1',
      title: '50m 30秒切り',
      type: 'time',
      params: { distance: 50, target_time: 30, style: 'fr', swim_category: 'Swim' },
      deadline: '2025-06-01',
      status: 'in_progress',
      achieved_at: null,
      reflection_done: false,
      reflection_note: null,
      created_at: '2025-01-15T10:00:00Z',
      updated_at: '2025-01-15T10:00:00Z',
    },
  ],
  ...overrides,
})

describe('Goal Query Hooks', () => {
  let mockSupabase: ReturnType<typeof createMockSupabaseClient>
  let mockGoalApi: {
    getGoals: ReturnType<typeof vi.fn>
    getGoalWithMilestones: ReturnType<typeof vi.fn>
  }
  let mockRecordApi: {
    getCompetitions: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockSupabase = createMockSupabaseClient()
    mockGoalApi = {
      getGoals: vi.fn(),
      getGoalWithMilestones: vi.fn(),
    }
    mockRecordApi = {
      getCompetitions: vi.fn(),
    }

    // コンストラクタがモックAPIインスタンスを返すように設定
    vi.mocked(GoalAPI).mockImplementation(() => mockGoalApi as unknown as GoalAPI)
    vi.mocked(RecordAPI).mockImplementation(() => mockRecordApi as unknown as RecordAPI)
  })

  describe('useGoalsQuery', () => {
    it('目標一覧を取得し、competition/styleフィールドを正しくマッピングする', async () => {
      const mockGoals = [
        createMockGoal({ id: 'goal-1', competition_id: 'comp-1', style_id: 1 }),
        createMockGoal({ id: 'goal-2', competition_id: 'comp-2', style_id: 2 }),
      ]
      const mockCompetitions = [
        createMockCompetition({ id: 'comp-1', title: '春季大会' }),
        createMockCompetition({ id: 'comp-2', title: '夏季大会' }),
      ]
      const mockStyles = [
        createMockStyle({ id: 1, name_jp: '自由形' }),
        createMockStyle({ id: 2, name_jp: '背泳ぎ' }),
      ]

      mockGoalApi.getGoals.mockResolvedValue(mockGoals)
      mockRecordApi.getCompetitions.mockResolvedValue(mockCompetitions)

      const { result } = renderQueryHook(() =>
        useGoalsQuery(mockSupabase as any, { styles: mockStyles })
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toHaveLength(2)
      expect(result.current.data![0]).toMatchObject({
        id: 'goal-1',
        competition: { title: '春季大会' },
        style: { name_jp: '自由形' },
      })
      expect(result.current.data![1]).toMatchObject({
        id: 'goal-2',
        competition: { title: '夏季大会' },
        style: { name_jp: '背泳ぎ' },
      })
    })

    it('competition_idに一致する大会がない場合はundefinedになる', async () => {
      const mockGoals = [createMockGoal({ competition_id: 'comp-unknown' })]
      mockGoalApi.getGoals.mockResolvedValue(mockGoals)
      mockRecordApi.getCompetitions.mockResolvedValue([])

      const { result } = renderQueryHook(() =>
        useGoalsQuery(mockSupabase as any, { styles: [] })
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data![0].competition).toBeUndefined()
      expect(result.current.data![0].style).toBeUndefined()
    })

    it('initialDataが提供された場合、初期値として使用される', async () => {
      const initialGoals = [createMockGoal({ id: 'initial-goal' })]

      // queryFnが解決する前に初期データが表示されることを確認
      mockGoalApi.getGoals.mockImplementation(
        () => new Promise(() => {}) // 永遠に解決しない
      )
      mockRecordApi.getCompetitions.mockImplementation(
        () => new Promise(() => {})
      )

      const { result } = renderQueryHook(() =>
        useGoalsQuery(mockSupabase as any, { initialData: initialGoals })
      )

      // initialDataが即座に使用される（competition/styleはundefinedでマッピング）
      expect(result.current.data).toHaveLength(1)
      expect(result.current.data![0]).toMatchObject({
        id: 'initial-goal',
        competition: undefined,
        style: undefined,
      })
    })

    it('invalidate()がgoalKeys.allでinvalidateQueriesを呼び出す', async () => {
      mockGoalApi.getGoals.mockResolvedValue([])
      mockRecordApi.getCompetitions.mockResolvedValue([])

      const queryClient = createTestQueryClient()
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      const { result } = renderQueryHook(
        () => useGoalsQuery(mockSupabase as any),
        { queryClient }
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      await act(async () => {
        await result.current.invalidate()
      })

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: goalKeys.all })
    })
  })

  describe('useGoalDetailQuery', () => {
    it('goalIdがnullの場合、getGoalWithMilestonesを呼び出さない', async () => {
      const { result } = renderQueryHook(() =>
        useGoalDetailQuery(mockSupabase as any, null)
      )

      // enabled=falseなのでクエリは実行されない
      await waitFor(() => {
        expect(result.current.fetchStatus).toBe('idle')
      })

      expect(mockGoalApi.getGoalWithMilestones).not.toHaveBeenCalled()
    })

    it('goalIdが設定された場合、getGoalWithMilestonesを呼び出す', async () => {
      const mockGoalDetail = createMockGoalWithMilestones()
      mockGoalApi.getGoalWithMilestones.mockResolvedValue(mockGoalDetail)

      const { result } = renderQueryHook(() =>
        useGoalDetailQuery(mockSupabase as any, 'goal-1')
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(mockGoalApi.getGoalWithMilestones).toHaveBeenCalledWith('goal-1')
      expect(result.current.data).toEqual(mockGoalDetail)
    })

    it('invalidate()がgoalKeys.detail(goalId)でinvalidateQueriesを呼び出す', async () => {
      const mockGoalDetail = createMockGoalWithMilestones()
      mockGoalApi.getGoalWithMilestones.mockResolvedValue(mockGoalDetail)

      const queryClient = createTestQueryClient()
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      const { result } = renderQueryHook(
        () => useGoalDetailQuery(mockSupabase as any, 'goal-1'),
        { queryClient }
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      await act(async () => {
        await result.current.invalidate()
      })

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: goalKeys.detail('goal-1'),
      })
    })

    it('goalIdがnullの場合、invalidate()はinvalidateQueriesを呼び出さない', async () => {
      const queryClient = createTestQueryClient()
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

      const { result } = renderQueryHook(
        () => useGoalDetailQuery(mockSupabase as any, null),
        { queryClient }
      )

      await act(async () => {
        await result.current.invalidate()
      })

      expect(invalidateSpy).not.toHaveBeenCalled()
    })
  })
})
