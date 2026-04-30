/**
 * LP CTA ボタン検証 - ユニットテスト
 *
 * Sprint Contract: LP Growth Sprint (統合版 Sprint 1+2+3)
 * 検証対象: V-21, V-22, V-23, V-24, V-25
 *
 * テストケース:
 * - TC-LP-CTA-001: LpFinalCTA に iOS App Store の実 URL リンクが存在する
 * - TC-LP-CTA-002: App Store リンクが target="_blank" / rel="noopener" を持つ
 * - TC-LP-CTA-003: App Store リンクの href が空でない (実 URL が設定されている)
 * - TC-LP-CTA-004: LpFinalCTA に disabled ボタン「App Store · 準備中」が存在しない
 * - TC-LP-CTA-005: LpScannerBlock の disabled 「デモ動画」ボタンが存在しない or 近日公開表記
 * - TC-LP-CTA-006: LpHero の「デモを見る」アンカーリンクが残っている
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import LpFinalCTA from "@/app/_components/lp/LpFinalCTA";
import LpScannerBlock from "@/app/_components/lp/LpScannerBlock";
import LpHero from "@/app/_components/lp/LpHero";

describe("LpFinalCTA", () => {
  describe("TC-LP-CTA-001/002/003: iOS App Store リンク", () => {
    it("App Store リンクが存在し href が実 URL (apps.apple.com) を含む", () => {
      render(<LpFinalCTA />);
      const link = screen.getByRole("link", { name: /App Store/i });
      expect(link).toBeInTheDocument();
      const href = (link as HTMLAnchorElement).getAttribute("href") ?? "";
      expect(href).toContain("apple.com");
      expect(href).not.toBe("");
      // プレースホルダー (#) ではないことを確認
      expect(href).not.toBe("#");
    });

    it("App Store リンクが target=_blank を持つ", () => {
      render(<LpFinalCTA />);
      const link = screen.getByRole("link", { name: /App Store/i });
      expect(link).toHaveAttribute("target", "_blank");
    });

    it("App Store リンクが rel=noopener を持つ", () => {
      render(<LpFinalCTA />);
      const link = screen.getByRole("link", { name: /App Store/i });
      const rel = link.getAttribute("rel") ?? "";
      expect(rel).toMatch(/noopener/);
    });

    it("disabled ボタン「App Store · 準備中」が存在しない", () => {
      render(<LpFinalCTA />);
      // disabled な button 要素が存在しないことを確認
      const disabledBtns = document.querySelectorAll("button[disabled]");
      expect(disabledBtns.length).toBe(0);
    });
  });

  describe("TC-LP-CTA-004: Google Play / Android 表記", () => {
    it("Android は「近日公開」テキストで表示されている (disabled ボタンでない)", () => {
      render(<LpFinalCTA />);
      // 「Android 版 近日公開」または「Android」テキストが存在するが、disabled button ではない
      const androidText = screen.queryByText(/Android.*近日公開|近日公開/);
      expect(androidText).toBeInTheDocument();
      // そのテキストを含む button 要素は disabled でない
      const buttons = document.querySelectorAll("button");
      buttons.forEach((btn) => {
        expect(btn).not.toBeDisabled();
      });
    });
  });
});

describe("LpScannerBlock", () => {
  describe("TC-LP-CTA-005: disabled デモ動画ボタン", () => {
    it("「デモ動画」テキストを持つ disabled ボタンが存在しない", () => {
      render(<LpScannerBlock />);
      // disabled な button が存在しないことを確認
      const disabledBtns = document.querySelectorAll("button[disabled]");
      expect(disabledBtns.length).toBe(0);
      // 「デモ動画」というテキスト自体が存在しないことを確認 (Sprint Contract: 削除済み)
      const demoVideoText = screen.queryByText(/デモ動画/);
      expect(demoVideoText).not.toBeInTheDocument();
    });

    it("「SCANNER を試す」リンクが存在する (disabled 除去後の代替)", () => {
      render(<LpScannerBlock />);
      const scannerLink = screen.getByRole("link", { name: /SCANNER を試す/i });
      expect(scannerLink).toBeInTheDocument();
      expect((scannerLink as HTMLAnchorElement).getAttribute("href")).toContain("scanner.swim-hub.app");
    });
  });
});

describe("LpHero", () => {
  describe("TC-LP-CTA-006: デモを見るアンカー保持", () => {
    it("「デモを見る」リンクが存在し href が #hero-card を指す", () => {
      render(<LpHero />);
      const demoLink = screen.getByRole("link", { name: /デモを見る/i });
      expect(demoLink).toBeInTheDocument();
      const href = (demoLink as HTMLAnchorElement).getAttribute("href") ?? "";
      expect(href).toMatch(/#hero-card/);
    });
  });
});
