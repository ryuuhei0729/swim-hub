/**
 * Mobile OnboardingFlow テスト
 *
 * Sprint Contract 確定版 (Issue #26 モバイル UI 改善) 検証観点:
 *
 * [アイコン置換]
 *   [V-IC01] OnboardingWelcome: 絵文字 3 箇所 (📊🏆👥) が Feather アイコンに置換される
 *   [V-IC02] OnboardingBestTime: 絵文字 🏊 が Feather アイコン (watch/trending-up 等) に置換される
 *   [V-IC03] OnboardingBestTime の BenefitRow: "✓" Unicode が Feather "check" アイコンに置換される
 *   [V-IC04] Stepper: 完了ステップの "✓" Unicode が Feather "check" アイコンに置換される
 *   [V-IC05] OnboardingGuide: 絵文字 4 箇所 (📋🏆👥👤) が Feather アイコンに置換される
 *   [V-IC06] BestTimesTable: 引き継ぎチェックボックスの "✓" Unicode が Feather "check" に置換される (整合性)
 *
 * [ベストタイム入力 UX (Step3 昇格)]
 *   [V-BT01] Step 3 に種目選択 Picker が表示される
 *   [V-BT02] 種目を選択するとエントリー行が追加される
 *   [V-BT03] エントリー行に 短水路/長水路 Picker が表示される
 *   [V-BT04] エントリー行にタイム入力フィールドが表示され、placeholder は "1:23.45" 形式
 *   [V-BT05] エントリーが 0 件のとき「スキップして始める」ボタンが表示される
 *   [V-BT06] エントリーが 1 件以上のとき「保存して始める」ボタンが表示される
 *   [V-BT07] タイム未入力エントリーがある場合「保存して始める」が disabled になる
 *   [V-BT08] 「保存して始める」タップ → RecordAPI.createBulkRecords() が呼ばれ、成功後に完了処理が実行される
 *   [V-BT09] 「スキップして始める」タップ → RecordAPI は呼ばれず、完了処理が直接実行される
 *   [V-BT10] 一括保存失敗時にエラーメッセージが表示される
 *   [V-BT11] エントリー行の削除ボタンで当該エントリーが削除される
 *   [V-BT12] 種目 + 水路タイプの重複エントリーがある場合、重複警告が表示され「保存して始める」が disabled になる
 *   [V-BT13] 保存処理中 (saving=true) はボタンが disabled になり「登録中...」と表示される
 *
 * [OnboardingScreen 統合]
 *   [V-M01] onboardingCompleted=false のとき OnboardingStack が表示される
 *   [V-M02] onboardingCompleted=true のとき MainStack が表示される
 *   [V-M03] onboardingCompleted=null (ローディング中) のとき ActivityIndicator が表示される
 *   [V-M04] OnboardingScreen が Step 1→2→3 の遷移を制御する
 *   [V-M05] Step 3 の「戻る」ボタンで Step 2 に戻る
 *   [V-M06] 「スキップして始める」/「保存して始める」完了後、updateOnboardingCompleted(true) が呼ばれる
 *   [V-M07] updateOnboardingCompleted 失敗時にエラーが表示される
 *   [V-M08] Stepper コンポーネントが currentStep に応じた完了状態を表示する
 *
 * テスト対象:
 *   apps/mobile/screens/OnboardingScreen.tsx
 *   apps/mobile/components/onboarding/OnboardingWelcome.tsx
 *   apps/mobile/components/onboarding/OnboardingBestTime.tsx (昇格後)
 *   apps/mobile/components/onboarding/OnboardingGuide.tsx
 *   apps/mobile/components/shared/Stepper.tsx
 *   apps/mobile/components/profile/BestTimesTable.tsx
 */

import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { createQueryWrapper } from "./helpers/testUtils";
// NOTE: 以下のインポートは it.todo を本実装に置き換える際に使用する。
// 現時点では lint の unused 警告を suppress するため void で参照しておく。
void createQueryWrapper;
void render;
void screen;
void waitFor;
void userEvent;
void expect;

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
// [V-M01〜M03] AppNavigator の 3 状態テスト
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

// ---------------------------------------------------------------------------
// [V-IC01〜IC06] アイコン置換 — 絵文字・Unicode チェックマーク
// ---------------------------------------------------------------------------
describe("[V-IC] アイコン置換 — 絵文字/Unicode チェックマーク撤廃", () => {
  // OnboardingWelcome
  it.todo("[V-IC01a] OnboardingWelcome: 練習記録の行に Feather bar-chart-2 アイコンが表示される (絵文字 📊 なし)");
  it.todo("[V-IC01b] OnboardingWelcome: 大会記録の行に Feather award アイコンが表示される (絵文字 🏆 なし)");
  it.todo("[V-IC01c] OnboardingWelcome: チーム機能の行に Feather users アイコンが表示される (絵文字 👥 なし)");

  // OnboardingBestTime (昇格後の画面)
  it.todo("[V-IC02] OnboardingBestTime: 絵文字 🏊 が Feather アイコン (watch/trending-up) に置換され、絵文字文字列がレンダリングされない");

  // OnboardingBestTime BenefitRow (現状 "✓" Unicode)
  it.todo("[V-IC03] OnboardingBestTime の BenefitRow: \"✓\" Unicode テキストが表示されず Feather check アイコンが表示される");

  // Stepper
  it.todo("[V-IC04] Stepper: 完了ステップの \"✓\" Unicode テキストが表示されず Feather check アイコン (data-testid=\"icon-check\") が表示される");

  // OnboardingGuide
  it.todo("[V-IC05a] OnboardingGuide: 練習カードに Feather clipboard アイコンが表示される (絵文字 📋 なし)");
  it.todo("[V-IC05b] OnboardingGuide: 大会カードに Feather award アイコンが表示される (絵文字 🏆 なし)");
  it.todo("[V-IC05c] OnboardingGuide: チームカードに Feather users アイコンが表示される (絵文字 👥 なし)");
  it.todo("[V-IC05d] OnboardingGuide: マイページカードに Feather user アイコンが表示される (絵文字 👤 なし)");

  // BestTimesTable (整合性)
  it.todo("[V-IC06] BestTimesTable: 「引き継ぎタイム含」チェックボックスのチェックマークが Feather check アイコンになる (\"✓\" Unicode なし)");
});

// ---------------------------------------------------------------------------
// [V-BT01〜BT13] ベストタイム入力 UX (Step 3 昇格)
// ---------------------------------------------------------------------------
describe("[V-BT] OnboardingBestTime — 種目・タイム入力 UI", () => {
  it.todo("[V-BT01] Step 3 に「種目を追加...」Picker/Select が表示される");

  it.todo("[V-BT02] Picker で種目 (例: 100m 自由形) を選択するとエントリー行が追加され、種目名が表示される");

  it.todo("[V-BT03] エントリー行に「短水路」/「長水路」選択 Picker が表示される");

  it.todo("[V-BT04] エントリー行のタイム入力フィールドに placeholder として \"1:23.45\" 形式が表示される");

  it.todo("[V-BT05] エントリーが 0 件のとき「スキップして始める」ボタンが表示される (「保存して始める」は表示されない)");

  it.todo("[V-BT06] エントリーが 1 件以上のとき「保存して始める」ボタンが表示される (「スキップして始める」は非表示)");

  it.todo("[V-BT07] タイム未入力エントリーがある場合「保存して始める」ボタンが disabled になる");

  it.todo(
    "[V-BT08] 全エントリーのタイムが入力済みの状態で「保存して始める」をタップすると RecordAPI.createBulkRecords() が呼ばれ、成功後に onSkip (完了処理) が呼ばれる",
  );

  it.todo("[V-BT09] 「スキップして始める」をタップすると RecordAPI.createBulkRecords() は呼ばれず onSkip が直接呼ばれる");

  it.todo(
    "[V-BT10] createBulkRecords() がエラーを返した場合、エラーメッセージが画面に表示され、完了処理は呼ばれない",
  );

  it.todo("[V-BT11] エントリー行の削除ボタンをタップすると当該エントリーが一覧から消える");

  it.todo(
    "[V-BT12] 同一種目 + 水路タイプのエントリーを 2 件追加した場合、重複警告テキストが表示され「保存して始める」が disabled になる",
  );

  it.todo(
    "[V-BT13] 保存処理中 (saving=true) は「保存して始める」「スキップして始める」「戻る」がすべて disabled になる",
  );
});

// ---------------------------------------------------------------------------
// [V-BT-EDGE] ベストタイム入力 エッジケース
// ---------------------------------------------------------------------------
describe("[V-BT-EDGE] OnboardingBestTime — エッジケース・境界値", () => {
  it.todo(
    "[V-BT-EDGE01] タイム \"0\" や空文字を入力した場合「保存して始める」が disabled のまま",
  );

  it.todo(
    "[V-BT-EDGE02] タイム \"1:23.45\" を parseTime() に渡すと 83.45 秒として解析される",
  );

  it.todo(
    "[V-BT-EDGE03] タイム \"23-45\" (ハイフン区切り) を parseTime() に渡すと 23.45 秒として解析される",
  );

  it.todo(
    "[V-BT-EDGE04] タイム入力後に削除ボタンでエントリーを全削除すると「スキップして始める」に切り替わる",
  );
});
