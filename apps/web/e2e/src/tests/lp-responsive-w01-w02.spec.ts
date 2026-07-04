/**
 * W-01/W-02 再検証スペック (LP レスポンシブ修正 v2)
 *
 * W-01: nav signup ボタンが 375px/1280px(de) で nowrap・改行なし
 * W-02: 320px/375px で login と signup が両方表示され重なり・見切れなし
 * 回帰: Hero/Scanner CTA で横スクロール発生なし。Pricing badge/CTA 引き続き1行。
 */
import { test, expect, Page } from "@playwright/test";

const BASE_URL = "http://localhost:3000";
const SCRATCHPAD = "/private/tmp/claude-501/-Users-ryuuhei-0729-SwimHub/a1c4c781-35f1-4a42-a997-2aaabadaed1b/scratchpad/screenshots";

// ---- helpers ----

async function getNavState(page: Page) {
  return page.evaluate(() => {
    const loginEl = document.querySelector<HTMLElement>(".lp-nav-login");
    const signupEl = document.querySelector<HTMLElement>(".lp-nav-signup");
    const burger = document.querySelector<HTMLElement>(".lp-nav-burger");

    const isVisible = (el: HTMLElement | null) => {
      if (!el) return false;
      const s = window.getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return s.display !== "none" && s.visibility !== "hidden" && r.width > 0 && r.height > 0;
    };

    const getWhiteSpace = (el: HTMLElement | null) =>
      el ? window.getComputedStyle(el).whiteSpace : null;

    // Overlap detection: do login and signup rects overlap?
    const loginRect = loginEl?.getBoundingClientRect() ?? null;
    const signupRect = signupEl?.getBoundingClientRect() ?? null;
    let overlap = false;
    if (loginRect && signupRect) {
      overlap = !(
        loginRect.right <= signupRect.left ||
        signupRect.right <= loginRect.left ||
        loginRect.bottom <= signupRect.top ||
        signupRect.bottom <= loginRect.top
      );
    }

    // Are they fully within the viewport (no clipping)?
    const vw = window.innerWidth;
    const loginClipped = loginRect ? loginRect.right > vw + 1 || loginRect.left < -1 : false;
    const signupClipped = signupRect ? signupRect.right > vw + 1 || signupRect.left < -1 : false;

    // Horizontal overflow
    const hasHorizontalOverflow = document.documentElement.scrollWidth > document.body.clientWidth + 1;

    // Signup button wrapping: compare its own height to expected single-line height
    const signupWrapped = (() => {
      if (!signupEl) return null;
      const s = window.getComputedStyle(signupEl);
      const r = signupEl.getBoundingClientRect();
      const pt = parseFloat(s.paddingTop) || 0;
      const pb = parseFloat(s.paddingBottom) || 0;
      const fs = parseFloat(s.fontSize);
      const lhRaw = parseFloat(s.lineHeight);
      const lh = isNaN(lhRaw) ? fs * 1.3 : lhRaw;
      return r.height > (lh + pt + pb) * 1.8;
    })();

    return {
      loginVisible: isVisible(loginEl),
      signupVisible: isVisible(signupEl),
      loginText: loginEl?.textContent?.trim() ?? null,
      signupText: signupEl?.textContent?.trim() ?? null,
      loginWhiteSpace: getWhiteSpace(loginEl),
      signupWhiteSpace: getWhiteSpace(signupEl),
      signupWrapped,
      overlap,
      loginClipped,
      signupClipped,
      hasHorizontalOverflow,
      loginRect: loginRect ? { left: Math.round(loginRect.left), right: Math.round(loginRect.right), top: Math.round(loginRect.top), bottom: Math.round(loginRect.bottom) } : null,
      signupRect: signupRect ? { left: Math.round(signupRect.left), right: Math.round(signupRect.right), top: Math.round(signupRect.top), bottom: Math.round(signupRect.bottom) } : null,
    };
  });
}

async function checkPageOverflow(page: Page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.body.clientWidth,
    hasOverflow: document.documentElement.scrollWidth > document.body.clientWidth + 1,
  }));
}

// ---- W-01: signup nowrap 再確認 ----

test.describe("W-01: nav signup ボタン nowrap", () => {
  test("[W-01] 375px ja: 無料登録ボタンが nowrap で改行なし", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${BASE_URL}/ja`, { waitUntil: "domcontentloaded" });

    const nav = await getNavState(page);

    expect(nav.signupWhiteSpace, "signup whiteSpace:nowrap").toBe("nowrap");
    expect(nav.signupWrapped, `signup 改行なし (text="${nav.signupText}")`).toBe(false);
    expect(nav.signupVisible, "signup 表示").toBe(true);

    await page.screenshot({ path: `${SCRATCHPAD}/w01-375-ja.png`, timeout: 15000 });
  });

  test("[W-01] 375px de: Kostenlos registrieren が nowrap で改行なし", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${BASE_URL}/de`, { waitUntil: "domcontentloaded" });

    const nav = await getNavState(page);

    expect(nav.signupWhiteSpace, "de signup whiteSpace:nowrap").toBe("nowrap");
    expect(nav.signupWrapped, `de signup 改行なし (text="${nav.signupText}")`).toBe(false);
    expect(nav.signupVisible, "de signup 表示").toBe(true);

    await page.screenshot({ path: `${SCRATCHPAD}/w01-375-de.png`, timeout: 15000 });
  });

  test("[W-01] 1280px de: スクロールバー存在時も signup が nowrap で改行なし", async ({ page }) => {
    // Force scrollbar by making page tall
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${BASE_URL}/de`, { waitUntil: "domcontentloaded" });
    // Scroll down to trigger scrollbar presence (pricing section)
    await page.evaluate(() => document.querySelector("#pricing")?.scrollIntoView());
    await page.waitForTimeout(300);

    const nav = await getNavState(page);

    expect(nav.signupWhiteSpace, "de 1280px signup whiteSpace:nowrap").toBe("nowrap");
    expect(nav.signupWrapped, `de 1280px signup 改行なし (text="${nav.signupText}")`).toBe(false);
    expect(nav.signupVisible, "de 1280px signup 表示").toBe(true);

    await page.screenshot({ path: `${SCRATCHPAD}/w01-1280-de-scrolled.png`, timeout: 15000 });
  });
});

// ---- W-02: 320px/375px 両方表示・重なりなし ----

test.describe("W-02: 320px/375px login+signup 両方表示・重なりなし", () => {
  for (const { width, locale } of [
    { width: 320, locale: "ja" },
    { width: 320, locale: "de" },
    { width: 375, locale: "ja" },
    { width: 375, locale: "de" },
  ]) {
    test(`[W-02] ${width}px ${locale}: login と signup が両方表示され重なり・見切れなし`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 812 });
      await page.goto(`${BASE_URL}/${locale}`, { waitUntil: "domcontentloaded" });

      const nav = await getNavState(page);

      expect(
        nav.loginVisible,
        `${width}px ${locale}: login 表示 (text="${nav.loginText}")`,
      ).toBe(true);
      expect(
        nav.signupVisible,
        `${width}px ${locale}: signup 表示 (text="${nav.signupText}")`,
      ).toBe(true);

      expect(
        nav.overlap,
        `${width}px ${locale}: login/signup 重なりなし (login=${JSON.stringify(nav.loginRect)} signup=${JSON.stringify(nav.signupRect)})`,
      ).toBe(false);

      expect(
        nav.loginClipped,
        `${width}px ${locale}: login がビューポート外にはみ出していない`,
      ).toBe(false);
      expect(
        nav.signupClipped,
        `${width}px ${locale}: signup がビューポート外にはみ出していない`,
      ).toBe(false);

      await page.screenshot({ path: `${SCRATCHPAD}/w02-${width}-${locale}.png`, timeout: 15000 });
    });
  }
});

// ---- 回帰: Hero/Scanner CTA 横スクロールなし ----

test.describe("回帰: Hero/Scanner CTA nowrap — 横スクロール発生なし", () => {
  for (const { width, locale } of [
    { width: 375, locale: "ja" },
    { width: 375, locale: "de" },
    { width: 320, locale: "de" },
  ]) {
    test(`[回帰-Hero] ${width}px ${locale}: Hero CTA で横スクロールなし`, async ({ page }) => {
      await page.setViewportSize({ width, height: 812 });
      await page.goto(`${BASE_URL}/${locale}`, { waitUntil: "domcontentloaded" });
      await page.evaluate(() => document.querySelector("#top")?.scrollIntoView());

      const overflow = await checkPageOverflow(page);
      expect(
        overflow.hasOverflow,
        `${width}px ${locale}: 横スクロールなし (scroll=${overflow.scrollWidth} client=${overflow.clientWidth})`,
      ).toBe(false);

      await page.screenshot({ path: `${SCRATCHPAD}/regression-hero-${width}-${locale}.png`, timeout: 15000 });
    });
  }

  for (const { width, locale } of [
    { width: 375, locale: "de" },
    { width: 320, locale: "de" },
  ]) {
    test(`[回帰-Scanner] ${width}px ${locale}: Scanner CTA で横スクロールなし`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 812 });
      await page.goto(`${BASE_URL}/${locale}`, { waitUntil: "domcontentloaded" });
      await page.evaluate(() => {
        const scanner = document.querySelector<HTMLElement>(".rv");
        if (scanner) scanner.scrollIntoView();
      });

      const overflow = await checkPageOverflow(page);
      expect(
        overflow.hasOverflow,
        `Scanner ${width}px ${locale}: 横スクロールなし`,
      ).toBe(false);
    });
  }
});

// ---- 回帰: Pricing badge/CTA 引き続き1行 ----

test.describe("回帰: Pricing badge/CTA 1行維持", () => {
  for (const locale of ["ja", "de"]) {
    test(`[回帰-Pricing] 1280px ${locale}: Premium badge/CTA/Free CTA 改行なし`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(`${BASE_URL}/${locale}#pricing`, { waitUntil: "domcontentloaded" });
      await page.evaluate(() => document.querySelector("#pricing")?.scrollIntoView());
      await page.waitForTimeout(300);

      const result = await page.evaluate(() => {
        const pricingSection = document.querySelector<HTMLElement>("#pricing");
        if (!pricingSection) return null;
        const articles = pricingSection.querySelectorAll<HTMLElement>("article");
        if (articles.length < 2) return null;

        const freeCard = articles[0];
        const premiumCard = articles[1];
        const premiumBadge = premiumCard.querySelector<HTMLElement>('div > span[style*="border"]');
        const premiumCta = premiumCard.querySelector<HTMLElement>("a");
        const freeCta = freeCard.querySelector<HTMLElement>("a");

        const check = (el: HTMLElement | null) => {
          if (!el) return null;
          const s = window.getComputedStyle(el);
          const r = el.getBoundingClientRect();
          const pt = parseFloat(s.paddingTop) || 0;
          const pb = parseFloat(s.paddingBottom) || 0;
          const fs = parseFloat(s.fontSize);
          const lhRaw = parseFloat(s.lineHeight);
          const lh = isNaN(lhRaw) ? fs * 1.3 : lhRaw;
          return {
            text: el.textContent?.trim(),
            ws: s.whiteSpace,
            wrapped: r.height > (lh + pt + pb) * 1.8,
          };
        };

        return {
          badge: check(premiumBadge),
          premiumCta: check(premiumCta),
          freeCta: check(freeCta),
        };
      });

      expect(result, "pricing section 検出").not.toBeNull();
      if (result) {
        expect(result.badge?.ws, `${locale} badge nowrap`).toBe("nowrap");
        expect(result.badge?.wrapped, `${locale} badge 改行なし (text="${result.badge?.text}")`).toBe(false);
        expect(result.premiumCta?.ws, `${locale} premium CTA nowrap`).toBe("nowrap");
        expect(result.premiumCta?.wrapped, `${locale} premium CTA 改行なし (text="${result.premiumCta?.text}")`).toBe(false);
        expect(result.freeCta?.ws, `${locale} free CTA nowrap`).toBe("nowrap");
        expect(result.freeCta?.wrapped, `${locale} free CTA 改行なし (text="${result.freeCta?.text}")`).toBe(false);
      }

      await page.screenshot({ path: `${SCRATCHPAD}/regression-pricing-1280-${locale}.png`, timeout: 15000 });
    });
  }
});
