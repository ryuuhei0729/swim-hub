// =============================================================================
// teamRecordBulk.detailScreenAdminGuard.test.tsx
// Sprint Contract Phase A スケルトン — 種目詳細画面への権限ゲート
// =============================================================================
//
// [V-08] 非管理者ユーザーが種目詳細画面 (TeamRecordStyleDetail) へ到達した場合、
//        入力・保存が拒否されること (現行 TeamRecordBulkFormScreen.tsx の
//        管理者ゲートと同等の保護を、分割後の一覧・詳細の両方で維持する)。
//
// 事実8 と対になる観点: 「非泳者だが管理者」は許可される一方
// (teamRecordBulk.nonSwimmerAdminGuard.test.tsx で別途保証)、
// 「泳者だが非管理者」は拒否されること。両者を混同しない。

import type { QueryClient } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ja from "@apps/shared/messages/ja.json";
import {
  createResponseMapSupabase,
  createWrapper,
  harness,
  makeQueryClient,
} from "./teamRecordBulkScreenHarness";
import { TeamRecordStyleDetailScreen } from "../TeamRecordStyleDetailScreen";

const mocks = createResponseMapSupabase();

harness.supabase = mocks.supabase;

describe("[V-08] 種目詳細画面の管理者ゲート", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = makeQueryClient();

    harness.getStyles.mockResolvedValue([
      { id: 2, name_jp: "自由形50m", name: "Freestyle", style: "Fr", distance: 50 },
    ]);
    mocks.responses["select:competitions"] = {
      data: { id: "comp-1", title: "テスト大会", pool_type: 0 },
      error: null,
    };
    mocks.responses["select:records"] = { data: [], error: null };
    mocks.responses["select:entries"] = { data: [], error: null };
    harness.currentUserId = "user-1";
  });

  it("非管理者ユーザーが一覧画面からカードをタップしても詳細画面が読み取り専用/拒否表示になる", async () => {
    harness.members = [
      { user_id: "user-1", role: "user", is_swimmer: true, users: { id: "user-1", name: "選手A" } },
      { user_id: "admin-1", role: "admin", users: { id: "admin-1", name: "管理者" } },
    ];

    render(<TeamRecordStyleDetailScreen />, { wrapper: createWrapper(queryClient) });

    await waitFor(() => {
      expect(harness.getStyles).toHaveBeenCalled();
    });

    // 権限ゲート: webGuide (拒否) 文言が表示され、保存ボタンは表示されない
    await waitFor(() => {
      expect(screen.getByText(ja.teams.mobile.webGuide)).toBeTruthy();
    });
    expect(screen.queryByText(ja.teams.record.saveButton)).toBeNull();
  });

  it("管理者ユーザーは詳細画面で保存ボタンを操作できる (対照)", async () => {
    harness.currentUserId = "admin-1";
    harness.members = [
      { user_id: "admin-1", role: "admin", is_swimmer: true, users: { id: "admin-1", name: "管理者" } },
    ];

    render(<TeamRecordStyleDetailScreen />, { wrapper: createWrapper(queryClient) });

    await waitFor(() => {
      expect(screen.getByText(ja.teams.record.saveButton)).toBeTruthy();
    });
    expect(screen.queryByText(ja.teams.mobile.webGuide)).toBeNull();
  });

  it("非泳者かつ管理者のユーザーは拒否されない (事実8 の権限ゲートとの非混同確認)", async () => {
    harness.currentUserId = "admin-nonswimmer-1";
    harness.members = [
      {
        user_id: "admin-nonswimmer-1",
        role: "admin",
        is_swimmer: false,
        users: { id: "admin-nonswimmer-1", name: "非泳者管理者" },
      },
    ];

    render(<TeamRecordStyleDetailScreen />, { wrapper: createWrapper(queryClient) });

    await waitFor(() => {
      expect(screen.getByText(ja.teams.record.saveButton)).toBeTruthy();
    });
    expect(screen.queryByText(ja.teams.mobile.webGuide)).toBeNull();
  });
});
