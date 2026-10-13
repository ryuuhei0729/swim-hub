// =============================================================================
// practicesSkipMilestoneUpdate.test.tsx  (D8 / S12 の shared 契約)
// =============================================================================
// useCreatePracticeLogMutation / useUpdatePracticeLogMutation は onSuccess でマイルストーン判定を呼ぶが、
// skipMilestoneUpdate:true のときは呼ばない (呼び出し側がタイム保存後に1回だけ判定するため)。
// 壊したら赤: skip を無視して常に判定 / skip 未指定でも判定しない (web など既存呼び出しが壊れる)。
// =============================================================================
import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ judge: vi.fn() }));
vi.mock("../../api/goals", () => ({
  GoalAPI: class {
    updateAllMilestoneStatuses = h.judge;
  },
}));

import { useCreatePracticeLogMutation, useUpdatePracticeLogMutation } from "../../hooks/queries/practices";

const supabase = { auth: { getUser: vi.fn(async () => ({ data: { user: { id: "u-9" } } })) } } as never;
const api = {
  createPracticeLog: vi.fn(async () => ({ id: "log-1" })),
  updatePracticeLog: vi.fn(async () => ({ id: "log-1" })),
} as never;

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  h.judge.mockReset().mockResolvedValue(undefined);
});

describe("useCreatePracticeLogMutation", () => {
  const input = { practice_id: "p1", style: "Fr", swim_category: "Swim", distance: 100, rep_count: 4, set_count: 1 } as never;

  it("skipMilestoneUpdate:true -> 判定を呼ばない。API には skip フラグを渡さない", async () => {
    const { result } = renderHook(() => useCreatePracticeLogMutation(supabase, api), { wrapper: wrapper() });
    await act(async () => { await result.current.mutateAsync({ ...(input as object), skipMilestoneUpdate: true } as never); });
    expect(h.judge).not.toHaveBeenCalled();
    const arg = (api as unknown as { createPracticeLog: { mock: { calls: unknown[][] } } }).createPracticeLog.mock.calls.at(-1)![0];
    expect(arg).not.toHaveProperty("skipMilestoneUpdate");
  });

  it("未指定 / false -> 従来どおり判定が userId 引数で1回呼ばれる", async () => {
    const { result } = renderHook(() => useCreatePracticeLogMutation(supabase, api), { wrapper: wrapper() });
    await act(async () => { await result.current.mutateAsync(input); });
    await waitFor(() => expect(h.judge).toHaveBeenCalledTimes(1));
    expect(h.judge).toHaveBeenCalledWith("u-9");
    h.judge.mockClear();
    await act(async () => { await result.current.mutateAsync({ ...(input as object), skipMilestoneUpdate: false } as never); });
    await waitFor(() => expect(h.judge).toHaveBeenCalledTimes(1));
  });
});

describe("useUpdatePracticeLogMutation", () => {
  it("skipMilestoneUpdate:true -> 判定を呼ばない", async () => {
    const { result } = renderHook(() => useUpdatePracticeLogMutation(supabase, api), { wrapper: wrapper() });
    await act(async () => { await result.current.mutateAsync({ id: "log-1", updates: {} as never, skipMilestoneUpdate: true }); });
    expect(h.judge).not.toHaveBeenCalled();
  });

  it("未指定 -> 判定が1回", async () => {
    const { result } = renderHook(() => useUpdatePracticeLogMutation(supabase, api), { wrapper: wrapper() });
    await act(async () => { await result.current.mutateAsync({ id: "log-1", updates: {} as never }); });
    await waitFor(() => expect(h.judge).toHaveBeenCalledTimes(1));
    expect(h.judge).toHaveBeenCalledWith("u-9");
  });
});
