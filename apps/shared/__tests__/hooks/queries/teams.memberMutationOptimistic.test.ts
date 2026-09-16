/**
 * 対象: apps/shared/hooks/queries/teams.ts
 *   - useUpdateMemberRoleMutation()
 *   - useUpdateSwimmerStatusMutation()
 *
 * 背景 (ユーザー報告):
 *   mobile のチーム詳細メンバータブで「ユーザー → 管理者」に変更しても、画面に
 *   反映されるまで体感 3 秒ほどかかっていた。mobile のメンバー詳細モーダルは
 *   teamKeys.members(teamId) クエリの結果をそのまま描画しているため、
 *   「UPDATE の往復 → invalidate → メンバー全件の再取得」が全部終わるまで
 *   表示が変わらなかった (web は displayMember というモーダル内 state で
 *   即時反映しているため同じ症状が出ない)。
 *
 * 検証観点:
 *   [V-OPT-01] role 変更: サーバー応答を待つ前に members キャッシュが新しい role になる
 *   [V-OPT-02] role 変更: 対象外のメンバーは書き換えない (user_id で1行だけ当てている)
 *   [V-OPT-03] role 変更: API が reject したら楽観的更新を元に戻す (嘘の表示を残さない)
 *   [V-OPT-04] is_swimmer 変更も同じ楽観的更新・ロールバックをする
 *
 * 検出できないことの明示:
 *   ここで見ているのは React Query キャッシュの中身だけで、mobile の描画は見ていない。
 *   「モーダルがそのキャッシュを読んでいる」ことは
 *   components/teams/__tests__/TeamMemberList.* 側の責務。
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, waitFor } from "@testing-library/react";
import { createMockSupabaseClient } from "../../../__mocks__/supabase";
import {
  useUpdateMemberRoleMutation,
  useUpdateSwimmerStatusMutation,
} from "../../../hooks/queries/teams";
import { teamKeys } from "../../../hooks/queries/keys";
import { QueryClient } from "@tanstack/react-query";
import { renderQueryHook } from "../../utils/test-utils";
import type { TeamMembersAPI } from "../../../api/teams";
import type { TeamMembershipWithUser } from "../../../types";

const TEAM_ID = "team-1";

/**
 * 共有の createTestQueryClient() は gcTime: 0 なので、observer の無い
 * setQueryData() のシードが即座に GC されて読み出せない。ここでは
 * キャッシュそのものを検証対象にするため gcTime を無効化した client を使う。
 */
const createClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: 0 },
      mutations: { retry: false },
    },
  });

const buildMember = (
  userId: string,
  overrides: Partial<TeamMembershipWithUser> = {},
): TeamMembershipWithUser =>
  ({
    id: `membership-${userId}`,
    team_id: TEAM_ID,
    user_id: userId,
    role: "user",
    status: "approved",
    is_active: true,
    is_swimmer: true,
    users: { id: userId, name: `user ${userId}`, gender: 0 },
    ...overrides,
  }) as unknown as TeamMembershipWithUser;

/** resolve/reject を外から制御できる Promise。「応答前」の状態を観測するために使う */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const readMembers = (queryClient: QueryClient) =>
  queryClient.getQueryData<TeamMembershipWithUser[]>(teamKeys.members(TEAM_ID)) ?? [];

const roleOf = (queryClient: QueryClient, userId: string) =>
  readMembers(queryClient).find((m) => m.user_id === userId)?.role;

const isSwimmerOf = (queryClient: QueryClient, userId: string) =>
  readMembers(queryClient).find((m) => m.user_id === userId)?.is_swimmer;

describe("メンバー変更ミューテーションの楽観的更新", () => {
  let mockSupabase: ReturnType<typeof createMockSupabaseClient>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = createMockSupabaseClient();
  });

  it("[V-OPT-01][V-OPT-02] role 変更はサーバー応答前にキャッシュへ反映され、対象外メンバーは変わらない", async () => {
    const pending = deferred<{ id: string }>();
    const fakeApi = { updateRole: vi.fn(() => pending.promise) };

    const queryClient = createClient();
    queryClient.setQueryData(teamKeys.members(TEAM_ID), [
      buildMember("u-1"),
      buildMember("u-2"),
    ]);

    const { result } = renderQueryHook(
      () => useUpdateMemberRoleMutation(mockSupabase, fakeApi as unknown as TeamMembersAPI),
      { queryClient },
    );

    // --- 正のコントロール: 開始前は user ---
    expect(roleOf(queryClient, "u-1")).toBe("user");

    act(() => {
      result.current.mutate({ teamId: TEAM_ID, userId: "u-1", role: "admin" });
    });

    // --- 本体: API はまだ解決していないのにキャッシュは admin になっている ---
    await waitFor(() => {
      expect(roleOf(queryClient, "u-1")).toBe("admin");
    });
    expect(fakeApi.updateRole).toHaveBeenCalledTimes(1);
    expect(result.current.isPending).toBe(true);

    // --- 交差ガード: 他のメンバーは巻き込まれていない ---
    expect(roleOf(queryClient, "u-2")).toBe("user");

    await act(async () => {
      pending.resolve({ id: "membership-u-1" });
      await pending.promise;
    });

    // 成功後も admin のまま (楽観的更新が success 経路で打ち消されない)
    expect(roleOf(queryClient, "u-1")).toBe("admin");
  });

  it("[V-OPT-03] role 変更が失敗したらキャッシュを元の role に戻す", async () => {
    const fakeApi = { updateRole: vi.fn().mockRejectedValue(new Error("network error")) };

    const queryClient = createClient();
    queryClient.setQueryData(teamKeys.members(TEAM_ID), [buildMember("u-1")]);

    const { result } = renderQueryHook(
      () => useUpdateMemberRoleMutation(mockSupabase, fakeApi as unknown as TeamMembersAPI),
      { queryClient },
    );

    await act(async () => {
      await expect(
        result.current.mutateAsync({ teamId: TEAM_ID, userId: "u-1", role: "admin" }),
      ).rejects.toThrow("network error");
    });

    expect(roleOf(queryClient, "u-1")).toBe("user");
  });

  it("[V-OPT-04] is_swimmer 変更も応答前に反映され、失敗時は元に戻る", async () => {
    const pending = deferred<{ id: string }>();
    const fakeApi = { updateSwimmerStatus: vi.fn(() => pending.promise) };

    const queryClient = createClient();
    queryClient.setQueryData(teamKeys.members(TEAM_ID), [buildMember("u-1")]);

    const { result } = renderQueryHook(
      () => useUpdateSwimmerStatusMutation(mockSupabase, fakeApi as unknown as TeamMembersAPI),
      { queryClient },
    );

    expect(isSwimmerOf(queryClient, "u-1")).toBe(true);

    act(() => {
      result.current.mutate({ teamId: TEAM_ID, userId: "u-1", isSwimmer: false });
    });

    await waitFor(() => {
      expect(isSwimmerOf(queryClient, "u-1")).toBe(false);
    });
    expect(result.current.isPending).toBe(true);

    await act(async () => {
      pending.reject(new Error("rls denied"));
      await pending.promise.catch(() => undefined);
    });

    await waitFor(() => {
      expect(isSwimmerOf(queryClient, "u-1")).toBe(true);
    });
  });
});
