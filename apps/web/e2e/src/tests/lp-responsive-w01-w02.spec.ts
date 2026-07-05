/**
 * W-01/W-02 再検証スペック (LP レスポンシブ修正 v2)
 *
 * W-01: nav signup ボタンが 375px/1280px(de) で nowrap・改行なし
 * W-02: 320px/375px で login と signup が両方表示され重なり・見切れなし
 * 回帰: Hero/Scanner CTA で横スクロール発生なし。Pricing badge/CTA 引き続き1行。
 */
import { test, expect, Page } from "@playwright/test";

const BASE_URL = "http://localhost:3000";
const SCRATCHPAD = "test-results/lp-screenshots";

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

// ≤960px ではヘッダー CTA が非表示になり、ハンバーガーメニュー内に導線が移る。
async function getMenuCtaState(page: Page) {
  return page.evaluate(() => {
    const menu = document.querySelector<HTMLElement>("#nav-menu");
    if (!menu) return null;
    const isVisible = (el: HTMLElement | null) => {
      if (!el) return false;
      const s = window.getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return s.display !== "none" && s.visibility !== "hidden" && r.width > 0 && r.height > 0;
    };
    const links = [...menu.querySelectorAll<HTMLAnchorElement>("a")];
    const login = links.find((a) => a.href.includes("/login")) ?? null;
    const signup = links.find((a) => a.href.includes("/signup")) ?? null;
    return {
      loginVisible: isVisible(login),
      signupVisible: isVisible(signup),
      loginText: login?.textContent?.trim() ?? null,
      signupText: signup?.textContent?.trim() ?? null,
    };
  });
}

// ハンバーガーメニュー内の無料登録ボタンの nowrap/改行状態を取得する。
async function getMenuSignupState(page: Page) {
  return page.evaluate(() => {
    const menu = document.querySelector<HTMLElement>("#nav-menu");
    if (!menu) return null;
    const signup =
      [...menu.querySelectorAll<HTMLAnchorElement>("a")].find((a) => a.href.includes("/signup")) ??
      null;
    if (!signup) return null;
    const s = window.getComputedStyle(signup);
    const r = signup.getBoundingClientRect();
    const pt = parseFloat(s.paddingTop) || 0;
    const pb = parseFloat(s.paddingBottom) || 0;
    const fs = parseFloat(s.fontSize);
    const lhRaw = parseFloat(s.lineHeight);
    const lh = isNaN(lhRaw) ? fs * 1.3 : lhRaw;
    return {
      text: signup.textContent?.trim() ?? null,
      whiteSpace: s.whiteSpace,
      wrapped: r.height > (lh + pt + pb) * 1.8,
      visible: s.display !== "none" && s.visibility !== "hidden" && r.width > 0 && r.height > 0,
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
  test("[W-01] 375px ja: ハンバーガー内の無料登録ボタンが nowrap で改行なし", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${BASE_URL}/ja`, { waitUntil: "domcontentloaded" });

    // モバイルではヘッダーの signup は非表示、導線はハンバーガー内
    const nav = await getNavState(page);
    expect(nav.signupVisible, "375px: ヘッダーの無料登録は非表示").toBe(false);

    await page.click("#nav-burger");
    await page.waitForTimeout(200);
    const menuSignup = await getMenuSignupState(page);
    expect(menuSignup, "メニュー内 signup 検出").not.toBeNull();
    expect(menuSignup!.visible, "メニュー内 signup 表示").toBe(true);
    expect(menuSignup!.whiteSpace, "signup whiteSpace:nowrap").toBe("nowrap");
    expect(menuSignup!.wrapped, `signup 改行なし (text="${menuSignup!.text}")`).toBe(false);

    await page.screenshot({ path: `${SCRATCHPAD}/w01-375-ja.png`, timeout: 15000 });
  });

  test("[W-01] 375px de: ハンバーガー内 Kostenlos registrieren が nowrap で改行なし", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${BASE_URL}/de`, { waitUntil: "domcontentloaded" });

    const nav = await getNavState(page);
    expect(nav.signupVisible, "de 375px: ヘッダーの無料登録は非表示").toBe(false);

    await page.click("#nav-burger");
    await page.waitForTimeout(200);
    const menuSignup = await getMenuSignupState(page);
    expect(menuSignup, "de メニュー内 signup 検出").not.toBeNull();
    expect(menuSignup!.visible, "de メニュー内 signup 表示").toBe(true);
    expect(menuSignup!.whiteSpace, "de signup whiteSpace:nowrap").toBe("nowrap");
    expect(menuSignup!.wrapped, `de signup 改行なし (text="${menuSignup!.text}")`).toBe(false);

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

test.describe("W-02: 320px/375px ハンバーガー内に login+signup 両方表示・横スクロールなし", () => {
  for (const { width, locale } of [
    { width: 320, locale: "ja" },
    { width: 320, locale: "de" },
    { width: 375, locale: "ja" },
    { width: 375, locale: "de" },
  ]) {
    test(`[W-02] ${width}px ${locale}: ハンバーガー内に login と signup が両方表示され横スクロールなし`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 812 });
      await page.goto(`${BASE_URL}/${locale}`, { waitUntil: "domcontentloaded" });

      // モバイルではヘッダー CTA は非表示・横スクロールなし
      const nav = await getNavState(page);
      expect(
        nav.loginVisible,
        `${width}px ${locale}: ヘッダーの login は非表示`,
      ).toBe(false);
      expect(
        nav.signupVisible,
        `${width}px ${locale}: ヘッダーの signup は非表示`,
      ).toBe(false);
      expect(
        nav.hasHorizontalOverflow,
        `${width}px ${locale}: 横スクロールなし`,
      ).toBe(false);

      // ハンバーガーを開くと login/signup が両方表示される
      await page.click("#nav-burger");
      await page.waitForTimeout(200);
      const menu = await getMenuCtaState(page);
      expect(
        menu?.loginVisible,
        `${width}px ${locale}: メニュー内 login 表示 (text="${menu?.loginText}")`,
      ).toBe(true);
      expect(
        menu?.signupVisible,
        `${width}px ${locale}: メニュー内 signup 表示 (text="${menu?.signupText}")`,
      ).toBe(true);

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
