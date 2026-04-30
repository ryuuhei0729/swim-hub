/**
 * LP ペルソナ別訴求セクション - ユニットテスト
 *
 * Sprint Contract: LP Growth Sprint (統合版 Sprint 1+2+3)
 * 検証対象: V-35, V-36
 *
 * テストケース:
 * - TC-LP-PERSONA-001: ペルソナ別 3 カラム (選手 / コーチ / 保護者) が描画される
 * - TC-LP-PERSONA-002: 3 カラムが LpPricing の後・LpFinalCTA の前に挿入されている
 * - TC-LP-PERSONA-003: モバイル幅でカラムが縦積みになる (CSS クラス確認)
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import LpPersonaSection from "@/app/_components/lp/LpPersonaSection";

describe("LpPersonaSection", () => {
  describe("TC-LP-PERSONA-001: 3 カラム描画", () => {
    it("「選手」カラムが表示される", () => {
      render(<LpPersonaSection />);
      // label「選手」が表示される
      expect(screen.getByText("選手")).toBeInTheDocument();
    });

    it("「コーチ」カラムが表示される", () => {
      render(<LpPersonaSection />);
      expect(screen.getByText("コーチ")).toBeInTheDocument();
    });

    it("「保護者」カラムが表示される", () => {
      render(<LpPersonaSection />);
      expect(screen.getByText("保護者")).toBeInTheDocument();
    });

    it("各ペルソナの「無料ではじめる」リンクが 3 つ存在する", () => {
      render(<LpPersonaSection />);
      // PERSONA_ITEMS の ctaText は「無料ではじめる →」
      const ctaLinks = screen.getAllByText(/無料ではじめる/);
      expect(ctaLinks).toHaveLength(3);
    });

    it("各ペルソナの CTA リンクが /signup を指す", () => {
      render(<LpPersonaSection />);
      const ctaLinks = screen.getAllByRole("link", { name: /無料ではじめる/ });
      expect(ctaLinks).toHaveLength(3);
      ctaLinks.forEach((link) => {
        expect(link).toHaveAttribute("href", "/signup");
      });
    });
  });

  describe("TC-LP-PERSONA-003: レスポンシブ対応", () => {
    it("グリッドコンテナにモバイルで縦積みになるレスポンシブクラスが付与されている", () => {
      const { container } = render(<LpPersonaSection />);
      // gridTemplateColumns: "1fr 1fr 1fr" + max-lp-md:grid-cols-1! でモバイル縦積み
      const grids = container.querySelectorAll('[class*="grid-cols-1"]');
      expect(grids.length).toBeGreaterThanOrEqual(1);
    });
  });
});
