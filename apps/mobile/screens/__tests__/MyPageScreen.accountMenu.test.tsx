// =============================================================================
// MyPageScreen.accountMenu.test.tsx
// =============================================================================
// 2026-11-09 にマイページと設定をまとめ、タブを「アカウント」にした。
// 上にプロフィールカード、下に一覧 (プラン / カレンダー / 練習ログテンプレート /
// ログインとセキュリティ / 規約 / ログアウト) を置き、各行から詳細画面へ進む。
// - 一覧の行と右側の値 (プラン名・連携中のカレンダー・テンプレート件数) が出ること
// - 行を押すと対応する stack 画面へ進むこと
// - 旧ヘッダーの「設定」ボタンは無くなったこと
// =============================================================================

import { QueryClient } from "@tanstack/react-query";
import { configure, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { createTableDispatchSupabase } from "./utils/tableSupabaseMock";
import { createWrapper, harness, USER_ID } from "./myPageScreenHarness";
import { MyPageScreen } from "../MyPageScreen";

// react-native のモックは testID をそのまま DOM 属性に落とす
configure({ testIdAttribute: "testID" });

function renderScreen(user: Record<string, unknown> = {}) {
  const supabaseMock = createTableDispatchSupabase({
    userId: USER_ID,
    tables: {
      users: { data: { id: USER_ID, name: "テストユーザー", gender: 0, ...user } },
    },
  });
  harness.supabase = supabaseMock.client;
  harness.getMyTeams.mockResolvedValue([]);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(<MyPageScreen />, { wrapper: createWrapper(queryClient) });
}

describe("MyPageScreen — アカウントタブの一覧", () => {
  beforeEach(() => {
    harness.navigate.mockClear();
    harness.subscription = null;
  });

  it("見出しは「アカウント」で、旧ヘッダーの「設定」ボタンは無い", async () => {
    renderScreen();
    expect(await screen.findByText("テストユーザー")).toBeTruthy();
    expect(screen.getByText("アカウント")).toBeTruthy();
    expect(screen.queryByLabelText("設定画面を開く")).toBeNull();
  });

  it("プロフィールカードに編集ボタンと、生年月日がなくても性別が出る", async () => {
    renderScreen();
    expect(await screen.findByText("テストユーザー")).toBeTruthy();
    expect(screen.getByText("プロフィールを編集")).toBeTruthy();
    expect(screen.getByText("男性")).toBeTruthy();
  });

  it("一覧の行がそろっていて、無料ユーザーのプランは Free、カレンダーは未連携と出る", async () => {
    renderScreen();
    expect(await screen.findByText("テストユーザー")).toBeTruthy();
    for (const label of [
      "プラン",
      "カレンダー",
      "練習ログテンプレート",
      "ログインとセキュリティ",
      "利用規約",
      "プライバシーポリシー",
      "ログアウト",
    ]) {
      expect(screen.getByText(label), label).toBeTruthy();
    }
    expect(screen.getByText("Free")).toBeTruthy();
    expect(screen.getByText("未連携")).toBeTruthy();
  });

  it("Premium のときはプランの値が Premium、Google カレンダー連携中なら Google と出る", async () => {
    harness.subscription = { plan: "premium", status: "active", premiumExpiresAt: null };
    renderScreen({ google_calendar_enabled: true });
    expect(await screen.findByText("テストユーザー")).toBeTruthy();
    expect(screen.getByText("Premium")).toBeTruthy();
    expect(await screen.findByText("Google")).toBeTruthy();
  });

  it("各行を押すと、対応する画面へ進む", async () => {
    renderScreen();
    expect(await screen.findByText("テストユーザー")).toBeTruthy();

    fireEvent.click(screen.getByTestId("account-row-plan"));
    expect(harness.navigate).toHaveBeenLastCalledWith("AccountPlan");
    fireEvent.click(screen.getByTestId("account-row-calendar"));
    expect(harness.navigate).toHaveBeenLastCalledWith("AccountCalendar");
    fireEvent.click(screen.getByTestId("account-row-templates"));
    expect(harness.navigate).toHaveBeenLastCalledWith("PracticeLogTemplates");
    fireEvent.click(screen.getByTestId("account-row-security"));
    expect(harness.navigate).toHaveBeenLastCalledWith("AccountSecurity");
  });
});
