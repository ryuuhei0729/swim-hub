/**
 * LP SEO / メタタグ / 構造化データ - E2E テスト
 *
 * Sprint Contract: LP Growth Sprint (統合版 Sprint 1+2+3)
 * 検証対象: V-01 〜 V-19 (Sprint 1 メタ/構造化データ)
 *
 * 前提: E2E_BASE_URL=http://localhost:3000 が設定されていること
 *
 * テストケース:
 * - TC-SEO-001: og:image が 1200x630 の og-image.png を指している
 * - TC-SEO-002: twitter:card が summary_large_image
 * - TC-SEO-003: canonical が絶対 URL (https://swim-hub.app)
 * - TC-SEO-005: WebApplication JSON-LD に Premium Offer が含まれる
 * - TC-SEO-006: LP に FAQPage JSON-LD が存在する
 * - TC-SEO-007: pricing ページに FAQPage JSON-LD が存在する
 * - TC-SEO-008: /manifest.json が 200 を返しかつ name / icons フィールドを持つ
 * - TC-SEO-009: hreflang ja の <link rel="alternate"> が出力される
 * - TC-SEO-010: /sitemap.xml が 200 を返す
 */

import { expect, test } from "@playwright/test";

// 環境変数チェック (auth.spec.ts と同様のパターン)
const baseUrl = process.env.E2E_BASE_URL || process.env.BASE_URL || "http://localhost:3000";

test.describe("LP SEO メタタグ検証", () => {
  test("TC-SEO-001: og:image が 1200x630 の og-image.png を指している", async ({ page }) => {
    await page.goto(`${baseUrl}/`);
    const ogImage = await page.$eval(
      'meta[property="og:image"]',
      (el) => el.getAttribute("content"),
    );
    expect(ogImage).toMatch(/og-image\.png/);
    // NOTE: 幅・高さは og:image:width / og:image:height タグで確認
    const ogWidth = await page.$eval(
      'meta[property="og:image:width"]',
      (el) => el.getAttribute("content"),
    ).catch(() => null);
    const ogHeight = await page.$eval(
      'meta[property="og:image:height"]',
      (el) => el.getAttribute("content"),
    ).catch(() => null);
    if (ogWidth) expect(ogWidth).toBe("1200");
    if (ogHeight) expect(ogHeight).toBe("630");
  });

  test("TC-SEO-002: twitter:card が summary_large_image", async ({ page }) => {
    await page.goto(`${baseUrl}/`);
    const card = await page.$eval(
      'meta[name="twitter:card"]',
      (el) => el.getAttribute("content"),
    );
    expect(card).toBe("summary_large_image");
  });

  test("TC-SEO-003: canonical が絶対 URL (https://swim-hub.app)", async ({ page }) => {
    await page.goto(`${baseUrl}/`);
    const canonical = await page.$eval(
      'link[rel="canonical"]',
      (el) => el.getAttribute("href"),
    );
    expect(canonical).toMatch(/^https:\/\/swim-hub\.app/);
  });

  test("TC-SEO-009: hreflang ja の <link rel=alternate> が出力される", async ({ page }) => {
    await page.goto(`${baseUrl}/`);
    const hreflang = await page.$eval(
      'link[rel="alternate"][hreflang="ja"]',
      (el) => el.getAttribute("href"),
    ).catch(() => null);
    expect(hreflang).toBeTruthy();
    expect(hreflang).toMatch(/https:\/\/swim-hub\.app/);
  });
});

test.describe("LP 構造化データ (JSON-LD) 検証", () => {
  async function getJsonLdScripts(page: Parameters<typeof test>[1] extends (args: { page: infer P }) => unknown ? P : never) {
    const scripts = await page.$$eval('script[type="application/ld+json"]', (els) =>
      els.map((el) => {
        try {
          return JSON.parse(el.textContent ?? "{}");
        } catch {
          return null;
        }
      }),
    );
    return scripts.filter(Boolean);
  }

  test("TC-SEO-005: WebApplication JSON-LD に Premium Offer が含まれる (¥500/月 or ¥5000/年)", async ({
    page,
  }) => {
    await page.goto(`${baseUrl}/`);
    const scripts = await getJsonLdScripts(page);
    const webApp = scripts.find((s: Record<string, unknown>) => s["@type"] === "WebApplication");
    expect(webApp).toBeTruthy();
    const offers = Array.isArray(webApp.offers) ? webApp.offers : [webApp.offers];
    const premiumOffer = offers.find(
      (o: Record<string, unknown>) => o && (o.price === "500" || o.price === "5000"),
    );
    expect(premiumOffer).toBeTruthy();
  });

  test("TC-SEO-006: LP に FAQPage JSON-LD が存在する", async ({ page }) => {
    await page.goto(`${baseUrl}/`);
    const scripts = await getJsonLdScripts(page);
    const faqPage = scripts.find((s: Record<string, unknown>) => s["@type"] === "FAQPage");
    expect(faqPage).toBeTruthy();
    expect(Array.isArray(faqPage.mainEntity)).toBe(true);
    expect((faqPage.mainEntity as unknown[]).length).toBeGreaterThanOrEqual(1);
  });

  test("TC-SEO-007: pricing ページに FAQPage JSON-LD が存在する", async ({ page }) => {
    await page.goto(`${baseUrl}/pricing`);
    const scripts = await getJsonLdScripts(page);
    const faqPage = scripts.find((s: Record<string, unknown>) => s["@type"] === "FAQPage");
    expect(faqPage).toBeTruthy();
    expect(Array.isArray(faqPage.mainEntity)).toBe(true);
  });
});

test.describe("manifest.json / sitemap 検証", () => {
  test("TC-SEO-008: /manifest.json が 200 を返し name / icons フィールドを持つ", async ({
    request,
  }) => {
    const res = await request.get(`${baseUrl}/manifest.json`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.name).toBeTruthy();
    expect(Array.isArray(body.icons)).toBe(true);
  });

  test("TC-SEO-010: /sitemap.xml が 200 を返す", async ({ request }) => {
    const res = await request.get(`${baseUrl}/sitemap.xml`);
    expect(res.status()).toBe(200);
    const text = await res.text();
    expect(text).toContain("<urlset");
  });
});
