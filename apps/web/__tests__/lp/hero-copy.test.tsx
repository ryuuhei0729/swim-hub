/**
 * LP Hero コピー・ピルバッジ改善 - ユニットテスト
 *
 * Sprint Contract: LP Growth Sprint (統合版 Sprint 1+2+3)
 * 検証対象: V-26, V-27
 *
 * テストケース:
 * - TC-LP-HERO-001: ピルバッジのフォントサイズが 14px 以上になっている
 * - TC-LP-HERO-002: ピルバッジの色の透明度が 80% 以上 (opacity 0.8+) になっている
 * - TC-LP-HERO-003: サブコピーが短縮されている (100 文字以内)
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import LpHero from "@/app/_components/lp/LpHero";

describe("LpHero ピルバッジとコピー", () => {
  describe("TC-LP-HERO-001: ピルバッジ フォントサイズ", () => {
    it("ピルバッジコンテナの fontSize が 14px 以上になっている (インラインスタイル確認)", () => {
      render(<LpHero />);
      // ピルバッジは LIVE テキストを含むコンテナ
      const liveSpan = screen.getByText("LIVE");
      // pill badge の親コンテナ (div) のスタイルを確認
      const badgeContainer = liveSpan.closest("div");
      expect(badgeContainer).not.toBeNull();
      const fontSize = parseInt(badgeContainer!.style.fontSize ?? "0");
      expect(fontSize).toBeGreaterThanOrEqual(14);
    });
  });

  describe("TC-LP-HERO-002: ピルバッジ 透明度", () => {
    it("ピルバッジコンテナのテキストカラーの alpha 値が 0.80 以上になっている", () => {
      render(<LpHero />);
      const liveSpan = screen.getByText("LIVE");
      const badgeContainer = liveSpan.closest("div");
      expect(badgeContainer).not.toBeNull();
      // color: rgba(10,26,54,X) の X が 0.80 以上
      const color = badgeContainer!.style.color ?? "";
      const alphaMatch = color.match(/rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/);
      if (alphaMatch) {
        const alpha = parseFloat(alphaMatch[1]);
        expect(alpha).toBeGreaterThanOrEqual(0.80);
      } else {
        // rgba でなく solid color (rgb / hex) の場合は alpha 問題なし → PASS
        expect(color.length).toBeGreaterThan(0);
      }
    });
  });

  describe("TC-LP-HERO-003: サブコピー短縮", () => {
    it("サブコピーのテキストが 100 文字以内に収まっている", () => {
      render(<LpHero />);
      // サブコピーは「練習ログ・大会記録・コーチの代理入力」で始まる p 要素
      const subcopy = screen.getByText(/練習ログ・大会記録/);
      expect(subcopy.textContent?.length).toBeLessThanOrEqual(100);
    });
  });
});
