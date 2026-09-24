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
    routeParams: { competitionId: "comp-1", teamId: "team-1", styleId: 2 },
    goBack: vi.fn(),
    navigate: vi.fn(),
    getStyles: vi.fn(),
    getAccessToken: vi.fn(async () => "test-access-token"),
    membersBox: { current: [] as unknown[] },
    currentUserId: "user-1",
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
    subscription: null,
    user: { id: mocks.currentUserId },
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
vi.mock("@/components/teams/MemberSelectModal", () => ({ MemberSelectModal: () => null }));

import { TeamRecordStyleDetailScreen } from "../TeamRecordStyleDetailScreen";

const createWrapper = (queryClient: QueryClient) => {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe("[V-08] 種目詳細画面の管理者ゲート", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
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
    mocks.responses["select:entries"] = { data: [], error: null };
    mocks.currentUserId = "user-1";
  });

  it("非管理者ユーザーが一覧画面からカードをタップしても詳細画面が読み取り専用/拒否表示になる", async () => {
    mocks.membersBox.current = [
      { user_id: "user-1", role: "user", is_swimmer: true, users: { id: "user-1", name: "選手A" } },
      { user_id: "admin-1", role: "admin", users: { id: "admin-1", name: "管理者" } },
    ];

    render(<TeamRecordStyleDetailScreen />, { wrapper: createWrapper(queryClient) });

    await waitFor(() => {
      expect(mocks.getStyles).toHaveBeenCalled();
    });

    // 権限ゲート: webGuide (拒否) 文言が表示され、保存ボタンは表示されない
    await waitFor(() => {
      expect(screen.getByText(ja.teams.mobile.webGuide)).toBeTruthy();
    });
    expect(screen.queryByText(ja.teams.record.saveButton)).toBeNull();
  });

  it("管理者ユーザーは詳細画面で保存ボタンを操作できる (対照)", async () => {
    mocks.currentUserId = "admin-1";
    mocks.membersBox.current = [
      { user_id: "admin-1", role: "admin", is_swimmer: true, users: { id: "admin-1", name: "管理者" } },
    ];

    render(<TeamRecordStyleDetailScreen />, { wrapper: createWrapper(queryClient) });

    await waitFor(() => {
      expect(screen.getByText(ja.teams.record.saveButton)).toBeTruthy();
    });
    expect(screen.queryByText(ja.teams.mobile.webGuide)).toBeNull();
  });

  it("非泳者かつ管理者のユーザーは拒否されない (事実8 の権限ゲートとの非混同確認)", async () => {
    mocks.currentUserId = "admin-nonswimmer-1";
    mocks.membersBox.current = [
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
