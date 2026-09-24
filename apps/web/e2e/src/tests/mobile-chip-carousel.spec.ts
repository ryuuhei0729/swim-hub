/**
 * mobile-chip-carousel.spec.ts — スマホ幅 Web UI 改善の実ブラウザ検証
 *
 * Sprint Contract「スマホ幅 Web UI 改善 (swim-hub / apps/web)」の Success Criteria /
 * Boundary Cases のうち、**幅・折り返し・見切れ・行間**に関わるものはすべてここで判定する。
 * jsdom は Tailwind を読まず Flexbox も解決しないため offsetWidth/scrollWidth が常に 0 になり、
 * これらの観点は原理的に検証できない (Contract 役割境界に明記)。
 *
 * ===========================================================================
 * ★★ このファイルは CI では実行されない ★★
 *
 * 下の `test.skip(!hasRequiredEnvVars, ...)` は `E2E_BASE_URL` / `E2E_EMAIL` /
 * `E2E_PASSWORD` を要求するが、**`E2E_BASE_URL` はリポジトリ内にも ci.yml にも
 * setup-e2e にも定義が無い** (消費側にしか存在しない)。そのため CI ではこの
 * ガードが必ず成立し、全件 skip される。Playwright は skipped を failure として
 * 扱わないので CI は緑のまま通る。
 *
 * PM 実測 (CI run 35431243958): `Running 113 tests → 69 skipped / 44 passed`。
 * e2e spec 21 ファイル中 16 ファイルが同じガードを持ち、CI で実際に走っているのは
 * ガード無しの 5 ファイル (billing-e2e-manual / i18n-unauthenticated /
 * keyboard-scroll / lp-responsive / lp-responsive-w01-w02) だけ。
 *
 * → **このファイルの結果は「ローカルでの手動実行」でのみ有効**。
 *   「CI が緑だから検証済み」と読むな。ガードの一斉解除は本スプリントのスコープ外
 *   (無関係な 69 件が一度に走り出し、赤の切り分けが混ざるため PM が見送りを裁定)。
 * ===========================================================================
 *
 * 前提環境 (ローカル実行時)
 *   1. ローカル Supabase が起動していること
 *        pnpm exec supabase start
 *      ※ `--workdir supabase` を付けると project-id が `supabase` になり、
 *        実際に動いている `swim-hub` プロジェクトを検出できず
 *        「停止中」と誤診する。`supabase status` も同様。
 *   2. dev サーバーが localhost:3000 で動いていること
 *        pnpm -C apps/web dev
 *      playwright.config.ts の webServer は reuseExistingServer: !CI なので、
 *      先に立てておけばそれを再利用する。
 *   3. E2E_EMAIL / E2E_PASSWORD / E2E_BASE_URL が apps/web/.env.local にあること
 *
 * 実行 (ヘッドレス。ユーザー指示によりウィンドウを出さないこと):
 *   pnpm -C apps/web run test:e2e:headless -- e2e/src/tests/mobile-chip-carousel.spec.ts
 * ---------------------------------------------------------------------------
 *
 * 測り方の原則:
 *   横あふれゼロ      → row.scrollWidth <= row.clientWidth + 1
 *   1行に収まる       → **外側ボックス** (`chiprow-*-box`) の高さ == 最大チップ高 (±2px)
 *                       ※ 内側 (`chiprow-*`) は py-1 の分 +8px になる。測定点を
 *                         間違えると正しい実装を FAIL と誤判定する
 *   横スクロール可能  → row.scrollWidth > row.clientWidth + 1
 *   行間が潰れない    → 隣接する外側ボックスの矩形間距離が space-y-1.5 の 6px
 *   デスクトップ復帰  → flex-wrap:wrap / overflow-x:visible / 横あふれ0 / padding 0
 *
 * 担保できていないこと (assertDesktopWrap のコメント参照):
 *   「1280px で変更前の offsetHeight と一致」は動的には検証していない。
 *   根拠は Reviewer による Flexbox 仕様 §9.4 の静的計算。
 */

import { expect, test, type Page } from "@playwright/test";
import { addDays, endOfMonth, format, startOfMonth, subDays } from "date-fns";
import { createClient } from "@supabase/supabase-js";
import { EnvConfig } from "../config/config";
import { supabaseLogin } from "../utils/supabase-login";

let hasRequiredEnvVars = false;
try {
  EnvConfig.getTestEnvironment();
  hasRequiredEnvVars = true;
} catch (error) {
  console.error("環境変数の検証に失敗しました:", error instanceof Error ? error.message : error);
}

/**
 * カレンダーの月送り操作を不要にするため、過去日 / 未来日を**必ず今月内**に収める。
 *
 * 単純な「今日 ±7 日」は同一月を保証しない (月初 1〜7 日・月末 24〜31 日に実行すると
 * 隣月にはみ出し、その日のセルが今月のカレンダーに存在せず大半のテストが落ちる)。
 * 月初/月末にぶつかったら内側に折り返して今月内にクランプする。
 */
const TODAY = new Date();
const MONTH_START = startOfMonth(TODAY);
const MONTH_END = endOfMonth(TODAY);

function clampToThisMonth(date: Date): Date {
  if (date < MONTH_START) return MONTH_START;
  if (date > MONTH_END) return MONTH_END;
  return date;
}

/** 今日より前で今月内の日。今日が 1 日なら今日自身 (= 過去日が取れない月初の縮退) */
const PAST_DATE = format(
  clampToThisMonth(subDays(TODAY, 7)) >= TODAY ? MONTH_START : clampToThisMonth(subDays(TODAY, 7)),
  "yyyy-MM-dd",
);
/** 今日より後で今月内の日。今日が月末なら今日自身 */
const FUTURE_DATE = format(
  clampToThisMonth(addDays(TODAY, 7)) <= TODAY ? MONTH_END : clampToThisMonth(addDays(TODAY, 7)),
  "yyyy-MM-dd",
);

// Tailwind の sm ブレークポイントは 640px。
// globals.css:39-46 の input 16px 強制は @media (max-width: 768px) なので 768 も帯の中。
const VIEWPORTS = {
  vp320: { width: 320, height: 800 },
  vp375: { width: 375, height: 812 },
  vp639: { width: 639, height: 900 },
  vp640: { width: 640, height: 900 },
  vp641: { width: 641, height: 900 },
  vp767: { width: 767, height: 900 },
  vp768: { width: 768, height: 1024 },
  vp1280: { width: 1280, height: 800 },
} as const;

// ---------------------------------------------------------------------------
// ページ内計測 (すべて実ブラウザのレイアウト結果を読む)
// ---------------------------------------------------------------------------

interface RowMetrics {
  found: boolean;
  /** 内側スクロール容器の高さ (py-1 の分だけ外側より 8px 高い) */
  height: number;
  /**
   * ★ 行の外形高さ。測るのは **外側ボックス** (`chiprow-*-box`)。
   *
   * data-testid が付いた内側は focus ring のクリップ回避で `py-1 -my-1` を持つため
   * border-box は チップ高 +8px になる。負マージンで相殺された後の
   * flex line cross size (= 外側の offsetHeight) が「変更前と同じ行の高さ」。
   * 内側で高さを測ると必ず +8px ずれて、正しい実装を FAIL と誤判定する。
   */
  outerHeight: number;
  outerFound: boolean;
  clientWidth: number;
  scrollWidth: number;
  clientHeight: number;
  scrollHeight: number;
  paddingTop: number;
  paddingBottom: number;
  flexWrap: string;
  overflowX: string;
  overflowY: string;
  maskImage: string;
  childCount: number;
  /** 子チップの最大高さ */
  maxChildHeight: number;
  /** 子チップが横方向に圧縮されていないか (flex-shrink の実効値) */
  childFlexShrink: string[];
  /** ページ全体の横あふれ */
  documentOverflowX: number;
}

async function measureRow(page: Page, rowTestId: string): Promise<RowMetrics> {
  return page.evaluate((testId) => {
    const empty: RowMetrics = {
      found: false,
      height: 0,
      outerHeight: 0,
      outerFound: false,
      clientWidth: 0,
      scrollWidth: 0,
      clientHeight: 0,
      scrollHeight: 0,
      paddingTop: 0,
      paddingBottom: 0,
      flexWrap: "",
      overflowX: "",
      overflowY: "",
      maskImage: "",
      childCount: 0,
      maxChildHeight: 0,
      childFlexShrink: [],
      documentOverflowX: 0,
    };

    const outer = document.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
    if (!outer) return empty;
    // 高さ・行間は外側ボックスで測る (内側は py-1 の分 +8px ずれる)
    const box = document.querySelector<HTMLElement>(`[data-testid="${testId}-box"]`);

    // ChipScrollRow は行間 Critical の対策で内側ラッパーを持ちうる。
    // 測るべきは「チップの直接の親」= flex / スクロール容器であって、
    // data-testid が付いた外側とは限らない。実測で辿る。
    const firstChip = outer.querySelector<HTMLElement>("button, input");
    const el = firstChip?.parentElement ?? outer;

    const cs = window.getComputedStyle(el);
    const children = Array.from(el.children) as HTMLElement[];

    return {
      found: true,
      height: el.getBoundingClientRect().height,
      outerFound: !!box,
      outerHeight: box ? box.getBoundingClientRect().height : -1,
      clientWidth: el.clientWidth,
      scrollWidth: el.scrollWidth,
      clientHeight: el.clientHeight,
      scrollHeight: el.scrollHeight,
      paddingTop: parseFloat(cs.paddingTop) || 0,
      paddingBottom: parseFloat(cs.paddingBottom) || 0,
      flexWrap: cs.flexWrap,
      overflowX: cs.overflowX,
      overflowY: cs.overflowY,
      // フェードは外側 / 内側どちらに乗るか実装次第なので両方見る
      maskImage: (() => {
        for (const cand of [el, outer]) {
          const s = window.getComputedStyle(cand);
          const m =
            s.maskImage || (s as unknown as Record<string, string>).webkitMaskImage || "";
          if (m && m !== "none") return m;
        }
        return "none";
      })(),
      childCount: children.length,
      maxChildHeight: children.reduce(
        (m, c) => Math.max(m, c.getBoundingClientRect().height),
        0,
      ),
      childFlexShrink: children.map((c) => window.getComputedStyle(c).flexShrink),
      documentOverflowX:
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  }, rowTestId);
}

/** sm 未満の期待: 1行 + 横スクロール可能 + チップが潰れない */
function assertMobileCarousel(label: string, m: RowMetrics, opts?: { mustOverflow?: boolean }) {
  expect(m.found, `${label}: 行コンテナが見つからない`).toBe(true);
  expect(m.childCount, `${label}: チップが 0 個`).toBeGreaterThan(0);
  expect(m.outerFound, `${label}: 外側ボックス (chiprow-*-box) が見つからない`).toBe(true);

  // ★ 高さは外側ボックスで測る。内側は py-1 (上下 4px) を持つため必ず +8px になる。
  //   負マージン -my-1 で相殺された後の flex line cross size が「行の高さ」。
  expect(
    Math.abs(m.outerHeight - m.maxChildHeight),
    `${label}: 1行に収まっていない (外側=${m.outerHeight}, チップ高=${m.maxChildHeight}, 内側=${m.height})`,
  ).toBeLessThanOrEqual(2);

  // 内側が「チップ高 + py-1 の 8px」になっていること (相殺の前提が崩れていないか)
  expect(
    Math.abs(m.height - (m.maxChildHeight + m.paddingTop + m.paddingBottom)),
    `${label}: 内側の高さが チップ高+padding と一致しない (内側=${m.height}, pad=${m.paddingTop}/${m.paddingBottom})`,
  ).toBeLessThanOrEqual(2);

  expect(m.overflowX, `${label}: 横スクロール容器になっていない`).toMatch(/auto|scroll/);

  // チップが潰れないこと ([&>*]:shrink-0)。これが無いと文字が見切れる。
  for (const shrink of m.childFlexShrink) {
    expect(shrink, `${label}: チップの flex-shrink が 0 でない`).toBe("0");
  }

  // 縦方向にクリップされていない (focus:ring の上下切れ対策 py-1 -my-1)
  expect(
    m.scrollHeight - m.clientHeight,
    `${label}: 行が縦にはみ出している (ring がクリップされる)`,
  ).toBeLessThanOrEqual(1);

  if (opts?.mustOverflow) {
    expect(
      m.scrollWidth,
      `${label}: 横スクロールの余地が無い (この幅では溢れるはずの行)`,
    ).toBeGreaterThan(m.clientWidth + 1);
  }
}

/** sm 以上の期待: 折り返しに完全復帰。変更前 (legacy) と同じ高さ */
function assertDesktopWrap(label: string, m: RowMetrics) {
  expect(m.found, `${label}: 行コンテナが見つからない`).toBe(true);
  expect(m.flexWrap, `${label}: sm 以上で折り返しに戻っていない`).toBe("wrap");
  expect(m.overflowX, `${label}: sm 以上で overflow-x が visible でない`).toBe("visible");
  expect(
    m.scrollWidth,
    `${label}: sm 以上で横あふれしている (折り返していない)`,
  ).toBeLessThanOrEqual(m.clientWidth + 1);
  expect(m.outerFound, `${label}: 外側ボックス (chiprow-*-box) が見つからない`).toBe(true);

  // ★★ 担保できていないこと (意図的に検証していない) ★★
  //   Contract の「1280px で変更前の offsetHeight と一致」は **Playwright では未検証**。
  //   以前ここには「実物を複製した legacy クローンとの高さ比較」があったが、
  //   クローンは実物の computed 値 (gap / clientWidth / fontSize) を丸写しして
  //   作っていたため、1280px では実物も wrap / padding 0 / visible であり
  //   比較が**構造的に必ず通る**トートロジーだった
  //   (gap 変更・チップ高変更・フォント変更・折り返し数変化を全部すり抜ける)。
  //   「検証済みに見えるトートロジー」を残す方が危険なので削除した。
  //
  //   代替の根拠: Reviewer が Flexbox 仕様 §9.4 で静的に計算済み
  //     内側 border-box = チップ高 32 + py-1(8) = 40px
  //     内側 margin-box = 40 + (-4) + (-4) = 32px   ← -my-1 が相殺
  //     flex line cross size = 32px → 外側 offsetHeight = 32px = 変更前と一致
  //   動的検証は担保外。下の実測 4 項目 (wrap / visible / 横あふれ0 / padding 0) が
  //   「折り返し挙動に完全復帰している」ことの担保である。
  // py-1 -my-1 が sm で解除されていること (高さが変わらない根拠)
  expect(m.paddingTop, `${label}: sm 以上で上 padding が残っている`).toBeLessThanOrEqual(0.5);
  expect(m.paddingBottom, `${label}: sm 以上で下 padding が残っている`).toBeLessThanOrEqual(0.5);
}

/**
 * 行と行の縦間隔を実測する (Reviewer 指摘 Critical C-1 の直接の証拠)。
 *
 * 親の `space-y-1.5` が生成する `:where(.space-y-1\.5 > :not(:last-child)) { margin-block: … }`
 * は特異度 0 なので、ChipScrollRow の**外側**に `-my-1` (特異度 0,1,0) が乗ると
 * 上書きされ、1280px で行間 6px → 0px に潰れる。
 * 行自体の offsetHeight は変わらないため、行の高さだけ測っていても検出できない。
 *
 * ここでは「data-testid を持つ行コンテナ同士の境界間の距離」を測る。
 */
async function measureRowGap(page: Page, upperTestId: string, lowerTestId: string) {
  return page.evaluate(
    ({ upperId, lowerId }) => {
      // ★ 行間は必ず外側ボックス同士で測る。内側は -my-1 で上下 4px はみ出すため
      //    内側同士だと 2px 重なって見え、行間 0 と誤判定する
      const up = document.querySelector<HTMLElement>(`[data-testid="${upperId}-box"]`);
      const low = document.querySelector<HTMLElement>(`[data-testid="${lowerId}-box"]`);
      if (!up || !low) return { found: false, gap: -1, sameParent: false, parentClass: "" };
      const u = up.getBoundingClientRect();
      const l = low.getBoundingClientRect();
      const cs = window.getComputedStyle(up);
      return {
        found: true,
        gap: l.top - u.bottom,
        sameParent: up.parentElement === low.parentElement,
        parentClass: up.parentElement?.className ?? "",
        upperMarginBottom: parseFloat(cs.marginBottom) || 0,
        upperMarginTop: parseFloat(cs.marginTop) || 0,
      };
    },
    { upperId: upperTestId, lowerId: lowerTestId },
  );
}

/** 入力欄の実効幅 */
async function inputWidth(page: Page, testId: string): Promise<number> {
  return page.evaluate((id) => {
    const el = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    return el ? el.getBoundingClientRect().width : -1;
  }, testId);
}

/** 入力欄の値が見切れていないか (中身が箱に収まっているか) */
async function inputIsClipped(page: Page, testId: string): Promise<boolean> {
  return page.evaluate((id) => {
    const el = document.querySelector<HTMLInputElement>(`[data-testid="${id}"]`);
    if (!el) return true;
    return el.scrollWidth > el.clientWidth + 1;
  }, testId);
}

// ---------------------------------------------------------------------------
// 画面操作ヘルパー
// ---------------------------------------------------------------------------

/** カレンダーの指定日をクリックして DayDetailModal を開く */
async function openDayDetail(page: Page, date: string) {
  await page.waitForSelector('[data-testid="calendar-day"]', { timeout: 20000 });
  await page.locator(`[data-testid="calendar-day"][data-date="${date}"]`).click();
  await page.waitForSelector(
    '[data-testid="day-detail-modal"], [data-testid="record-detail-modal"]',
    { timeout: 10000 },
  );
}

/** 大会タブモーダル (CompetitionTabModal) を新規作成で開く */
async function openCompetitionTabModal(page: Page, date: string) {
  await openDayDetail(page, date);
  await page.locator('[data-testid="add-record-button"]').first().click();
  await page.waitForSelector('[data-testid="competition-tab-modal"]', { timeout: 10000 });
}

/** 練習タブモーダル (PracticeTabModal) を新規作成で開く */
async function openPracticeTabModal(page: Page, date: string) {
  await openDayDetail(page, date);
  await page.locator('[data-testid="add-practice-button"]').first().click();
  await page.waitForSelector('[data-testid="practice-tab-modal"]', { timeout: 10000 });
}

/**
 * 目的の testid が現れるまで role="tab" を順に押す。
 * タブ名はロケール依存かつ Contract で変更対象でもあるため、名前ではなく
 * 「押すと目的のパネルが出るか」で選ぶ (ロケール非依存)。
 */
async function activateTabShowing(page: Page, testId: string) {
  const target = page.locator(`[data-testid="${testId}"]`).first();
  if (await target.isVisible().catch(() => false)) return;

  const tabs = page.locator('[role="tab"]');
  const count = await tabs.count();
  for (let i = 0; i < count; i++) {
    await tabs.nth(i).click();
    await page.waitForTimeout(300);
    if (await target.isVisible().catch(() => false)) return;
  }
  throw new Error(`タブを全部押しても [data-testid="${testId}"] が現れない (tabs=${count})`);
}

/** 行コンテナを右端までスクロールする */
async function scrollRowToEnd(page: Page, rowTestId: string) {
  await page.evaluate((id) => {
    const el = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
    if (el) el.scrollLeft = el.scrollWidth;
  }, rowTestId);
  await page.waitForTimeout(150);
}

/** 指定チップが行コンテナの可視領域に完全に入っているか */
async function chipFullyVisibleInRow(page: Page, rowTestId: string, chipTestId: string) {
  return page.evaluate(
    ({ rowId, chipId }) => {
      const row = document.querySelector<HTMLElement>(`[data-testid="${rowId}"]`);
      const chip = document.querySelector<HTMLElement>(`[data-testid="${chipId}"]`);
      if (!row || !chip) return { ok: false, reason: "要素が無い" };
      const r = row.getBoundingClientRect();
      const c = chip.getBoundingClientRect();
      const ok = c.left >= r.left - 1 && c.right <= r.right + 1;
      return {
        ok,
        reason: `row=[${Math.round(r.left)},${Math.round(r.right)}] chip=[${Math.round(c.left)},${Math.round(c.right)}]`,
      };
    },
    { rowId: rowTestId, chipId: chipTestId },
  );
}

/** 最初に見つかった距離チップの値 (行ごとに存在する距離が違うため動的に取る) */
async function firstChipTestId(page: Page, rowTestId: string): Promise<string> {
  const id = await page.evaluate((rowId) => {
    const row = document.querySelector<HTMLElement>(`[data-testid="${rowId}"]`);
    const first = row?.querySelector<HTMLElement>("[data-testid]");
    return first?.getAttribute("data-testid") ?? "";
  }, rowTestId);
  expect(id, `${rowTestId} の中にチップが無い`).not.toBe("");
  return id;
}

async function lastChipTestId(page: Page, rowTestId: string): Promise<string> {
  const id = await page.evaluate((rowId) => {
    const row = document.querySelector<HTMLElement>(`[data-testid="${rowId}"]`);
    const chips = row ? Array.from(row.querySelectorAll<HTMLElement>("[data-testid]")) : [];
    return chips.length ? (chips[chips.length - 1]!.getAttribute("data-testid") ?? "") : "";
  }, rowTestId);
  expect(id, `${rowTestId} の中にチップが無い`).not.toBe("");
  return id;
}

// ---------------------------------------------------------------------------

test.describe("スマホ幅 チップ行カルーセル + 水路トグル略称 (実ブラウザ)", () => {
  test.describe.configure({ timeout: 120000 });

  test.skip(
    !hasRequiredEnvVars,
    "必要な環境変数が設定されていません。E2E_BASE_URL, E2E_EMAIL, E2E_PASSWORD を設定してください。",
  );

  test.beforeAll(async () => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY が設定されていません");

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: users } = await supabase.auth.admin.listUsers();
    const testEmail = (
      process.env.E2E_EMAIL ||
      process.env.E2E_TEST_EMAIL ||
      "e2e-test@swimhub.com"
    ).toLowerCase();
    const testUser = users?.users?.find((u) => u.email?.toLowerCase() === testEmail);
    if (!testUser) throw new Error(`E2E テストユーザーが見つかりません: ${testEmail}`);

    // (authenticated)/layout が onboarding 未完了ユーザーを /onboarding へ飛ばすため
    await supabase.from("users").update({ onboarding_completed: true }).eq("id", testUser.id);
  });

  // =========================================================================
  // SC-1 / SC-2 / BC-1: 水路トグルの文言と横あふれ
  // =========================================================================
  test.describe("[V-01] 大会タブ 水路トグル", () => {
    const CASES: Array<{ vp: keyof typeof VIEWPORTS; abbrev: boolean }> = [
      { vp: "vp320", abbrev: true },
      { vp: "vp375", abbrev: true },
      { vp: "vp639", abbrev: true }, // sm 未満の上限
      { vp: "vp640", abbrev: false }, // sm ちょうど → フル表記
      { vp: "vp641", abbrev: false },
      { vp: "vp767", abbrev: false },
      { vp: "vp768", abbrev: false }, // input 16px 強制帯の上端
      { vp: "vp1280", abbrev: false },
    ];

    for (const c of CASES) {
      test(`${VIEWPORTS[c.vp].width}px で ${c.abbrev ? "略称" : "フル表記"} を表示し横あふれしない`, async ({
        page,
      }) => {
        await page.setViewportSize(VIEWPORTS[c.vp]);
        await supabaseLogin(page);
        await page.goto("/ja/dashboard");
        await openCompetitionTabModal(page, FUTURE_DATE);

        const shortBtn = page.locator('[data-testid="competition-tab-pool-type-0"]');
        const longBtn = page.locator('[data-testid="competition-tab-pool-type-1"]');
        await expect(shortBtn).toBeVisible();

        // innerText は display:none の span を含まないため「実際に見える文言」が取れる
        const shortText = (await shortBtn.innerText()).trim();
        const longText = (await longBtn.innerText()).trim();

        if (c.abbrev) {
          expect(shortText, "sm 未満で略称になっていない").toBe("短水");
          expect(longText, "sm 未満で略称になっていない").toBe("長水");
        } else {
          expect(shortText, "sm 以上でフル表記でない").toBe("短水路 (25m)");
          expect(longText, "sm 以上でフル表記でない").toBe("長水路 (50m)");
        }

        // トグル行 (2 ボタンの親) が横あふれしていないこと
        const overflow = await page.evaluate(() => {
          const btn = document.querySelector<HTMLElement>(
            '[data-testid="competition-tab-pool-type-0"]',
          );
          const row = btn?.parentElement;
          if (!row) return { rowOverflow: 1, docOverflow: 1, btnLines: 99, btnClipped: true };
          // ★ 行数はボタンの高さから割り出せない。ボタンは h-8 / sm:h-10 の
          //    固定高さなので、sm 以上では height/lineHeight = 40/20 = 2 になり
          //    「2行に折れている」と誤判定する (実際は 1 行)。
          //    インライン要素の getClientRects() は line box ごとに 1 個返るので、
          //    実際に表示されている span の rect 数が行数そのものになる。
          const visibleSpan = Array.from(btn.querySelectorAll<HTMLElement>("span")).find(
            (s) => window.getComputedStyle(s).display !== "none",
          );
          return {
            rowOverflow: row.scrollWidth - row.clientWidth,
            docOverflow:
              document.documentElement.scrollWidth - document.documentElement.clientWidth,
            btnLines: visibleSpan ? visibleSpan.getClientRects().length : 99,
            // ボタン自身も横あふれしていないこと (文字が切れていないか)
            btnClipped: btn.scrollWidth > btn.clientWidth + 1,
          };
        });
        expect(overflow.rowOverflow, "水路トグル行が横あふれしている").toBeLessThanOrEqual(1);
        expect(overflow.docOverflow, "ページ全体が横あふれしている").toBeLessThanOrEqual(1);
        expect(overflow.btnLines, "水路ボタンの文字が2行に折れている").toBe(1);
        expect(overflow.btnClipped, "水路ボタンの文字が見切れている").toBe(false);
      });
    }
  });

  // =========================================================================
  // BC-4: en / de (最長文字列) の 375px
  // =========================================================================
  test.describe("[V-02] 水路トグル 多言語 375px", () => {
    const LOCALE_CASES = [
      { locale: "en", short: "Short", long: "Long" },
      { locale: "de", short: "Kurz", long: "Lang" },
    ];

    for (const lc of LOCALE_CASES) {
      test(`${lc.locale} の 375px で略称が1行で収まる`, async ({ page }) => {
        await page.setViewportSize(VIEWPORTS.vp375);
        await supabaseLogin(page);
        await page.goto(`/${lc.locale}/dashboard`);
        await openCompetitionTabModal(page, FUTURE_DATE);

        const shortBtn = page.locator('[data-testid="competition-tab-pool-type-0"]');
        await expect(shortBtn).toBeVisible();
        expect((await shortBtn.innerText()).trim()).toBe(lc.short);
        expect(
          (await page.locator('[data-testid="competition-tab-pool-type-1"]').innerText()).trim(),
        ).toBe(lc.long);

        const docOverflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(docOverflow, `${lc.locale} でページが横あふれ`).toBeLessThanOrEqual(1);
      });
    }
  });

  // =========================================================================
  // SC-3 / SC-4 / SC-5 / SC-9: レースレコードタブのチップ行
  // =========================================================================
  test.describe("[V-03] レースレコードタブのチップ行", () => {
    const DISTANCE_ROW = "chiprow-record-style-distance-1";
    const STROKE_ROW = "chiprow-record-style-stroke-1";

    test("375px: 距離行・泳法行が1行 + 横スクロール可能", async ({ page }) => {
      await page.setViewportSize(VIEWPORTS.vp375);
      await supabaseLogin(page);
      await page.goto("/ja/dashboard");
      await openCompetitionTabModal(page, PAST_DATE); // 過去日 = レースレコードタブが出る
      await activateTabShowing(page, DISTANCE_ROW);

      const distance = await measureRow(page, DISTANCE_ROW);
      // 距離は 25/50/100/200/400/800/1500 と多いため 375px では必ず溢れる
      assertMobileCarousel("375px 距離行", distance, { mustOverflow: true });

      const stroke = await measureRow(page, STROKE_ROW);
      assertMobileCarousel("375px 泳法行", stroke);

      expect(
        distance.documentOverflowX,
        "ページ全体が横あふれしている",
      ).toBeLessThanOrEqual(1);
    });

    test("375px: 右端までスクロールすると末尾チップが容器内に完全に入る", async ({ page }) => {
      await page.setViewportSize(VIEWPORTS.vp375);
      await supabaseLogin(page);
      await page.goto("/ja/dashboard");
      await openCompetitionTabModal(page, PAST_DATE);
      await activateTabShowing(page, DISTANCE_ROW);

      const before = await measureRow(page, DISTANCE_ROW);
      expect(before.scrollWidth, "そもそもスクロールできない").toBeGreaterThan(
        before.clientWidth + 1,
      );

      const lastId = await lastChipTestId(page, DISTANCE_ROW);
      await scrollRowToEnd(page, DISTANCE_ROW);

      const visible = await chipFullyVisibleInRow(page, DISTANCE_ROW, lastId);
      expect(visible.ok, `末尾チップ(${lastId})が容器内に入らない: ${visible.reason}`).toBe(true);

      // 右端に到達したらフェードが消える (mobile と同じ表示条件)
      const after = await measureRow(page, DISTANCE_ROW);
      expect(after.maskImage === "none" || after.maskImage === "", "右端でフェードが消えない").toBe(
        true,
      );
    });

    test("375px: スクロール余地がある間は右端フェードが出る", async ({ page }) => {
      await page.setViewportSize(VIEWPORTS.vp375);
      await supabaseLogin(page);
      await page.goto("/ja/dashboard");
      await openCompetitionTabModal(page, PAST_DATE);
      await activateTabShowing(page, DISTANCE_ROW);

      const m = await measureRow(page, DISTANCE_ROW);
      expect(m.scrollWidth).toBeGreaterThan(m.clientWidth + 1);
      // `toContain("gradient")` だと radial-gradient でも、方向が to left でも、
      // ストップが逆順 (行の左 90% が不可視) でも通ってしまう。
      // computed 値なので色は rgb() に正規化される。方向・ストップ順・幅を固定する。
      expect(
        m.maskImage,
        `フェードの形が期待と違う (mask="${m.maskImage}")`,
      ).toMatch(
        /^linear-gradient\(\s*to right\s*,\s*rgb\(0,\s*0,\s*0\)\s+calc\(100%\s*-\s*28px\)\s*,\s*(?:rgba\(0,\s*0,\s*0,\s*0\)|transparent)\s*\)$/,
      );
    });

    test("1280px: 距離行・泳法行が折り返し表示に戻る (変更前相当と同じ高さ)", async ({ page }) => {
      await page.setViewportSize(VIEWPORTS.vp1280);
      await supabaseLogin(page);
      await page.goto("/ja/dashboard");
      await openCompetitionTabModal(page, PAST_DATE);
      await activateTabShowing(page, DISTANCE_ROW);

      assertDesktopWrap("1280px 距離行", await measureRow(page, DISTANCE_ROW));
      assertDesktopWrap("1280px 泳法行", await measureRow(page, STROKE_ROW));
    });

    // Reviewer 指摘 Critical C-1 の直接の検証。
    // ミューテーション: ChipScrollRow の内側ラッパーを外して外側に -my-1 を戻すと
    // ここだけが赤になる (行の高さ判定は通ってしまう)。
    for (const vpKey of ["vp375", "vp1280"] as const) {
      test(`${VIEWPORTS[vpKey].width}px: 距離行と泳法行の縦間隔が潰れていない (space-y-1.5 の上書き検出)`, async ({
        page,
      }) => {
        await page.setViewportSize(VIEWPORTS[vpKey]);
        await supabaseLogin(page);
        await page.goto("/ja/dashboard");
        await openCompetitionTabModal(page, PAST_DATE);
        await activateTabShowing(page, DISTANCE_ROW);

        const gap = await measureRowGap(page, DISTANCE_ROW, STROKE_ROW);
        expect(gap.found, "距離行 / 泳法行が両方見つからない").toBe(true);
        expect(
          gap.sameParent,
          `距離行と泳法行が同じ親の直下に無い (parent="${gap.parentClass}")`,
        ).toBe(true);
        // 親は space-y-1.5 = 6px。ChipScrollRow のルートが素の block だと
        // 内側の負マージンが margin collapsing で漏れ、6px → 2px に縮む
        // (Reviewer 検算値)。その 4px 差を確実に検出できる精度で見る。
        expect(
          gap.gap,
          `行間が space-y-1.5 の 6px と一致しない (gap=${gap.gap}px, 上行 marginBottom=${gap.upperMarginBottom}px)`,
        ).toBeGreaterThan(4.5);
        expect(gap.gap, `行間が広がりすぎている (gap=${gap.gap}px)`).toBeLessThan(7.5);
      });
    }

    // Reviewer NEW-L1: 内側ボックスは -my-1 で上下 4px はみ出すため、隣接行の内側同士が
    // 2px 重なる。理論上その帯にチップは無いのでクリックは奪われないはずだが、
    // 「理論上無害」を実ブラウザで潰す。全行・全チップを実際にクリックして確認する。
    for (const vpKey of ["vp375", "vp1280"] as const) {
      test(`${VIEWPORTS[vpKey].width}px: 全行の全チップが実際にクリックできる (行の重なりで奪われない)`, async ({
        page,
      }) => {
        await page.setViewportSize(VIEWPORTS[vpKey]);
        await supabaseLogin(page);
        await page.goto("/ja/dashboard");
        await openCompetitionTabModal(page, PAST_DATE);
        await activateTabShowing(page, DISTANCE_ROW);

        for (const rowId of [DISTANCE_ROW, STROKE_ROW]) {
          const chipIds = await page.evaluate((id) => {
            const row = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
            return row
              ? Array.from(row.querySelectorAll<HTMLElement>("button[data-testid]")).map(
                  (b) => b.getAttribute("data-testid")!,
                )
              : [];
          }, rowId);
          expect(chipIds.length, `${rowId}: チップが 0 個 (fixture がガードを通っていない)`)
            .toBeGreaterThan(0);

          for (const chipId of chipIds) {
            const chip = page.locator(`[data-testid="${chipId}"]`);
            // スクロールして可視化してからクリック (375px では行外のチップがある)
            await chip.scrollIntoViewIfNeeded();

            // 「その座標で実際に受け取る要素」が自分自身か = 他行に奪われていないか
            const hit = await page.evaluate((id) => {
              const el = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
              if (!el) return { ok: false, topTestId: null as string | null };
              const r = el.getBoundingClientRect();
              const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
              return {
                ok: !!top && (top === el || el.contains(top)),
                topTestId: (top as HTMLElement | null)?.getAttribute?.("data-testid") ?? null,
              };
            }, chipId);
            expect(
              hit.ok,
              `${chipId} の中心が別要素に奪われている (実際に受け取るのは ${hit.topTestId})`,
            ).toBe(true);

            await chip.click({ timeout: 5000 });
            await expect(chip, `${chipId} をクリックしても選択状態にならない`).toHaveAttribute(
              "aria-pressed",
              "true",
            );
          }
        }
      });
    }

    test("チップのクリックで選択が変わる (挙動不変)", async ({ page }) => {
      await page.setViewportSize(VIEWPORTS.vp375);
      await supabaseLogin(page);
      await page.goto("/ja/dashboard");
      await openCompetitionTabModal(page, PAST_DATE);
      await activateTabShowing(page, DISTANCE_ROW);

      const firstId = await firstChipTestId(page, DISTANCE_ROW);
      const lastId = await lastChipTestId(page, DISTANCE_ROW);
      expect(firstId).not.toBe(lastId);

      await scrollRowToEnd(page, DISTANCE_ROW);
      await page.locator(`[data-testid="${lastId}"]`).click();
      await expect(page.locator(`[data-testid="${lastId}"]`)).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await expect(page.locator(`[data-testid="${firstId}"]`)).toHaveAttribute(
        "aria-pressed",
        "false",
      );
    });

    test("[BC] Tab フォーカスでチップが自動スクロールし、フォーカスリングが上下で切れない", async ({
      page,
    }) => {
      await page.setViewportSize(VIEWPORTS.vp375);
      await supabaseLogin(page);
      await page.goto("/ja/dashboard");
      await openCompetitionTabModal(page, PAST_DATE);
      await activateTabShowing(page, DISTANCE_ROW);

      const lastId = await lastChipTestId(page, DISTANCE_ROW);
      await page.locator(`[data-testid="${lastId}"]`).focus();
      await page.waitForTimeout(200);

      // ★ この assert は**実装の担保ではない**。
      //   `focus()` は Chromium 既定 (preventScroll: false) でフォーカス対象を
      //   スクロールして可視化する。ChipScrollRow をどう壊してもここは true になる。
      //   「ブラウザ既定の挙動がこの構成でも働くこと」の確認に留まる。
      //   実装を担保しているのは下の ringRoom / vClip の 2 つ (py-1 -my-1 を実測している)。
      const visible = await chipFullyVisibleInRow(page, DISTANCE_ROW, lastId);
      expect(
        visible.ok,
        `フォーカスしたチップまで自動スクロールしない (ブラウザ既定の担保): ${visible.reason}`,
      ).toBe(true);

      // 縦方向のクリップ (ring が切れる) が無いこと
      const clip = await page.evaluate(
        ({ rowId, chipId }) => {
          const row = document.querySelector<HTMLElement>(`[data-testid="${rowId}"]`);
          const chip = document.querySelector<HTMLElement>(`[data-testid="${chipId}"]`);
          if (!row || !chip) return { vClip: 99, ringRoom: -1, paddingTop: 0 };
          const r = row.getBoundingClientRect();
          const c = chip.getBoundingClientRect();
          const cs = window.getComputedStyle(row);
          return {
            vClip: row.scrollHeight - row.clientHeight,
            // ring は 2px。上下にそれ以上の余白 (padding) が必要
            ringRoom: Math.min(c.top - r.top, r.bottom - c.bottom),
            paddingTop: parseFloat(cs.paddingTop) || 0,
          };
        },
        { rowId: DISTANCE_ROW, chipId: lastId },
      );
      expect(clip.vClip, "行が縦方向にスクロール可能 = ring がクリップされている").toBeLessThanOrEqual(
        1,
      );
      expect(clip.ringRoom, "チップ上下に focus ring 2px 分の余白が無い").toBeGreaterThanOrEqual(2);
    });
  });

  // =========================================================================
  // SC-6: エントリータブのチップ行
  // =========================================================================
  test.describe("[V-04] エントリータブのチップ行", () => {
    const DISTANCE_ROW = "chiprow-entry-style-1-distance";
    const STROKE_ROW = "chiprow-entry-style-1-stroke";

    test("375px: 距離行・泳法行が1行 + 横スクロール可能", async ({ page }) => {
      await page.setViewportSize(VIEWPORTS.vp375);
      await supabaseLogin(page);
      await page.goto("/ja/dashboard");
      await openCompetitionTabModal(page, FUTURE_DATE); // 未来日 = エントリータブ
      await activateTabShowing(page, DISTANCE_ROW);

      assertMobileCarousel("375px エントリー距離行", await measureRow(page, DISTANCE_ROW), {
        mustOverflow: true,
      });
      assertMobileCarousel("375px エントリー泳法行", await measureRow(page, STROKE_ROW));
    });

    test("1280px: 折り返し表示に戻る", async ({ page }) => {
      await page.setViewportSize(VIEWPORTS.vp1280);
      await supabaseLogin(page);
      await page.goto("/ja/dashboard");
      await openCompetitionTabModal(page, FUTURE_DATE);
      await activateTabShowing(page, DISTANCE_ROW);

      assertDesktopWrap("1280px エントリー距離行", await measureRow(page, DISTANCE_ROW));
      assertDesktopWrap("1280px エントリー泳法行", await measureRow(page, STROKE_ROW));
    });

    test("1280px: エントリータブの距離行と泳法行の縦間隔が潰れていない", async ({ page }) => {
      await page.setViewportSize(VIEWPORTS.vp1280);
      await supabaseLogin(page);
      await page.goto("/ja/dashboard");
      await openCompetitionTabModal(page, FUTURE_DATE);
      await activateTabShowing(page, DISTANCE_ROW);

      const gap = await measureRowGap(page, DISTANCE_ROW, STROKE_ROW);
      expect(gap.found).toBe(true);
      expect(gap.sameParent, `parent="${gap.parentClass}"`).toBe(true);
      expect(gap.gap, `エントリータブの行間が潰れている (gap=${gap.gap}px)`).toBeGreaterThan(4.5);
      expect(gap.gap, `エントリータブの行間が広すぎる (gap=${gap.gap}px)`).toBeLessThan(7.5);
    });
  });

  // =========================================================================
  // SC-7 / BC-2: 練習ログのチップ行
  // =========================================================================
  test.describe("[V-05] 練習ログのチップ行", () => {
    const STYLE_ROW = "chiprow-practice-style";
    const CATEGORY_ROW = "chiprow-practice-swim-category";
    const DISTANCE_ROW = "chiprow-practice-distance-preset";

    for (const vpKey of ["vp320", "vp375"] as const) {
      test(`${VIEWPORTS[vpKey].width}px: 種目行・カテゴリ行・距離行がすべて1行`, async ({
        page,
      }) => {
        await page.setViewportSize(VIEWPORTS[vpKey]);
        await supabaseLogin(page);
        await page.goto("/ja/dashboard");
        await openPracticeTabModal(page, PAST_DATE);
        await activateTabShowing(page, STYLE_ROW);

        assertMobileCarousel(`${VIEWPORTS[vpKey].width}px 種目行`, await measureRow(page, STYLE_ROW));
        assertMobileCarousel(
          `${VIEWPORTS[vpKey].width}px カテゴリ行`,
          await measureRow(page, CATEGORY_ROW),
        );
        const distance = await measureRow(page, DISTANCE_ROW);
        assertMobileCarousel(`${VIEWPORTS[vpKey].width}px 距離行`, distance);
        expect(distance.documentOverflowX, "ページ全体が横あふれ").toBeLessThanOrEqual(1);
      });
    }

    test("375px: 種目行は横スクロール可能で、末尾チップまで到達できる", async ({ page }) => {
      await page.setViewportSize(VIEWPORTS.vp375);
      await supabaseLogin(page);
      await page.goto("/ja/dashboard");
      await openPracticeTabModal(page, PAST_DATE);
      await activateTabShowing(page, STYLE_ROW);

      const m = await measureRow(page, STYLE_ROW);
      // 条件分岐にすると「溢れなければ何も検証しないまま緑」になるので
      // 375px では必ず溢れることを前提条件として固定する。
      // (種目は Fr/Ba/Br/Fly/IM の 5 チップ + gap で 375px には収まらない)
      expect(
        m.scrollWidth,
        `375px で種目行が溢れていない = fixture が前提を満たしていない (scrollWidth=${m.scrollWidth}, clientWidth=${m.clientWidth})`,
      ).toBeGreaterThan(m.clientWidth + 1);

      const lastId = await lastChipTestId(page, STYLE_ROW);
      await scrollRowToEnd(page, STYLE_ROW);
      const visible = await chipFullyVisibleInRow(page, STYLE_ROW, lastId);
      expect(visible.ok, `末尾チップに到達できない: ${visible.reason}`).toBe(true);
    });

    test("[BC] 「その他」→数値入力に切り替えても距離行が1行のまま", async ({ page }) => {
      await page.setViewportSize(VIEWPORTS.vp375);
      await supabaseLogin(page);
      await page.goto("/ja/dashboard");
      await openPracticeTabModal(page, PAST_DATE);
      await activateTabShowing(page, DISTANCE_ROW);

      const before = await measureRow(page, DISTANCE_ROW);
      await page.locator('[data-testid="practice-distance-other"]').click();
      await expect(page.locator('[data-testid="practice-distance"]')).toBeVisible();
      await page.waitForTimeout(200);

      const after = await measureRow(page, DISTANCE_ROW);
      assertMobileCarousel("375px 距離行 (その他入力中)", after);
      // autoFocus によるスクロールジャンプでページが崩れていないこと
      expect(after.documentOverflowX, "ページ全体が横あふれ").toBeLessThanOrEqual(1);
      expect(
        Math.abs(after.height - before.height),
        "「その他」入力欄に切り替えると行の高さが変わる",
      ).toBeLessThanOrEqual(2);
    });

    test("1280px: 3行すべて折り返し表示に戻る", async ({ page }) => {
      await page.setViewportSize(VIEWPORTS.vp1280);
      await supabaseLogin(page);
      await page.goto("/ja/dashboard");
      await openPracticeTabModal(page, PAST_DATE);
      await activateTabShowing(page, STYLE_ROW);

      assertDesktopWrap("1280px 種目行", await measureRow(page, STYLE_ROW));
      assertDesktopWrap("1280px カテゴリ行", await measureRow(page, CATEGORY_ROW));
      assertDesktopWrap("1280px 距離行", await measureRow(page, DISTANCE_ROW));
    });
  });

  // =========================================================================
  // SC-8 / BC-5 / BC-8: スプリット行の入力幅
  // =========================================================================
  test.describe("[V-06] スプリット行の入力幅 (F-1 修正)", () => {
    const DISTANCE_ROW = "chiprow-record-style-distance-1";

    async function openRecordTabWithSplit(page: Page) {
      await supabaseLogin(page);
      await page.goto("/ja/dashboard");
      await openCompetitionTabModal(page, PAST_DATE);
      await activateTabShowing(page, DISTANCE_ROW);
      // スプリット行を1行追加する
      await page.locator('[data-testid="record-split-add-button-1"]').click();
      await expect(page.locator('[data-testid="record-split-distance-1-1"]')).toBeVisible({
        timeout: 10000,
      });
    }

    test("375px: 距離 input が 56〜72px、タイム input が 160px 以上", async ({ page }) => {
      await page.setViewportSize(VIEWPORTS.vp375);
      await openRecordTabWithSplit(page);

      const distW = await inputWidth(page, "record-split-distance-1-1");
      const timeW = await inputWidth(page, "record-split-time-1-1");

      expect(distW, `距離 input 幅が範囲外: ${distW}px`).toBeGreaterThanOrEqual(56);
      expect(distW, `距離 input 幅が範囲外: ${distW}px`).toBeLessThanOrEqual(72);
      expect(timeW, `タイム input 幅が狭すぎる: ${timeW}px`).toBeGreaterThanOrEqual(160);
    });

    test("1280px: 距離 input が 96px (PM 裁定: デスクトップも 180→96 に変更)", async ({ page }) => {
      await page.setViewportSize(VIEWPORTS.vp1280);
      await openRecordTabWithSplit(page);

      const distW = await inputWidth(page, "record-split-distance-1-1");
      expect(distW, `距離 input 幅が 96px 近辺でない: ${distW}px`).toBeGreaterThanOrEqual(90);
      expect(distW, `距離 input 幅が 96px 近辺でない: ${distW}px`).toBeLessThanOrEqual(102);
    });

    for (const vpKey of ["vp375", "vp1280"] as const) {
      test(`[BC] ${VIEWPORTS[vpKey].width}px: 距離に 1500 を入れても文字が見切れない`, async ({
        page,
      }) => {
        await page.setViewportSize(VIEWPORTS[vpKey]);
        await openRecordTabWithSplit(page);

        await page.locator('[data-testid="record-split-distance-1-1"]').fill("1500");
        await page.waitForTimeout(150);
        await expect(page.locator('[data-testid="record-split-distance-1-1"]')).toHaveValue("1500");

        const clipped = await inputIsClipped(page, "record-split-distance-1-1");
        expect(clipped, "1500 が距離 input 内で見切れている").toBe(false);
      });
    }

    test("[BC] 640-767px (16px 強制帯) でもスプリット行が横あふれしない", async ({ page }) => {
      await page.setViewportSize(VIEWPORTS.vp767);
      await openRecordTabWithSplit(page);
      await page.locator('[data-testid="record-split-distance-1-1"]').fill("1500");

      // ★ スプリット行は parentElement の段数で辿ってはいけない。
      //   Input (components/ui/Input.tsx) は <input> を
      //   <div class="space-y-2"><div class="relative"><input> の 2 段で包むため、
      //   2 段上は「Input 自身のルート」であって行ではない。そこを測ると
      //   中身が w-full の input 1 つだけなので scrollWidth - clientWidth が
      //   **常に 0** になり、原理的に失敗しない assert になる
      //   (前ラウンドの H-1 とまったく同型の誤り)。
      //   jsdom 側 splitRow() と同じく「距離 input とタイム input の両方を含む
      //   最も近い祖先」を行として構造から導出する。
      const rowMetrics = await page.evaluate(() => {
        const dist = document.querySelector<HTMLElement>(
          '[data-testid="record-split-distance-1-1"]',
        );
        const time = document.querySelector<HTMLElement>('[data-testid="record-split-time-1-1"]');
        if (!dist || !time) return { found: false, overflow: 99, rowClass: "", isFlexRow: false };

        let row: HTMLElement | null = dist.parentElement;
        while (row && !row.contains(time)) row = row.parentElement;
        if (!row) return { found: false, overflow: 99, rowClass: "", isFlexRow: false };

        const cs = window.getComputedStyle(row);
        return {
          found: true,
          overflow: row.scrollWidth - row.clientWidth,
          rowClass: row.className,
          // 行が横並び (flex) であること自体も前提なので併せて確認する。
          // block に戻ると距離とタイムが縦に積まれ、横あふれは起きなくなる =
          // overflow だけ見ていると壊れたのに緑になる
          isFlexRow: cs.display === "flex",
        };
      });
      expect(rowMetrics.found, "スプリット行 (距離+タイムを含む祖先) を導出できない").toBe(true);
      expect(
        rowMetrics.isFlexRow,
        `スプリット行が横並びでない (display=${rowMetrics.rowClass})`,
      ).toBe(true);
      expect(
        rowMetrics.overflow,
        `767px でスプリット行が横あふれ (class="${rowMetrics.rowClass}")`,
      ).toBeLessThanOrEqual(1);

      const clipped = await inputIsClipped(page, "record-split-distance-1-1");
      expect(clipped, "767px (font-size 16px 強制) で 1500 が見切れる").toBe(false);
    });
  });

  // =========================================================================
  // M-4: 設定 > 練習ログテンプレート作成モーダルのチップ行
  //      (Phase A の検証網に入っていなかった画面。Reviewer 指摘で追加)
  // =========================================================================
  test.describe("[V-08] テンプレート作成モーダルのチップ行", () => {
    const STYLE_ROW = "chiprow-template-style";
    const CATEGORY_ROW = "chiprow-template-swim-category";
    const DISTANCE_ROW = "chiprow-template-distance-preset";

    /**
     * 作成ボタンに data-testid が無いためラベルで引く。
     * テンプレート 0 件のときは `list.emptyCreateButton`、1 件以上のときは
     * `list.createNewButton` が出る (ja ではどちらも「新しいテンプレートを作成」)。
     * 「ボタンを総当たりで押す」方式は 375px で別要素を押して失敗したのでやめた。
     */
    async function openTemplateCreateModal(page: Page) {
      await page.goto("/ja/settings/practice-log-templates");
      await page.waitForLoadState("networkidle").catch(() => {});

      const createButton = page.getByRole("button", { name: "新しいテンプレートを作成" }).first();
      await expect(
        createButton,
        "テンプレート作成ボタンが見つからない (上限到達で disabled の可能性)",
      ).toBeVisible({ timeout: 15000 });
      await createButton.scrollIntoViewIfNeeded();
      await createButton.click();

      await expect(page.locator(`[data-testid="${DISTANCE_ROW}"]`).first()).toBeVisible({
        timeout: 10000,
      });
    }

    for (const vpKey of ["vp375", "vp1280"] as const) {
      test(`${VIEWPORTS[vpKey].width}px: 種目 / カテゴリ / 距離の3行が期待どおり`, async ({
        page,
      }) => {
        await page.setViewportSize(VIEWPORTS[vpKey]);
        await supabaseLogin(page);
        await openTemplateCreateModal(page);

        for (const rowId of [STYLE_ROW, CATEGORY_ROW, DISTANCE_ROW]) {
          const m = await measureRow(page, rowId);
          const label = `${VIEWPORTS[vpKey].width}px テンプレート ${rowId}`;
          if (VIEWPORTS[vpKey].width < 640) {
            assertMobileCarousel(label, m);
          } else {
            assertDesktopWrap(label, m);
          }
        }
      });
    }
  });

  // =========================================================================
  // SC-11: ItemTabs のスクロールバー非表示
  // =========================================================================
  test.describe("[V-07] ItemTabs のスクロールバー", () => {
    test("375px: 記録タブ行のスクロールバーが非表示 (scrollbar-hide が効いている)", async ({
      page,
    }) => {
      await page.setViewportSize(VIEWPORTS.vp375);
      await supabaseLogin(page);
      await page.goto("/ja/dashboard");
      await openCompetitionTabModal(page, PAST_DATE);
      await activateTabShowing(page, "chiprow-record-style-distance-1");

      const state = await page.evaluate(() => {
        // ItemTabs の tablist (aria-label="item tabs")
        const list = document.querySelector<HTMLElement>('[role="tablist"][aria-label="item tabs"]');
        if (!list) return { found: false, scrollbarWidth: "", barHeight: -1, overflowX: "" };
        const cs = window.getComputedStyle(list);
        return {
          found: true,
          scrollbarWidth: (cs as unknown as Record<string, string>).scrollbarWidth ?? "",
          // 横スクロールバーが場所を取っていれば offsetHeight > clientHeight になる
          barHeight: list.offsetHeight - list.clientHeight,
          overflowX: cs.overflowX,
        };
      });

      expect(state.found, "ItemTabs の tablist が見つからない").toBe(true);
      expect(state.overflowX, "タブ行が横スクロール容器でない").toMatch(/auto|scroll/);
      expect(state.scrollbarWidth, "scrollbar-width: none が効いていない").toBe("none");
      expect(state.barHeight, "スクロールバーが高さを占有している").toBeLessThanOrEqual(1);
    });
  });
});
