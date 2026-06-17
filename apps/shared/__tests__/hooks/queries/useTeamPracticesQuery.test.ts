// =============================================================================
// QA: useTeamPracticesQuery / useTeamCompetitionsQuery 検証テスト
// Sprint 2 - Phase B
// =============================================================================

import { describe, expect, it, vi, beforeEach } from "vitest";
import { waitFor, act } from "@testing-library/react";
import {
  createMockSupabaseClient,
  createMockPractice,
  createMockCompetition,
} from "../../../__mocks__/supabase";
import { TeamPracticesAPI } from "../../../api/teams/practices";
import { TeamRecordsAPI } from "../../../api/teams/records";
import {
  useTeamPracticesQuery,
  useDeleteTeamPracticeMutation,
  useTeamCompetitionsQuery,
  useDeleteTeamCompetitionMutation,
} from "../../../hooks/queries/teams";
import { renderQueryHook } from "../../utils/test-utils";
import { teamKeys } from "../../../hooks/queries/keys";

// TeamPracticesAPI / TeamRecordsAPI をモック化
vi.mock("../../../api/teams/practices", () => ({
  TeamPracticesAPI: vi.fn().mockImplementation(() => ({
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  })),
}));

vi.mock("../../../api/teams/records", () => ({
  TeamRecordsAPI: vi.fn().mockImplementation(() => ({
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  })),
}));

describe("useTeamPracticesQuery", () => {
  let mockSupabase: ReturnType<typeof createMockSupabaseClient>;
  let mockPracticesApi: {
    list: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = createMockSupabaseClient();
    mockPracticesApi = {
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    };
  });

  // [S2-V-01] teamId を指定するとチーム練習一覧を取得できる
  it("teamId を指定するとチーム練習一覧を取得できる", async () => {
    const practices = [
      createMockPractice({ id: "p-1", team_id: "team-1" }),
      createMockPractice({ id: "p-2", team_id: "team-1", title: "朝練" }),
    ];
    mockPracticesApi.list.mockResolvedValue(practices);

    const { result } = renderQueryHook(() =>
      useTeamPracticesQuery(
        mockSupabase,
        "team-1",
        mockPracticesApi as unknown as TeamPracticesAPI,
      ),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual(practices);
    expect(mockPracticesApi.list).toHaveBeenCalledWith("team-1");
  });

  // teamId なしのとき enabled=false でクエリが実行されないこと
  it("teamId が undefined の場合はクエリが実行されない", async () => {
    const { result } = renderQueryHook(() =>
      useTeamPracticesQuery(
        mockSupabase,
        undefined,
        mockPracticesApi as unknown as TeamPracticesAPI,
      ),
    );

    // fetchStatus が idle（実行されていない）
    expect(result.current.fetchStatus).toBe("idle");
    expect(mockPracticesApi.list).not.toHaveBeenCalled();
  });

  // API エラー時は isError になる
  it("API エラー時は isError が true になる", async () => {
    mockPracticesApi.list.mockRejectedValue(new Error("network error"));

    const { result } = renderQueryHook(() =>
      useTeamPracticesQuery(
        mockSupabase,
        "team-1",
        mockPracticesApi as unknown as TeamPracticesAPI,
      ),
    );

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.message).toBe("network error");
  });

  // クエリキーが teamKeys.practices(teamId) と一致すること
  it("クエリキーが teamKeys.practices(teamId) に対応する構造になる", () => {
    const key = teamKeys.practices("team-abc");
    expect(key).toEqual(["teams", "detail", "team-abc", "practices"]);
  });
});

// =============================================================================
// useDeleteTeamPracticeMutation
// =============================================================================
describe("useDeleteTeamPracticeMutation", () => {
  let mockSupabase: ReturnType<typeof createMockSupabaseClient>;
  let mockPracticesApi: {
    list: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = createMockSupabaseClient();
    mockPracticesApi = {
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    };
  });

  it("id を渡すと remove(id) が呼ばれる", async () => {
    mockPracticesApi.remove.mockResolvedValue(undefined);

    const { result } = renderQueryHook(() =>
      useDeleteTeamPracticeMutation(
        mockSupabase,
        mockPracticesApi as unknown as TeamPracticesAPI,
      ),
    );

    await act(async () => {
      await result.current.mutateAsync({ id: "p-1", teamId: "team-1" });
    });

    expect(mockPracticesApi.remove).toHaveBeenCalledWith("p-1");
  });

  it("削除後に teamKeys.practices(teamId) が invalidate される", async () => {
    mockPracticesApi.remove.mockResolvedValue(undefined);

    const { result, queryClient } = renderQueryHook(() =>
      useDeleteTeamPracticeMutation(
        mockSupabase,
        mockPracticesApi as unknown as TeamPracticesAPI,
      ),
    );

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    await act(async () => {
      await result.current.mutateAsync({ id: "p-1", teamId: "team-1" });
    });

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: teamKeys.practices("team-1") }),
    );
  });

  // 異常系: API エラー
  it("削除失敗時は mutateAsync が reject される", async () => {
    mockPracticesApi.remove.mockRejectedValue(new Error("delete failed"));

    const { result } = renderQueryHook(() =>
      useDeleteTeamPracticeMutation(
        mockSupabase,
        mockPracticesApi as unknown as TeamPracticesAPI,
      ),
    );

    await act(async () => {
      await expect(
        result.current.mutateAsync({ id: "p-1", teamId: "team-1" }),
      ).rejects.toThrow("delete failed");
    });
  });
});

// =============================================================================
// useTeamCompetitionsQuery
// =============================================================================
describe("useTeamCompetitionsQuery", () => {
  let mockSupabase: ReturnType<typeof createMockSupabaseClient>;
  let mockRecordsApi: {
    list: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = createMockSupabaseClient();
    mockRecordsApi = {
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    };
  });

  // [S2-V-01] チーム大会一覧を取得できる
  it("teamId を指定するとチーム大会一覧を取得できる", async () => {
    const competitions = [
      createMockCompetition({ id: "c-1", team_id: "team-1" }),
      createMockCompetition({ id: "c-2", team_id: "team-1", title: "秋季大会" }),
    ];
    mockRecordsApi.list.mockResolvedValue(competitions);

    const { result } = renderQueryHook(() =>
      useTeamCompetitionsQuery(
        mockSupabase,
        "team-1",
        mockRecordsApi as unknown as TeamRecordsAPI,
      ),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual(competitions);
    expect(mockRecordsApi.list).toHaveBeenCalledWith("team-1");
  });

  it("teamId が undefined の場合はクエリが実行されない", async () => {
    const { result } = renderQueryHook(() =>
      useTeamCompetitionsQuery(
        mockSupabase,
        undefined,
        mockRecordsApi as unknown as TeamRecordsAPI,
      ),
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(mockRecordsApi.list).not.toHaveBeenCalled();
  });

  // クエリキー構造の検証
  it("クエリキーが teamKeys.competitions(teamId) に対応する構造になる", () => {
    const key = teamKeys.competitions("team-abc");
    expect(key).toEqual(["teams", "detail", "team-abc", "competitions"]);
  });
});

// =============================================================================
// useDeleteTeamCompetitionMutation
// =============================================================================
describe("useDeleteTeamCompetitionMutation", () => {
  let mockSupabase: ReturnType<typeof createMockSupabaseClient>;
  let mockRecordsApi: {
    list: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = createMockSupabaseClient();
    mockRecordsApi = {
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    };
  });

  it("id を渡すと remove(id) が呼ばれる", async () => {
    mockRecordsApi.remove.mockResolvedValue(undefined);

    const { result } = renderQueryHook(() =>
      useDeleteTeamCompetitionMutation(
        mockSupabase,
        mockRecordsApi as unknown as TeamRecordsAPI,
      ),
    );

    await act(async () => {
      await result.current.mutateAsync({ id: "c-1", teamId: "team-1" });
    });

    expect(mockRecordsApi.remove).toHaveBeenCalledWith("c-1");
  });

  it("削除後に teamKeys.competitions(teamId) が invalidate される", async () => {
    mockRecordsApi.remove.mockResolvedValue(undefined);

    const { result, queryClient } = renderQueryHook(() =>
      useDeleteTeamCompetitionMutation(
        mockSupabase,
        mockRecordsApi as unknown as TeamRecordsAPI,
      ),
    );

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    await act(async () => {
      await result.current.mutateAsync({ id: "c-1", teamId: "team-1" });
    });

    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: teamKeys.competitions("team-1") }),
    );
  });
});
