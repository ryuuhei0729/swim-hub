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

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ja from "@apps/shared/messages/ja.json";

vi.mock("react-native", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("react-native");
  return { ...actual, KeyboardAvoidingView: actual.View };
});

const mocks = vi.hoisted(() => {
  const responses: Record<string, { data: unknown; error: unknown }> = {};

  function makeSupabase() {
    return {
      from: (table: string) => {
        let op: string | null = null;
        const builder: Record<string, unknown> = {};
        builder.select = vi.fn((..._a: unknown[]) => {
          if (!op) op = "select";
          return builder;
        });
        builder.eq = vi.fn(() => builder);
        builder.order = vi.fn(() => builder);
        builder.in = vi.fn(() => builder);
        builder.single = vi.fn(() =>
          Promise.resolve(responses[`${op}:${table}`] ?? { data: null, error: null }),
        );
        builder.then = (resolve: (v: { data: unknown; error: unknown }) => void) =>
          resolve(responses[`${op}:${table}`] ?? { data: null, error: null });
        return builder;
      },
    };
  }

  return {
    responses,
    supabase: makeSupabase(),
    routeParams: { competitionId: "comp-1", teamId: "team-1" } as Record<string, unknown>,
    goBack: vi.fn(),
    navigate: vi.fn(),
    getStyles: vi.fn(),
    getAccessToken: vi.fn(async () => "test-access-token"),
    membersBox: { current: [] as unknown[] },
  };
});

// useFocusEffect はマウント時に1回だけ callback を実行する実装で上書きする
// (RecordsScreen.refreshDrift.test.tsx 等と同一パターン)。空の vi.fn() にはしない
// (フォーカス時再取得が一切実行されなくなり回帰検知能力を失う) が、グローバルモック
// (vitest.setup.ts の `vi.fn((callback) => callback())`) をそのまま持ち込むと、
// このファイルの callback は `load` (setState を伴う実 fetch) であるため、
// 「レンダーのたびに再実行される」globalモックの挙動と組み合わさり
// setState → 再レンダー → callback 再実行 → setState → ... の無限ループになる
// (実測済み: "Too many re-renders" で検証)。このファイルの関心事はフォーカス時
// 再取得の再現ではなく通常表示なので、マウント1回だけ発火させれば十分。
vi.mock("@react-navigation/native", () => ({
  useRoute: () => ({ params: mocks.routeParams }),
  useNavigation: () => ({ navigate: mocks.navigate, goBack: mocks.goBack }),
  usePreventRemove: () => undefined,
  useFocusEffect: (callback: () => void) => {
    React.useEffect(() => {
      callback();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
  },
}));

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({
    supabase: mocks.supabase,
    subscription: null,
    user: { id: "admin-nonswimmer-1" },
    getAccessToken: mocks.getAccessToken,
  }),
}));

vi.mock("@apps/shared/hooks/queries/teams", () => ({
  useTeamsQuery: () => ({ members: mocks.membersBox.current, isLoading: false }),
}));

vi.mock("@apps/shared/api/styles", () => ({
  StyleAPI: class {
    getStyles = mocks.getStyles;
  },
}));

vi.mock("@apps/shared/api/records", () => ({
  RecordAPI: class {
    getBestTimesDetailedForUsers = vi.fn(async () => new Map());
  },
}));

vi.mock("@/components/shared/VideoUploader", () => ({ VideoUploader: () => null }));
vi.mock("@/components/shared/PremiumBadge", () => ({ PremiumBadge: () => null }));
vi.mock("@/components/records/LapTimeDisplay", () => ({ LapTimeDisplay: () => null }));

const capturedMemberSelectProps: Array<{ members: Array<{ user_id: string }> }> = [];
vi.mock("@/components/teams/MemberSelectModal", () => ({
  MemberSelectModal: (props: { members: Array<{ user_id: string }> }) => {
    capturedMemberSelectProps.push(props);
    return null;
  },
}));

import { TeamRecordStyleListScreen } from "../TeamRecordStyleListScreen";
import { TeamRecordStyleDetailScreen } from "../TeamRecordStyleDetailScreen";

const createWrapper = (queryClient: QueryClient) => {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe("TeamRecordStyleListScreen/Detail - 非泳者管理者の締め出し回帰 (R4)", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    capturedMemberSelectProps.length = 0;
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    mocks.routeParams = { competitionId: "comp-1", teamId: "team-1" };
    mocks.getStyles.mockResolvedValue([
      { id: 2, name_jp: "自由形50m", name: "Freestyle", style: "Fr", distance: 50 },
    ]);
    mocks.responses["select:competitions"] = {
      data: { id: "comp-1", title: "テスト大会", pool_type: 0 },
      error: null,
    };
    mocks.responses["select:records"] = { data: [], error: null };
    mocks.responses["select:entries"] = { data: [], error: null };

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
  });

  it("[V-15-01] 非泳者かつ管理者のログインユーザーは一覧画面の権限ゲートに阻まれずアクセスできる", async () => {
    render(<TeamRecordStyleListScreen />, { wrapper: createWrapper(queryClient) });

    await waitFor(() => {
      expect(mocks.getStyles).toHaveBeenCalled();
    });

    expect(screen.queryByText(ja.teams.mobile.webGuide)).toBeNull();
  });

  it("[V-15-02] 詳細画面の MemberSelectModal に渡る候補一覧には非泳者が含まれない", async () => {
    mocks.routeParams = { competitionId: "comp-1", teamId: "team-1", styleId: 2 };

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
