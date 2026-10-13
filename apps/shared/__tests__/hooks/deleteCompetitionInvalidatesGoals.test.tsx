// =============================================================================
// useDeleteCompetitionMutation が goalKeys.all を invalidate する (S13)
// =============================================================================
// delete_competition_with_records RPC は個人大会に紐づく goals も削除する。invalidate されないと
// 削除済み大会を指す目標が一覧キャッシュに残る。mobile の大会削除はこの hook が唯一の経路。
// 壊したら赤: onSuccess から goalKeys.all の invalidate を外す / 失敗時にまで invalidate する
// =============================================================================
import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { useDeleteCompetitionMutation } from "../../hooks/queries/records";
import { goalKeys } from "../../hooks/queries/goals";

const supabase = {
  from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: null }) }) }) }),
  auth: { getUser: async () => ({ data: { user: null } }) },
} as never;

function setup(deleteImpl: () => Promise<void>) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  qc.setQueryData([...goalKeys.all, "list", null], { goals: [{ id: "g1" }], competitions: [] });
  qc.setQueryData([...goalKeys.all, "detail", "g1"], { id: "g1" });
  const api = { deleteCompetition: vi.fn(deleteImpl) } as never;
  const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  const hook = renderHook(() => useDeleteCompetitionMutation(supabase, api), { wrapper });
  return { qc, hook, api: api as unknown as { deleteCompetition: ReturnType<typeof vi.fn> } };
}
const isInvalid = (qc: QueryClient, key: readonly unknown[]) => qc.getQueryState(key)?.isInvalidated;

describe("useDeleteCompetitionMutation × goalKeys", () => {
  it("削除成功 -> goals の一覧・詳細キャッシュがすべて invalidated になる", async () => {
    const { qc, hook, api } = setup(async () => {});
    expect(isInvalid(qc, [...goalKeys.all, "list", null])).toBe(false);
    await act(async () => { await hook.result.current.mutateAsync("c1"); });
    expect(api.deleteCompetition).toHaveBeenCalledWith("c1");
    expect(isInvalid(qc, [...goalKeys.all, "list", null])).toBe(true);
    expect(isInvalid(qc, [...goalKeys.all, "detail", "g1"])).toBe(true);
  });

  it("削除失敗 (チーム大会拒否等) -> goals は invalidate されない", async () => {
    const { qc, hook } = setup(async () => { throw new Error("rejected"); });
    await act(async () => { await hook.result.current.mutateAsync("c1").catch(() => {}); });
    expect(isInvalid(qc, [...goalKeys.all, "list", null])).toBe(false);
  });
});
