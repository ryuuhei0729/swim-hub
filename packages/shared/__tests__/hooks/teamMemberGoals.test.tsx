/**
 * teamMemberGoalKeys / useTeamMemberGoalsQuery (Sprint Contract v1)。
 * - queryKey に teamId と memberId が入り、本人用 goalKeys と空間が衝突しない
 * - memberId 未選択では fetch しない
 * - memberId 切替で前メンバーの data を返さない (placeholderData / keepPreviousData 禁止の実証)
 */
import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { teamMemberGoalKeys, useTeamMemberGoalsQuery, resolveMemberGoalsRetry } from "../../hooks/queries/teamMemberGoals";
import { goalKeys } from "../../hooks/queries/goals";
import type { TeamMemberGoalsAPI } from "../../api/teams/memberGoals";

const supabase = {} as SupabaseClient;

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, wrapper };
}

describe("teamMemberGoalKeys", () => {
  it("list キーに teamId と memberId が含まれ、別メンバーでは別キー", () => {
    const a = teamMemberGoalKeys.list("T", "A");
    const b = teamMemberGoalKeys.list("T", "B");
    expect(a).toContain("T");
    expect(a).toContain("A");
    expect(a).not.toEqual(b);
    expect(teamMemberGoalKeys.list("T1", "A")).not.toEqual(teamMemberGoalKeys.list("T2", "A"));
  });

  it("goalKeys (本人用) とルート要素が衝突しない", () => {
    expect(teamMemberGoalKeys.all[0]).not.toBe(goalKeys.all[0]);
  });

  it("list キーは all で始まる (一括 invalidate できる)", () => {
    expect(teamMemberGoalKeys.list("T", "A").slice(0, teamMemberGoalKeys.all.length)).toEqual([
      ...teamMemberGoalKeys.all,
    ]);
  });
});

describe("useTeamMemberGoalsQuery", () => {
  it("memberId 未選択では fetch しない", async () => {
    const list = vi.fn();
    const { wrapper } = setup();
    const { result } = renderHook(
      () => useTeamMemberGoalsQuery(supabase, "T", undefined, { api: { list } as unknown as TeamMemberGoalsAPI }),
      { wrapper },
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(list).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.data).toBeUndefined();
  });

  it("memberId 指定で (teamId, memberId) をそのまま api.list に渡す", async () => {
    const list = vi.fn().mockResolvedValue([{ id: "g1" }]);
    const { wrapper } = setup();
    const { result } = renderHook(
      () => useTeamMemberGoalsQuery(supabase, "T", "A", { api: { list } as unknown as TeamMemberGoalsAPI }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.data).toEqual([{ id: "g1" }]));
    expect(list).toHaveBeenCalledTimes(1);
    expect(list).toHaveBeenCalledWith("T", "A");
  });

  it("enabled:false なら memberId があっても fetch しない", async () => {
    const list = vi.fn();
    const { wrapper } = setup();
    renderHook(
      () => useTeamMemberGoalsQuery(supabase, "T", "A", { enabled: false, api: { list } as unknown as TeamMemberGoalsAPI }),
      { wrapper },
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(list).not.toHaveBeenCalled();
  });

  it("memberId 切替の直後・取得完了前に、前メンバーの data を返さない", async () => {
    let releaseB: (v: unknown[]) => void = () => {};
    const list = vi.fn((_t: string, m: string) =>
      m === "A" ? Promise.resolve([{ id: "goal-of-A" }]) : new Promise<unknown[]>((r) => { releaseB = r; }),
    );
    const api = { list } as unknown as TeamMemberGoalsAPI;
    const { wrapper } = setup();
    const { result, rerender } = renderHook(
      ({ m }: { m: string }) => useTeamMemberGoalsQuery(supabase, "T", m, { api }),
      { wrapper, initialProps: { m: "A" } },
    );
    await waitFor(() => expect(result.current.data).toEqual([{ id: "goal-of-A" }]));

    rerender({ m: "B" });
    // B の取得は保留中。A の目標が見えてはならない
    expect(result.current.data).toBeUndefined();
    expect(result.current.isPending).toBe(true);

    releaseB([{ id: "goal-of-B" }]);
    await waitFor(() => expect(result.current.data).toEqual([{ id: "goal-of-B" }]));
  });

  it("取得エラーは data を出さず isError になる (生のエラーを握り潰さない)", async () => {
    const list = vi.fn().mockRejectedValue({ message: "boom" });
    const { wrapper } = setup();
    const { result } = renderHook(
      () => useTeamMemberGoalsQuery(supabase, "T", "A", { api: { list } as unknown as TeamMemberGoalsAPI }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });

  describe("再試行 (本番の retry 関数を通す。遅延だけ 0 に潰す)", () => {
    const apiOf = (list: ReturnType<typeof vi.fn>) => ({ list } as unknown as TeamMemberGoalsAPI);
    function withDefaultRetry(retry: unknown) {
      const qc = new QueryClient({
        defaultOptions: { queries: { retry: retry as never, retryDelay: 0 } },
      });
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={qc}>{children}</QueryClientProvider>
      );
      return { wrapper };
    }
    const run = async (list: ReturnType<typeof vi.fn>, retry: unknown) => {
      const { wrapper } = withDefaultRetry(retry);
      const { result } = renderHook(
        () => useTeamMemberGoalsQuery(supabase, "T", "A", { api: apiOf(list) }),
        { wrapper },
      );
      await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 3000 });
      await new Promise((r) => setTimeout(r, 30));
      return result;
    };

    it("P0001 は既定 retry が何であっても再試行せず api.list は1回だけ", async () => {
      const list = vi.fn().mockRejectedValue({ code: "P0001", message: "not an approved active admin" });
      await run(list, 5);
      expect(list).toHaveBeenCalledTimes(1);
    });

    it("P0001 以外は既定 retry (数値 2) に従い、初回 + 2回 = 3回", async () => {
      const list = vi.fn().mockRejectedValue({ code: "57014", message: "timeout" });
      await run(list, 2);
      expect(list).toHaveBeenCalledTimes(3);
    });

    it("既定 retry が関数でその関数が false を返すエラー (NETWORK_ERROR) は1回だけ (グローバル設定を上書きしない)", async () => {
      const list = vi.fn().mockRejectedValue({ code: "NETWORK_ERROR", message: "net" });
      const globalRetry = vi.fn((count: number, err: { code?: string }) => err.code !== "NETWORK_ERROR" && count < 3);
      await run(list, globalRetry);
      expect(list).toHaveBeenCalledTimes(1);
      expect(globalRetry).toHaveBeenCalled();
    });

    it("既定 retry が関数で true を返すエラーはその関数の回数だけ再試行される", async () => {
      const list = vi.fn().mockRejectedValue({ code: "57014", message: "timeout" });
      await run(list, (count: number) => count < 1);
      expect(list).toHaveBeenCalledTimes(2);
    });

    it("既定 retry が false なら P0001 以外も再試行しない", async () => {
      const list = vi.fn().mockRejectedValue({ code: "57014", message: "timeout" });
      await run(list, false);
      expect(list).toHaveBeenCalledTimes(1);
    });

    it("既定 retry 未設定 (undefined) のときは 3 回再試行 = 合計4回", async () => {
      const list = vi.fn().mockRejectedValue({ code: "57014", message: "timeout" });
      const qc = new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={qc}>{children}</QueryClientProvider>
      );
      const { result } = renderHook(
        () => useTeamMemberGoalsQuery(supabase, "T", "A", { api: apiOf(list) }),
        { wrapper },
      );
      await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 3000 });
      expect(list).toHaveBeenCalledTimes(4);
    });

    it("途中成功すれば再試行で回復する", async () => {
      const list = vi.fn().mockRejectedValueOnce({ code: "57014", message: "timeout" }).mockResolvedValueOnce([{ id: "g1" }]);
      const { wrapper } = withDefaultRetry(3);
      const { result } = renderHook(
        () => useTeamMemberGoalsQuery(supabase, "T", "A", { api: apiOf(list) }),
        { wrapper },
      );
      await waitFor(() => expect(result.current.data).toEqual([{ id: "g1" }]));
      expect(list).toHaveBeenCalledTimes(2);
    });
  });
});

describe("resolveMemberGoalsRetry (純粋関数)", () => {
  const err = (code?: string) => ({ code, message: "m" }) as unknown as Error;
  it("P0001 は常に false", () => {
    expect(resolveMemberGoalsRetry(5, 0, err("P0001"))).toBe(false);
    expect(resolveMemberGoalsRetry(true, 0, err("P0001"))).toBe(false);
    expect(resolveMemberGoalsRetry(() => true, 0, err("P0001"))).toBe(false);
    expect(resolveMemberGoalsRetry(undefined, 0, err("P0001"))).toBe(false);
  });
  it("関数ならそれを (failureCount, error) で呼んだ結果", () => {
    const fn = vi.fn(() => true);
    const e = err("X");
    expect(resolveMemberGoalsRetry(fn, 2, e)).toBe(true);
    expect(fn).toHaveBeenCalledWith(2, e);
    expect(resolveMemberGoalsRetry(() => false, 0, e)).toBe(false);
  });
  it("数値 n なら failureCount < n (境界)", () => {
    expect(resolveMemberGoalsRetry(2, 1, err())).toBe(true);
    expect(resolveMemberGoalsRetry(2, 2, err())).toBe(false);
    expect(resolveMemberGoalsRetry(0, 0, err())).toBe(false);
  });
  it("真偽値ならその値", () => {
    expect(resolveMemberGoalsRetry(true, 99, err())).toBe(true);
    expect(resolveMemberGoalsRetry(false, 0, err())).toBe(false);
  });
  it("未設定なら failureCount < 3 (境界)", () => {
    expect(resolveMemberGoalsRetry(undefined, 2, err())).toBe(true);
    expect(resolveMemberGoalsRetry(undefined, 3, err())).toBe(false);
  });
  it("code を持たないエラー(null/文字列)でも例外を出さない", () => {
    expect(resolveMemberGoalsRetry(undefined, 0, null as unknown as Error)).toBe(true);
    expect(resolveMemberGoalsRetry(undefined, 0, "x" as unknown as Error)).toBe(true);
  });
});
