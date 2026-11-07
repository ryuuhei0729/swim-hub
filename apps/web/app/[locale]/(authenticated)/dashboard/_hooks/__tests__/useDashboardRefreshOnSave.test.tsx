import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { dashboardKeys, recordKeys } from "@apps/shared/hooks/queries/keys";
import { useDashboardRefreshOnSave } from "../useDashboardRefreshOnSave";

function setup() {
  const queryClient = new QueryClient();
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const hook = renderHook(
    ({ refreshKey }: { refreshKey: number }) => useDashboardRefreshOnSave(refreshKey, "user-1"),
    { wrapper, initialProps: { refreshKey: 0 } },
  );
  return { invalidate, ...hook };
}

describe("useDashboardRefreshOnSave", () => {
  it("初回の描画では何も取り直さない", () => {
    const { invalidate } = setup();
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("calendarRefreshKey が進んだら、ダッシュボードの各ブロックと自分のベストタイムを取り直す", () => {
    const { invalidate, rerender } = setup();

    rerender({ refreshKey: 1 });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: dashboardKeys.all });
    // 記録の作成・更新の mutation は bestTimes を invalidate しないので、ここで取り直す必要がある
    expect(invalidate).toHaveBeenCalledWith({ queryKey: recordKeys.bestTimes("user-1") });
  });

  it("calendarRefreshKey が変わらない再描画では取り直さない", () => {
    const { invalidate, rerender } = setup();
    rerender({ refreshKey: 0 });
    expect(invalidate).not.toHaveBeenCalled();
  });
});
