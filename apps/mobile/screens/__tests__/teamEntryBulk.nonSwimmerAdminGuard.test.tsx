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
// 踏襲する。フル harness を複製せず、本ファイルの関心事に必要な最小構成のみ用意する。

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ja from "@apps/shared/messages/ja.json";

const mocks = vi.hoisted(() => {
  const responses: Record<string, { data: unknown; error: unknown }> = {};

  function makeSupabase() {
    return {
      from: (table: string) => {
        const op = "select";
        const builder: Record<string, unknown> = {};
        const chain = () => builder;
        builder.select = vi.fn(chain);
        builder.eq = vi.fn(chain);
        builder.order = vi.fn(() =>
          Promise.resolve(responses[`${op}:${table}`] ?? { data: null, error: null }),
        );
        builder.single = vi.fn(() =>
          Promise.resolve(responses[`${op}:${table}`] ?? { data: null, error: null }),
        );
        return builder;
      },
    };
  }

  return {
    responses,
    supabase: makeSupabase(),
    routeParams: { competitionId: "comp-1", teamId: "team-1" },
    goBack: vi.fn(),
    navigate: vi.fn(),
    getStyles: vi.fn(),
    getBestTimesForUsers: vi.fn(),
    // members は各テストの it() 内で差し替える (vi.hoisted はテストごとに再生成されないため、
    // 可変の box に入れて参照する)
    membersBox: { current: [] as unknown[] },
  };
});

vi.mock("@react-navigation/native", () => ({
  useRoute: () => ({ params: mocks.routeParams }),
  useNavigation: () => ({ navigate: mocks.navigate, goBack: mocks.goBack }),
  usePreventRemove: () => undefined,
}));

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({
    supabase: mocks.supabase,
    // ログイン中の本人が「非泳者かつ管理者」のシナリオを再現する
    user: { id: "admin-nonswimmer-1" },
  }),
}));

vi.mock("@apps/shared/hooks/queries/teams", () => ({
  useTeamsQuery: () => ({
    members: mocks.membersBox.current,
    isLoading: false,
  }),
}));

vi.mock("@apps/shared/api/styles", () => ({
  StyleAPI: class {
    getStyles = mocks.getStyles;
  },
}));

vi.mock("@apps/shared/api/entries", () => ({
  EntryAPI: class {
    createBulkEntries = vi.fn().mockResolvedValue([]);
    updateEntry = vi.fn().mockResolvedValue({});
    deleteBulkEntries = vi.fn().mockResolvedValue(undefined);
  },
}));

vi.mock("@apps/shared/api/records", () => ({
  RecordAPI: class {
    getBestTimesForUsers = mocks.getBestTimesForUsers;
  },
}));

// MemberSelectModal の props を捕捉するスタブ (候補一覧のフィルタ結果を検証するため、
// テストローカルで捕捉用の配列に積む)
const capturedMemberSelectProps: Array<{ members: Array<{ user_id: string }> }> = [];
vi.mock("@/components/teams/MemberSelectModal", () => ({
  MemberSelectModal: (props: { members: Array<{ user_id: string }> }) => {
    capturedMemberSelectProps.push(props);
    return null;
  },
}));

import { TeamEntryBulkFormScreen } from "../TeamEntryBulkFormScreen";

const createWrapper = (queryClient: QueryClient) => {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe("TeamEntryBulkFormScreen - 非泳者管理者の締め出し回帰 (R4)", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    capturedMemberSelectProps.length = 0;
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    mocks.getStyles.mockResolvedValue([
      { id: 3, name_jp: "自由形100m", name: "Freestyle", style: "fr", distance: 100 },
    ]);
    mocks.getBestTimesForUsers.mockResolvedValue(new Map());

    mocks.responses["select:competitions"] = {
      data: {
        id: "comp-1",
        title: "テスト大会",
        pool_type: 0,
        date: "2999-01-01",
        entry_status: "open",
      },
      error: null,
    };
    mocks.responses["select:entries"] = { data: [], error: null };
  });

  it("[V-14-01] 非泳者かつ管理者のログインユーザーは権限ゲートに阻まれず画面にアクセスできる", async () => {
    mocks.membersBox.current = [
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
      expect(mocks.getStyles).toHaveBeenCalled();
    });

    expect(screen.queryByText(ja.teams.mobile.webGuide)).toBeNull();
  });

  it("[V-14-02] MemberSelectModal に渡る候補一覧には非泳者が含まれない (admin判定とは独立してフィルタされる)", async () => {
    mocks.membersBox.current = [
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
      expect(capturedMemberSelectProps.length).toBeGreaterThan(0);
    });

    const lastProps = capturedMemberSelectProps[capturedMemberSelectProps.length - 1]!;
    const candidateIds = lastProps.members.map((m) => m.user_id);

    expect(candidateIds).toContain("swimmer-1");
    expect(candidateIds).not.toContain("admin-nonswimmer-1");
  });
});
