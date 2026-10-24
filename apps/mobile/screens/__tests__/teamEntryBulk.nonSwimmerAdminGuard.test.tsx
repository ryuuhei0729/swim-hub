// TeamEntryBulkFormScreen — 非泳者管理者アクセス規制回帰テスト (Issue #49 QA Phase A スケルトン)
//
// Sprint Contract 検証観点:
//   PM裁定(Issue #49コメント, R4) が名指しした危険箇所そのものを検証する:
//     `const isCurrentUserAdmin = useMemo(() => members.some(m => m.user_id===user.id &&
//      m.role==='admin'), [user, members])` (TeamEntryBulkFormScreen.tsx:107-110)
//     は useTeamsQuery が返す**生の** members を読む。もし Developer が「候補提示の直前」
//     ではなくこの手前で members を非泳者除外フィルタに通してしまうと、
//     「非泳者だが管理者でもあるユーザー (例: プレーしないコーチ件管理者)」が
//     admin 判定に失敗し、権限ゲート画面 (teams.mobile.webGuide) に弾かれて
//     代理入力に一切アクセスできなくなる。
//
//   [V-14-01] 非泳者かつ管理者のログインユーザーは、権限ゲート画面を表示されず
//             通常の代理入力フォームにアクセスできる (retiredMemberBadge 的な「締め出し」regression)
//   [V-14-02] MemberSelectModal に渡す候補一覧 (members prop) からは非泳者が除外されている
//             一方、admin 判定は生の members から行われていること (二重に確認する)
//
// このテストは apps/mobile/screens/__tests__/teamEntryBulk.adminProxy.test.tsx の
// モック方式 (useTeamsQuery を丸ごとモックし、供給する members に is_swimmer を持たせる) を
// 踏襲する。モック一式は teamEntryBulkScreenHarness から取り、members と本人の user id だけを差し替える。

import { QueryClient } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import ja from "@apps/shared/messages/ja.json";
import { createWrapper, harness } from "./teamEntryBulkScreenHarness";
import { TeamEntryBulkFormScreen } from "../TeamEntryBulkFormScreen";

// ログイン中の本人が「非泳者かつ管理者」のシナリオを再現する。members は各テストの it() 内で差し替える
harness.currentUserId = "admin-nonswimmer-1";
harness.members = [];


describe("TeamEntryBulkFormScreen - 非泳者管理者の締め出し回帰 (R4)", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    harness.memberSelectProps.length = 0;
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    harness.getStyles.mockResolvedValue([
      { id: 3, name_jp: "自由形100m", name: "Freestyle", style: "fr", distance: 100 },
    ]);
    harness.getBestTimesForUsers.mockResolvedValue(new Map());

    harness.responses["select:competitions"] = {
      data: {
        id: "comp-1",
        title: "テスト大会",
        pool_type: 0,
        date: "2999-01-01",
        entry_status: "open",
      },
      error: null,
    };
    harness.responses["select:entries"] = { data: [], error: null };
  });

  it("[V-14-01] 非泳者かつ管理者のログインユーザーは権限ゲートに阻まれず画面にアクセスできる", async () => {
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

    render(<TeamEntryBulkFormScreen />, { wrapper: createWrapper(queryClient) });

    // 権限ゲート画面 (teams.mobile.webGuide) が出ないことを確認する。
    // waitFor でローディング解消を待ってから判定する。
    await waitFor(() => {
      expect(harness.getStyles).toHaveBeenCalled();
    });

    expect(screen.queryByText(ja.teams.mobile.webGuide)).toBeNull();
  });

  it("[V-14-02] MemberSelectModal に渡る候補一覧には非泳者が含まれない (admin判定とは独立してフィルタされる)", async () => {
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

    render(<TeamEntryBulkFormScreen />, { wrapper: createWrapper(queryClient) });

    await waitFor(() => {
      expect(harness.memberSelectProps.length).toBeGreaterThan(0);
    });

    const lastProps = harness.memberSelectProps[harness.memberSelectProps.length - 1]!;
    const candidateIds = lastProps.members.map((m) => m.user_id);

    expect(candidateIds).toContain("swimmer-1");
    expect(candidateIds).not.toContain("admin-nonswimmer-1");
  });
});
