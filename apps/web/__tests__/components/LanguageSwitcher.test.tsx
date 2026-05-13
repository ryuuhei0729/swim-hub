/**
 * Issue #32 Phase 1-A: LanguageSwitcher コンポーネント単体テスト
 *
 * Sprint Contract 検証観点:
 *   [V-09-LS] ja ボタンクリック → /ja/<current-path> に遷移
 *   [V-09-LS] en ボタンクリック → /en/<current-path> に遷移
 *   [V-09-LS] 現在のロケールボタンに aria-current="page" が付くこと
 *   [V-14] LanguageSwitcher が Header / Sidebar に存在すること (smoke test)
 *
 * テスト対象: components/ui/LanguageSwitcher.tsx (Phase 1-A で新規作成)
 *
 * モックパターン:
 *   実装は useLocale を "next-intl" から、useRouter / usePathname / Link を
 *   "@/i18n/navigation" (createNavigation の返り値) から import する。
 *   テストもこれに合わせて両方の module を mock する。
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// モック設定
// ---------------------------------------------------------------------------

const { mockRouterPush, mockRouterReplace } = vi.hoisted(() => ({
  mockRouterPush: vi.fn(),
  mockRouterReplace: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useLocale: vi.fn(() => "ja"),
  useTranslations: vi.fn(() => (key: string) => key),
}));

// 実装は @/i18n/navigation (createNavigation の返り値) を使う
vi.mock("@/i18n/navigation", () => ({
  useRouter: vi.fn(() => ({
    push: mockRouterPush,
    replace: mockRouterReplace,
    prefetch: vi.fn(),
  })),
  usePathname: vi.fn(() => "/dashboard"),
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  redirect: vi.fn(),
}));

// ---------------------------------------------------------------------------
// テスト本体
// ---------------------------------------------------------------------------

describe("LanguageSwitcher コンポーネント (Issue #32 Phase 1-A)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // [V-09-LS] 基本レンダリング
  // -------------------------------------------------------------------------
  describe("基本レンダリング", () => {
    it("ja と en の2つのボタン/リンクが表示される", async () => {
      const { default: LanguageSwitcher } = await import("@/components/ui/LanguageSwitcher");

      render(<LanguageSwitcher />);

      // "ja" または "JA" または "日本語" のいずれかが表示されること
      const jaElement = screen.queryByText(/^(ja|JA|日本語)$/i);
      expect(jaElement).not.toBeNull();

      // "en" または "EN" または "English" のいずれかが表示されること
      const enElement = screen.queryByText(/^(en|EN|English)$/i);
      expect(enElement).not.toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // [V-09-LS] ロケール切り替え動作
  // -------------------------------------------------------------------------
  describe("ロケール切り替え", () => {
    it("現在ロケールが ja のとき、en をクリックすると router.push が pathname と {locale: 'en'} で呼ばれる", async () => {
      const { useLocale } = await import("next-intl");
      vi.mocked(useLocale).mockReturnValue("ja");

      const { usePathname } = await import("@/i18n/navigation");
      vi.mocked(usePathname).mockReturnValue("/dashboard");

      const { default: LanguageSwitcher } = await import("@/components/ui/LanguageSwitcher");

      render(<LanguageSwitcher />);

      const enButton =
        screen.queryByRole("button", { name: /en/i }) ?? screen.getByText(/^(en|EN|English)$/i);
      await userEvent.click(enButton);

      // 実装は router.push(pathname, { locale: 'en' }) を呼ぶ。
      // 引数を正確に検証 (緩い OR 判定はリグレッション検出力が落ちるため避ける)。
      expect(mockRouterPush).toHaveBeenCalledWith("/dashboard", { locale: "en" });
      expect(mockRouterPush).toHaveBeenCalledTimes(1);
      expect(mockRouterReplace).not.toHaveBeenCalled();
    });

    it("現在ロケールが en のとき、ja をクリックすると router.push が pathname と {locale: 'ja'} で呼ばれる", async () => {
      const { useLocale } = await import("next-intl");
      vi.mocked(useLocale).mockReturnValue("en");

      const { usePathname } = await import("@/i18n/navigation");
      vi.mocked(usePathname).mockReturnValue("/dashboard");

      const { default: LanguageSwitcher } = await import("@/components/ui/LanguageSwitcher");

      render(<LanguageSwitcher />);

      const jaButton =
        screen.queryByRole("button", { name: /ja/i }) ?? screen.getByText(/^(ja|JA|日本語)$/i);
      await userEvent.click(jaButton);

      expect(mockRouterPush).toHaveBeenCalledWith("/dashboard", { locale: "ja" });
      expect(mockRouterPush).toHaveBeenCalledTimes(1);
      expect(mockRouterReplace).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // [V-09-LS] aria-current による現在ロケールの表示
  // -------------------------------------------------------------------------
  describe("アクセシビリティ — 現在ロケールの aria-current", () => {
    it("現在ロケールが ja のとき、ja ボタンに aria-current='page' が付く", async () => {
      const { useLocale } = await import("next-intl");
      vi.mocked(useLocale).mockReturnValue("ja");

      const { default: LanguageSwitcher } = await import("@/components/ui/LanguageSwitcher");

      render(<LanguageSwitcher />);

      // aria-current="page" または aria-current="true" のいずれかの実装を許容
      const currentElements = document.querySelectorAll(
        '[aria-current="page"], [aria-current="true"]',
      );
      expect(currentElements.length).toBeGreaterThan(0);

      // 現在のロケール要素が ja であること
      const currentElement = Array.from(currentElements).find((el) =>
        el.textContent?.match(/^(ja|JA|日本語)$/i),
      );
      expect(currentElement).toBeDefined();
    });

    it("現在ロケールが en のとき、en ボタンに aria-current='page' が付く", async () => {
      const { useLocale } = await import("next-intl");
      vi.mocked(useLocale).mockReturnValue("en");

      const { default: LanguageSwitcher } = await import("@/components/ui/LanguageSwitcher");

      render(<LanguageSwitcher />);

      const currentElements = document.querySelectorAll(
        '[aria-current="page"], [aria-current="true"]',
      );
      expect(currentElements.length).toBeGreaterThan(0);

      const currentElement = Array.from(currentElements).find((el) =>
        el.textContent?.match(/^(en|EN|English)$/i),
      );
      expect(currentElement).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // [V-09-LS] 現在と同じロケールをクリックしても遷移しない (UX)
  // -------------------------------------------------------------------------
  describe("同一ロケールクリック時の挙動", () => {
    it("現在ロケールが ja のとき ja をクリックしても router.push は呼ばれない", async () => {
      const { useLocale } = await import("next-intl");
      vi.mocked(useLocale).mockReturnValue("ja");

      const { default: LanguageSwitcher } = await import("@/components/ui/LanguageSwitcher");

      render(<LanguageSwitcher />);

      const jaButton =
        screen.queryByRole("button", { name: /^(ja|JA)$/i }) ??
        screen.queryByText(/^(ja|JA|日本語)$/i);

      // ボタンが見つからない場合は構造変更を検出するためテスト失敗にする
      expect(jaButton).not.toBeNull();

      await userEvent.click(jaButton!);
      // 同一ロケールへの遷移は行わない
      expect(mockRouterPush).not.toHaveBeenCalled();
      expect(mockRouterReplace).not.toHaveBeenCalled();
    });
  });
});
