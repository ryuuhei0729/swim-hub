/**
 * LP UX / ブラウザ実機検証 - E2E テスト
 *
 * Sprint Contract: LP Growth Sprint (統合版 Sprint 1+2+3)
 * 検証対象: V-20 〜 V-39 (Sprint 2 + 3 + ブラウザ実機)
 *
 * 前提: E2E_BASE_URL=http://localhost:3000 が設定されていること
 *
 * テストケース:
 * - TC-UX-001: LP が正常に表示される (200 + 主要セクション)
 * - TC-UX-002: LpFinalCTA の iOS App Store リンクが実 URL を持ち target=_blank
 * - TC-UX-003: LpScannerBlock に disabled ボタンが存在しない
 * - TC-UX-004: LP に β 版バッジが表示される
 * - TC-UX-005: FAQ セクションが LpPricing の後・LpFinalCTA の前に存在する
 * - TC-UX-006: FAQ アイテムが 3-4 問存在する
 * - TC-UX-007: ペルソナ別 3 カラム (選手 / コーチ / 保護者) が表示される
 * - TC-UX-008: モバイル幅 (375px) で LP が崩れない
 * - TC-UX-009: pricing ページの canonical が絶対 URL
 */

import { expect, test } from "@playwright/test";

const baseUrl = process.env.E2E_BASE_URL || process.env.BASE_URL || "http://localhost:3000";

test.describe("LP 基本表示確認", () => {
  test("TC-UX-001: LP が正常に表示され主要セクションが存在する", async ({ page }) => {
    await page.goto(`${baseUrl}/`);
    await page.waitForLoadState("networkidle");

    // Hero セクション
    await expect(page.locator("h1")).toBeVisible();
    // 無料で始めるボタン (複数あり得るので first)
    await expect(page.locator('a[href="/signup"]').first()).toBeVisible();
    // LpPricing セクション
    await expect(page.locator("#lp-pricing")).toBeVisible();
    // LpFinalCTA セクション
    await expect(page.locator("#lp-final-cta")).toBeVisible();
  });
});

test.describe("TC-UX-002: iOS App Store リンク (Sprint 2)", () => {
  test("LpFinalCTA に App Store の実 URL リンクが存在し target=_blank", async ({ page }) => {
    await page.goto(`${baseUrl}/`);
    await page.waitForLoadState("networkidle");

    // App Store リンクを取得
    const appStoreLink = page.locator('#lp-final-cta a[href*="apple.com"], #lp-final-cta a[href*="apps.apple.com"]');
    await expect(appStoreLink).toBeVisible();
    await expect(appStoreLink).toHaveAttribute("target", "_blank");
    const rel = await appStoreLink.getAttribute("rel");
    expect(rel).toMatch(/noopener/);
  });

  test("LpFinalCTA に disabled ボタン「App Store · 準備中」が存在しない", async ({ page }) => {
    await page.goto(`${baseUrl}/`);
    const disabledBtn = page.locator('#lp-final-cta button[disabled]');
    await expect(disabledBtn).toHaveCount(0);
  });
});

test.describe("TC-UX-003: LpScannerBlock disabled ボタン除去 (Sprint 2)", () => {
  test("LpScannerBlock に disabled ボタンが存在しない", async ({ page }) => {
    await page.goto(`${baseUrl}/`);
    const disabledBtn = page.locator('#lp-scanner button[disabled]');
    await expect(disabledBtn).toHaveCount(0);
  });
});

test.describe("TC-UX-004: β 版バッジ (Sprint 3)", () => {
  test("LP に β 版またはパブリック公開バッジが表示される", async ({ page }) => {
    await page.goto(`${baseUrl}/`);
    await page.waitForLoadState("networkidle");
    // β, ベータ, パブリック公開中 のいずれか
    const badge = page.locator("text=/β|ベータ|パブリック公開中|PUBLIC BETA/i").first();
    await expect(badge).toBeVisible();
  });
});

test.describe("TC-UX-005/006: FAQ セクション位置と問数 (Sprint 3)", () => {
  test("FAQ セクションが LpPricing の後・LpFinalCTA の前に存在する", async ({ page }) => {
    await page.goto(`${baseUrl}/`);
    await page.waitForLoadState("networkidle");

    // DOM 順: #lp-pricing → FAQ section → #lp-final-cta
    const pricingBox = await page.locator("#lp-pricing").boundingBox();
    const finalCtaBox = await page.locator("#lp-final-cta").boundingBox();
    // FAQ セクションを id or data-testid で特定 (Developer が付与する想定)
    const faqSection = page.locator('[data-testid="lp-faq-section"], #lp-faq');
    await expect(faqSection).toBeVisible();
    const faqBox = await faqSection.boundingBox();

    expect(pricingBox).not.toBeNull();
    expect(finalCtaBox).not.toBeNull();
    expect(faqBox).not.toBeNull();
    // FAQ が pricing より下にある
    expect(faqBox!.y).toBeGreaterThan(pricingBox!.y);
    // FAQ が final CTA より上にある
    expect(faqBox!.y).toBeLessThan(finalCtaBox!.y);
  });

  test("FAQ アイテムが 3 問以上 4 問以下存在する", async ({ page }) => {
    await page.goto(`${baseUrl}/`);
    await page.waitForLoadState("networkidle");
    const faqItems = page.locator('[data-testid="lp-faq-item"]');
    const count = await faqItems.count();
    expect(count).toBeGreaterThanOrEqual(3);
    expect(count).toBeLessThanOrEqual(4);
  });
});

test.describe("TC-UX-007: ペルソナ別 3 カラム (Sprint 3)", () => {
  test("選手 / コーチ / 保護者 の 3 カラムが表示される", async ({ page }) => {
    await page.goto(`${baseUrl}/`);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("text=選手").first()).toBeVisible();
    await expect(page.locator("text=コーチ").first()).toBeVisible();
    await expect(page.locator("text=保護者").first()).toBeVisible();
  });
});

test.describe("TC-UX-008: モバイル幅レスポンシブ (375px)", () => {
  test("モバイル幅 375px で LP が水平スクロールなく表示される", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${baseUrl}/`);
    await page.waitForLoadState("networkidle");

    // 水平スクロールバーが発生していないことを確認
    const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
    const clientWidth = await page.evaluate(() => document.body.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 5); // 5px の余裕

    // 主要セクションが表示されている
    await expect(page.locator("h1").first()).toBeVisible();
    await expect(page.locator("#lp-pricing")).toBeVisible();
  });
});

test.describe("TC-UX-009: pricing canonical (Sprint 1)", () => {
  test("pricing ページの canonical が絶対 URL (https://swim-hub.app/pricing)", async ({ page }) => {
    await page.goto(`${baseUrl}/pricing`);
    const canonical = await page.$eval(
      'link[rel="canonical"]',
      (el) => el.getAttribute("href"),
    );
    expect(canonical).toMatch(/^https:\/\/swim-hub\.app\/pricing/);
  });
});
