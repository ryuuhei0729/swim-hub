/**
 * OnboardingWizard テスト
 *
 * Sprint Contract Issue #26 検証観点:
 *   [V-01] Step 1 (Welcome) が表示され、「始める」でStep 2に進む
 *   [V-02] Step 2 (Profile) の name フィールドに初期値(email由来の名前)がプリフィル表示される
 *   [V-03] Step 2 (Profile) の name が email 形式の場合、スキップ不可でステップを強制する
 *   [V-04] Step 2 (Profile) の name が email 形式以外はスキップ可能
 *   [V-05] Step 3 (BestTime) は「スキップ」でStep 4へ進める
 *   [V-06] Step 4 (Guide) の「完了」ボタンで onboarding_completed=true が DB に保存される
 *   [V-07] 完了後 /dashboard にリダイレクトされる
 *   [V-08] DB 保存失敗時にエラーメッセージが表示される
 *   [V-09] FormStepper が 4 ステップを正しく表示し、現在ステップを強調する
 *   [V-10] BulkBestTime に遷移する場合、return_to=onboarding のクエリパラメータが付与される
 *
 * テスト対象:
 *   apps/web/app/(authenticated)/onboarding/_client/OnboardingWizard.tsx (未実装)
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect as _expect, expect, it, vi, beforeEach } from "vitest";
import type { UserProfile } from "@apps/shared/types";

// Next.js Router をモック
const mockRouterPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockRouterPush,
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

// useAuth をモック (updateProfile を含める)
const mockUpdateProfile = vi.fn();
vi.mock("@/contexts", () => ({
  useAuth: () => ({
    user: { id: "user-1", email: "test@example.com" },
    supabase: { auth: {}, from: vi.fn() },
    subscription: null,
    updateProfile: mockUpdateProfile,
  }),
}));

// AvatarUpload は画像アップロードロジックが重いのでモック化
vi.mock("@/components/profile/AvatarUpload", () => ({
  __esModule: true,
  default: () => null,
}));

// RecordAPI をモック (Step3BestTime が使う)
vi.mock("@apps/shared/api/records", () => ({
  RecordAPI: class {
    createBulkRecords = vi.fn().mockResolvedValue({ errors: [] });
  },
}));

import OnboardingWizard from "../OnboardingWizard";

describe("OnboardingWizard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateProfile.mockResolvedValue({ error: null });
  });

  // ---------------------------------------------------------------------------
  // State lifting (ステップ遷移で入力が破棄されないこと)
  // ---------------------------------------------------------------------------
  describe("State lifting", () => {
    it("Step 2 で入力 → Step 3 に進む → Step 2 に戻る、でフォームの値が保持される", async () => {
      const user = userEvent.setup();
      render(<OnboardingWizard initialProfile={null} />);

      // Step 1: 「始める」で Step 2 へ
      await user.click(screen.getByRole("button", { name: "始める" }));

      // Step 2: 名前を入力
      const nameInput = await screen.findByLabelText(/名前/);
      await user.type(nameInput, "山田太郎");
      expect(nameInput).toHaveValue("山田太郎");

      // 自己紹介を入力 (任意)
      const bioInput = screen.getByLabelText(/自己紹介/);
      await user.type(bioInput, "水泳歴10年");

      // 「次へ」で Step 3 へ (updateProfile が呼ばれる)
      await user.click(screen.getByRole("button", { name: "次へ" }));
      await waitFor(() => {
        expect(mockUpdateProfile).toHaveBeenCalledTimes(1);
      });

      // Step 3 が表示されたことを確認
      await screen.findByRole("button", { name: /スキップして始める/ });

      // Step 3 の「戻る」で Step 2 に戻る
      await user.click(screen.getByRole("button", { name: "戻る" }));

      // 破棄されず山田太郎 / 水泳歴10年 が残っているべき
      const nameInputAfter = await screen.findByLabelText(/名前/);
      expect(nameInputAfter).toHaveValue("山田太郎");
      expect(screen.getByLabelText(/自己紹介/)).toHaveValue("水泳歴10年");
    });

    it("Step 3 でエントリー追加 → Step 2 に戻る → Step 3 に戻る、でエントリーが保持される", async () => {
      const user = userEvent.setup();
      render(
        <OnboardingWizard
          initialProfile={
            {
              id: "user-1",
              name: "山田太郎",
              gender: 0,
              birthday: null,
              bio: null,
              profile_image_path: null,
            } as UserProfile
          }
        />,
      );

      // Step 1 → Step 2 → Step 3
      await user.click(screen.getByRole("button", { name: "始める" }));
      await user.click(await screen.findByRole("button", { name: "次へ" }));

      // Step 3: 種目を追加 (エントリー追加すると「X を削除」の aria-label を持つボタンが出る)
      const styleSelect = await screen.findByRole("combobox");
      await user.selectOptions(styleSelect, "2"); // 50m 自由形

      // Step 3 に行が 1 件あることを確認 (削除ボタンの存在で検証)
      expect(screen.getByRole("button", { name: "50m 自由形を削除" })).toBeInTheDocument();

      // Step 2 に戻る
      await user.click(screen.getByRole("button", { name: "戻る" }));
      await screen.findByLabelText(/名前/);

      // もう一度 Step 3 に進む
      await user.click(screen.getByRole("button", { name: "次へ" }));

      // エントリーが保持されているべき
      expect(
        await screen.findByRole("button", { name: "50m 自由形を削除" }),
      ).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // 未保存変更ダイアログ (popstate)
  // ---------------------------------------------------------------------------
  describe("未保存変更の離脱ダイアログ", () => {
    it("dirty 状態でブラウザ戻るボタンを押すと確認ダイアログが表示される", async () => {
      const user = userEvent.setup();
      render(<OnboardingWizard initialProfile={null} />);

      // Step 1 → Step 2
      await user.click(screen.getByRole("button", { name: "始める" }));

      // Step 2 で入力して dirty に
      const nameInput = await screen.findByLabelText(/名前/);
      await user.type(nameInput, "あ");

      // dirty state が Wizard に伝搬し popstate listener が再登録されるのを待つ
      await waitFor(() => {
        expect(nameInput).toHaveValue("あ");
      });

      // popstate イベント発火 (ブラウザの戻るボタンをシミュレート)
      window.dispatchEvent(new PopStateEvent("popstate"));

      // ダイアログが表示される
      expect(await screen.findByText("入力内容が保存されていません")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "編集を続ける" })).toBeInTheDocument();
    });

    it("未入力 (dirty=false) では popstate でもダイアログは出ない", async () => {
      render(<OnboardingWizard initialProfile={null} />);
      // Step 1 は dirty ではない
      window.dispatchEvent(new PopStateEvent("popstate"));
      // waitFor で繰り返しチェックしダイアログが出現しないことを保証
      await waitFor(() => {
        expect(screen.queryByText("入力内容が保存されていません")).not.toBeInTheDocument();
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Step 1: Welcome
  // ---------------------------------------------------------------------------
  describe("[V-01] Step1Welcome", () => {
    it.todo("ウェルカムメッセージとサービス概要が表示される");

    it.todo("「始める」ボタンをクリックするとStep 2 (Profile)に進む");

    it.todo("Step 1 表示中は FormStepper のステップ 1 が current になる");
  });

  // ---------------------------------------------------------------------------
  // Step 2: Profile
  // ---------------------------------------------------------------------------
  describe("[V-02] Step2Profile — name プリフィル", () => {
    it.todo("user.email が email 形式の場合、name フィールドは空で表示される");

    it.todo(
      "user の name が既に設定されている (email 形式でない) 場合、name フィールドにプリフィルされる",
    );
  });

  describe("[V-03] Step2Profile — email 形式ユーザーはスキップ不可", () => {
    it.todo(
      "name フィールドが email 形式のまま (変更なし) の場合、スキップボタンが表示されない or 無効化される",
    );

    it.todo("name フィールドが空の場合、次へボタンが無効化されエラーメッセージが表示される");
  });

  describe("[V-04] Step2Profile — email 形式以外はスキップ可能", () => {
    it.todo("name フィールドに email 形式でない値が入力された場合、スキップボタンが表示される");

    it.todo("スキップすると Step 3 に進む (name は変更なし)");
  });

  describe("[V-04a] Step2Profile — 入力と次へ", () => {
    it.todo("name フィールドに値を入力して「次へ」クリックで Step 3 に進む");

    it.todo("birthday (任意) を入力して次へ進んだとき、値がフォーム状態に保持される");

    it.todo("gender を選択して次へ進んだとき、値がフォーム状態に保持される");
  });

  // ---------------------------------------------------------------------------
  // Step 3: BestTime (3 ステップ構成)
  // ---------------------------------------------------------------------------
  describe("[V-05] Step3BestTime", () => {
    it.todo("「スキップして始める」ボタンで onboarding 完了 → /dashboard へ遷移する");
  });

  // ---------------------------------------------------------------------------
  // 完了処理 (updateProfile({ onboarding_completed: true }) 経由)
  // ---------------------------------------------------------------------------
  describe("[V-06] 完了処理", () => {
    it.todo("「スキップして始める」で updateProfile({ onboarding_completed: true }) が呼ばれる");

    it.todo("updateProfile 成功後に router.push('/dashboard') が呼ばれる");
  });

  // ---------------------------------------------------------------------------
  // エラー系
  // ---------------------------------------------------------------------------
  describe("[V-08] DB 更新失敗時のエラーハンドリング", () => {
    it.todo("updateProfile が error を返した場合、エラーメッセージが表示される");

    it.todo("エラー時は /dashboard への遷移が発生しない");

    it.todo("エラー時に isSubmitted が false に戻り、再試行で警告抑止が働き直す");
  });

  // ---------------------------------------------------------------------------
  // FormStepper (3 ステップ)
  // ---------------------------------------------------------------------------
  describe("[V-09] FormStepper", () => {
    it.todo("3 ステップ (ようこそ / プロフィール / ベストタイム) が正しいラベルで表示される");

    it.todo("Step 1 → 2 → 3 と進むにつれ currentStep が更新される");
  });
});
