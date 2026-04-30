/**
 * LP FAQ セクション - ユニットテスト
 *
 * Sprint Contract: LP Growth Sprint (統合版 Sprint 1+2+3)
 * 検証対象: V-31, V-32, V-33, V-34
 *
 * テストケース:
 * - TC-LP-FAQ-001: FAQ セクションが LpPricing の後・LpFinalCTA の前に存在する
 * - TC-LP-FAQ-002: FAQ アイテムが 3-4 問存在する
 * - TC-LP-FAQ-003: 必須の FAQ 質問文がすべて含まれる
 * - TC-LP-FAQ-004: FAQPage JSON-LD が LP の <script> タグに出力される
 * - TC-LP-FAQ-005: pricing/page.tsx の FAQ にも FAQPage JSON-LD が存在する
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import LpFaqSection from "@/app/_components/lp/LpFaqSection";

describe("LpFaqSection", () => {
  describe("TC-LP-FAQ-002: FAQ アイテム数", () => {
    it("FAQ アイテムが 3 問以上 4 問以下存在する", () => {
      render(<LpFaqSection />);
      const items = screen.getAllByTestId("lp-faq-item");
      expect(items.length).toBeGreaterThanOrEqual(3);
      expect(items.length).toBeLessThanOrEqual(4);
    });
  });

  describe("TC-LP-FAQ-003: 必須の FAQ 質問文", () => {
    it("「クレジットカード不要」に関する質問が含まれる", () => {
      render(<LpFaqSection />);
      // 質問文と回答文の両方に「クレジットカード」が含まれるため getAllByText を使用
      const elements = screen.getAllByText(/クレジットカード/);
      expect(elements.length).toBeGreaterThanOrEqual(1);
    });

    it("「キャンセル」に関する質問が含まれる", () => {
      render(<LpFaqSection />);
      // 「いつでも解約できますか？」の質問文 + 回答のキャンセル
      const elements = screen.getAllByText(/解約|キャンセル/);
      expect(elements.length).toBeGreaterThanOrEqual(1);
    });

    it("「データはチームを移っても消えない」に関する質問が含まれる", () => {
      render(<LpFaqSection />);
      const elements = screen.getAllByText(/チームを移籍|移っても|記録は消えません/);
      expect(elements.length).toBeGreaterThanOrEqual(1);
    });

    it("「マスターズ選手や一般スイマー」に関する質問が含まれる", () => {
      render(<LpFaqSection />);
      const elements = screen.getAllByText(/マスターズ|一般スイマー/);
      expect(elements.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("TC-LP-FAQ-004: FAQPage JSON-LD 出力", () => {
    it("@type が FAQPage の JSON-LD が含まれる", () => {
      // LpFaqSection は <script type="application/ld+json"> を直接 JSX で出力する。
      // jsdom では script の dangerouslySetInnerHTML はパースされないが、
      // DOM に script 要素が存在することは確認できる。
      const { container } = render(<LpFaqSection />);
      const scripts = container.querySelectorAll('script[type="application/ld+json"]');
      expect(scripts.length).toBeGreaterThanOrEqual(1);
      // スクリプト内容を JSON.parse して @type を確認
      let hasFaqPage = false;
      scripts.forEach((s) => {
        try {
          const data = JSON.parse(s.textContent ?? "{}");
          if (data["@type"] === "FAQPage") hasFaqPage = true;
        } catch {
          // parse error は無視
        }
      });
      expect(hasFaqPage).toBe(true);
    });

    it("mainEntity に Question と acceptedAnswer が含まれる", () => {
      const { container } = render(<LpFaqSection />);
      const scripts = container.querySelectorAll('script[type="application/ld+json"]');
      let faqData: Record<string, unknown> | null = null;
      scripts.forEach((s) => {
        try {
          const data = JSON.parse(s.textContent ?? "{}");
          if (data["@type"] === "FAQPage") faqData = data;
        } catch {
          // parse error は無視
        }
      });
      expect(faqData).not.toBeNull();
      const entities = (faqData as unknown as Record<string, unknown>)["mainEntity"] as unknown[];
      expect(Array.isArray(entities)).toBe(true);
      expect(entities.length).toBeGreaterThanOrEqual(3);
      // 最初のエンティティが Question + acceptedAnswer を持つ
      const first = entities[0] as Record<string, unknown>;
      expect(first["@type"]).toBe("Question");
      expect((first["acceptedAnswer"] as Record<string, unknown>)["@type"]).toBe("Answer");
    });
  });
});
