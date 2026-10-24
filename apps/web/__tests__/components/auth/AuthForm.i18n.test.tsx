/**
 * AuthForm の i18n 配線 (Phase 1-B [V-10]〜[V-13])
 *
 * next-intl はモックせず、本物の NextIntlClientProvider に shared/messages の ja / en を渡して
 * 描画する (renderWithI18n)。期待値も同じ messages JSON から取るので、文言を更新しても
 * このテストは壊れない。
 *
 * 旧版は手書きの翻訳表で next-intl をモックしていたため、文言の更新 (例: 「Googleでサインアップ」→
 * 「Googleで新規登録」) に追従できず 2026-05 から describe.skip のまま放置されていた。
 */

import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import enMessages from "@apps/shared/messages/en.json";
import jaMessages from "@apps/shared/messages/ja.json";
import { AuthForm } from "@/components/auth/AuthForm";
import { renderWithI18n, type TestLocale } from "../../utils/render";

// useAuth は自動モック (contexts/__mocks__)。signIn / signUp / signInWithOAuth は成功を返す vi.fn
vi.mock("@/contexts");
// Link / useRouter は自動モック (i18n/__mocks__/navigation.ts)
vi.mock("@/i18n/navigation");

// BirthdayInput は date input に置き換える (本物は複数セレクトで描画が重い)
vi.mock("@/components/ui/BirthdayInput", () => ({
  default: ({ label, onChange }: { label: string; value: string; onChange: (v: string) => void }) => (
    <div>
      <label>{label}</label>
      <input type="date" onChange={(e) => onChange(e.target.value)} data-testid="birthday-input" />
    </div>
  ),
}));

const AUTH = { ja: jaMessages.auth, en: enMessages.auth } as const;
const LOCALES: TestLocale[] = ["ja", "en"];

describe("AuthForm 翻訳 (Phase 1-B)", () => {
  it("ja と en の期待値が異なる (同一ならロケール切替を検証できない)", () => {
    expect(AUTH.ja.signin.submitButton).not.toBe(AUTH.en.signin.submitButton);
    expect(AUTH.ja.signup.submitButton).not.toBe(AUTH.en.signup.submitButton);
    expect(AUTH.ja.validation.nameRequired).not.toBe(AUTH.en.validation.nameRequired);
    expect(AUTH.ja.passwordRequirements.title).not.toBe(AUTH.en.passwordRequirements.title);
  });

  describe.each(LOCALES)("[V-10] signin mode — %s", (locale) => {
    it("ログインボタン・パスワード再設定リンク・区切り文字・Google ボタンがそのロケールの文言になる", () => {
      renderWithI18n(<AuthForm mode="signin" />, { locale });

      expect(screen.getByTestId("login-button")).toHaveTextContent(AUTH[locale].signin.submitButton);
      expect(screen.getByTestId("forgot-password-link")).toHaveTextContent(AUTH[locale].forgotPassword);
      expect(screen.getByText(AUTH[locale].orSeparator)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: AUTH[locale].googleSignin })).toBeInTheDocument();
    });
  });

  describe.each(LOCALES)("[V-12] signup mode — %s", (locale) => {
    it("アカウント作成ボタンと Google 新規登録ボタンがそのロケールの文言になる", () => {
      renderWithI18n(<AuthForm mode="signup" />, { locale });

      expect(screen.getByTestId("signup-button")).toHaveTextContent(AUTH[locale].signup.submitButton);
      expect(screen.getByRole("button", { name: AUTH[locale].googleSignup })).toBeInTheDocument();
    });
  });

  describe.each(LOCALES)("[V-11] バリデーションエラー — %s", (locale) => {
    it("signup mode で名前を空のまま送信すると nameRequired の文言が表示される", async () => {
      renderWithI18n(<AuthForm mode="signup" />, { locale });

      // ブラウザの required 検証を経由せず submit ハンドラ側のバリデーション文言を見る
      fireEvent.submit(screen.getByTestId("auth-form"));

      expect(await screen.findByText(AUTH[locale].validation.nameRequired)).toBeInTheDocument();
    });
  });

  describe.each(LOCALES)("[V-13] パスワード要件 — %s", (locale) => {
    it("signup mode でパスワード要件のタイトルがそのロケールの文言になる", () => {
      renderWithI18n(<AuthForm mode="signup" />, { locale });

      expect(screen.getByText(AUTH[locale].passwordRequirements.title)).toBeInTheDocument();
    });
  });
});
