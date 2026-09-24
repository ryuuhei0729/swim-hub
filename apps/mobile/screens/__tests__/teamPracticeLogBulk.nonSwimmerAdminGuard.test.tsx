// TeamPracticeLogBulkFormScreen — 非泳者管理者アクセス規制回帰テスト (Issue #49 QA Phase B 追加)
//
// teamEntryBulk.nonSwimmerAdminGuard.test.tsx / teamRecordBulk.nonSwimmerAdminGuard.test.tsx
// と同型。PM裁定 R4 が名指しした isCurrentUserAdmin 判定
// (TeamPracticeLogBulkFormScreen.tsx:157-160) が生の members を読み続けていること、
// および memberSelectCandidates (:163) が候補提示の直前だけに適用されていることを検証する。
//
//   [V-16-01] 非泳者かつ管理者のログインユーザーは権限ゲートに阻まれず画面にアクセスできる
//   [V-16-02] MemberSelectModal に渡る候補一覧には非泳者が含まれない

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ja from "@apps/shared/messages/ja.json";

const mocks = vi.hoisted(() => ({
  routeParams: { practiceId: "practice-1", teamId: "team-1" },
  navigate: vi.fn(),
  goBack: vi.fn(),
  getAccessToken: vi.fn(async () => null),
  membersBox: { current: [] as unknown[] },
  supabaseResponses: {
    practices: { data: { id: "practice-1", date: "2026-08-01", place: "市民プール" }, error: null },
    practice_logs: { data: [] as unknown[], error: null },
    team_attendance: { data: [] as unknown[], error: null },
  } as Record<string, { data: unknown; error: unknown }>,
}));

function createChainableQueryBuilder(table: string) {
  const resolveValue = () => mocks.supabaseResponses[table] ?? { data: null, error: null };
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    single: () => Promise.resolve(resolveValue()),
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve(resolveValue()).then(resolve, reject),
  };
  return chain;
}

const mockSupabase = { from: (table: string) => createChainableQueryBuilder(table) };

vi.mock("react-native", async (importOriginal) => {
  const original = await importOriginal<typeof import("react-native")>();
  return {
    ...original,
    Dimensions: {
      get: vi.fn(() => ({ width: 375, height: 812 })),
      addEventListener: vi.fn(() => ({ remove: vi.fn() })),
    },
    Keyboard: { dismiss: vi.fn() },
    KeyboardAvoidingView: original.View,
  };
});

vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  initialWindowMetrics: { insets: { top: 0, bottom: 0, left: 0, right: 0 }, frame: { x: 0, y: 0, width: 0, height: 0 } },
  SafeAreaView: ({ children, ...props }: { children?: React.ReactNode } & Record<string, unknown>) =>
    React.createElement("div", props, children),
}));

vi.mock("@react-navigation/native", () => ({
  useRoute: () => ({ params: mocks.routeParams }),
  useNavigation: () => ({ navigate: mocks.navigate, goBack: mocks.goBack }),
  usePreventRemove: () => undefined,
}));

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({
    supabase: mockSupabase,
    subscription: null,
    user: { id: "admin-nonswimmer-1" },
    getAccessToken: mocks.getAccessToken,
  }),
}));

vi.mock("@apps/shared/hooks/queries/teams", () => ({
  useTeamsQuery: () => ({ members: mocks.membersBox.current, isLoading: false }),
}));

vi.mock("@apps/shared/hooks/queries/practices", () => ({
  usePracticeTagsQuery: () => ({ data: [], isLoading: false }),
  useCreatePracticeTagMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdatePracticeTagMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeletePracticeTagMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/components/shared/VideoUploader", () => ({ VideoUploader: () => null }));
vi.mock("@/components/shared/ImageUploader", () => ({ ImageUploader: () => null }));

const capturedMemberSelectProps: Array<{ members: Array<{ user_id: string }> }> = [];
vi.mock("@/components/teams/MemberSelectModal", () => ({
  MemberSelectModal: (props: { members: Array<{ user_id: string }> }) => {
    capturedMemberSelectProps.push(props);
    return null;
  },
}));

import { TeamPracticeLogBulkFormScreen } from "../TeamPracticeLogBulkFormScreen";

const createWrapper = (queryClient: QueryClient) => {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe("TeamPracticeLogBulkFormScreen - 非泳者管理者の締め出し回帰 (R4)", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    capturedMemberSelectProps.length = 0;
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });

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

  it("[V-16-01] 非泳者かつ管理者のログインユーザーは権限ゲートに阻まれず画面にアクセスできる", async () => {
    render(<TeamPracticeLogBulkFormScreen />, { wrapper: createWrapper(queryClient) });

    // ローディング中は権限ゲートも本体もまだ描画されないため、
    // 「webGuide が無い」だけを待つと初期ローディング画面で誤って合格してしまう
    // (waitFor は否定アサーションを最初の試行で満たすと即座に成功してしまうため)。
    // MemberSelectModal が最低1回マウントされる = 権限ゲートを通過して本体まで
    // 描画が進んだことの確実な証拠として先に待ってから、webGuide の不在を確認する。
    await waitFor(() => {
      expect(capturedMemberSelectProps.length).toBeGreaterThan(0);
    });

    expect(screen.queryByText(ja.teams.mobile.webGuide)).toBeNull();
  });

  it("[V-16-02] MemberSelectModal に渡る候補一覧には非泳者が含まれない", async () => {
    render(<TeamPracticeLogBulkFormScreen />, { wrapper: createWrapper(queryClient) });

    await waitFor(() => {
      expect(capturedMemberSelectProps.length).toBeGreaterThan(0);
    });

    const lastProps = capturedMemberSelectProps[capturedMemberSelectProps.length - 1]!;
    const candidateIds = lastProps.members.map((m) => m.user_id);

    expect(candidateIds).toContain("swimmer-1");
    expect(candidateIds).not.toContain("admin-nonswimmer-1");
  });
});
