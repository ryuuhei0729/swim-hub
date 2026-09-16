// TeamRecordBulkFormScreen — 非泳者管理者アクセス規制回帰テスト (Issue #49 QA Phase B 追加)
//
// teamEntryBulk.nonSwimmerAdminGuard.test.tsx と同型。PM裁定 R4 が名指しした
// isCurrentUserAdmin 判定 (TeamRecordBulkFormScreen.tsx:128-131) が生の members を
// 読み続けていること、および memberSelectCandidates (:134) が候補提示の直前だけに
// 適用されていることを検証する。
//
//   [V-15-01] 非泳者かつ管理者のログインユーザーは権限ゲートに阻まれず画面にアクセスできる
//   [V-15-02] MemberSelectModal に渡る候補一覧には非泳者が含まれない

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
    routeParams: { competitionId: "comp-1", teamId: "team-1" },
    goBack: vi.fn(),
    navigate: vi.fn(),
    getStyles: vi.fn(),
    getAccessToken: vi.fn(async () => "test-access-token"),
    membersBox: { current: [] as unknown[] },
  };
});

vi.mock("@react-navigation/native", () => ({
  useRoute: () => ({ params: mocks.routeParams }),
  useNavigation: () => ({ navigate: mocks.navigate, goBack: mocks.goBack }),
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

import { TeamRecordBulkFormScreen } from "../TeamRecordBulkFormScreen";

const createWrapper = (queryClient: QueryClient) => {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe("TeamRecordBulkFormScreen - 非泳者管理者の締め出し回帰 (R4)", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    capturedMemberSelectProps.length = 0;
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

    mocks.getStyles.mockResolvedValue([
      { id: 2, name_jp: "自由形50m", name: "Freestyle", style: "Fr", distance: 50 },
    ]);
    mocks.responses["select:competitions"] = {
      data: { id: "comp-1", title: "テスト大会", pool_type: 0 },
      error: null,
    };
    mocks.responses["select:records"] = { data: [], error: null };

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

  it("[V-15-01] 非泳者かつ管理者のログインユーザーは権限ゲートに阻まれず画面にアクセスできる", async () => {
    render(<TeamRecordBulkFormScreen />, { wrapper: createWrapper(queryClient) });

    await waitFor(() => {
      expect(mocks.getStyles).toHaveBeenCalled();
    });

    expect(screen.queryByText(ja.teams.mobile.webGuide)).toBeNull();
  });

  it("[V-15-02] MemberSelectModal に渡る候補一覧には非泳者が含まれない", async () => {
    render(<TeamRecordBulkFormScreen />, { wrapper: createWrapper(queryClient) });

    await waitFor(() => {
      expect(capturedMemberSelectProps.length).toBeGreaterThan(0);
    });

    const lastProps = capturedMemberSelectProps[capturedMemberSelectProps.length - 1]!;
    const candidateIds = lastProps.members.map((m) => m.user_id);

    expect(candidateIds).toContain("swimmer-1");
    expect(candidateIds).not.toContain("admin-nonswimmer-1");
  });
});
