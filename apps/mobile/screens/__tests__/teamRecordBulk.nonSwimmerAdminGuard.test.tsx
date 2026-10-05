// TeamRecordStyleListScreen / TeamRecordStyleDetailScreen — 非泳者管理者アクセス規制回帰テスト
// (Issue #49 QA Phase B 追加。2階層化に伴い移植: 旧 TeamRecordBulkFormScreen.test.tsx)
//
// PM裁定 R4 が名指しした isCurrentUserAdmin 判定 (旧 TeamRecordBulkFormScreen.tsx:128-131、
// 新画面でも同形) が生の members を読み続けていること、および
// memberSelectCandidates (詳細画面) が候補提示の直前だけに適用されていることを検証する。
//
//   [V-15-01] 非泳者かつ管理者のログインユーザーは一覧画面の権限ゲートに阻まれず
//             アクセスできる
//   [V-15-02] 詳細画面の MemberSelectModal に渡る候補一覧には非泳者が含まれない
//
// 移植方針: 2階層化により関心事が一覧画面 (admin ゲート) と詳細画面 (候補フィルタ) に
// 分かれた。V-15-02 は teamRecordBulk.nonSwimmerHandoffDetail.test.tsx (Sprint Contract
// V-09) と観点が重複するが、こちらは「旧テストの移植」という別の出自として残す
// (回帰検知の網を二重化する意図。削除しない)。

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
import { TeamRecordStyleListScreen } from "../TeamRecordStyleListScreen";
import { TeamRecordStyleDetailScreen } from "../TeamRecordStyleDetailScreen";

const mocks = createResponseMapSupabase();

harness.supabase = mocks.supabase;
harness.currentUserId = "admin-nonswimmer-1";

const capturedMemberSelectProps = harness.memberSelectProps as Array<{
  members: Array<{ user_id: string }>;
}>;

describe("TeamRecordStyleListScreen/Detail - 非泳者管理者の締め出し回帰 (R4)", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    capturedMemberSelectProps.length = 0;
    queryClient = makeQueryClient();

    harness.routeParams = { competitionId: "comp-1", teamId: "team-1" };
    harness.getStyles.mockResolvedValue([
      { id: 2, name_jp: "自由形50m", name: "Freestyle", style: "Fr", distance: 50 },
    ]);
    mocks.responses["select:competitions"] = {
      data: { id: "comp-1", title: "テスト大会", pool_type: 0 },
      error: null,
    };
    mocks.responses["select:records"] = { data: [], error: null };
    mocks.responses["select:entries"] = { data: [], error: null };

    harness.members = [
      {
        user_id: "admin-nonswimmer-1",
        role: "admin",
        is_swimmer: false,
        users: { id: "admin-nonswimmer-1", name: "非泳者管理者" },
      },
      {
        user_id: "swimmer-1",
        role: "user",
        is_swimmer: true,
        users: { id: "swimmer-1", name: "選手A" },
      },
    ];
  });

  it("[V-15-01] 非泳者かつ管理者のログインユーザーは一覧画面の権限ゲートに阻まれずアクセスできる", async () => {
    render(<TeamRecordStyleListScreen />, { wrapper: createWrapper(queryClient) });

    await waitFor(() => {
      expect(harness.getStyles).toHaveBeenCalled();
    });

    expect(screen.queryByText(ja.teams.mobile.webGuide)).toBeNull();
  });

  it("[V-15-02] 詳細画面の MemberSelectModal に渡る候補一覧には非泳者が含まれない", async () => {
    harness.routeParams = { competitionId: "comp-1", teamId: "team-1", styleId: 2 };

    render(<TeamRecordStyleDetailScreen />, { wrapper: createWrapper(queryClient) });

    await waitFor(() => {
      expect(capturedMemberSelectProps.length).toBeGreaterThan(0);
    });

    const lastProps = capturedMemberSelectProps[capturedMemberSelectProps.length - 1]!;
    const candidateIds = lastProps.members.map((m) => m.user_id);

    expect(candidateIds).toContain("swimmer-1");
    expect(candidateIds).not.toContain("admin-nonswimmer-1");
  });
});
