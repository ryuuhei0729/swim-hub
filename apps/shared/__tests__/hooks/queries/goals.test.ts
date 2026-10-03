import { describe, expect, it, vi, beforeEach } from "vitest";
import { waitFor, act } from "@testing-library/react";
import {
  createMockSupabaseClient,
  createMockCompetition,
  createMockStyle,
} from "../../../__mocks__/supabase";
import { GoalAPI } from "../../../api/goals";
import { useGoalsQuery, useGoalDetailQuery, goalKeys } from "../../../hooks/queries/goals";
import { renderQueryHook, createTestQueryClient } from "../../utils/test-utils";
import type { Goal, GoalWithMilestones } from "../../../types";

// APIをモック化。useGoalsQuery は L3 (RecordAPI.getCompetitions ではなく
// GoalAPI.getSelectableCompetitions を使う。個人大会+所属チームの大会を対象にするため)
// に伴い RecordAPI へは依存しなくなった (課題C)。
vi.mock("../../../api/goals", () => ({
  GoalAPI: vi.fn().mockImplementation(() => ({
    getGoals: vi.fn(),
    getGoalWithMilestones: vi.fn(),
    getSelectableCompetitions: vi.fn(),
  })),
}));

// フィクスチャデータ
const createMockGoal = (overrides: Partial<Goal> = {}): Goal => ({
  id: "goal-1",
  user_id: "test-user-id",
  competition_id: "comp-1",
  style_id: 1,
  target_time: 55.0,
  start_time: 60.0,
  status: "active",
  achieved_at: null,
  // M3 (reflection_note 追加) 後、Goal 型は非 optional なので fixture にも必須
  // (Developer 報告の課題D。欠落させると tsc エラーになる)。
  reflection_note: null,
  created_at: "2025-01-15T10:00:00Z",
  updated_at: "2025-01-15T10:00:00Z",
  ...overrides,
});

const createMockGoalWithMilestones = (
  overrides: Partial<GoalWithMilestones> = {},
): GoalWithMilestones => ({
  ...createMockGoal(),
  competition: createMockCompetition(),
  style: createMockStyle(),
  milestones: [
    {
      id: "milestone-1",
      goal_id: "goal-1",
      title: "50m 30秒切り",
      type: "time",
      params: { distance: 50, target_time: 30, style: "Fr", swim_category: "Swim" },
      deadline: "2025-06-01",
      status: "in_progress",
      achieved_at: null,
      reflection_done: false,
      reflection_note: null,
      created_at: "2025-01-15T10:00:00Z",
      updated_at: "2025-01-15T10:00:00Z",
    },
  ],
  ...overrides,
});

describe("Goal Query Hooks", () => {
  let mockSupabase: ReturnType<typeof createMockSupabaseClient>;
  let mockGoalApi: {
    getGoals: ReturnType<typeof vi.fn>;
    getGoalWithMilestones: ReturnType<typeof vi.fn>;
    getSelectableCompetitions: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = createMockSupabaseClient();
    mockGoalApi = {
      getGoals: vi.fn(),
      getGoalWithMilestones: vi.fn(),
      getSelectableCompetitions: vi.fn(),
    };

    // コンストラクタがモックAPIインスタンスを返すように設定
    vi.mocked(GoalAPI).mockImplementation(() => mockGoalApi as unknown as GoalAPI);
  });

  describe("useGoalsQuery", () => {
    it("目標一覧を取得し、competition/styleフィールドを正しくマッピングする", async () => {
      const mockGoals = [
        createMockGoal({ id: "goal-1", competition_id: "comp-1", style_id: 1 }),
        createMockGoal({ id: "goal-2", competition_id: "comp-2", style_id: 2 }),
      ];
      const mockCompetitions = [
        createMockCompetition({ id: "comp-1", title: "春季大会" }),
        createMockCompetition({ id: "comp-2", title: "夏季大会" }),
      ];
      const mockStyles = [
        createMockStyle({ id: 1, name_jp: "自由形" }),
        createMockStyle({ id: 2, name_jp: "背泳ぎ" }),
      ];

      mockGoalApi.getGoals.mockResolvedValue(mockGoals);
      mockGoalApi.getSelectableCompetitions.mockResolvedValue(mockCompetitions);

      const { result } = renderQueryHook(() => useGoalsQuery(mockSupabase, { styles: mockStyles }));

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(result.current.data).toHaveLength(2);
      expect(result.current.data![0]).toMatchObject({
        id: "goal-1",
        competition: { title: "春季大会" },
        style: { name_jp: "自由形" },
      });
      expect(result.current.data![1]).toMatchObject({
        id: "goal-2",
        competition: { title: "夏季大会" },
        style: { name_jp: "背泳ぎ" },
      });
    });

    it("competition_idに一致する大会がない場合はnullになる (GoalList/GoalDetail の `=== null` 判定と一致させるため)", async () => {
      const mockGoals = [createMockGoal({ competition_id: "comp-unknown" })];
      mockGoalApi.getGoals.mockResolvedValue(mockGoals);
      mockGoalApi.getSelectableCompetitions.mockResolvedValue([]);

      const { result } = renderQueryHook(() => useGoalsQuery(mockSupabase, { styles: [] }));

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      // mockGoals は1件のみ返すため、data[0] は必ず存在する。
      // 旧実装は undefined を返しており (GoalList/GoalDetail の `=== null` 判定と
      // 噛み合わず「大会情報なし」表示・編集ボタン非表示が発火しない実バグの原因だった)、
      // このテスト自体がその挙動を pin していた。修正後は null を返す。
      expect(result.current.data![0]!.competition).toBeNull();
      expect(result.current.data![0]!.style).toBeUndefined();
    });

    it("invalidate()がgoalKeys.allでinvalidateQueriesを呼び出す", async () => {
      mockGoalApi.getGoals.mockResolvedValue([]);
      mockGoalApi.getSelectableCompetitions.mockResolvedValue([]);

      const queryClient = createTestQueryClient();
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

      const { result } = renderQueryHook(() => useGoalsQuery(mockSupabase), { queryClient });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      await act(async () => {
        await result.current.invalidate();
      });

      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: goalKeys.all });
    });
  });

  describe("useGoalDetailQuery", () => {
    it("goalIdがnullの場合、getGoalWithMilestonesを呼び出さない", async () => {
      const { result } = renderQueryHook(() => useGoalDetailQuery(mockSupabase, null));

      // enabled=falseなのでクエリは実行されない
      await waitFor(() => {
        expect(result.current.fetchStatus).toBe("idle");
      });

      expect(mockGoalApi.getGoalWithMilestones).not.toHaveBeenCalled();
    });

    it("goalIdが設定された場合、getGoalWithMilestonesを呼び出す", async () => {
      const mockGoalDetail = createMockGoalWithMilestones();
      mockGoalApi.getGoalWithMilestones.mockResolvedValue(mockGoalDetail);

      const { result } = renderQueryHook(() => useGoalDetailQuery(mockSupabase, "goal-1"));

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      expect(mockGoalApi.getGoalWithMilestones).toHaveBeenCalledWith("goal-1");
      expect(result.current.data).toEqual(mockGoalDetail);
    });

    it("invalidate()がgoalKeys.detail(goalId)でinvalidateQueriesを呼び出す", async () => {
      const mockGoalDetail = createMockGoalWithMilestones();
      mockGoalApi.getGoalWithMilestones.mockResolvedValue(mockGoalDetail);

      const queryClient = createTestQueryClient();
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

      const { result } = renderQueryHook(() => useGoalDetailQuery(mockSupabase, "goal-1"), {
        queryClient,
      });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      await act(async () => {
        await result.current.invalidate();
      });

      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: goalKeys.detail("goal-1"),
      });
    });

    it("goalIdがnullの場合、invalidate()はinvalidateQueriesを呼び出さない", async () => {
      const queryClient = createTestQueryClient();
      const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

      const { result } = renderQueryHook(() => useGoalDetailQuery(mockSupabase, null), {
        queryClient,
      });

      await act(async () => {
        await result.current.invalidate();
      });

      expect(invalidateSpy).not.toHaveBeenCalled();
    });
  });
});
