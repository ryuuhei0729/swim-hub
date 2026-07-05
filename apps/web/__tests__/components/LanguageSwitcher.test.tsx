/**
 * Issue #32 Phase 1-A: LanguageSwitcher コンポーネント単体テスト
 *
 * Sprint Contract 検証観点:
 *   [V-09-LS] トリガークリックでメニューが開き、各ロケール項目が表示される
 *   [V-09-LS] en 項目クリック → /en/<current-path> に遷移
 *   [V-09-LS] ja 項目クリック → /ja/<current-path> に遷移
 *   [V-09-LS] 現在のロケール項目に aria-current が付くこと
 *   [V-14] LanguageSwitcher が Header / Sidebar に存在すること (smoke test)
 *
 * テスト対象: components/ui/LanguageSwitcher.tsx
 *   2026-06-10: 言語数増加 (ja/en/zh/ko) に伴いインライントグル → プルダウンに変更。
 *   トリガーは common.language ラベル、メニュー項目はネイティブ表記 + data-testid。
 *
 * モックパターン:
 *   実装は useLocale / useTranslations を "next-intl" から import する。
 *   t("language") / t("aria.switchLanguage") は mock がキー文字列をそのまま返す。
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// モック設定
// ---------------------------------------------------------------------------

vi.mock("next-intl", () => ({
  useLocale: vi.fn(() => "ja"),
  useTranslations: vi.fn(() => (key: string) => key),
}));

// 実装は @/i18n/routing の stripLocale のみ利用 (純関数なので実体を使う)

// ---------------------------------------------------------------------------
// テスト本体
// ---------------------------------------------------------------------------

describe("LanguageSwitcher コンポーネント (Issue #32 / プルダウン版)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // [V-09-LS] トリガーとメニュー展開
  // -------------------------------------------------------------------------
  describe("基本レンダリング", () => {
    it("初期状態ではトリガーのみ表示され、メニュー項目は閉じている", async () => {
      const { default: LanguageSwitcher } = await import("@/components/ui/LanguageSwitcher");

      render(<LanguageSwitcher />);

      // トリガーボタンが存在する
      const trigger = screen.getByTestId("language-switcher-trigger");
      expect(trigger).not.toBeNull();
      // disclosure パターン: 閉じた状態では aria-expanded が false
      expect(trigger.getAttribute("aria-expanded")).toBe("false");
      // メニュー項目はまだ表示されていない
      expect(screen.queryByTestId("language-switcher-en")).toBeNull();
    });

    it("トリガークリックで ja/en/zh/ko/de の5項目が表示される", async () => {
      const { default: LanguageSwitcher } = await import("@/components/ui/LanguageSwitcher");

      render(<LanguageSwitcher />);

      await userEvent.click(screen.getByTestId("language-switcher-trigger"));

      expect(screen.getByTestId("language-switcher-ja")).not.toBeNull();
      expect(screen.getByTestId("language-switcher-en")).not.toBeNull();
      expect(screen.getByTestId("language-switcher-zh")).not.toBeNull();
      expect(screen.getByTestId("language-switcher-ko")).not.toBeNull();
      expect(screen.getByTestId("language-switcher-de")).not.toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // [V-09-LS] ロケール切り替え動作
  // -------------------------------------------------------------------------
  describe("ロケール切り替え", () => {
    it("現在ロケールが ja のとき、en 項目クリックで window.location.assign('/en/...') が呼ばれる", async () => {
      const { useLocale } = await import("next-intl");
      vi.mocked(useLocale).mockReturnValue("ja");

      const assignMock = vi.fn();
      Object.defineProperty(window, "location", {
        writable: true,
        value: { pathname: "/ja/dashboard", search: "", assign: assignMock },
      });

      const { default: LanguageSwitcher } = await import("@/components/ui/LanguageSwitcher");

      render(<LanguageSwitcher />);

      await userEvent.click(screen.getByTestId("language-switcher-trigger"));
      await userEvent.click(screen.getByTestId("language-switcher-en"));

      expect(assignMock).toHaveBeenCalledWith("/en/dashboard");
      expect(assignMock).toHaveBeenCalledTimes(1);
    });

    it("現在ロケールが en のとき、ja 項目クリックで window.location.assign('/ja/...') が呼ばれる", async () => {
      const { useLocale } = await import("next-intl");
      vi.mocked(useLocale).mockReturnValue("en");

      const assignMock = vi.fn();
      Object.defineProperty(window, "location", {
        writable: true,
        value: { pathname: "/en/dashboard", search: "", assign: assignMock },
      });

      const { default: LanguageSwitcher } = await import("@/components/ui/LanguageSwitcher");

      render(<LanguageSwitcher />);

      await userEvent.click(screen.getByTestId("language-switcher-trigger"));
      await userEvent.click(screen.getByTestId("language-switcher-ja"));

      expect(assignMock).toHaveBeenCalledWith("/ja/dashboard");
      expect(assignMock).toHaveBeenCalledTimes(1);
    });

    it("zh 項目クリックで window.location.assign('/zh/...') が呼ばれる", async () => {
      const { useLocale } = await import("next-intl");
      vi.mocked(useLocale).mockReturnValue("ja");

      const assignMock = vi.fn();
      Object.defineProperty(window, "location", {
        writable: true,
        value: { pathname: "/ja/settings", search: "", assign: assignMock },
      });

      const { default: LanguageSwitcher } = await import("@/components/ui/LanguageSwitcher");

      render(<LanguageSwitcher />);

      await userEvent.click(screen.getByTestId("language-switcher-trigger"));
      await userEvent.click(screen.getByTestId("language-switcher-zh"));

      expect(assignMock).toHaveBeenCalledWith("/zh/settings");
    });

    it("ko 項目クリックで window.location.assign('/ko/...') が呼ばれる", async () => {
      const { useLocale } = await import("next-intl");
      vi.mocked(useLocale).mockReturnValue("ja");

      const assignMock = vi.fn();
      Object.defineProperty(window, "location", {
        writable: true,
        value: { pathname: "/ja/dashboard", search: "", assign: assignMock },
      });

      const { default: LanguageSwitcher } = await import("@/components/ui/LanguageSwitcher");

      render(<LanguageSwitcher />);

      await userEvent.click(screen.getByTestId("language-switcher-trigger"));
      await userEvent.click(screen.getByTestId("language-switcher-ko"));

      expect(assignMock).toHaveBeenCalledWith("/ko/dashboard");
    });

    it("de 項目クリックで window.location.assign('/de/...') が呼ばれる", async () => {
      const { useLocale } = await import("next-intl");
      vi.mocked(useLocale).mockReturnValue("ja");

      const assignMock = vi.fn();
      Object.defineProperty(window, "location", {
        writable: true,
        value: { pathname: "/ja/dashboard", search: "", assign: assignMock },
      });

      const { default: LanguageSwitcher } = await import("@/components/ui/LanguageSwitcher");

      render(<LanguageSwitcher />);

      await userEvent.click(screen.getByTestId("language-switcher-trigger"));
      await userEvent.click(screen.getByTestId("language-switcher-de"));

      expect(assignMock).toHaveBeenCalledWith("/de/dashboard");
    });
  });

  // -------------------------------------------------------------------------
  // [V-09-LS] aria-current による現在ロケールの表示
  // -------------------------------------------------------------------------
  describe("アクセシビリティ — 現在ロケールの aria-current", () => {
    it("現在ロケールが ja のとき、ja 項目に aria-current が付く", async () => {
      const { useLocale } = await import("next-intl");
      vi.mocked(useLocale).mockReturnValue("ja");

      const { default: LanguageSwitcher } = await import("@/components/ui/LanguageSwitcher");

      render(<LanguageSwitcher />);

      await userEvent.click(screen.getByTestId("language-switcher-trigger"));

      const jaItem = screen.getByTestId("language-switcher-ja");
      expect(jaItem.getAttribute("aria-current")).toBe("true");
      // 他ロケールには付かない
      expect(screen.getByTestId("language-switcher-en").getAttribute("aria-current")).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // [C1] Escape キーでメニューが閉じ、トリガーにフォーカスが戻る (disclosure パターン)
  // -------------------------------------------------------------------------
  describe("Escape キーによるメニュー閉鎖 (disclosure パターン)", () => {
    it("メニューが開いた状態で Escape を押すと項目が非表示になる", async () => {
      const { default: LanguageSwitcher } = await import("@/components/ui/LanguageSwitcher");

      render(<LanguageSwitcher />);

      // メニューを開く
      await userEvent.click(screen.getByTestId("language-switcher-trigger"));
      expect(screen.getByTestId("language-switcher-en")).not.toBeNull();

      // Escape キーを押す
      await userEvent.keyboard("{Escape}");

      // メニューが閉じている
      expect(screen.queryByTestId("language-switcher-en")).toBeNull();
    });

    it("Escape 後にトリガーボタンがフォーカスを持つ", async () => {
      const { default: LanguageSwitcher } = await import("@/components/ui/LanguageSwitcher");

      render(<LanguageSwitcher />);

      const trigger = screen.getByTestId("language-switcher-trigger");

      // メニューを開く
      await userEvent.click(trigger);
      expect(screen.getByTestId("language-switcher-en")).not.toBeNull();

      // Escape キーを押す
      await userEvent.keyboard("{Escape}");

      // トリガーにフォーカスが戻る
      expect(document.activeElement).toBe(trigger);
    });
  });

  // -------------------------------------------------------------------------
  // [V-09-LS] 現在と同じロケールをクリックしても遷移しない (UX)
  // -------------------------------------------------------------------------
  describe("同一ロケールクリック時の挙動", () => {
    it("現在ロケールが ja のとき ja 項目をクリックしても window.location.assign は呼ばれない", async () => {
      const { useLocale } = await import("next-intl");
      vi.mocked(useLocale).mockReturnValue("ja");

      const assignMock = vi.fn();
      Object.defineProperty(window, "location", {
        writable: true,
        value: { pathname: "/ja/dashboard", search: "", assign: assignMock },
      });

      const { default: LanguageSwitcher } = await import("@/components/ui/LanguageSwitcher");

      render(<LanguageSwitcher />);

      await userEvent.click(screen.getByTestId("language-switcher-trigger"));
      await userEvent.click(screen.getByTestId("language-switcher-ja"));

      expect(assignMock).not.toHaveBeenCalled();
    });
  });
});
