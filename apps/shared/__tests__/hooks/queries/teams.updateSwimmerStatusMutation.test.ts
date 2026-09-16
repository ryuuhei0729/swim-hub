/**
 * Issue #49 QA テスト (Phase A スケルトン): useUpdateSwimmerStatusMutation
 *
 * 対象: apps/shared/hooks/queries/teams.ts - useUpdateSwimmerStatusMutation()
 *   (Phase A 時点では未実装。useUpdateMemberRoleMutation と同じ構造で追加する契約)
 *
 * Sprint Contract 検証観点:
 *   [V-06] 変異が成功したら teamKeys.members(teamId) のキャッシュを invalidate する
 *          (これが無いと、チェックボックスを押した本人の画面では次の再取得まで
 *           反映されない = 「保存したのに反映されない」体感バグになる)
 *
 * 契約 (Developer 実装対象、Phase A で QA が確定させたシグネチャ):
 *   useUpdateSwimmerStatusMutation(supabase, api?): UseMutationResult<
 *     TeamMembership, Error, { teamId: string; userId: string; isSwimmer: boolean }
 *   >
 *   onSuccess で teamKeys.members(teamId) と teamKeys.detail(teamId) を invalidate する
 *   (useUpdateMemberRoleMutation と同一パターン)。
 *
 * モック方針: TeamMembersAPI モジュール全体を vi.mock せず、既存の
 * apps/shared/__tests__/hooks/queries/teams.test.ts (useUpdateMemberRoleMutation ブロック) と
 * 同じ方式で、テスト内に組み立てた fake API オブジェクトを直接注入する
 * (第2引数 api を渡せる設計になっている前提)。
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act } from "@testing-library/react";
import { createMockSupabaseClient } from "../../../__mocks__/supabase";
import { useUpdateSwimmerStatusMutation } from "../../../hooks/queries/teams";
import { teamKeys } from "../../../hooks/queries/keys";
import { renderQueryHook, createTestQueryClient } from "../../utils/test-utils";
import type { TeamMembersAPI } from "../../../api/teams";

describe("useUpdateSwimmerStatusMutation", () => {
  let mockSupabase: ReturnType<typeof createMockSupabaseClient>;
  let fakeApi: { updateSwimmerStatus: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = createMockSupabaseClient();
    fakeApi = { updateSwimmerStatus: vi.fn() };
  });

  it("[V-06-01] isSwimmer=false を指定すると API へそのまま渡す", async () => {
    fakeApi.updateSwimmerStatus.mockResolvedValue({
      id: "membership-1",
      team_id: "team-1",
      user_id: "user-1",
      is_swimmer: false,
    });

    const { result } = renderQueryHook(() =>
      useUpdateSwimmerStatusMutation(mockSupabase, fakeApi as unknown as TeamMembersAPI),
    );

    await act(async () => {
      await result.current.mutateAsync({ teamId: "team-1", userId: "user-1", isSwimmer: false });
    });

    expect(fakeApi.updateSwimmerStatus).toHaveBeenCalledWith("team-1", "user-1", false);
  });

  it("[V-06-02] 成功時に teamKeys.members(teamId) を invalidate する", async () => {
    fakeApi.updateSwimmerStatus.mockResolvedValue({
      id: "membership-1",
      team_id: "team-1",
      user_id: "user-1",
      is_swimmer: false,
    });

    const queryClient = createTestQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderQueryHook(
      () => useUpdateSwimmerStatusMutation(mockSupabase, fakeApi as unknown as TeamMembersAPI),
      { queryClient },
    );

    await act(async () => {
      await result.current.mutateAsync({ teamId: "team-1", userId: "user-1", isSwimmer: false });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: teamKeys.members("team-1") });
  });

  it("[V-06-03] API が reject した場合は invalidate されない (失敗を成功扱いしない)", async () => {
    const apiError = new Error("network error");
    fakeApi.updateSwimmerStatus.mockRejectedValue(apiError);

    const queryClient = createTestQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderQueryHook(
      () => useUpdateSwimmerStatusMutation(mockSupabase, fakeApi as unknown as TeamMembersAPI),
      { queryClient },
    );

    await act(async () => {
      await expect(
        result.current.mutateAsync({ teamId: "team-1", userId: "user-1", isSwimmer: false }),
      ).rejects.toThrow("network error");
    });

    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
