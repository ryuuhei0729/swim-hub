// =============================================================================
// PendingMembersSection.test.tsx - QA Engineer Sprint 1 検証
// =============================================================================

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

// AuthProvider モック
vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: vi.fn(() => ({
    supabase: {},
    user: { id: "admin-user-id" },
  })),
}));

// shared hooks モック
vi.mock("@apps/shared/hooks/queries/teams", () => ({
  useListPendingMembersQuery: vi.fn(),
  useApproveMemberMutation: vi.fn(),
  useRejectMemberMutation: vi.fn(),
}));

// ErrorView モック
vi.mock("@/components/layout/ErrorView", () => ({
  ErrorView: ({ message, onRetry }: { message: string; onRetry: () => void }) =>
    React.createElement("div", { "data-testid": "error-view" },
      React.createElement("span", null, message),
      React.createElement("button", { onClick: onRetry }, "retry"),
    ),
}));

import {
  useListPendingMembersQuery,
  useApproveMemberMutation,
  useRejectMemberMutation,
} from "@apps/shared/hooks/queries/teams";
import { PendingMembersSection } from "../PendingMembersSection";

const mockUseListPendingMembersQuery = useListPendingMembersQuery as ReturnType<typeof vi.fn>;
const mockUseApproveMemberMutation = useApproveMemberMutation as ReturnType<typeof vi.fn>;
const mockUseRejectMemberMutation = useRejectMemberMutation as ReturnType<typeof vi.fn>;

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
};

const makeMutationStub = (overrides: Record<string, unknown> = {}) => ({
  mutateAsync: vi.fn(),
  isPending: false,
  variables: undefined,
  ...overrides,
});

describe("PendingMembersSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseApproveMemberMutation.mockReturnValue(makeMutationStub());
    mockUseRejectMemberMutation.mockReturnValue(makeMutationStub());
  });

  // S1-V-09: ローディング状態の表示
  it("ローディング中は ActivityIndicator とローディングテキストが表示される", () => {
    mockUseListPendingMembersQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<PendingMembersSection teamId="team-1" />, { wrapper: createWrapper() });

    expect(screen.getByText("Loading...")).toBeTruthy(); // ActivityIndicator モック
    expect(screen.getByText("承認待ちメンバーを読み込み中...")).toBeTruthy();
  });

  // S1-V-10: 空状態の表示
  it("承認待ちメンバーが 0 件のとき空状態メッセージが表示される", () => {
    mockUseListPendingMembersQuery.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<PendingMembersSection teamId="team-1" />, { wrapper: createWrapper() });

    expect(screen.getByText("承認待ちのメンバーはいません")).toBeTruthy();
  });

  // S1-V-11: エラー状態の表示
  it("エラー時は ErrorView が表示される", () => {
    const error = new Error("取得に失敗しました");
    mockUseListPendingMembersQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error,
      refetch: vi.fn(),
    });

    render(<PendingMembersSection teamId="team-1" />, { wrapper: createWrapper() });

    expect(screen.getByTestId("error-view")).toBeTruthy();
    expect(screen.getByText("取得に失敗しました")).toBeTruthy();
  });

  // S1-V-12: メンバー一覧の表示
  it("承認待ちメンバーが存在するとき各メンバー名と申請日が表示される", () => {
    mockUseListPendingMembersQuery.mockReturnValue({
      data: [
        {
          id: "m-1",
          team_id: "team-1",
          user_id: "u-1",
          status: "pending",
          created_at: "2025-06-10T00:00:00Z",
          users: { id: "u-1", name: "田中太郎" },
        },
        {
          id: "m-2",
          team_id: "team-1",
          user_id: "u-2",
          status: "pending",
          created_at: "2025-06-11T00:00:00Z",
          users: { id: "u-2", name: "鈴木花子" },
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<PendingMembersSection teamId="team-1" />, { wrapper: createWrapper() });

    expect(screen.getByText("田中太郎")).toBeTruthy();
    expect(screen.getByText("鈴木花子")).toBeTruthy();
    // sectionTitle: "承認待ち (2件)"
    expect(screen.getByText("承認待ち (2件)")).toBeTruthy();
    // 申請日 (date-fns format: yyyy/MM/dd)
    expect(screen.getByText(/2025\/06\/10/)).toBeTruthy();
  });

  // S1-V-12: 承認ボタン・却下ボタンが表示される
  it("各メンバー行に承認ボタンと却下ボタンが表示される", () => {
    mockUseListPendingMembersQuery.mockReturnValue({
      data: [
        {
          id: "m-1",
          team_id: "team-1",
          user_id: "u-1",
          status: "pending",
          created_at: "2025-06-10T00:00:00Z",
          users: { id: "u-1", name: "田中太郎" },
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<PendingMembersSection teamId="team-1" />, { wrapper: createWrapper() });

    // ja.json: teams.pendingMembers.approveButton = "承認"
    expect(screen.getAllByText("承認").length).toBeGreaterThan(0);
    // ja.json: teams.pendingMembers.rejectButton = "拒否"
    expect(screen.getAllByText("拒否").length).toBeGreaterThan(0);
  });

  // S1-V-13: users が null のとき unnamedMember フォールバック
  it("users が null のとき「名前なし」フォールバックが表示される", () => {
    mockUseListPendingMembersQuery.mockReturnValue({
      data: [
        {
          id: "m-1",
          team_id: "team-1",
          user_id: "u-1",
          status: "pending",
          created_at: "2025-06-10T00:00:00Z",
          users: null,
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<PendingMembersSection teamId="team-1" />, { wrapper: createWrapper() });

    // ja.json: teams.mobile.unnamedMember = "名前未設定"
    expect(screen.getByText("名前未設定")).toBeTruthy();
  });

  // 承認処理中: ボタンが disabled / Spinner に変わる
  it("承認処理中は対象メンバー行が ActivityIndicator を表示しボタンが disabled になる", () => {
    mockUseApproveMemberMutation.mockReturnValue(
      makeMutationStub({
        isPending: true,
        variables: { membershipId: "m-1", teamId: "team-1" },
      }),
    );
    mockUseListPendingMembersQuery.mockReturnValue({
      data: [
        {
          id: "m-1",
          team_id: "team-1",
          user_id: "u-1",
          status: "pending",
          created_at: "2025-06-10T00:00:00Z",
          users: { id: "u-1", name: "田中太郎" },
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<PendingMembersSection teamId="team-1" />, { wrapper: createWrapper() });

    // 処理中なのでボタン (承認/却下) が消え、Spinner が表示される
    expect(screen.queryByText("承認")).toBeNull();
    expect(screen.queryByText("却下")).toBeNull();
    expect(screen.getByText("Loading...")).toBeTruthy();
  });

  // エラー時のリトライ
  it("ErrorView の retry ボタンをクリックすると refetch が呼ばれる", () => {
    const refetch = vi.fn();
    mockUseListPendingMembersQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("fetch failed"),
      refetch,
    });

    render(<PendingMembersSection teamId="team-1" />, { wrapper: createWrapper() });

    fireEvent.click(screen.getByText("retry"));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
