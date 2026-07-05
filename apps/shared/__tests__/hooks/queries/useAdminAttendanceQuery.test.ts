// =============================================================================
// QA: Sprint 4 - useAttendanceByPracticeQuery / useAttendanceByCompetitionQuery
//               / useUpdateAttendanceStatusMutation 検証テスト
// Phase B - 仕様ベーステスト (Sprint Contract に基づく)
// =============================================================================

import { describe, expect, it, vi, beforeEach } from "vitest";
import { waitFor, act } from "@testing-library/react";
import { createMockSupabaseClient } from "../../../__mocks__/supabase";
import { TeamAttendancesAPI } from "../../../api/teams/attendances";
import {
  useAttendanceByPracticeQuery,
  useAttendanceByCompetitionQuery,
  useUpdateAttendanceStatusMutation,
} from "../../../hooks/queries/teams";
import { teamKeys } from "../../../hooks/queries/keys";
import { renderQueryHook } from "../../utils/test-utils";

// TeamAttendancesAPI をモック化
vi.mock("../../../api/teams/attendances", () => ({
  TeamAttendancesAPI: vi.fn().mockImplementation(() => ({
    listByPractice: vi.fn(),
    listByCompetition: vi.fn(),
    updatePracticeAttendanceStatus: vi.fn(),
    updateCompetitionAttendanceStatus: vi.fn(),
  })),
}));

describe("useAttendanceByPracticeQuery", () => {
  let mockSupabase: ReturnType<typeof createMockSupabaseClient>;
  let mockAttendancesApi: {
    listByPractice: ReturnType<typeof vi.fn>;
    listByCompetition: ReturnType<typeof vi.fn>;
    updatePracticeAttendanceStatus: ReturnType<typeof vi.fn>;
    updateCompetitionAttendanceStatus: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = createMockSupabaseClient();
    mockAttendancesApi = {
      listByPractice: vi.fn(),
      listByCompetition: vi.fn(),
      updatePracticeAttendanceStatus: vi.fn(),
      updateCompetitionAttendanceStatus: vi.fn(),
    };
  });

  // [S4-V-01] keys に attendanceByPractice / attendanceByCompetition が追加されていること
  it("[S4-V-01] teamKeys.attendanceByPractice が正しいキーを返す", () => {
    const key = teamKeys.attendanceByPractice("practice-abc");
    expect(key).toEqual(["teams", "attendance", "practice", "practice-abc"]);
  });

  it("[S4-V-01] teamKeys.attendanceByCompetition が正しいキーを返す", () => {
    const key = teamKeys.attendanceByCompetition("comp-xyz");
    expect(key).toEqual(["teams", "attendance", "competition", "comp-xyz"]);
  });

  it("[S4-V-01] 異なる practiceId は異なるキーを生成する", () => {
    const k1 = teamKeys.attendanceByPractice("p-1");
    const k2 = teamKeys.attendanceByPractice("p-2");
    expect(k1).not.toEqual(k2);
  });

  // [S4-V-02] useAttendanceByPracticeQuery が practiceId を受け取りデータを返す
  it("[S4-V-02] practiceId があれば出欠一覧を取得できる", async () => {
    const mockData = [
      { id: "att-1", practice_id: "practice-1", user_id: "user-1", status: "present" },
      { id: "att-2", practice_id: "practice-1", user_id: "user-2", status: "absent" },
    ];
    mockAttendancesApi.listByPractice.mockResolvedValue(mockData);

    const { result } = renderQueryHook(() =>
      useAttendanceByPracticeQuery(
        mockSupabase,
        "practice-1",
        mockAttendancesApi as unknown as TeamAttendancesAPI,
      ),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockAttendancesApi.listByPractice).toHaveBeenCalledWith("practice-1");
    expect(result.current.data).toEqual(mockData);
  });

  it("[S4-V-02] practiceId が undefined のとき query は enabled=false で呼ばれない", () => {
    const { result } = renderQueryHook(() =>
      useAttendanceByPracticeQuery(
        mockSupabase,
        undefined,
        mockAttendancesApi as unknown as TeamAttendancesAPI,
      ),
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(mockAttendancesApi.listByPractice).not.toHaveBeenCalled();
  });

  it("[S4-V-02] API エラー時は isError=true になる", async () => {
    mockAttendancesApi.listByPractice.mockRejectedValue(new Error("fetch failed"));

    const { result } = renderQueryHook(() =>
      useAttendanceByPracticeQuery(
        mockSupabase,
        "practice-1",
        mockAttendancesApi as unknown as TeamAttendancesAPI,
      ),
    );

    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("[S4-V-02] 空の出欠配列を正常に返す（空状態）", async () => {
    mockAttendancesApi.listByPractice.mockResolvedValue([]);

    const { result } = renderQueryHook(() =>
      useAttendanceByPracticeQuery(
        mockSupabase,
        "practice-1",
        mockAttendancesApi as unknown as TeamAttendancesAPI,
      ),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});

describe("useAttendanceByCompetitionQuery", () => {
  let mockSupabase: ReturnType<typeof createMockSupabaseClient>;
  let mockAttendancesApi: {
    listByPractice: ReturnType<typeof vi.fn>;
    listByCompetition: ReturnType<typeof vi.fn>;
    updatePracticeAttendanceStatus: ReturnType<typeof vi.fn>;
    updateCompetitionAttendanceStatus: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = createMockSupabaseClient();
    mockAttendancesApi = {
      listByPractice: vi.fn(),
      listByCompetition: vi.fn(),
      updatePracticeAttendanceStatus: vi.fn(),
      updateCompetitionAttendanceStatus: vi.fn(),
    };
  });

  it("[S4-V-02] competitionId があれば出欠一覧を取得できる", async () => {
    const mockData = [
      { id: "att-3", competition_id: "comp-1", user_id: "user-1", status: "present" },
    ];
    mockAttendancesApi.listByCompetition.mockResolvedValue(mockData);

    const { result } = renderQueryHook(() =>
      useAttendanceByCompetitionQuery(
        mockSupabase,
        "comp-1",
        mockAttendancesApi as unknown as TeamAttendancesAPI,
      ),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockAttendancesApi.listByCompetition).toHaveBeenCalledWith("comp-1");
    expect(result.current.data).toEqual(mockData);
  });

  it("[S4-V-02] competitionId が undefined のとき query は enabled=false で呼ばれない", () => {
    const { result } = renderQueryHook(() =>
      useAttendanceByCompetitionQuery(
        mockSupabase,
        undefined,
        mockAttendancesApi as unknown as TeamAttendancesAPI,
      ),
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(mockAttendancesApi.listByCompetition).not.toHaveBeenCalled();
  });
});

describe("useUpdateAttendanceStatusMutation", () => {
  let mockSupabase: ReturnType<typeof createMockSupabaseClient>;
  let mockAttendancesApi: {
    listByPractice: ReturnType<typeof vi.fn>;
    listByCompetition: ReturnType<typeof vi.fn>;
    updatePracticeAttendanceStatus: ReturnType<typeof vi.fn>;
    updateCompetitionAttendanceStatus: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = createMockSupabaseClient();
    mockAttendancesApi = {
      listByPractice: vi.fn(),
      listByCompetition: vi.fn(),
      updatePracticeAttendanceStatus: vi.fn(),
      updateCompetitionAttendanceStatus: vi.fn(),
    };
  });

  // [S4-V-03] 練習の open/closed 切替が API を正しく呼ぶ
  it("[S4-V-03] eventType=practice のとき updatePracticeAttendanceStatus が呼ばれる", async () => {
    mockAttendancesApi.updatePracticeAttendanceStatus.mockResolvedValue(undefined);

    const { result } = renderQueryHook(() =>
      useUpdateAttendanceStatusMutation(
        mockSupabase,
        mockAttendancesApi as unknown as TeamAttendancesAPI,
      ),
    );

    await act(async () => {
      await result.current.mutateAsync({
        eventId: "practice-1",
        eventType: "practice",
        status: "open",
      });
    });

    expect(mockAttendancesApi.updatePracticeAttendanceStatus).toHaveBeenCalledWith(
      "practice-1",
      "open",
    );
    expect(mockAttendancesApi.updateCompetitionAttendanceStatus).not.toHaveBeenCalled();
  });

  it("[S4-V-03] eventType=practice, status=closed のとき closed で更新される", async () => {
    mockAttendancesApi.updatePracticeAttendanceStatus.mockResolvedValue(undefined);

    const { result } = renderQueryHook(() =>
      useUpdateAttendanceStatusMutation(
        mockSupabase,
        mockAttendancesApi as unknown as TeamAttendancesAPI,
      ),
    );

    await act(async () => {
      await result.current.mutateAsync({
        eventId: "practice-1",
        eventType: "practice",
        status: "closed",
      });
    });

    expect(mockAttendancesApi.updatePracticeAttendanceStatus).toHaveBeenCalledWith(
      "practice-1",
      "closed",
    );
  });

  // [S4-V-03] 大会の open/closed 切替が API を正しく呼ぶ
  it("[S4-V-03] eventType=competition のとき updateCompetitionAttendanceStatus が呼ばれる", async () => {
    mockAttendancesApi.updateCompetitionAttendanceStatus.mockResolvedValue(undefined);

    const { result } = renderQueryHook(() =>
      useUpdateAttendanceStatusMutation(
        mockSupabase,
        mockAttendancesApi as unknown as TeamAttendancesAPI,
      ),
    );

    await act(async () => {
      await result.current.mutateAsync({
        eventId: "comp-1",
        eventType: "competition",
        status: "open",
      });
    });

    expect(mockAttendancesApi.updateCompetitionAttendanceStatus).toHaveBeenCalledWith(
      "comp-1",
      "open",
    );
    expect(mockAttendancesApi.updatePracticeAttendanceStatus).not.toHaveBeenCalled();
  });

  // [S4-V-03] null ステータス (未設定) にリセット
  it("[S4-V-03] status=null で null にリセットできる (practice)", async () => {
    mockAttendancesApi.updatePracticeAttendanceStatus.mockResolvedValue(undefined);

    const { result } = renderQueryHook(() =>
      useUpdateAttendanceStatusMutation(
        mockSupabase,
        mockAttendancesApi as unknown as TeamAttendancesAPI,
      ),
    );

    await act(async () => {
      await result.current.mutateAsync({
        eventId: "practice-1",
        eventType: "practice",
        status: null,
      });
    });

    expect(mockAttendancesApi.updatePracticeAttendanceStatus).toHaveBeenCalledWith(
      "practice-1",
      null,
    );
  });

  // [S4-V-03] API エラー時はミューテーションが失敗する
  it("[S4-V-03] API エラー時はミューテーションが isError になる", async () => {
    mockAttendancesApi.updatePracticeAttendanceStatus.mockRejectedValue(
      new Error("権限がありません"),
    );

    const { result } = renderQueryHook(() =>
      useUpdateAttendanceStatusMutation(
        mockSupabase,
        mockAttendancesApi as unknown as TeamAttendancesAPI,
      ),
    );

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          eventId: "practice-1",
          eventType: "practice",
          status: "open",
        }),
      ).rejects.toThrow("権限がありません");
    });
  });
});
