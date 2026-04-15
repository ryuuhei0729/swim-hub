/**
 * Mobile OnboardingFlow テスト
 *
 * Sprint Contract Issue #26 検証観点 (Mobile):
 *   [V-M01] AuthState.onboardingCompleted が false のとき AppNavigator が OnboardingStack を表示する
 *   [V-M02] AuthState.onboardingCompleted が true のとき AppNavigator が MainStack を表示する
 *   [V-M03] AuthState.onboardingCompleted が null (ローディング中) のとき AppNavigator がスピナーを表示する
 *   [V-M04] OnboardingScreen が Step 1〜4 を正しく表示する
 *   [V-M05] Step 3 の「記録を入力する」で RecordFormScreen に遷移する
 *   [V-M06] Step 3 の「スキップ」で Step 4 に進む
 *   [V-M07] Step 4 の「完了」で onboarding_completed=true が保存され MainStack に切り替わる
 *   [V-M08] Stepper コンポーネントが 4 ステップを表示し現在位置を強調する
 *
 * テスト対象:
 *   apps/mobile/App.tsx (AppNavigator の 3 状態拡張)
 *   apps/mobile/screens/OnboardingScreen.tsx (未実装)
 *   apps/mobile/components/shared/Stepper.tsx (未実装)
 *   apps/mobile/navigation/OnboardingStack.tsx (未実装)
 */

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { createQueryWrapper } from "./helpers/testUtils";
// NOTE: createQueryWrapper は将来の非同期テスト用のインポートとして保持
// (現時点では it.todo のみのため lint の unused 警告を suppress)
void createQueryWrapper;

// React Navigation のモックは vitest.setup.ts で設定済み

// useAuth をモック (AppNavigator の 3 状態テスト用)
const mockUseAuth = vi.hoisted(() => vi.fn());
vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: mockUseAuth,
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// AuthStack / MainStack / OnboardingStack のモック
vi.mock("@/navigation/AuthStack", () => ({
  AuthStack: () => React.createElement("div", { "data-testid": "auth-stack" }, "AuthStack"),
}));

vi.mock("@/navigation/MainStack", () => ({
  MainStack: () => React.createElement("div", { "data-testid": "main-stack" }, "MainStack"),
}));

// OnboardingStack は未実装のためモック
vi.mock("@/navigation/OnboardingStack", () => ({
  OnboardingStack: () =>
    React.createElement("div", { "data-testid": "onboarding-stack" }, "OnboardingStack"),
}));

// ---------------------------------------------------------------------------
// AppNavigator の 3 状態テスト
// ---------------------------------------------------------------------------
describe("[V-M01〜M03] AppNavigator — onboardingCompleted 3 状態", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.todo(
    "[V-M01] onboardingCompleted=false のとき OnboardingStack が表示される (MainStack は非表示)",
  );

  it.todo("[V-M02] onboardingCompleted=true のとき MainStack が表示される (OnboardingStack は非表示)");

  it.todo(
    "[V-M03] onboardingCompleted=null (ローディング中) のとき ActivityIndicator が表示され、Stack は表示されない",
  );

  it.todo("[V-M01b] 未認証ユーザーは AuthStack が表示される");
});

// ---------------------------------------------------------------------------
// OnboardingScreen の Step 遷移テスト
// ---------------------------------------------------------------------------
describe("[V-M04] OnboardingScreen — Step 遷移", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      user: { id: "user-1", email: "test@example.com" },
      isAuthenticated: true,
      onboardingCompleted: false,
      loading: false,
      subscription: null,
    });
  });

  it.todo("OnboardingScreen がマウントされると Step 1 (OnboardingWelcomeStep) が表示される");

  it.todo("「始める」ボタンで Step 2 (OnboardingWelcomeProfile) に進む");

  it.todo("Step 2 で名前を入力して「次へ」で Step 3 (OnboardingWelcomeBestTime) に進む");

  it.todo("Step 3 で「スキップ」をタップすると Step 4 (OnboardingWelcomeGuide) に進む");

  it.todo("「戻る」ボタンで前のステップに戻る");
});

// ---------------------------------------------------------------------------
// [V-M05] Step 3 — RecordFormScreen 遷移
// ---------------------------------------------------------------------------
describe("[V-M05] Step3 — RecordFormScreen への遷移", () => {
  it.todo(
    "Step 3 の「記録を入力する」をタップすると navigation.navigate('RecordForm') が呼ばれる",
  );

  it.todo("RecordForm 画面から戻ったとき Step 3 が表示される");
});

// ---------------------------------------------------------------------------
// [V-M06] Step 3 スキップ
// ---------------------------------------------------------------------------
describe("[V-M06] Step3 — スキップ", () => {
  it.todo("「スキップ」ボタンをタップすると Step 4 に進む");
});

// ---------------------------------------------------------------------------
// [V-M07] Step 4 — 完了処理
// ---------------------------------------------------------------------------
describe("[V-M07] Step4Guide — 完了処理", () => {
  const mockUpdateProfile = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateProfile.mockResolvedValue({ error: null });
    mockUseAuth.mockReturnValue({
      user: { id: "user-1", email: "test@example.com" },
      isAuthenticated: true,
      onboardingCompleted: false,
      loading: false,
      updateProfile: mockUpdateProfile,
      subscription: null,
    });
  });

  it.todo(
    "「完了」ボタンをタップすると updateProfile({ onboarding_completed: true }) が呼ばれる",
  );

  it.todo("更新成功後に AuthState.onboardingCompleted が true になり MainStack に切り替わる");

  it.todo("更新失敗時にエラーメッセージが表示される");
});

// ---------------------------------------------------------------------------
// [V-M08] Stepper コンポーネント
// ---------------------------------------------------------------------------
describe("[V-M08] Stepper コンポーネント", () => {
  it.todo("4 ステップ分のインジケーターが表示される");

  it.todo("currentStep=0 のとき最初のインジケーターがアクティブ状態になる");

  it.todo("currentStep=3 のとき最後のインジケーターがアクティブ状態になる");

  it.todo("完了済みステップは完了状態のスタイルで表示される");
});
