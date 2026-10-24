import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMockQueryBuilder,
  createMockSupabaseClient,
  createMockCompetition,
  createMockStyle,
  type MockSupabaseClient,
} from "../../__mocks__/supabase";
import { GoalAPI } from "../../api/goals";
import type {
  Goal,
  Milestone,
  MilestoneRepsTimeParams,
  MilestoneSetParams,
  MilestoneTimeParams,
} from "../../types/goals";

// テストデータのファクトリー
const createMockGoal = (overrides = {}): Goal => ({
  id: "goal-1",
  user_id: "test-user-id",
  competition_id: "comp-1",
  style_id: 1,
  target_time: 60,
  status: "active",
  achieved_at: null,
  // M3 (reflection_note 追加) 後、Goal 型は非 optional なので fixture にも必須。
  // 欠落させると tsc エラーになる (Developer 報告の課題D)。
  reflection_note: null,
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-01T00:00:00Z",
  ...overrides,
});

const createMockMilestone = (overrides = {}): Milestone => ({
  id: "milestone-1",
  goal_id: "goal-1",
  title: "テストマイルストーン",
  type: "time",
  params: {
    distance: 100,
    target_time: 60,
    style: "Fr",
    swim_category: "Swim" as const,
  },
  deadline: null,
  status: "not_started",
  achieved_at: null,
  reflection_done: false,
  reflection_note: null,
  created_at: "2025-01-01T00:00:00Z",
  updated_at: "2025-01-01T00:00:00Z",
  ...overrides,
});

describe("GoalAPI", () => {
  let mockClient: MockSupabaseClient;
  let api: GoalAPI;

  beforeEach(() => {
    mockClient = createMockSupabaseClient();
    api = new GoalAPI(mockClient);
  });

  describe("createGoal", () => {
    /**
     * goals への insert payload を捕まえる (引数を捨てない)。
     * records を引いたら記録する: 初期タイムの自動取得は撤去済みなので、createGoal は
     * records に一切問い合わせない (Sprint Contract v2 SC5)。
     */
    function trackCreateGoal(mockGoal: Goal, competition = createMockCompetition()) {
      const goalInserts: unknown[] = [];
      const competitionInserts: unknown[] = [];
      const tables: string[] = [];
      mockClient.from = vi.fn((table: string) => {
        tables.push(table);
        if (table === "competitions") {
          return {
            insert: vi.fn((v: unknown) => {
              competitionInserts.push(v);
              return { select: () => ({ single: async () => ({ data: competition, error: null }) }) };
            }),
          };
        }
        if (table === "goals") {
          return {
            insert: vi.fn((v: unknown) => {
              goalInserts.push(v);
              return { select: () => ({ single: async () => ({ data: mockGoal, error: null }) }) };
            }),
          };
        }
        return createMockQueryBuilder();
      }) as unknown as typeof mockClient.from;
      return { goalInserts, competitionInserts, tables };
    }

    it("既存の大会IDで目標を作成できる。goals の insert payload は5列だけ (初期タイムの列を含まない)", async () => {
      const mockGoal = createMockGoal();
      const { goalInserts, tables } = trackCreateGoal(mockGoal);

      const result = await api.createGoal({
        userId: "test-user-id",
        competitionId: "comp-1",
        styleId: 1,
        targetTime: 60,
      });

      expect(result).toEqual(mockGoal);
      expect(goalInserts).toEqual([
        {
          user_id: "test-user-id",
          competition_id: "comp-1",
          style_id: 1,
          target_time: 60,
          status: "active",
        },
      ]);
      expect(tables).not.toContain("records");
    });

    it("新規大会と一緒に目標を作成できる。goals の insert payload は5列だけで、大会は1回だけ insert される", async () => {
      const mockCompetition = createMockCompetition({ id: "comp-new" });
      const mockGoal = createMockGoal();
      const { goalInserts, competitionInserts, tables } = trackCreateGoal(mockGoal, mockCompetition);

      const result = await api.createGoal({
        userId: "test-user-id",
        styleId: 1,
        targetTime: 60,
        competitionData: {
          title: "テスト大会",
          date: "2025-03-01",
          place: "テスト会場",
          poolType: 1,
        },
      });

      expect(result).toEqual(mockGoal);
      expect(competitionInserts).toHaveLength(1);
      expect(goalInserts).toEqual([
        {
          user_id: "test-user-id",
          competition_id: "comp-new",
          style_id: 1,
          target_time: 60,
          status: "active",
        },
      ]);
      expect(tables).not.toContain("records");
    });

    it("[撤去の検証] 旧フォームの入力 (初期タイム・水路) が混ざって渡っても、insert payload に初期タイムの列は乗らず records も引かない", async () => {
      const mockGoal = createMockGoal();
      const { goalInserts, tables } = trackCreateGoal(mockGoal);

      // 旧 CreateGoalInput の startTime / poolType を型を迂回して渡す (書き戻しが起きたら赤)
      await api.createGoal({
        userId: "test-user-id",
        competitionId: "comp-1",
        styleId: 1,
        targetTime: 60,
        startTime: 70,
        poolType: 1,
      } as never);

      expect(goalInserts).toEqual([
        {
          user_id: "test-user-id",
          competition_id: "comp-1",
          style_id: 1,
          target_time: 60,
          status: "active",
        },
      ]);
      expect(tables).not.toContain("records");
    });

    it("goals の insert が失敗したらエラーを投げる", async () => {
      const insertError = { code: "42501", message: "rls" };
      mockClient.from = vi.fn(() => ({
        insert: vi.fn(() => ({ select: () => ({ single: async () => ({ data: null, error: insertError }) }) })),
      })) as unknown as typeof mockClient.from;

      await expect(
        api.createGoal({ userId: "test-user-id", competitionId: "comp-1", styleId: 1, targetTime: 60 }),
      ).rejects.toBe(insertError);
    });

    it("未認証の場合はエラーを投げる", async () => {
      mockClient = createMockSupabaseClient({ userId: "" });
      api = new GoalAPI(mockClient);

      await expect(
        api.createGoal({
          userId: "test-user-id",
          competitionId: "comp-1",
          styleId: 1,
          targetTime: 60,
        }),
      ).rejects.toThrow("認証が必要です");
    });

    it("大会IDも大会情報もない場合はエラーを投げる", async () => {
      await expect(
        api.createGoal({
          userId: "test-user-id",
          styleId: 1,
          targetTime: 60,
        }),
      ).rejects.toThrow("大会IDまたは大会情報が必要です");
    });
  });

  describe("getGoals", () => {
    it("目標一覧を取得できる", async () => {
      const mockGoals = [createMockGoal()];

      mockClient.from = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: mockGoals.map((g) => ({ ...g, competition: {}, style: {} })),
          error: null,
        }),
      }) as unknown as typeof mockClient.from;

      const result = await api.getGoals();

      expect(result).toHaveLength(1);
    });

    it("ステータスでフィルタできる", async () => {
      const mockGoals = [createMockGoal({ status: "achieved" })];

      const builder = {
        select: vi.fn(),
        eq: vi.fn(),
        order: vi.fn(),
        then: vi.fn(),
      };
      // チェーン対応：全てのメソッドがbuilder自身を返す
      builder.select.mockReturnValue(builder);
      builder.eq.mockReturnValue(builder);
      builder.order.mockReturnValue(builder);
      // thenableとして動作させる
      builder.then.mockImplementation((onFulfilled: (value: unknown) => unknown) =>
        Promise.resolve({
          data: mockGoals.map((g) => ({ ...g, competition: {}, style: {} })),
          error: null,
        }).then(onFulfilled),
      );
      mockClient.from = vi.fn().mockReturnValue(builder) as unknown as typeof mockClient.from;

      await api.getGoals({ status: "achieved" });

      expect(builder.eq).toHaveBeenCalledWith("status", "achieved");
    });

    it("未認証の場合はエラーを投げる", async () => {
      mockClient = createMockSupabaseClient({ userId: "" });
      api = new GoalAPI(mockClient);

      await expect(api.getGoals()).rejects.toThrow("認証が必要です");
    });
  });

  describe("getGoalWithMilestones", () => {
    it("目標とマイルストーンを取得できる", async () => {
      const mockGoal = createMockGoal();
      const mockMilestone = createMockMilestone();

      mockClient.from = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: {
            ...mockGoal,
            competition: createMockCompetition(),
            style: createMockStyle(),
            milestones: [mockMilestone],
          },
          error: null,
        }),
      }) as unknown as typeof mockClient.from;

      const result = await api.getGoalWithMilestones("goal-1");

      expect(result).not.toBeNull();
      expect(result?.milestones).toHaveLength(1);
    });

    it("存在しない目標の場合はnullを返す", async () => {
      mockClient.from = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { code: "PGRST116" },
        }),
      }) as unknown as typeof mockClient.from;

      const result = await api.getGoalWithMilestones("invalid-id");

      expect(result).toBeNull();
    });
  });

  describe("updateGoal", () => {
    function trackUpdateGoal(returned: Goal) {
      const builder = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: returned, error: null }),
      };
      mockClient.from = vi.fn().mockReturnValue(builder) as unknown as typeof mockClient.from;
      return builder;
    }

    it("目標を更新できる。update payload は渡した項目だけ ({ target_time })", async () => {
      const builder = trackUpdateGoal(createMockGoal({ target_time: 55 }));

      const result = await api.updateGoal("goal-1", { targetTime: 55 });

      expect(result.target_time).toBe(55);
      expect(builder.update).toHaveBeenCalledTimes(1);
      expect(builder.update).toHaveBeenCalledWith({ target_time: 55 });
      expect(builder.eq).toHaveBeenCalledWith("id", "goal-1");
    });

    it("フォームの更新 (大会・種目・目標タイム) の payload は3列だけ (初期タイムの列を含まない)", async () => {
      const builder = trackUpdateGoal(createMockGoal());

      await api.updateGoal("goal-1", { competitionId: "comp-2", styleId: 3, targetTime: 59.5 });

      expect(builder.update).toHaveBeenCalledWith({
        competition_id: "comp-2",
        style_id: 3,
        target_time: 59.5,
      });
    });

    it("[撤去の検証] 旧フォームの初期タイム (startTime) が混ざって渡っても update payload に乗らない", async () => {
      const builder = trackUpdateGoal(createMockGoal());

      // 旧 UpdateGoalInput の startTime を型を迂回して渡す (書き戻しが起きたら赤)
      await api.updateGoal("goal-1", { targetTime: 55, startTime: 70 } as never);
      await api.updateGoal("goal-1", { targetTime: 55, startTime: null } as never);

      expect(builder.update.mock.calls).toEqual([[{ target_time: 55 }], [{ target_time: 55 }]]);
    });

    it("達成済みに変更すると achieved_at が設定される", async () => {
      const achievedGoal = createMockGoal({
        status: "achieved",
        achieved_at: "2025-01-15T00:00:00Z",
      });

      const builder = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: achievedGoal,
          error: null,
        }),
      };
      mockClient.from = vi.fn().mockReturnValue(builder) as unknown as typeof mockClient.from;

      await api.updateGoal("goal-1", { status: "achieved" });

      expect(builder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "achieved",
          achieved_at: expect.any(String),
        }),
      );
    });
  });

  describe("deleteGoal", () => {
    // deleteGoal は delete().eq("id", id).select("id") というチェインで呼ばれる
    // (RLSがDELETEを拒否した場合もerrorを返さず0行削除で正常終了する問題への対策として
    // .select() で結果行を見る。practices.ts の deletePractice と同型)。
    // eq / select に渡された引数は戻り値経由でテストごとに検証できるようにし、
    // クエリの絞り込み対象・返却カラムを捨てない。
    const mockDeleteGoalChain = (response: { data: unknown; error: unknown }) => {
      const selectMock = vi.fn().mockResolvedValue(response);
      const eqMock = vi.fn().mockReturnThis();
      const deleteMock = vi.fn().mockReturnThis();
      const builder = { delete: deleteMock, eq: eqMock, select: selectMock };
      mockClient.from = vi.fn(() => builder) as unknown as typeof mockClient.from;
      return { deleteMock, eqMock, selectMock };
    };

    it("目標を削除できる", async () => {
      const { deleteMock, eqMock, selectMock } = mockDeleteGoalChain({
        data: [{ id: "goal-1" }],
        error: null,
      });

      await expect(api.deleteGoal("goal-1")).resolves.not.toThrow();

      expect(mockClient.from).toHaveBeenCalledWith("goals");
      expect(deleteMock).toHaveBeenCalled();
      expect(eqMock).toHaveBeenCalledWith("id", "goal-1");
      expect(selectMock).toHaveBeenCalledWith("id");
    });

    it("削除エラーの場合は例外を投げる", async () => {
      const error = new Error("削除失敗");
      mockDeleteGoalChain({ data: null, error });

      await expect(api.deleteGoal("goal-1")).rejects.toThrow(error);
    });

    describe("0行ガード (課題B展開・回帰)", () => {
      it("[D-1] DELETEが0行を返した場合はエラーをthrowする", async () => {
        const { eqMock, selectMock } = mockDeleteGoalChain({ data: [], error: null });

        await expect(api.deleteGoal("goal-1")).rejects.toThrow("大会目標の削除に失敗しました");
        expect(eqMock).toHaveBeenCalledWith("id", "goal-1");
        expect(selectMock).toHaveBeenCalledWith("id");
      });

      it("[D-2] dataがnullの場合もエラーをthrowする", async () => {
        mockDeleteGoalChain({ data: null, error: null });

        await expect(api.deleteGoal("goal-1")).rejects.toThrow("大会目標の削除に失敗しました");
      });

      it("[D-3] 1行返った場合は正常終了する(非退行)", async () => {
        const { eqMock, selectMock } = mockDeleteGoalChain({
          data: [{ id: "goal-99" }],
          error: null,
        });

        await expect(api.deleteGoal("goal-99")).resolves.toBeUndefined();
        expect(eqMock).toHaveBeenCalledWith("id", "goal-99");
        expect(selectMock).toHaveBeenCalledWith("id");
      });

      it("[D-4] errorが返った場合は元のerrorをthrowする(汎用メッセージで上書きしない)", async () => {
        const error = new Error("permission denied for table goals");
        mockDeleteGoalChain({ data: null, error });

        await expect(api.deleteGoal("goal-1")).rejects.toThrow(error);
      });
    });
  });

  describe("createMilestone", () => {
    it("マイルストーンを作成できる", async () => {
      const mockMilestone = createMockMilestone();

      mockClient.from = vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: mockMilestone,
          error: null,
        }),
      }) as unknown as typeof mockClient.from;

      const result = await api.createMilestone({
        goalId: "goal-1",
        title: "テストマイルストーン",
        type: "time",
        params: { distance: 100, target_time: 60, style: "Fr", swim_category: "Swim" as const },
      });

      expect(result).toEqual(mockMilestone);
    });
  });

  describe("getMilestones", () => {
    it("マイルストーン一覧を取得できる", async () => {
      const mockMilestones = [createMockMilestone()];

      mockClient.from = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: mockMilestones,
          error: null,
        }),
      }) as unknown as typeof mockClient.from;

      const result = await api.getMilestones("goal-1");

      expect(result).toEqual(mockMilestones);
    });

    it("ステータスでフィルタできる", async () => {
      const builder = {
        select: vi.fn(),
        eq: vi.fn(),
        in: vi.fn(),
        order: vi.fn(),
        then: vi.fn(),
      };
      // チェーン対応：全てのメソッドがbuilder自身を返す
      builder.select.mockReturnValue(builder);
      builder.eq.mockReturnValue(builder);
      builder.in.mockReturnValue(builder);
      builder.order.mockReturnValue(builder);
      // thenableとして動作させる
      builder.then.mockImplementation((onFulfilled: (value: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(onFulfilled),
      );
      mockClient.from = vi.fn().mockReturnValue(builder) as unknown as typeof mockClient.from;

      await api.getMilestones("goal-1", { status: ["in_progress", "achieved"] });

      expect(builder.in).toHaveBeenCalledWith("status", ["in_progress", "achieved"]);
    });

    it("期限でフィルタできる", async () => {
      const builder = {
        select: vi.fn(),
        eq: vi.fn(),
        or: vi.fn(),
        order: vi.fn(),
        then: vi.fn(),
      };
      // チェーン対応：全てのメソッドがbuilder自身を返す
      builder.select.mockReturnValue(builder);
      builder.eq.mockReturnValue(builder);
      builder.or.mockReturnValue(builder);
      builder.order.mockReturnValue(builder);
      // thenableとして動作させる
      builder.then.mockImplementation((onFulfilled: (value: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(onFulfilled),
      );
      mockClient.from = vi.fn().mockReturnValue(builder) as unknown as typeof mockClient.from;

      await api.getMilestones("goal-1", { deadlineAfter: "2025-01-01" });

      expect(builder.or).toHaveBeenCalledWith("deadline.gte.2025-01-01,deadline.is.null");
    });
  });

  describe("updateMilestone", () => {
    it("マイルストーンを更新できる", async () => {
      const updatedMilestone = createMockMilestone({ title: "更新済み" });

      mockClient.from = vi.fn().mockReturnValue({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: updatedMilestone,
          error: null,
        }),
      }) as unknown as typeof mockClient.from;

      const result = await api.updateMilestone("milestone-1", { title: "更新済み" });

      expect(result.title).toBe("更新済み");
    });

    it("内省メモを保存するとreflection_doneがtrueになる", async () => {
      const builder = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: createMockMilestone({ reflection_done: true, reflection_note: "メモ" }),
          error: null,
        }),
      };
      mockClient.from = vi.fn().mockReturnValue(builder) as unknown as typeof mockClient.from;

      await api.updateMilestone("milestone-1", { reflectionNote: "メモ" });

      expect(builder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          reflection_note: "メモ",
          reflection_done: true,
        }),
      );
    });
  });

  describe("deleteMilestone", () => {
    // deleteMilestone は delete().eq("id", id).select("id") というチェインで呼ばれる
    // (deleteGoal と同型: RLS拒否時0行を検出するため .select() で結果行を見る)。
    // eq / select に渡された引数は戻り値経由でテストごとに検証できるようにし、
    // クエリの絞り込み対象・返却カラムを捨てない。
    const mockDeleteMilestoneChain = (response: { data: unknown; error: unknown }) => {
      const selectMock = vi.fn().mockResolvedValue(response);
      const eqMock = vi.fn().mockReturnThis();
      const deleteMock = vi.fn().mockReturnThis();
      const builder = { delete: deleteMock, eq: eqMock, select: selectMock };
      mockClient.from = vi.fn(() => builder) as unknown as typeof mockClient.from;
      return { deleteMock, eqMock, selectMock };
    };

    it("マイルストーンを削除できる", async () => {
      const { deleteMock, eqMock, selectMock } = mockDeleteMilestoneChain({
        data: [{ id: "milestone-1" }],
        error: null,
      });

      await expect(api.deleteMilestone("milestone-1")).resolves.not.toThrow();

      expect(mockClient.from).toHaveBeenCalledWith("milestones");
      expect(deleteMock).toHaveBeenCalled();
      expect(eqMock).toHaveBeenCalledWith("id", "milestone-1");
      expect(selectMock).toHaveBeenCalledWith("id");
    });

    describe("0行ガード (課題B展開・回帰)", () => {
      it("[D-5] DELETEが0行を返した場合はエラーをthrowする", async () => {
        const { eqMock, selectMock } = mockDeleteMilestoneChain({ data: [], error: null });

        await expect(api.deleteMilestone("milestone-1")).rejects.toThrow(
          "マイルストーンの削除に失敗しました",
        );
        expect(eqMock).toHaveBeenCalledWith("id", "milestone-1");
        expect(selectMock).toHaveBeenCalledWith("id");
      });

      it("[D-6] dataがnullの場合もエラーをthrowする", async () => {
        mockDeleteMilestoneChain({ data: null, error: null });

        await expect(api.deleteMilestone("milestone-1")).rejects.toThrow(
          "マイルストーンの削除に失敗しました",
        );
      });

      it("[D-7] 1行返った場合は正常終了する(非退行)", async () => {
        const { eqMock, selectMock } = mockDeleteMilestoneChain({
          data: [{ id: "milestone-99" }],
          error: null,
        });

        await expect(api.deleteMilestone("milestone-99")).resolves.toBeUndefined();
        expect(eqMock).toHaveBeenCalledWith("id", "milestone-99");
        expect(selectMock).toHaveBeenCalledWith("id");
      });

      it("[D-8] errorが返った場合は元のerrorをthrowする(汎用メッセージで上書きしない)", async () => {
        const error = new Error("permission denied for table milestones");
        mockDeleteMilestoneChain({ data: null, error });

        await expect(api.deleteMilestone("milestone-1")).rejects.toThrow(error);
      });
    });
  });

  describe("getExpiredGoals", () => {
    it("期限切れの目標を取得できる", async () => {
      const mockGoal = createMockGoal();
      const pastDate = "2024-01-01";

      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-01-15"));

      mockClient.from = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        lt: vi.fn().mockResolvedValue({
          data: [
            {
              ...mockGoal,
              competition: createMockCompetition({ date: pastDate }),
              style: createMockStyle(),
              milestones: [],
            },
          ],
          error: null,
        }),
      }) as unknown as typeof mockClient.from;

      const result = await api.getExpiredGoals();

      expect(result).toHaveLength(1);

      vi.useRealTimers();
    });

    it("未認証の場合はエラーを投げる", async () => {
      mockClient = createMockSupabaseClient({ userId: "" });
      api = new GoalAPI(mockClient);

      await expect(api.getExpiredGoals()).rejects.toThrow("認証が必要です");
    });
  });

  describe("getExpiredMilestones", () => {
    it("期限切れのマイルストーンを取得できる", async () => {
      const mockMilestones = [createMockMilestone({ deadline: "2024-01-01" })];

      vi.useFakeTimers();
      vi.setSystemTime(new Date("2025-01-15"));

      mockClient.from = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        not: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
        neq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: mockMilestones,
          error: null,
        }),
      }) as unknown as typeof mockClient.from;

      const result = await api.getExpiredMilestones();

      expect(result).toEqual(mockMilestones);

      vi.useRealTimers();
    });

    it("未認証の場合はエラーを投げる", async () => {
      mockClient = createMockSupabaseClient({ userId: "" });
      api = new GoalAPI(mockClient);

      await expect(api.getExpiredMilestones()).rejects.toThrow("認証が必要です");
    });
  });

  describe("checkMilestoneAchievement", () => {
    it("time型の達成判定ができる", async () => {
      const milestone = createMockMilestone({
        type: "time",
        params: { distance: 100, target_time: 60, style: "Fr" },
      });

      mockClient.from = vi.fn((table: string) => {
        if (table === "practice_logs") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            // 実装 (C1) は canonical 化した style を .ilike("style", ...) で問い合わせる
            // (.eq ではない)。ilike が定義されていないとチェーンが TypeError になる
            // (課題A)。
            ilike: vi.fn().mockReturnThis(),
            gte: vi.fn().mockReturnThis(),
            gt: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({
              data: [
                {
                  id: "log-1",
                  practice_times: [{ time: 59 }],
                },
              ],
              error: null,
            }),
          };
        }
        return createMockQueryBuilder([]);
      }) as unknown as typeof mockClient.from;

      const result = await api.checkMilestoneAchievement(milestone);

      expect(result.achieved).toBe(true);
      expect(result.achievementData?.achievedValue.time).toBe(59);
    });

    it("未認証の場合はエラーを投げる", async () => {
      mockClient = createMockSupabaseClient({ userId: "" });
      api = new GoalAPI(mockClient);

      await expect(api.checkMilestoneAchievement(createMockMilestone())).rejects.toThrow(
        "認証が必要です",
      );
    });
  });

  describe("updateMilestoneStatus", () => {
    it("ステータスを更新できる", async () => {
      const updatedMilestone = createMockMilestone({ status: "achieved" });

      mockClient.from = vi.fn().mockReturnValue({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: updatedMilestone,
          error: null,
        }),
      }) as unknown as typeof mockClient.from;

      const result = await api.updateMilestoneStatus("milestone-1", "achieved");

      expect(result.status).toBe("achieved");
    });

    it("achievedAtを設定できる", async () => {
      const builder = {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: createMockMilestone({ status: "achieved", achieved_at: "2025-01-15T00:00:00Z" }),
          error: null,
        }),
      };
      mockClient.from = vi.fn().mockReturnValue(builder) as unknown as typeof mockClient.from;

      await api.updateMilestoneStatus("milestone-1", "achieved", "2025-01-15T00:00:00Z");

      expect(builder.update).toHaveBeenCalledWith({
        status: "achieved",
        achieved_at: "2025-01-15T00:00:00Z",
      });
    });
  });
});

describe("GoalAPI - マイルストーン状態遷移", () => {
  let mockClient: MockSupabaseClient;
  let api: GoalAPI;

  beforeEach(() => {
    mockClient = createMockSupabaseClient();
    api = new GoalAPI(mockClient);
  });

  describe("hasRecordsForMilestone", () => {
    describe("time型のマイルストーン", () => {
      const milestone: Milestone = {
        id: "milestone-1",
        goal_id: "goal-1",
        title: "100m自由形を60秒で",
        type: "time",
        params: {
          distance: 100,
          target_time: 60,
          style: "Fr", // スタイルコード（'Fr', 'Ba', 'Br', 'Fly', 'IM'のいずれか）
        } as MilestoneTimeParams,
        deadline: null,
        status: "not_started",
        achieved_at: null,
        reflection_done: false,
        reflection_note: null,
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
      };

      it("練習記録が存在する場合、trueを返す", async () => {
        // practice_logsにレコードが存在する場合
        mockClient.from = vi.fn((table: string) => {
          if (table === "practice_logs") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              limit: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: "log-1",
                    practice_times: [{ id: "time-1" }],
                  },
                ],
                error: null,
              }),
            };
          }
          // recordsテーブルのクエリ（レコードなし）
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({
              data: [],
              error: null,
            }),
          };
        }) as unknown as typeof mockClient.from;

        // プライベートメソッドをテストするため、updateAllMilestoneStatusesを通じて間接的にテスト
        // 実際には、hasRecordsForMilestoneは内部で呼ばれるため、updateAllMilestoneStatusesの動作で確認
        mockClient.from = vi.fn((table: string) => {
          if (table === "milestones") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              in: vi.fn().mockResolvedValue({
                data: [milestone],
                error: null,
              }),
            };
          }
          if (table === "practice_logs") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              // hasTimeRecords は canonical 化した style を .ilike("style", ...) で
              // 問い合わせる (課題A: ilike 未定義だと TypeError)。
              ilike: vi.fn().mockReturnThis(),
              gte: vi.fn().mockReturnThis(),
              gt: vi.fn().mockReturnThis(),
              limit: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: "log-1",
                    practice_times: [{ id: "time-1" }],
                  },
                ],
                error: null,
              }),
            };
          }
          // recordsテーブル
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            ilike: vi.fn().mockReturnThis(),
            gte: vi.fn().mockReturnThis(),
            gt: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({
              data: [],
              error: null,
            }),
          };
        }) as unknown as typeof mockClient.from;

        // checkMilestoneAchievementのモック
        vi.spyOn(api, "checkMilestoneAchievement").mockResolvedValue({
          achieved: false,
          achievementData: undefined,
        });

        // updateMilestoneStatusのモック
        vi.spyOn(api, "updateMilestoneStatus").mockResolvedValue({
          ...milestone,
          status: "in_progress",
        });

        await api.updateAllMilestoneStatuses("test-user-id");

        // レコードが存在するため、in_progressに変更される
        expect(api.updateMilestoneStatus).toHaveBeenCalledWith(milestone.id, "in_progress");
      });

      it("レコードが存在しない場合、ステータスが変更されない", async () => {
        mockClient.from = vi.fn((table: string) => {
          if (table === "milestones") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              in: vi.fn().mockResolvedValue({
                data: [milestone],
                error: null,
              }),
            };
          }
          if (table === "practice_logs") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              ilike: vi.fn().mockReturnThis(),
              gte: vi.fn().mockReturnThis(),
              gt: vi.fn().mockReturnThis(),
              limit: vi.fn().mockResolvedValue({
                data: [],
                error: null,
              }),
            };
          }
          // recordsテーブル
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            ilike: vi.fn().mockReturnThis(),
            gte: vi.fn().mockReturnThis(),
            gt: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({
              data: [],
              error: null,
            }),
          };
        }) as unknown as typeof mockClient.from;

        // checkMilestoneAchievementのモック
        vi.spyOn(api, "checkMilestoneAchievement").mockResolvedValue({
          achieved: false,
          achievementData: undefined,
        });

        // updateMilestoneStatusのモック
        vi.spyOn(api, "updateMilestoneStatus").mockResolvedValue(milestone);

        await api.updateAllMilestoneStatuses("test-user-id");

        // レコードが存在しないため、ステータスは変更されない
        expect(api.updateMilestoneStatus).not.toHaveBeenCalledWith(milestone.id, "in_progress");
      });
    });

    describe("reps_time型のマイルストーン", () => {
      const milestone: Milestone = {
        id: "milestone-2",
        goal_id: "goal-1",
        title: "100m自由形×4本の平均タイム",
        type: "reps_time",
        params: {
          distance: 100,
          reps: 4,
          sets: 1,
          target_average_time: 65,
          // C1 (PM暫定判断): canonical でない値 (旧: "freestyle") は
          // toStyleCode で null になり、practice_logs へのクエリを送らず
          // 早期 false 判定になる (goals.practiceLogStyleFilter.test.ts 参照)。
          // 「レコードが実在すれば in_progress になる」ことを検証するこの
          // フィクスチャは canonical 値でなければ成立しないため "Fr" に修正する。
          style: "Fr",
          swim_category: "Swim",
          circle: 1,
        } as MilestoneRepsTimeParams,
        deadline: null,
        status: "not_started",
        achieved_at: null,
        reflection_done: false,
        reflection_note: null,
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
      };

      it("レコードが存在する場合、in_progressに変更される", async () => {
        mockClient.from = vi.fn((table: string) => {
          if (table === "milestones") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              in: vi.fn().mockResolvedValue({
                data: [milestone],
                error: null,
              }),
            };
          }
          if (table === "practice_logs") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              // hasRepsTimeRecords は canonical 化した style を .ilike("style", ...) で
              // 問い合わせる (課題A と同型)。
              ilike: vi.fn().mockReturnThis(),
              gte: vi.fn().mockReturnThis(),
              gt: vi.fn().mockReturnThis(),
              limit: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: "log-1",
                    practice_times: [{ id: "time-1" }],
                  },
                ],
                error: null,
              }),
            };
          }
          return createMockQueryBuilder([]);
        }) as unknown as typeof mockClient.from;

        // checkMilestoneAchievementのモック
        vi.spyOn(api, "checkMilestoneAchievement").mockResolvedValue({
          achieved: false,
          achievementData: undefined,
        });

        // updateMilestoneStatusのモック
        vi.spyOn(api, "updateMilestoneStatus").mockResolvedValue({
          ...milestone,
          status: "in_progress",
        });

        await api.updateAllMilestoneStatuses("test-user-id");

        // レコードが存在するため、in_progressに変更される
        expect(api.updateMilestoneStatus).toHaveBeenCalledWith(milestone.id, "in_progress");
      });

      it("レコードが存在しない場合、ステータスが変更されない", async () => {
        mockClient.from = vi.fn((table: string) => {
          if (table === "milestones") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              in: vi.fn().mockResolvedValue({
                data: [milestone],
                error: null,
              }),
            };
          }
          if (table === "practice_logs") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              ilike: vi.fn().mockReturnThis(),
              gte: vi.fn().mockReturnThis(),
              gt: vi.fn().mockReturnThis(),
              limit: vi.fn().mockResolvedValue({
                data: [],
                error: null,
              }),
            };
          }
          return createMockQueryBuilder([]);
        }) as unknown as typeof mockClient.from;

        // checkMilestoneAchievementのモック
        vi.spyOn(api, "checkMilestoneAchievement").mockResolvedValue({
          achieved: false,
          achievementData: undefined,
        });

        // updateMilestoneStatusのモック
        vi.spyOn(api, "updateMilestoneStatus").mockResolvedValue(milestone);

        await api.updateAllMilestoneStatuses("test-user-id");

        // レコードが存在しないため、ステータスは変更されない
        expect(api.updateMilestoneStatus).not.toHaveBeenCalledWith(milestone.id, "in_progress");
      });
    });

    describe("set型のマイルストーン", () => {
      const milestone: Milestone = {
        id: "milestone-3",
        goal_id: "goal-1",
        title: "100m自由形×4本×3セット",
        type: "set",
        params: {
          distance: 100,
          reps: 4,
          sets: 3,
          // C1 (PM暫定判断): 上記 reps_time型フィクスチャと同じ理由で canonical 化。
          style: "Fr",
          swim_category: "Swim",
          circle: 1,
        } as MilestoneSetParams,
        deadline: null,
        status: "not_started",
        achieved_at: null,
        reflection_done: false,
        reflection_note: null,
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
      };

      it("レコードが存在する場合、in_progressに変更される", async () => {
        mockClient.from = vi.fn((table: string) => {
          if (table === "milestones") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              in: vi.fn().mockResolvedValue({
                data: [milestone],
                error: null,
              }),
            };
          }
          if (table === "practice_logs") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              // hasSetRecords は canonical 化した style を .ilike("style", ...) で
              // 問い合わせる (課題A と同型)。
              ilike: vi.fn().mockReturnThis(),
              gte: vi.fn().mockReturnThis(),
              gt: vi.fn().mockReturnThis(),
              limit: vi.fn().mockResolvedValue({
                data: [{ id: "log-1" }],
                error: null,
              }),
            };
          }
          return createMockQueryBuilder([]);
        }) as unknown as typeof mockClient.from;

        // checkMilestoneAchievementのモック
        vi.spyOn(api, "checkMilestoneAchievement").mockResolvedValue({
          achieved: false,
          achievementData: undefined,
        });

        // updateMilestoneStatusのモック
        vi.spyOn(api, "updateMilestoneStatus").mockResolvedValue({
          ...milestone,
          status: "in_progress",
        });

        await api.updateAllMilestoneStatuses("test-user-id");

        // レコードが存在するため、in_progressに変更される
        expect(api.updateMilestoneStatus).toHaveBeenCalledWith(milestone.id, "in_progress");
      });

      it("レコードが存在しない場合、ステータスが変更されない", async () => {
        mockClient.from = vi.fn((table: string) => {
          if (table === "milestones") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              in: vi.fn().mockResolvedValue({
                data: [milestone],
                error: null,
              }),
            };
          }
          if (table === "practice_logs") {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              ilike: vi.fn().mockReturnThis(),
              gte: vi.fn().mockReturnThis(),
              gt: vi.fn().mockReturnThis(),
              limit: vi.fn().mockResolvedValue({
                data: [],
                error: null,
              }),
            };
          }
          return createMockQueryBuilder([]);
        }) as unknown as typeof mockClient.from;

        // checkMilestoneAchievementのモック
        vi.spyOn(api, "checkMilestoneAchievement").mockResolvedValue({
          achieved: false,
          achievementData: undefined,
        });

        // updateMilestoneStatusのモック
        vi.spyOn(api, "updateMilestoneStatus").mockResolvedValue(milestone);

        await api.updateAllMilestoneStatuses("test-user-id");

        // レコードが存在しないため、ステータスは変更されない
        expect(api.updateMilestoneStatus).not.toHaveBeenCalledWith(milestone.id, "in_progress");
      });
    });
  });

  describe("updateAllMilestoneStatuses - 達成済みマイルストーン", () => {
    it("達成済みのマイルストーンはステータスが更新される", async () => {
      const achievedMilestone: Milestone = {
        id: "milestone-achieved",
        goal_id: "goal-1",
        title: "100m自由形を60秒で",
        type: "time",
        params: {
          distance: 100,
          target_time: 60,
          // checkMilestoneAchievement は spyOn で完全に差し替えているため
          // hasRecordsForMilestone には到達しない (status が "not_started" でないため)。
          // 実行経路には影響しないが、他フィクスチャと同様 canonical 値に揃える。
          style: "Fr",
        } as MilestoneTimeParams,
        deadline: null,
        status: "in_progress",
        achieved_at: null,
        reflection_done: false,
        reflection_note: null,
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
      };

      mockClient.from = vi.fn((table: string) => {
        if (table === "milestones") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            in: vi.fn().mockResolvedValue({
              data: [achievedMilestone],
              error: null,
            }),
          };
        }
        return createMockSupabaseClient().from(table as "milestones");
      }) as unknown as typeof mockClient.from;

      // checkMilestoneAchievementのモック（達成済み）
      vi.spyOn(api, "checkMilestoneAchievement").mockResolvedValue({
        achieved: true,
        achievementData: {
          practiceLogId: "log-1",
          achievedValue: { time: 59, target_time: 60 },
        },
      });

      // updateMilestoneStatusのモック
      vi.spyOn(api, "updateMilestoneStatus").mockResolvedValue({
        ...achievedMilestone,
        status: "achieved",
      });

      await api.updateAllMilestoneStatuses("test-user-id");

      // 達成済みのため、achievedに変更される
      expect(api.updateMilestoneStatus).toHaveBeenCalledWith(
        achievedMilestone.id,
        "achieved",
        expect.any(String),
      );
    });
  });
});
