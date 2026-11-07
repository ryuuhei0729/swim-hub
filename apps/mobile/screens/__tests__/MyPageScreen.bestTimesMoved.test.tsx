// =============================================================================
// MyPageScreen.bestTimesMoved.test.tsx
// =============================================================================
// 2026-11-07 にベストタイム欄をホーム (DashboardBestTimesSection) へ移し、マイページからは消した。
// 書き戻し (欄の再導入) を見落とさないよう、表示だけでなく取得 (RecordAPI.getBestTimes) が
// 呼ばれないことまで確かめる。
// =============================================================================

import { QueryClient } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createTableDispatchSupabase } from "./utils/tableSupabaseMock";
import { createWrapper, harness, USER_ID } from "./myPageScreenHarness";
import { MyPageScreen } from "../MyPageScreen";

describe("MyPageScreen — ベストタイム欄はホームへ移した", () => {
  it("プロフィールは出すが、ベストタイムの見出し・一括入力・点数化は出さず、ベストタイムも取得しない", async () => {
    const supabaseMock = createTableDispatchSupabase({
      userId: USER_ID,
      tables: { users: { data: { id: USER_ID, name: "テストユーザー", gender: 0 } } },
    });
    harness.supabase = supabaseMock.client;
    harness.getMyTeams.mockResolvedValue([]);
    harness.getBestTimes.mockResolvedValue([]);
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    render(<MyPageScreen />, { wrapper: createWrapper(queryClient) });

    expect(await screen.findByText("テストユーザー")).toBeTruthy();
    expect(screen.queryByText("Best Time")).toBeNull();
    expect(screen.queryByText("一括入力")).toBeNull();
    expect(screen.queryByText("点数化")).toBeNull();
    expect(harness.getBestTimes).not.toHaveBeenCalled();
  });
});
