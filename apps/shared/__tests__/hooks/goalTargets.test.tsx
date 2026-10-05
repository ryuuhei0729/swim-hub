/**
 * goalTargetKeys / useGoalTargetsQuery (Sprint Contract goal_target_badge)
 * - キー ["goals","targets"] が goalKeys.list()/detail() と衝突しない
 * - goalKeys.all の invalidate で再取得される (目標の編集・削除に追従)
 * - 失敗は isError で例外を投げない
 * - retry は個別指定せず QueryClient の既定に従う
 */
import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { goalTargetKeys, useGoalTargetsQuery } from "../../hooks/queries/goalTargets";
import { goalKeys } from "../../hooks/queries/goals";
import type { GoalAPI } from "../../api/goals";

const supabase = {} as SupabaseClient;
const apiOf = (getGoals: ReturnType<typeof vi.fn>) => ({ getGoals }) as unknown as GoalAPI;

function setup(defaults: Record<string, unknown> = { retry: false }) {
  const qc = new QueryClient({ defaultOptions: { queries: defaults as never } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  return { qc, wrapper };
}

describe("goalTargetKeys", () => {
  it("キーは ['goals','targets'] で goalKeys.all 配下", () => {
    expect([...goalTargetKeys.all]).toEqual(["goals", "targets"]);
    expect(goalTargetKeys.all.slice(0, goalKeys.all.length)).toEqual([...goalKeys.all]);
  });

  it("goalKeys.list() / lists() / detail() のどれとも、そして互いに接頭辞が重ならない", () => {
    const isPrefix = (a: readonly unknown[], b: readonly unknown[]) =>
      a.length <= b.length && a.every((v, i) => JSON.stringify(v) === JSON.stringify(b[i]));
    const others = [goalKeys.list(), goalKeys.lists(), goalKeys.detail("x")];
    for (const other of others) {
      expect(isPrefix(goalTargetKeys.all, other)).toBe(false);
      expect(isPrefix(other, goalTargetKeys.all)).toBe(false);
    }
  });
});

describe("useGoalTargetsQuery", () => {
  it("本人の全目標 (getGoals の戻り) をそのまま返す", async () => {
    const goals = [{ id: "g1" }, { id: "g2" }];
    const getGoals = vi.fn().mockResolvedValue(goals);
    const { wrapper } = setup();
    const { result } = renderHook(() => useGoalTargetsQuery(supabase, { api: apiOf(getGoals) }), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual(goals));
    expect(getGoals).toHaveBeenCalledTimes(1);
  });

  it("enabled:false なら fetch しない", async () => {
    const getGoals = vi.fn();
    const { wrapper } = setup();
    renderHook(() => useGoalTargetsQuery(supabase, { enabled: false, api: apiOf(getGoals) }), { wrapper });
    await new Promise((r) => setTimeout(r, 20));
    expect(getGoals).not.toHaveBeenCalled();
  });

  it("goalKeys.all を invalidate すると再取得される (目標の編集・削除に追従)", async () => {
    const getGoals = vi.fn().mockResolvedValueOnce([{ id: "old" }]).mockResolvedValueOnce([{ id: "new" }]);
    const { qc, wrapper } = setup();
    const { result } = renderHook(() => useGoalTargetsQuery(supabase, { api: apiOf(getGoals) }), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual([{ id: "old" }]));
    await act(async () => {
      await qc.invalidateQueries({ queryKey: goalKeys.all });
    });
    await waitFor(() => expect(result.current.data).toEqual([{ id: "new" }]));
    expect(getGoals).toHaveBeenCalledTimes(2);
  });

  it("失敗は isError になり、data は無く、例外を投げない", async () => {
    const getGoals = vi.fn().mockRejectedValue({ message: "boom" });
    const { wrapper } = setup();
    const { result } = renderHook(() => useGoalTargetsQuery(supabase, { api: apiOf(getGoals) }), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });

  describe("retry は QueryClient の既定に従う (フック個別指定がない)", () => {
    const run = async (retry: unknown) => {
      const getGoals = vi.fn().mockRejectedValue({ code: "X", message: "m" });
      const { wrapper } = setup({ retry, retryDelay: 0 });
      const { result } = renderHook(() => useGoalTargetsQuery(supabase, { api: apiOf(getGoals) }), { wrapper });
      await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 3000 });
      await new Promise((r) => setTimeout(r, 30));
      return getGoals;
    };
    it("既定 retry=false なら1回", async () => {
      expect(await run(false)).toHaveBeenCalledTimes(1);
    });
    it("既定 retry=2 なら初回 + 2回 = 3回", async () => {
      expect(await run(2)).toHaveBeenCalledTimes(3);
    });
    it("既定 retry が関数で false を返すエラーなら1回 (グローバル設定を上書きしない)", async () => {
      expect(await run((_c: number, e: { code?: string }) => e.code !== "X")).toHaveBeenCalledTimes(1);
    });
  });
});
