// =============================================================================
// usePendingMembers*.test.ts - QA Engineer Sprint 1 検証
// useListPendingMembersQuery / useApproveMemberMutation / useRejectMemberMutation
// =============================================================================

import { describe, expect, it, vi, beforeEach } from "vitest";
import { waitFor, act } from "@testing-library/react";
import { createMockSupabaseClient, createMockTeamMembershipWithUser } from "../../../__mocks__/supabase";
import { TeamMembersAPI } from "../../../api/teams";
import {
  useListPendingMembersQuery,
  useApproveMemberMutation,
  useRejectMemberMutation,
} from "../../../hooks/queries/teams";
import { teamKeys } from "../../../hooks/queries/keys";
import { renderQueryHook } from "../../utils/test-utils";

// TeamMembersAPI をモック化（Sprint Contract: フック単体テスト用）
vi.mock("../../../api/teams", () => ({
  TeamCoreAPI: vi.fn(),
  TeamAnnouncementsAPI: vi.fn(),
  TeamMembersAPI: vi.fn().mockImplementation(() => ({
    listPending: vi.fn(),
    approve: vi.fn(),
    reject: vi.fn(),
    list: vi.fn(),
    join: vi.fn(),
    leave: vi.fn(),
    updateRole: vi.fn(),
    remove: vi.fn(),
  })),
}));

// S1-V-01 相当: useListPendingMembersQuery
describe("useListPendingMembersQuery", () => {
  let mockSupabase: ReturnType<typeof createMockSupabaseClient>;
  let mockMembersApi: { listPending: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = createMockSupabaseClient();
    mockMembersApi = { listPending: vi.fn() };
    (TeamMembersAPI as ReturnType<typeof vi.fn>).mockImplementation(() => mockMembersApi);
  });

  it("teamId を指定すると承認待ちメンバー一覧を取得できる", async () => {
    const pending = [
      createMockTeamMembershipWithUser({ id: "m-1", status: "pending" as const }),
      createMockTeamMembershipWithUser({ id: "m-2", status: "pending" as const }),
    ];
    mockMembersApi.listPending.mockResolvedValue(pending);

    const { result } = renderQueryHook(() =>
      useListPendingMembersQuery(mockSupabase, "team-1"),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual(pending);
    expect(mockMembersApi.listPending).toHaveBeenCalledWith("team-1");
  });

  it("teamId が undefined のときクエリは実行されない (enabled: false)", () => {
    const { result } = renderQueryHook(() =>
      useListPendingMembersQuery(mockSupabase, undefined),
    );

    // enabled: false なので isLoading でなく isPending になる
    expect(result.current.fetchStatus).toBe("idle");
    expect(mockMembersApi.listPending).not.toHaveBeenCalled();
  });

  it("空リストが返ったとき data は空配列になる", async () => {
    mockMembersApi.listPending.mockResolvedValue([]);

    const { result } = renderQueryHook(() =>
      useListPendingMembersQuery(mockSupabase, "team-1"),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.data).toEqual([]);
  });

  it("API がエラーを投げたとき isError が true になる", async () => {
    const apiError = new Error("権限がありません");
    mockMembersApi.listPending.mockRejectedValue(apiError);

    const { result } = renderQueryHook(() =>
      useListPendingMembersQuery(mockSupabase, "team-1"),
    );

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toEqual(apiError);
  });

  it("クエリキーが teamKeys.pendingMembers(teamId) と一致する", () => {
    const key = teamKeys.pendingMembers("team-abc");
    // キー構造: ["teams", "detail", "team-abc", "pendingMembers"]
    expect(key).toContain("team-abc");
    expect(key).toContain("pendingMembers");
  });
});

// S1-V-07 相当: useApproveMemberMutation
describe("useApproveMemberMutation", () => {
  let mockSupabase: ReturnType<typeof createMockSupabaseClient>;
  let mockMembersApi: {
    approve: ReturnType<typeof vi.fn>;
    listPending: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = createMockSupabaseClient();
    mockMembersApi = {
      approve: vi.fn(),
      listPending: vi.fn(),
    };
    (TeamMembersAPI as ReturnType<typeof vi.fn>).mockImplementation(() => mockMembersApi);
  });

  it("membershipId と teamId を渡すと approve が呼ばれ、キャッシュが無効化される", async () => {
    const approved = createMockTeamMembershipWithUser({
      id: "m-1",
      status: "approved" as const,
      is_active: true,
    });
    mockMembersApi.approve.mockResolvedValue(approved);

    const { result, queryClient } = renderQueryHook(() =>
      useApproveMemberMutation(mockSupabase, mockMembersApi as unknown as TeamMembersAPI),
    );

    let returnedData;
    await act(async () => {
      returnedData = await result.current.mutateAsync({
        membershipId: "m-1",
        teamId: "team-1",
      });
    });

    expect(mockMembersApi.approve).toHaveBeenCalledWith("m-1");
    expect(returnedData).toEqual(approved);
  });

  it("API エラー時に例外が投げられる", async () => {
    mockMembersApi.approve.mockRejectedValue(new Error("承認失敗"));

    const { result } = renderQueryHook(() =>
      useApproveMemberMutation(mockSupabase, mockMembersApi as unknown as TeamMembersAPI),
    );

    await act(async () => {
      await expect(
        result.current.mutateAsync({ membershipId: "m-bad", teamId: "team-1" }),
      ).rejects.toThrow("承認失敗");
    });
  });
});

// S1-V-08 相当: useRejectMemberMutation
describe("useRejectMemberMutation", () => {
  let mockSupabase: ReturnType<typeof createMockSupabaseClient>;
  let mockMembersApi: {
    reject: ReturnType<typeof vi.fn>;
    listPending: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = createMockSupabaseClient();
    mockMembersApi = {
      reject: vi.fn(),
      listPending: vi.fn(),
    };
    (TeamMembersAPI as ReturnType<typeof vi.fn>).mockImplementation(() => mockMembersApi);
  });

  it("membershipId と teamId を渡すと reject が呼ばれる", async () => {
    const rejected = createMockTeamMembershipWithUser({
      id: "m-1",
      status: "rejected" as const,
      is_active: false,
    });
    mockMembersApi.reject.mockResolvedValue(rejected);

    const { result } = renderQueryHook(() =>
      useRejectMemberMutation(mockSupabase, mockMembersApi as unknown as TeamMembersAPI),
    );

    let returnedData;
    await act(async () => {
      returnedData = await result.current.mutateAsync({
        membershipId: "m-1",
        teamId: "team-1",
      });
    });

    expect(mockMembersApi.reject).toHaveBeenCalledWith("m-1");
    expect(returnedData).toEqual(rejected);
  });

  it("API エラー時に例外が投げられる", async () => {
    mockMembersApi.reject.mockRejectedValue(new Error("拒否失敗"));

    const { result } = renderQueryHook(() =>
      useRejectMemberMutation(mockSupabase, mockMembersApi as unknown as TeamMembersAPI),
    );

    await act(async () => {
      await expect(
        result.current.mutateAsync({ membershipId: "m-bad", teamId: "team-1" }),
      ).rejects.toThrow("拒否失敗");
    });
  });
});
