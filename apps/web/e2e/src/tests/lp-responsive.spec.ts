/**
 * LP レスポンシブ修正 検証スペック
 *
 * Sprint Contract Verification Checklist (Phase B):
 * V-01: Desktop 1280px — ヘッダーにログイン/無料登録が両方表示
 * V-02: Tablet 960px  — ヘッダーにログイン/無料登録が両方表示 (ハンバーガーと共存)
 * V-03: Mobile 375px  — ヘッダーにログイン/無料登録が両方表示
 * V-04: 320px         — ヘッダーが破綻しない (横スクロールなし)
 * V-05: 5言語         — ヘッダーのCTAが1行に収まる (特に de)
 * V-06: Pricing       — Premium badge 改行なし (特に de)
 * V-07: Pricing       — Premium CTA 改行なし (特に de)
 * V-08: Pricing       — Free CTA 改行なし
 * V-09: FinalCta      — signup/login 改行なし (特に de)
 * V-10: 回帰          — ハンバーガーメニュー open/close
 * V-11: 回帰          — ハンバーガー内ログイン重複削除後、ヘッダーにログイン導線1つ残存
 */
import { test, expect, Page } from "@playwright/test";

const BASE_URL = "http://localhost:3000";

// ---- helpers ----

async function getNavState(page: Page) {
  return page.evaluate(() => {
    const loginEl = document.querySelector<HTMLElement>(".lp-nav-login");
    const burger = document.querySelector<HTMLElement>(".lp-nav-burger");

    const isVisible = (el: HTMLElement | null) => {
      if (!el) return false;
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0;
    };

    const ctaItems = [
      ...document.querySelectorAll<HTMLElement>(".lp-nav-cta a, .lp-nav-cta button"),
    ].map((el) => ({
      text: el.textContent?.trim() ?? "",
      visible: isVisible(el),
      href: (el as HTMLAnchorElement).href ?? "",
    }));

    const bodyWidth = document.body.clientWidth;
    const scrollWidth = document.documentElement.scrollWidth;

    return {
      loginVisible: isVisible(loginEl),
      loginText: loginEl?.textContent?.trim() ?? null,
      ctaItems,
      burgerVisible: isVisible(burger),
      hasHorizontalOverflow: scrollWidth > bodyWidth + 1,
      bodyWidth,
      scrollWidth,
    };
  });
}

async function getPricingButtonState(page: Page) {
  return page.evaluate(() => {
    const pricingSection = document.querySelector<HTMLElement>("#pricing");
    if (!pricingSection) return null;

    const articles = pricingSection.querySelectorAll<HTMLElement>("article");
    if (articles.length < 2) return null;

    const freeCard = articles[0];
    const premiumCard = articles[1];

    // Premium badge: the span with border inside premium card header
    const premiumBadge = premiumCard.querySelector<HTMLElement>(
      'div > span[style*="border"]',
    );
    const premiumCta = premiumCard.querySelector<HTMLElement>("a");
    const freeCta = freeCard.querySelector<HTMLElement>("a");

    const getWhiteSpace = (el: HTMLElement | null) =>
      el ? window.getComputedStyle(el).whiteSpace : null;

    /**
     * Detect wrapping by comparing the element's scrollWidth to its clientWidth.
     * If whiteSpace:nowrap is set, text cannot wrap — scrollWidth > clientWidth means
     * the text is wider than the container (overflowing), NOT wrapping.
     * True wrapping would increase the element's own height beyond a single line.
     * We detect this by: element height > (lineHeight + paddingTop + paddingBottom) * 1.8
     * which indicates 2+ lines of text.
     */
    const isWrapped = (el: HTMLElement | null) => {
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      const paddingTop = parseFloat(style.paddingTop) || 0;
      const paddingBottom = parseFloat(style.paddingBottom) || 0;
      const fontSize = parseFloat(style.fontSize);
      // Use lineHeight if it's a number, otherwise fall back to 1.3x fontSize
      const lhRaw = parseFloat(style.lineHeight);
      const lineHeight = isNaN(lhRaw) ? fontSize * 1.3 : lhRaw;
      // Single-line height = lineHeight + vertical padding
      const singleLineHeight = lineHeight + paddingTop + paddingBottom;
      // Wrapped if total height > 1.8x single line height
      return rect.height > singleLineHeight * 1.8;
    };

    return {
      premiumBadge: {
        text: premiumBadge?.textContent?.trim() ?? null,
        whiteSpace: getWhiteSpace(premiumBadge),
        wrapped: isWrapped(premiumBadge),
      },
      premiumCta: {
        text: premiumCta?.textContent?.trim() ?? null,
        whiteSpace: getWhiteSpace(premiumCta),
        wrapped: isWrapped(premiumCta),
      },
      freeCta: {
        text: freeCta?.textContent?.trim() ?? null,
        whiteSpace: getWhiteSpace(freeCta),
        wrapped: isWrapped(freeCta),
      },
    };
  });
}

async function getFinalCtaState(page: Page) {
  return page.evaluate(() => {
    const container = document.querySelector<HTMLElement>(".lp-final-ctas");
    if (!container) return null;

    const links = [...container.querySelectorAll<HTMLElement>("a")];
    return links.map((el) => {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const paddingTop = parseFloat(style.paddingTop) || 0;
      const paddingBottom = parseFloat(style.paddingBottom) || 0;
      const fontSize = parseFloat(style.fontSize);
      const lhRaw = parseFloat(style.lineHeight);
      const lineHeight = isNaN(lhRaw) ? fontSize * 1.3 : lhRaw;
      const singleLineHeight = lineHeight + paddingTop + paddingBottom;
      return {
        text: el.textContent?.trim() ?? "",
        whiteSpace: style.whiteSpace,
        wrapped: rect.height > singleLineHeight * 1.8,
      };
    });
  });
}

// ---- tests ----

test.describe("LP レスポンシブ修正 検証", () => {
  // V-01: Desktop 1280px
  test("[V-01] Desktop 1280px: ヘッダーにログイン/無料登録が両方表示される", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${BASE_URL}/ja`, { waitUntil: "domcontentloaded" });

    const nav = await getNavState(page);

    expect(nav.loginVisible, "ログインリンクが表示されていること").toBe(true);
    expect(nav.loginText, "ログインテキスト確認").toBe("ログイン");

    const signupVisible = nav.ctaItems.some((i) => i.visible && i.text === "無料登録");
    expect(signupVisible, "無料登録ボタンが表示されていること").toBe(true);

    expect(nav.hasHorizontalOverflow, "横スクロールが発生していないこと").toBe(false);

    await page.screenshot({
      path: "/private/tmp/claude-501/-Users-ryuuhei-0729-SwimHub/a1c4c781-35f1-4a42-a997-2aaabadaed1b/scratchpad/screenshots/v01-1280-ja.png",
    });
  });

  // V-02: Tablet 960px
  test("[V-02] Tablet 960px: ヘッダーにログイン/無料登録が表示され、ハンバーガーも表示される", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 960, height: 800 });
    await page.goto(`${BASE_URL}/ja`, { waitUntil: "domcontentloaded" });

    const nav = await getNavState(page);

    expect(nav.loginVisible, "ログインリンクが表示されていること").toBe(true);

    const signupVisible = nav.ctaItems.some((i) => i.visible && i.text === "無料登録");
    expect(signupVisible, "無料登録ボタンが表示されていること").toBe(true);

    expect(nav.burgerVisible, "ハンバーガーボタンが表示されていること").toBe(true);
    expect(nav.hasHorizontalOverflow, "横スクロールなし").toBe(false);

    await page.screenshot({
      path: "/private/tmp/claude-501/-Users-ryuuhei-0729-SwimHub/a1c4c781-35f1-4a42-a997-2aaabadaed1b/scratchpad/screenshots/v02-960-ja.png",
    });
  });

  // V-03: Mobile 375px
  test("[V-03] Mobile 375px: ヘッダーにログイン/無料登録が両方表示される", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${BASE_URL}/ja`, { waitUntil: "domcontentloaded" });

    const nav = await getNavState(page);

    expect(nav.loginVisible, "ログインリンクが375pxで表示されていること").toBe(true);

    const signupVisible = nav.ctaItems.some((i) => i.visible && i.text === "無料登録");
    expect(signupVisible, "無料登録ボタンが375pxで表示されていること").toBe(true);

    expect(nav.hasHorizontalOverflow, "横スクロールなし").toBe(false);

    await page.screenshot({
      path: "/private/tmp/claude-501/-Users-ryuuhei-0729-SwimHub/a1c4c781-35f1-4a42-a997-2aaabadaed1b/scratchpad/screenshots/v03-375-ja.png",
    });
  });

  // V-04: 320px
  test("[V-04] 320px: ヘッダーが破綻しない (横スクロールなし)", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto(`${BASE_URL}/ja`, { waitUntil: "domcontentloaded" });

    const nav = await getNavState(page);
    expect(
      nav.hasHorizontalOverflow,
      `320pxで横スクロールが発生していないこと (body=${nav.bodyWidth}px scroll=${nav.scrollWidth}px)`,
    ).toBe(false);

    await page.screenshot({
      path: "/private/tmp/claude-501/-Users-ryuuhei-0729-SwimHub/a1c4c781-35f1-4a42-a997-2aaabadaed1b/scratchpad/screenshots/v04-320-ja.png",
    });
  });

  // V-05: 5言語 ヘッダーCTA 1行
  for (const { locale, login, signup } of [
    { locale: "ja", login: "ログイン", signup: "無料登録" },
    { locale: "en", login: "Log In", signup: "Sign Up Free" },
    { locale: "ko", login: "로그인", signup: "무료 가입" },
    { locale: "zh", login: "登录", signup: "免费注册" },
    { locale: "de", login: "Anmelden", signup: "Kostenlos registrieren" },
  ]) {
    test(`[V-05] ${locale} Desktop 1280px: ヘッダーCTAが1行に収まる`, async ({
      page,
    }) => {
      test.setTimeout(30000);
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(`${BASE_URL}/${locale}`, { waitUntil: "domcontentloaded" });

      const nav = await getNavState(page);

      expect(nav.loginText, `${locale}: ログインテキスト`).toBe(login);
      expect(nav.loginVisible, `${locale}: ログイン表示`).toBe(true);

      const signupVisible = nav.ctaItems.some((i) => i.visible && i.text === signup);
      expect(signupVisible, `${locale}: 登録ボタン表示 "${signup}"`).toBe(true);

      // Header height check — should not grow beyond ~80px
      const headerHeight = await page.evaluate(() => {
        const h = document.querySelector<HTMLElement>(".lp-nav");
        return h ? h.getBoundingClientRect().height : 0;
      });
      expect(
        headerHeight,
        `${locale}: ヘッダー高さが80px以下であること (actual: ${headerHeight}px)`,
      ).toBeLessThanOrEqual(80);

      expect(nav.hasHorizontalOverflow, `${locale}: 横スクロールなし`).toBe(false);

      await page.screenshot({
        path: `/private/tmp/claude-501/-Users-ryuuhei-0729-SwimHub/a1c4c781-35f1-4a42-a997-2aaabadaed1b/scratchpad/screenshots/v05-1280-${locale}.png`,
      });
    });
  }

  // V-05 de at 375px
  test("[V-05] de Mobile 375px: ヘッダーCTAが表示され横スクロールなし", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${BASE_URL}/de`, { waitUntil: "domcontentloaded" });

    const nav = await getNavState(page);
    expect(nav.loginVisible, "de 375px: Anmeldenが表示").toBe(true);
    expect(nav.hasHorizontalOverflow, "de 375px: 横スクロールなし").toBe(false);

    await page.screenshot({
      path: "/private/tmp/claude-501/-Users-ryuuhei-0729-SwimHub/a1c4c781-35f1-4a42-a997-2aaabadaed1b/scratchpad/screenshots/v05-375-de.png",
    });
  });

  // V-06/07/08: Pricing buttons — ja
  test("[V-06/07/08] ja Pricing: Premium badge/CTA/Free CTA が whiteSpace:nowrap で改行なし", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${BASE_URL}/ja#pricing`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);
    await page.evaluate(() => document.querySelector("#pricing")?.scrollIntoView());
    await page.waitForTimeout(300);

    const pricing = await getPricingButtonState(page);
    expect(pricing, "pricing section が取得できること").not.toBeNull();

    if (pricing) {
      // V-06
      expect(
        pricing.premiumBadge.whiteSpace,
        `Premium badge whiteSpace (text="${pricing.premiumBadge.text}")`,
      ).toBe("nowrap");
      expect(pricing.premiumBadge.wrapped, "Premium badge 改行なし").toBe(false);

      // V-07
      expect(
        pricing.premiumCta.whiteSpace,
        `Premium CTA whiteSpace (text="${pricing.premiumCta.text}")`,
      ).toBe("nowrap");
      expect(pricing.premiumCta.wrapped, "Premium CTA 改行なし").toBe(false);

      // V-08
      expect(
        pricing.freeCta.whiteSpace,
        `Free CTA whiteSpace (text="${pricing.freeCta.text}")`,
      ).toBe("nowrap");
      expect(pricing.freeCta.wrapped, "Free CTA 改行なし").toBe(false);
    }

    await page.screenshot({
      path: "/private/tmp/claude-501/-Users-ryuuhei-0729-SwimHub/a1c4c781-35f1-4a42-a997-2aaabadaed1b/scratchpad/screenshots/v06-pricing-1280-ja.png",
    });
  });

  // V-06/07/08: Pricing buttons — de (最長テキスト)
  test("[V-06/07/08] de Pricing: Premium badge/CTA/Free CTA が whiteSpace:nowrap で改行なし", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${BASE_URL}/de#pricing`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);
    await page.evaluate(() => document.querySelector("#pricing")?.scrollIntoView());
    await page.waitForTimeout(300);

    const pricing = await getPricingButtonState(page);
    expect(pricing, "pricing section が取得できること").not.toBeNull();

    if (pricing) {
      // V-06: "7 Tage kostenlos testen"
      expect(
        pricing.premiumBadge.whiteSpace,
        `de Premium badge whiteSpace (text="${pricing.premiumBadge.text}")`,
      ).toBe("nowrap");
      expect(pricing.premiumBadge.wrapped, "de Premium badge 改行なし").toBe(false);

      // V-07: "Kostenlose Testversion starten"
      expect(
        pricing.premiumCta.whiteSpace,
        `de Premium CTA whiteSpace (text="${pricing.premiumCta.text}")`,
      ).toBe("nowrap");
      expect(pricing.premiumCta.wrapped, "de Premium CTA 改行なし").toBe(false);

      // V-08: "Kostenlos starten"
      expect(
        pricing.freeCta.whiteSpace,
        `de Free CTA whiteSpace (text="${pricing.freeCta.text}")`,
      ).toBe("nowrap");
      expect(pricing.freeCta.wrapped, "de Free CTA 改行なし").toBe(false);
    }

    await page.screenshot({
      path: "/private/tmp/claude-501/-Users-ryuuhei-0729-SwimHub/a1c4c781-35f1-4a42-a997-2aaabadaed1b/scratchpad/screenshots/v06-pricing-1280-de.png",
    });
  });

  // V-09: FinalCta — de
  test("[V-09] de FinalCta: signup/login ボタンが改行なし", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${BASE_URL}/de`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);
    // scroll to near bottom
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight - 1000));
    await page.waitForTimeout(300);

    const btns = await getFinalCtaState(page);
    expect(btns, ".lp-final-ctas が検出されること").not.toBeNull();
    expect(btns!.length, "ボタンが2つあること").toBeGreaterThanOrEqual(2);

    for (const btn of btns!) {
      expect(
        btn.whiteSpace,
        `FinalCta "${btn.text}" whiteSpace:nowrap`,
      ).toBe("nowrap");
      expect(btn.wrapped, `FinalCta "${btn.text}" 改行なし`).toBe(false);
    }

    await page.screenshot({
      path: "/private/tmp/claude-501/-Users-ryuuhei-0729-SwimHub/a1c4c781-35f1-4a42-a997-2aaabadaed1b/scratchpad/screenshots/v09-finalcta-1280-de.png",
    });
  });

  // V-09: FinalCta — ja
  test("[V-09] ja FinalCta: signup/login ボタンが改行なし", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${BASE_URL}/ja`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(500);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight - 1000));
    await page.waitForTimeout(300);

    const btns = await getFinalCtaState(page);
    expect(btns, ".lp-final-ctas が検出されること").not.toBeNull();

    for (const btn of btns!) {
      expect(btn.whiteSpace, `FinalCta ja "${btn.text}" nowrap`).toBe("nowrap");
    }

    await page.screenshot({
      path: "/private/tmp/claude-501/-Users-ryuuhei-0729-SwimHub/a1c4c781-35f1-4a42-a997-2aaabadaed1b/scratchpad/screenshots/v09-finalcta-1280-ja.png",
    });
  });

  // V-10: Hamburger open/close regression
  test("[V-10] 回帰: ハンバーガーメニューの open/close が動作する", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${BASE_URL}/ja`, { waitUntil: "domcontentloaded" });

    // Initially menu closed
    const menuBefore = await page.locator("#nav-menu").count();
    expect(menuBefore, "初期状態: メニューが閉じている").toBe(0);

    // Open
    await page.click("#nav-burger");
    await page.waitForTimeout(200);
    const menuAfterOpen = await page.locator("#nav-menu").count();
    expect(menuAfterOpen, "クリック後: メニューが開いている").toBe(1);

    await page.screenshot({
      path: "/private/tmp/claude-501/-Users-ryuuhei-0729-SwimHub/a1c4c781-35f1-4a42-a997-2aaabadaed1b/scratchpad/screenshots/v10-burger-open.png",
    });

    // Close
    await page.click("#nav-burger");
    await page.waitForTimeout(200);
    const menuAfterClose = await page.locator("#nav-menu").count();
    expect(menuAfterClose, "再クリック後: メニューが閉じている").toBe(0);

    await page.screenshot({
      path: "/private/tmp/claude-501/-Users-ryuuhei-0729-SwimHub/a1c4c781-35f1-4a42-a997-2aaabadaed1b/scratchpad/screenshots/v10-burger-close.png",
    });
  });

  // V-11: No duplicate login in hamburger, header login still exists
  test("[V-11] 回帰: ハンバーガー内ログイン重複削除後、ヘッダーにログイン導線が1つ残存", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${BASE_URL}/ja`, { waitUntil: "domcontentloaded" });

    // Open hamburger
    await page.click("#nav-burger");
    await page.waitForTimeout(200);

    // Check no login link inside hamburger menu
    const loginLinksInMenu = await page.evaluate(() => {
      const menu = document.querySelector<HTMLElement>("#nav-menu");
      if (!menu) return [];
      return [...menu.querySelectorAll<HTMLAnchorElement>("a")]
        .filter((a) => a.href.includes("/login"))
        .map((a) => a.textContent?.trim());
    });
    expect(
      loginLinksInMenu.length,
      `ハンバーガー内ログインリンク数=0 (found: ${JSON.stringify(loginLinksInMenu)})`,
    ).toBe(0);

    // Check header login still exists (in .lp-nav-cta)
    const headerLoginLinks = await page.evaluate(() => {
      return [...document.querySelectorAll<HTMLAnchorElement>(".lp-nav-cta a")]
        .filter((a) => a.href.includes("/login"))
        .map((a) => ({
          text: a.textContent?.trim(),
          visible:
            window.getComputedStyle(a).display !== "none" &&
            a.getBoundingClientRect().width > 0,
        }));
    });
    expect(
      headerLoginLinks.length,
      `ヘッダーにログインリンクが1つあること (found: ${JSON.stringify(headerLoginLinks)})`,
    ).toBe(1);
    expect(headerLoginLinks[0].visible, "ヘッダーのログインリンクが表示されている").toBe(
      true,
    );

    await page.screenshot({
      path: "/private/tmp/claude-501/-Users-ryuuhei-0729-SwimHub/a1c4c781-35f1-4a42-a997-2aaabadaed1b/scratchpad/screenshots/v11-no-dup-login.png",
    });
  });
});
