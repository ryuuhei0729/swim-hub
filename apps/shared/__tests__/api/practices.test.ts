import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMockPractice,
  createMockPracticeLog,
  createMockSupabaseClient,
  type MockSupabaseClient,
} from "../../__mocks__/supabase";
import { PracticeAPI } from "../../api/practices";

describe("PracticeAPI", () => {
  let mockClient: MockSupabaseClient;
  let api: PracticeAPI;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockSupabaseClient();
    api = new PracticeAPI(mockClient);
  });

  describe("練習記録取得", () => {
    it("認証済みユーザーのとき練習記録一覧を取得できる", async () => {
      const mockPractice = createMockPractice();
      mockClient.from = vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: [mockPractice],
          error: null,
        }),
      })) as unknown as typeof mockClient.from;

      const result = await api.getPractices("2025-01-01", "2025-01-31");

      expect(mockClient.auth.getUser).toHaveBeenCalled();
      expect(mockClient.from).toHaveBeenCalledWith("practices");
      expect(result).toEqual([mockPractice]);
    });

    it("認証されていないときエラーになる", async () => {
      mockClient = createMockSupabaseClient({ userId: "" });
      api = new PracticeAPI(mockClient);

      await expect(api.getPractices("2025-01-01", "2025-01-31")).rejects.toThrow("認証が必要です");
    });

    it("クエリが失敗したときエラーが発生する", async () => {
      const error = new Error("Database error");
      mockClient.from = vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: null,
          error,
        }),
      })) as unknown as typeof mockClient.from;

      await expect(api.getPractices("2025-01-01", "2025-01-31")).rejects.toThrow("Database error");
    });
  });

  describe("練習記録取得（日付指定）", () => {
    it("日付を指定したとき該当日の練習記録を取得できる", async () => {
      const mockPractice = createMockPractice({ date: "2025-01-15" });
      mockClient.from = vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        then: (resolve: (value: { data: (typeof mockPractice)[]; error: null }) => unknown) =>
          Promise.resolve({ data: [mockPractice], error: null }).then(resolve),
      })) as unknown as typeof mockClient.from;

      const result = await api.getPracticesByDate("2025-01-15");

      expect(mockClient.from).toHaveBeenCalledWith("practices");
      expect(result).toEqual([mockPractice]);
    });
  });

  describe("練習記録作成", () => {
    it("認証済みユーザーのとき練習記録を作成できる", async () => {
      const newPractice = {
        date: "2025-01-15",
        title: "テスト練習",
        place: "テストプール",
        memo: "テスト練習",
      };
      const createdPractice = createMockPractice(newPractice);

      mockClient.from = vi.fn(() => ({
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: createdPractice,
          error: null,
        }),
      })) as unknown as typeof mockClient.from;

      const result = await api.createPractice({ ...newPractice, note: "テストメモ" });

      expect(mockClient.from).toHaveBeenCalledWith("practices");
      expect(result).toEqual(createdPractice);
    });

    it("認証されていないときエラーになる", async () => {
      mockClient = createMockSupabaseClient({ userId: "" });
      api = new PracticeAPI(mockClient);

      await expect(
        api.createPractice({
          date: "2025-01-15",
          title: "テスト練習",
          place: "プール",
          note: "テストメモ",
        }),
      ).rejects.toThrow("認証が必要です");
    });
  });

  describe("練習記録更新", () => {
    it("練習記録を更新できる", async () => {
      const updatedPractice = createMockPractice({ place: "更新後プール" });

      mockClient.from = vi.fn(() => ({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: updatedPractice,
          error: null,
        }),
      })) as unknown as typeof mockClient.from;

      const result = await api.updatePractice("practice-1", { place: "更新後プール" });

      expect(mockClient.from).toHaveBeenCalledWith("practices");
      expect(result).toEqual(updatedPractice);
    });

    it("更新が失敗したときエラーが発生する", async () => {
      const error = new Error("Update failed");
      mockClient.from = vi.fn(() => ({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error,
        }),
      })) as unknown as typeof mockClient.from;

      await expect(api.updatePractice("practice-1", { place: "更新後" })).rejects.toThrow(
        "Update failed",
      );
    });
  });

  describe("練習記録削除", () => {
    // deletePractice は delete().eq("id", id).select("id") というチェインで呼ばれる
    // (RLS拒否時に0行でも正常終了扱いになる問題への対策として .select() で結果行を見る)。
    // eq / select に渡された引数は戻り値経由でテストごとに検証できるようにし、
    // クエリの絞り込み対象・返却カラムを捨てない。
    const mockDeleteChain = (response: { data: unknown; error: unknown }) => {
      const selectMock = vi.fn().mockResolvedValue(response);
      const eqMock = vi.fn().mockReturnThis();
      const deleteMock = vi.fn().mockReturnThis();
      const builder = { delete: deleteMock, eq: eqMock, select: selectMock };
      mockClient.from = vi.fn(() => builder) as unknown as typeof mockClient.from;
      return { deleteMock, eqMock, selectMock };
    };

    it("練習記録を削除できる", async () => {
      const { deleteMock, eqMock, selectMock } = mockDeleteChain({
        data: [{ id: "practice-1" }],
        error: null,
      });

      await expect(api.deletePractice("practice-1")).resolves.toBeUndefined();

      expect(mockClient.from).toHaveBeenCalledWith("practices");
      expect(deleteMock).toHaveBeenCalled();
      expect(eqMock).toHaveBeenCalledWith("id", "practice-1");
      expect(selectMock).toHaveBeenCalledWith("id");
    });

    it("削除が失敗したときエラーが発生する", async () => {
      const error = new Error("Delete failed");
      mockDeleteChain({ data: null, error });

      await expect(api.deletePractice("practice-1")).rejects.toThrow("Delete failed");
    });

    describe("RLS拒否時の無言失敗防止 (課題B回帰)", () => {
      it("[D-1] DELETEが0行を返した場合はエラーをthrowする", async () => {
        const { eqMock, selectMock } = mockDeleteChain({ data: [], error: null });

        await expect(api.deletePractice("practice-1")).rejects.toThrow(
          "練習記録の削除に失敗しました",
        );
        expect(eqMock).toHaveBeenCalledWith("id", "practice-1");
        expect(selectMock).toHaveBeenCalledWith("id");
      });

      it("[D-2] dataがnullの場合もエラーをthrowする", async () => {
        mockDeleteChain({ data: null, error: null });

        await expect(api.deletePractice("practice-1")).rejects.toThrow(
          "練習記録の削除に失敗しました",
        );
      });

      it("[D-3] 1行返った場合は正常終了する(管理者による代理削除などの非退行)", async () => {
        const { eqMock, selectMock } = mockDeleteChain({
          data: [{ id: "practice-99" }],
          error: null,
        });

        await expect(api.deletePractice("practice-99")).resolves.toBeUndefined();
        expect(eqMock).toHaveBeenCalledWith("id", "practice-99");
        expect(selectMock).toHaveBeenCalledWith("id");
      });

      it("[D-4] errorが返った場合は元のerrorをthrowする(汎用メッセージで上書きしない)", async () => {
        const error = new Error("permission denied for table practices");
        mockDeleteChain({ data: null, error });

        await expect(api.deletePractice("practice-1")).rejects.toThrow(error);
      });
    });
  });

  describe("練習ログ作成", () => {
    it("練習ログを作成できる", async () => {
      const newLog = {
        practice_id: "practice-1",
        distance: 100,
        rep_count: 4,
        set_count: 2,
        circle_time: 90,
        style: "freestyle",
        swim_category: "Swim" as const,
        note: "テストメモ",
        circle: 1,
      };
      const createdLog = createMockPracticeLog(newLog);

      mockClient.from = vi.fn(() => ({
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: createdLog,
          error: null,
        }),
      })) as unknown as typeof mockClient.from;

      const result = await api.createPracticeLog(newLog);

      expect(mockClient.from).toHaveBeenCalledWith("practice_logs");
      expect(result).toEqual(createdLog);
    });
  });

  describe("練習ログ一括作成", () => {
    it("複数の練習ログを作成できる", async () => {
      const newLogs = [
        {
          practice_id: "practice-1",
          distance: 100,
          rep_count: 4,
          set_count: 2,
          circle_time: 90,
          style: "freestyle",
          swim_category: "Swim" as const,
          note: "テストメモ1",
          circle: 1,
        },
        {
          practice_id: "practice-1",
          distance: 200,
          rep_count: 2,
          set_count: 1,
          circle_time: 180,
          style: "backstroke",
          swim_category: "Swim" as const,
          note: "テストメモ2",
          circle: 2,
        },
      ];
      const createdLogs = newLogs.map((log, i) =>
        createMockPracticeLog({ ...log, id: `log-${i + 1}` }),
      );

      mockClient.from = vi.fn(() => ({
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockResolvedValue({
          data: createdLogs,
          error: null,
        }),
      })) as unknown as typeof mockClient.from;

      const result = await api.createPracticeLogs(newLogs);

      expect(mockClient.from).toHaveBeenCalledWith("practice_logs");
      expect(result).toHaveLength(2);
    });
  });

  describe("練習ログ更新", () => {
    it("練習ログを更新できる", async () => {
      const updatedLog = createMockPracticeLog({ distance: 200 });

      mockClient.from = vi.fn(() => ({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: updatedLog,
          error: null,
        }),
      })) as unknown as typeof mockClient.from;

      const result = await api.updatePracticeLog("log-1", { distance: 200 });

      expect(mockClient.from).toHaveBeenCalledWith("practice_logs");
      expect(result).toEqual(updatedLog);
    });
  });

  describe("練習ログ削除", () => {
    // deletePracticeLog は delete().eq("id", id).select("id") というチェインで呼ばれる
    // (deletePractice と同型: RLS拒否時0行を検出するため .select() で結果行を見る)。
    // eq / select に渡された引数は戻り値経由でテストごとに検証できるようにし、
    // クエリの絞り込み対象・返却カラムを捨てない。
    const mockDeleteLogChain = (response: { data: unknown; error: unknown }) => {
      const selectMock = vi.fn().mockResolvedValue(response);
      const eqMock = vi.fn().mockReturnThis();
      const deleteMock = vi.fn().mockReturnThis();
      const builder = { delete: deleteMock, eq: eqMock, select: selectMock };
      mockClient.from = vi.fn(() => builder) as unknown as typeof mockClient.from;
      return { deleteMock, eqMock, selectMock };
    };

    it("練習ログを削除できる", async () => {
      const { deleteMock, eqMock, selectMock } = mockDeleteLogChain({
        data: [{ id: "log-1" }],
        error: null,
      });

      await expect(api.deletePracticeLog("log-1")).resolves.toBeUndefined();

      expect(mockClient.from).toHaveBeenCalledWith("practice_logs");
      expect(deleteMock).toHaveBeenCalled();
      expect(eqMock).toHaveBeenCalledWith("id", "log-1");
      expect(selectMock).toHaveBeenCalledWith("id");
    });

    describe("0行ガード (課題B展開・回帰)", () => {
      it("[D-8] DELETEが0行を返した場合はエラーをthrowする", async () => {
        const { eqMock, selectMock } = mockDeleteLogChain({ data: [], error: null });

        await expect(api.deletePracticeLog("log-1")).rejects.toThrow(
          "練習ログの削除に失敗しました",
        );
        expect(eqMock).toHaveBeenCalledWith("id", "log-1");
        expect(selectMock).toHaveBeenCalledWith("id");
      });

      it("[D-9] dataがnullの場合もエラーをthrowする", async () => {
        mockDeleteLogChain({ data: null, error: null });

        await expect(api.deletePracticeLog("log-1")).rejects.toThrow(
          "練習ログの削除に失敗しました",
        );
      });

      it("[D-10] 1行返った場合は正常終了する(非退行)", async () => {
        const { eqMock, selectMock } = mockDeleteLogChain({
          data: [{ id: "log-99" }],
          error: null,
        });

        await expect(api.deletePracticeLog("log-99")).resolves.toBeUndefined();
        expect(eqMock).toHaveBeenCalledWith("id", "log-99");
        expect(selectMock).toHaveBeenCalledWith("id");
      });

      it("[D-11] errorが返った場合は元のerrorをthrowする(汎用メッセージで上書きしない)", async () => {
        const error = new Error("permission denied for table practice_logs");
        mockDeleteLogChain({ data: null, error });

        await expect(api.deletePracticeLog("log-1")).rejects.toThrow(error);
      });
    });
  });

  describe("練習記録件数取得", () => {
    it("期間内の練習記録件数を取得できる", async () => {
      mockClient.from = vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockResolvedValue({
          count: 5,
          error: null,
        }),
      })) as unknown as typeof mockClient.from;

      const result = await api.countPractices("2025-01-01", "2025-01-31");

      expect(mockClient.from).toHaveBeenCalledWith("practices");
      expect(result).toBe(5);
    });

    it("認証されていないときエラーになる", async () => {
      mockClient = createMockSupabaseClient({ userId: "" });
      api = new PracticeAPI(mockClient);

      await expect(api.countPractices("2025-01-01", "2025-01-31")).rejects.toThrow(
        "認証が必要です",
      );
    });

    it("countがnullの場合は0を返す", async () => {
      mockClient.from = vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lte: vi.fn().mockResolvedValue({
          count: null,
          error: null,
        }),
      })) as unknown as typeof mockClient.from;

      const result = await api.countPractices("2025-01-01", "2025-01-31");

      expect(result).toBe(0);
    });
  });

  describe("練習記録取得（ID指定）", () => {
    it("IDで練習記録を取得できる", async () => {
      const mockPractice = createMockPractice();
      mockClient.from = vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: mockPractice,
          error: null,
        }),
      })) as unknown as typeof mockClient.from;

      const result = await api.getPracticeById("practice-1");

      expect(mockClient.from).toHaveBeenCalledWith("practices");
      expect(result).toEqual(mockPractice);
    });

    it("存在しない場合はnullを返す", async () => {
      mockClient.from = vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error: { code: "PGRST116" },
        }),
      })) as unknown as typeof mockClient.from;

      const result = await api.getPracticeById("non-existent");

      expect(result).toBeNull();
    });

    it("認証されていないときエラーになる", async () => {
      mockClient = createMockSupabaseClient({ userId: "" });
      api = new PracticeAPI(mockClient);

      await expect(api.getPracticeById("practice-1")).rejects.toThrow("認証が必要です");
    });

    it("その他のエラーの場合は例外を投げる", async () => {
      const error = new Error("Unknown error");
      mockClient.from = vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: null,
          error,
        }),
      })) as unknown as typeof mockClient.from;

      await expect(api.getPracticeById("practice-1")).rejects.toThrow("Unknown error");
    });
  });

  describe("練習記録取得（limit/offset付き）", () => {
    it("limitを指定して取得できる", async () => {
      const mockPractices = [createMockPractice()];
      const builder = {
        select: vi.fn(),
        eq: vi.fn(),
        gte: vi.fn(),
        lte: vi.fn(),
        order: vi.fn(),
        limit: vi.fn(),
        then: vi.fn(),
      };
      builder.select.mockReturnValue(builder);
      builder.eq.mockReturnValue(builder);
      builder.gte.mockReturnValue(builder);
      builder.lte.mockReturnValue(builder);
      builder.order.mockReturnValue(builder);
      builder.limit.mockReturnValue(builder);
      builder.then.mockImplementation((onFulfilled: (value: unknown) => unknown) =>
        Promise.resolve({ data: mockPractices, error: null }).then(onFulfilled),
      );
      mockClient.from = vi.fn().mockReturnValue(builder) as unknown as typeof mockClient.from;

      const result = await api.getPractices("2025-01-01", "2025-01-31", 10);

      expect(builder.limit).toHaveBeenCalledWith(10);
      expect(result).toEqual(mockPractices);
    });

    it("limit/offsetを指定して取得できる", async () => {
      const mockPractices = [createMockPractice()];
      const builder = {
        select: vi.fn(),
        eq: vi.fn(),
        gte: vi.fn(),
        lte: vi.fn(),
        order: vi.fn(),
        range: vi.fn(),
        then: vi.fn(),
      };
      builder.select.mockReturnValue(builder);
      builder.eq.mockReturnValue(builder);
      builder.gte.mockReturnValue(builder);
      builder.lte.mockReturnValue(builder);
      builder.order.mockReturnValue(builder);
      builder.range.mockReturnValue(builder);
      builder.then.mockImplementation((onFulfilled: (value: unknown) => unknown) =>
        Promise.resolve({ data: mockPractices, error: null }).then(onFulfilled),
      );
      mockClient.from = vi.fn().mockReturnValue(builder) as unknown as typeof mockClient.from;

      const result = await api.getPractices("2025-01-01", "2025-01-31", 10, 20);

      expect(builder.range).toHaveBeenCalledWith(20, 29);
      expect(result).toEqual(mockPractices);
    });
  });

  describe("練習タイム操作", () => {
    it("練習タイムを作成できる", async () => {
      const newTime = {
        user_id: "test-user-id",
        practice_log_id: "log-1",
        set_number: 1,
        rep_number: 1,
        time: 25.5,
      };
      const createdTime = { id: "time-1", ...newTime };

      mockClient.from = vi.fn(() => ({
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: createdTime,
          error: null,
        }),
      })) as unknown as typeof mockClient.from;

      const result = await api.createPracticeTime(newTime);

      expect(mockClient.from).toHaveBeenCalledWith("practice_times");
      expect(result).toEqual(createdTime);
    });

    it("複数の練習タイムを作成できる", async () => {
      const newTimes = [
        {
          user_id: "test-user-id",
          practice_log_id: "log-1",
          set_number: 1,
          rep_number: 1,
          time: 25.5,
        },
        {
          user_id: "test-user-id",
          practice_log_id: "log-1",
          set_number: 1,
          rep_number: 2,
          time: 26.0,
        },
      ];
      const createdTimes = newTimes.map((t, i) => ({ id: `time-${i}`, ...t }));

      mockClient.from = vi.fn(() => ({
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockResolvedValue({
          data: createdTimes,
          error: null,
        }),
      })) as unknown as typeof mockClient.from;

      const result = await api.createPracticeTimes(newTimes);

      expect(mockClient.from).toHaveBeenCalledWith("practice_times");
      expect(result).toEqual(createdTimes);
    });

    it("空配列の場合は空配列を返す", async () => {
      const result = await api.createPracticeTimes([]);
      expect(result).toEqual([]);
    });

    it("練習タイムを置き換えできる", async () => {
      const newTimes = [
        { set_number: 1, rep_number: 1, time: 24.5 },
        { set_number: 1, rep_number: 2, time: 25.0 },
      ];
      const createdTimes = newTimes.map((t, i) => ({
        id: `time-${i}`,
        practice_log_id: "log-1",
        ...t,
      }));

      // delete用のモック
      const deleteBuilder = {
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null }),
      };
      // insert用のモック
      const insertBuilder = {
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockResolvedValue({ data: createdTimes, error: null }),
      };

      let callCount = 0;
      mockClient.from = vi.fn(() => {
        callCount++;
        return callCount === 1 ? deleteBuilder : insertBuilder;
      }) as unknown as typeof mockClient.from;

      const result = await api.replacePracticeTimes("log-1", newTimes);

      expect(result).toEqual(createdTimes);
    });

    it("練習タイム置き換えで空配列の場合は削除のみ行う", async () => {
      const deleteBuilder = {
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ error: null }),
      };
      mockClient.from = vi.fn(() => deleteBuilder) as unknown as typeof mockClient.from;

      const result = await api.replacePracticeTimes("log-1", []);

      expect(deleteBuilder.delete).toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    // deletePracticeTime は delete().eq("id", id).select("id") というチェインで呼ばれる
    // (deletePractice と同型)。eq / select の引数を捨てずに記録する。
    const mockDeleteTimeChain = (response: { data: unknown; error: unknown }) => {
      const selectMock = vi.fn().mockResolvedValue(response);
      const eqMock = vi.fn().mockReturnThis();
      const deleteMock = vi.fn().mockReturnThis();
      const builder = { delete: deleteMock, eq: eqMock, select: selectMock };
      mockClient.from = vi.fn(() => builder) as unknown as typeof mockClient.from;
      return { deleteMock, eqMock, selectMock };
    };

    it("練習タイムを削除できる", async () => {
      const { deleteMock, eqMock, selectMock } = mockDeleteTimeChain({
        data: [{ id: "time-1" }],
        error: null,
      });

      await expect(api.deletePracticeTime("time-1")).resolves.toBeUndefined();

      expect(mockClient.from).toHaveBeenCalledWith("practice_times");
      expect(deleteMock).toHaveBeenCalled();
      expect(eqMock).toHaveBeenCalledWith("id", "time-1");
      expect(selectMock).toHaveBeenCalledWith("id");
    });

    describe("0行ガード (課題B展開・回帰)", () => {
      it("[D-12] DELETEが0行を返した場合はエラーをthrowする", async () => {
        const { eqMock, selectMock } = mockDeleteTimeChain({ data: [], error: null });

        await expect(api.deletePracticeTime("time-1")).rejects.toThrow(
          "練習タイムの削除に失敗しました",
        );
        expect(eqMock).toHaveBeenCalledWith("id", "time-1");
        expect(selectMock).toHaveBeenCalledWith("id");
      });

      it("[D-13] dataがnullの場合もエラーをthrowする", async () => {
        mockDeleteTimeChain({ data: null, error: null });

        await expect(api.deletePracticeTime("time-1")).rejects.toThrow(
          "練習タイムの削除に失敗しました",
        );
      });

      it("[D-14] 1行返った場合は正常終了する(非退行)", async () => {
        const { eqMock, selectMock } = mockDeleteTimeChain({
          data: [{ id: "time-99" }],
          error: null,
        });

        await expect(api.deletePracticeTime("time-99")).resolves.toBeUndefined();
        expect(eqMock).toHaveBeenCalledWith("id", "time-99");
        expect(selectMock).toHaveBeenCalledWith("id");
      });

      it("[D-15] errorが返った場合は元のerrorをthrowする(汎用メッセージで上書きしない)", async () => {
        const error = new Error("permission denied for table practice_times");
        mockDeleteTimeChain({ data: null, error });

        await expect(api.deletePracticeTime("time-1")).rejects.toThrow(error);
      });
    });

    describe("練習タイム置き換えの0行許容とerror伝播 (回帰)", () => {
      it("[D-20] 既存タイムが0件(削除0行)でもthrowせず正常に完了する(0行ガードを追加していないことの担保)", async () => {
        const newTimes = [{ set_number: 1, rep_number: 1, time: 20.0 }];
        const createdTimes = newTimes.map((t, i) => ({
          id: `time-${i}`,
          practice_log_id: "log-1",
          ...t,
        }));

        // practice_log_id単位の削除で0行(タイム未入力のログ)を模擬
        const deleteBuilder = {
          delete: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
        const insertBuilder = {
          insert: vi.fn().mockReturnThis(),
          select: vi.fn().mockResolvedValue({ data: createdTimes, error: null }),
        };

        let callCount = 0;
        mockClient.from = vi.fn(() => {
          callCount++;
          return callCount === 1 ? deleteBuilder : insertBuilder;
        }) as unknown as typeof mockClient.from;

        await expect(api.replacePracticeTimes("log-1", newTimes)).resolves.toEqual(createdTimes);
        expect(deleteBuilder.eq).toHaveBeenCalledWith("practice_log_id", "log-1");
      });

      it("[D-21] 削除でerrorが返った場合はthrowする(errorチェック追加の担保)", async () => {
        const error = new Error("permission denied for table practice_times");
        const deleteBuilder = {
          delete: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: null, error }),
        };
        mockClient.from = vi.fn(() => deleteBuilder) as unknown as typeof mockClient.from;

        await expect(
          api.replacePracticeTimes("log-1", [{ set_number: 1, rep_number: 1, time: 20.0 }]),
        ).rejects.toThrow(error);
        expect(deleteBuilder.eq).toHaveBeenCalledWith("practice_log_id", "log-1");
      });

      it("[D-22] 削除成功後に新しいタイムが挿入される(非退行)", async () => {
        const newTimes = [{ set_number: 1, rep_number: 1, time: 21.0 }];
        const createdTimes = newTimes.map((t, i) => ({
          id: `time-${i}`,
          practice_log_id: "log-1",
          ...t,
        }));

        const deleteBuilder = {
          delete: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({ data: [{ id: "old-time-1" }], error: null }),
        };
        const insertBuilder = {
          insert: vi.fn().mockReturnThis(),
          select: vi.fn().mockResolvedValue({ data: createdTimes, error: null }),
        };

        let callCount = 0;
        mockClient.from = vi.fn(() => {
          callCount++;
          return callCount === 1 ? deleteBuilder : insertBuilder;
        }) as unknown as typeof mockClient.from;

        await expect(api.replacePracticeTimes("log-1", newTimes)).resolves.toEqual(createdTimes);
        expect(insertBuilder.select).toHaveBeenCalled();
      });
    });
  });

  describe("練習タグ操作", () => {
    it("練習タグ一覧を取得できる", async () => {
      const mockTags = [
        { id: "tag-1", name: "タグ1", color: "#ff0000", user_id: "user-1" },
        { id: "tag-2", name: "タグ2", color: "#00ff00", user_id: "user-1" },
      ];
      mockClient.from = vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: mockTags,
          error: null,
        }),
      })) as unknown as typeof mockClient.from;

      const result = await api.getPracticeTags();

      expect(mockClient.from).toHaveBeenCalledWith("practice_tags");
      expect(result).toEqual(mockTags);
    });

    it("練習タグを作成できる", async () => {
      const createdTag = {
        id: "tag-1",
        name: "新規タグ",
        color: "#ff0000",
        user_id: "test-user-id",
      };
      mockClient.from = vi.fn(() => ({
        insert: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: createdTag,
          error: null,
        }),
      })) as unknown as typeof mockClient.from;

      const result = await api.createPracticeTag("新規タグ", "#ff0000");

      expect(mockClient.from).toHaveBeenCalledWith("practice_tags");
      expect(result).toEqual(createdTag);
    });

    it("認証されていないとき練習タグ作成でエラーになる", async () => {
      mockClient = createMockSupabaseClient({ userId: "" });
      api = new PracticeAPI(mockClient);

      await expect(api.createPracticeTag("タグ", "#fff")).rejects.toThrow("認証が必要です");
    });

    it("練習タグを更新できる", async () => {
      const updatedTag = {
        id: "tag-1",
        name: "更新後タグ",
        color: "#00ff00",
        user_id: "test-user-id",
      };
      mockClient.from = vi.fn(() => ({
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({
          data: updatedTag,
          error: null,
        }),
      })) as unknown as typeof mockClient.from;

      const result = await api.updatePracticeTag("tag-1", "更新後タグ", "#00ff00");

      expect(mockClient.from).toHaveBeenCalledWith("practice_tags");
      expect(result).toEqual(updatedTag);
    });

    // deletePracticeTag は delete().eq("id", id).eq("user_id", user.id).select("id") という
    // 2段 eq チェインで呼ばれる。同一の eqMock が2回呼ばれるので
    // toHaveBeenNthCalledWith で id/user_id 両方の絞り込み引数を検証する
    // (user_id 絞り込みが消えると他人のタグを削除できてしまうため)。
    const mockDeleteTagChain = (response: { data: unknown; error: unknown }) => {
      const selectMock = vi.fn().mockResolvedValue(response);
      const eqMock = vi.fn().mockReturnThis();
      const deleteMock = vi.fn().mockReturnThis();
      const builder = { delete: deleteMock, eq: eqMock, select: selectMock };
      mockClient.from = vi.fn(() => builder) as unknown as typeof mockClient.from;
      return { deleteMock, eqMock, selectMock };
    };

    it("練習タグを削除できる", async () => {
      const { deleteMock, eqMock, selectMock } = mockDeleteTagChain({
        data: [{ id: "tag-1" }],
        error: null,
      });

      await expect(api.deletePracticeTag("tag-1")).resolves.toBeUndefined();

      expect(mockClient.from).toHaveBeenCalledWith("practice_tags");
      expect(deleteMock).toHaveBeenCalled();
      expect(eqMock).toHaveBeenNthCalledWith(1, "id", "tag-1");
      expect(eqMock).toHaveBeenNthCalledWith(2, "user_id", "test-user-id");
      expect(selectMock).toHaveBeenCalledWith("id");
    });

    describe("0行ガードとuser_idスコープ (課題B展開・回帰)", () => {
      it("[D-16] DELETEが0行を返した場合はエラーをthrowする", async () => {
        const { eqMock, selectMock } = mockDeleteTagChain({ data: [], error: null });

        await expect(api.deletePracticeTag("tag-1")).rejects.toThrow(
          "練習タグの削除に失敗しました",
        );
        expect(eqMock).toHaveBeenNthCalledWith(1, "id", "tag-1");
        expect(eqMock).toHaveBeenNthCalledWith(2, "user_id", "test-user-id");
        expect(selectMock).toHaveBeenCalledWith("id");
      });

      it("[D-17] dataがnullの場合もエラーをthrowする", async () => {
        mockDeleteTagChain({ data: null, error: null });

        await expect(api.deletePracticeTag("tag-1")).rejects.toThrow(
          "練習タグの削除に失敗しました",
        );
      });

      it("[D-18] 1行返った場合は正常終了し、id/user_idの両方で絞り込まれる(他人のタグを削除できないことの担保・非退行)", async () => {
        const { eqMock, selectMock } = mockDeleteTagChain({
          data: [{ id: "tag-1" }],
          error: null,
        });

        await expect(api.deletePracticeTag("tag-1")).resolves.toBeUndefined();
        expect(eqMock).toHaveBeenNthCalledWith(1, "id", "tag-1");
        expect(eqMock).toHaveBeenNthCalledWith(2, "user_id", "test-user-id");
        expect(selectMock).toHaveBeenCalledWith("id");
      });

      it("[D-19] errorが返った場合は元のerrorをthrowする(汎用メッセージで上書きしない)", async () => {
        const error = new Error("permission denied for table practice_tags");
        mockDeleteTagChain({ data: null, error });

        await expect(api.deletePracticeTag("tag-1")).rejects.toThrow(error);
      });
    });
  });

  describe("ユニークな場所取得", () => {
    it("ユニークな場所一覧を取得できる", async () => {
      const mockPlaces = [{ place: "プールA" }, { place: "プールB" }, { place: null }];
      mockClient.from = vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        not: vi.fn().mockReturnThis(),
        order: vi.fn().mockResolvedValue({
          data: mockPlaces,
          error: null,
        }),
      })) as unknown as typeof mockClient.from;

      const result = await api.getUniquePlaces();

      expect(mockClient.from).toHaveBeenCalledWith("practices");
      expect(result).toEqual(["プールA", "プールB"]);
    });

    it("認証されていないときエラーになる", async () => {
      mockClient = createMockSupabaseClient({ userId: "" });
      api = new PracticeAPI(mockClient);

      await expect(api.getUniquePlaces()).rejects.toThrow("認証が必要です");
    });
  });
});
