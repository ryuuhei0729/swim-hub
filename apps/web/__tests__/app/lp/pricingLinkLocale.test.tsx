/**
 * LP 料金セクション: リンクが現在の locale を保つことの回帰テスト
 *
 * 背景:
 *   LpPricing の 3 本のリンク (無料プラン CTA / 有料プラン CTA / 料金詳細) は
 *   `https://swim-hub.app/ja/...` と絶対 URL でハードコードされていた。
 *   localePrefix: "always" のため、en/zh/ko/de で LP を見ている閲覧者が
 *   サインアップしようとすると ja に飛ばされていた。
 *
 * 検証方針:
 *   ja 以外の locale で描画し、href を実際に読んで locale が保たれることを見る。
 *   ハードコードに戻すと [V-02] が赤になる。
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import LpPricing from "@/app/[locale]/_components/lp/LpPricing";

const t = {
  label: "PRICING",
  h2: "料金",
  lead: "lead",
  detailLink: "料金の詳細",
  free: { name: "Free", price: "¥0", note: "note", items: ["a"], cta: "無料ではじめる" },
  premium: {
    name: "Premium",
    price: "¥500",
    badge: "badge",
    annualNote: "annual",
    items: ["b"],
    cta: "プレミアムにする",
  },
};

function hrefsFor(locale: string): string[] {
  const { container } = render(<LpPricing locale={locale} t={t} />);
  return Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href") ?? "");
}

describe("LpPricing: リンクの locale 保持", () => {
  it("[V-01-control] リンクは 3 本あり、行き先は signup 2 本と pricing 1 本", () => {
    const hrefs = hrefsFor("ja");
    expect(hrefs).toHaveLength(3);
    expect(hrefs.filter((h) => h.endsWith("/signup"))).toHaveLength(2);
    expect(hrefs.filter((h) => h.endsWith("/pricing"))).toHaveLength(1);
  });

  it("[V-02] ja 以外の locale でも自分の locale に留まる (ja へ強制送還されない)", () => {
    for (const locale of ["en", "zh", "ko", "de"]) {
      const hrefs = hrefsFor(locale);
      expect(hrefs).toEqual([`/${locale}/signup`, `/${locale}/signup`, `/${locale}/pricing`]);
    }
  });

  it("[V-03] href は絶対 URL でなく locale プレフィックス付きの相対パス", () => {
    for (const href of hrefsFor("en")) {
      expect(href.startsWith("/en/")).toBe(true);
      expect(href).not.toContain("swim-hub.app");
    }
  });

  it("[V-04] detailLink のテキストが料金詳細リンクに乗っている", () => {
    render(<LpPricing locale="de" t={t} />);
    expect(screen.getByText("料金の詳細").getAttribute("href")).toBe("/de/pricing");
  });
});
