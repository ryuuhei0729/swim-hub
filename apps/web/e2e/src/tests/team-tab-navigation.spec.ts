import { expect, test, type Page } from "@playwright/test";
import { EnvConfig, URLS } from "../config/config";
import { supabaseLogin } from "../utils/supabase-login";

/**
 * チーム詳細のタブ切替 E2E
 *
 * ■ なぜ専用のスペックが要るのか
 *   既存の teams.spec.ts / members.spec.ts はタブへ `?tab=xxx` の**直リンク**で
 *   遷移している。しかし実際に起きた不具合は「**タブをクリックしたときだけ**
 *   初回が効かない」というもので、直リンクでは**構造的に素通し**する。
 *
 *   機構 (Next 16.3.5 の実ソースで確定):
 *     `dynamic(() => import(...))` はオプション無しだと既定が
 *     `ssr: true` / `loading: null` になり、
 *     `hasSuspenseBoundary = !opts.ssr || !!opts.loading` が false になるため
 *     **Next は自前の Suspense 境界を作らない**。サスペンドは上へ伝播し、
 *     最も近い境界である `page.tsx` の `<Suspense>` がフォールバックをコミットする。
 *     React は隠したツリーの effect を破棄するので、`TeamDetailClient` の
 *     アンマウント cleanup (`reset()`) が走り、`activeTab` が既定値へ戻る。
 *     = 未ロードのタブを**初めて押したときだけ**クリックが消える。
 *
 *   対策は各 `dynamic()` に `loading` を渡して境界をローカル化すること。
 *   本スペックはその退行を **実ブラウザ**で検出する。
 *
 * ■ 測り方の要点
 *   - **毎回リロードしてから「1回目のクリック」を測る。**
 *     2回目はチャンクがキャッシュ済みで必ず通るため、意味が無い。
 *   - 設定タブだけでなく他のタブでも確認する (境界は各 dynamic ごとに要る)。
 *   - クリック後に**別の値へ戻らない**ことまで見る (reset の再発検出)。
 *
 * ■ jsdom では再現不能
 *   vitest は `next/dynamic` を app-router 版ではなく pages 版に解決するため、
 *   この経路はユニットテストでは原理的に踏めない。**実ブラウザでしか担保できない。**
 */

let hasRequiredEnvVars = false;
try {
  EnvConfig.getTestEnvironment();
  hasRequiredEnvVars = true;
} catch (error) {
  console.error("環境変数の検証に失敗しました:", error instanceof Error ? error.message : error);
}

/** アクティブなタブのラベル (TeamTabs は選択中に border-blue-500 を付ける) */
async function activeTabLabel(page: Page): Promise<string> {
  return await page.evaluate(() => {
    const buttons = [...document.querySelectorAll("nav[aria-label='Tabs'] button")];
    return (
      buttons
        .filter((b) => b.className.includes("border-blue-500"))
        .map((b) => (b as HTMLElement).innerText.trim())
        .join(",") || "(none)"
    );
  });
}

/** 参加しているチームの id を1つ取得する */
async function findTeamId(page: Page): Promise<string | null> {
  await page.goto(URLS.TEAMS);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000);

  const teamCards = page.locator('a[href^="/teams/"]');
  if ((await teamCards.count()) === 0) return null;
  const href = await teamCards.first().getAttribute("href");
  return href?.split("/teams/")[1]?.split("/")[0] ?? null;
}

/** チーム詳細を**新規ロード**し、指定タブを**1回だけ**クリックする */
async function reloadAndClickTab(page: Page, teamId: string, label: string) {
  await page.goto(`/ja/teams/${teamId}`);
  await page.waitForSelector("nav[aria-label='Tabs']", { timeout: 30000 });
  // ハイドレーション完了を待つ (急ぎすぎるとクリックが届かない)
  await page.waitForTimeout(3000);

  await page.getByRole("button", { name: label, exact: true }).click();
  await page.waitForTimeout(2500);
}

test.describe("チーム詳細のタブ切替 (クリック経由)", () => {
  test.skip(!hasRequiredEnvVars, "必要な環境変数が設定されていません。");

  test.beforeEach(async ({ page }) => {
    await supabaseLogin(page);
  });

  /**
   * TC-TABNAV-001: リロード直後の**1回目のクリック**で各タブに到達できる
   *
   * 🚨 `?tab=` の直リンクに置き換えてはいけない。直リンクでは今回の不具合を
   *    素通しする (それが既存スペックの死角だった)。
   */
  test("TC-TABNAV-001: リロード後の1回目のクリックで各タブへ到達する", async ({ page }) => {
    const teamId = await findTeamId(page);
    if (!teamId) {
      console.log("参加しているチームがないため、テストをスキップします");
      test.skip();
      return;
    }

    // 設定タブ (今スプリントの成果物) を含め、複数のタブで確認する。
    // 境界は dynamic() ごとに必要なので、1つ通っても他が通るとは限らない
    for (const label of ["設定", "メンバー", "練習"]) {
      await reloadAndClickTab(page, teamId, label);

      expect(
        await activeTabLabel(page),
        `「${label}」タブがリロード後の1回目のクリックで選択されない。` +
          "dynamic() の loading 未指定で Suspense 境界が page.tsx まで上がり、" +
          "フォールバックのコミットで TeamDetailClient の effect が破棄されている可能性がある",
      ).toBe(label);
    }
  });

  /**
   * TC-TABNAV-002: クリック後に activeTab が別の値へ戻らない
   *
   * reset() が走ると既定タブ (出欠) へ戻る。押した直後だけでなく
   * **チャンク解決後まで**見ないと、戻りを取りこぼす。
   */
  test("TC-TABNAV-002: タブをクリックした後、別の値へ戻らない", async ({ page }) => {
    const teamId = await findTeamId(page);
    if (!teamId) {
      console.log("参加しているチームがないため、テストをスキップします");
      test.skip();
      return;
    }

    await reloadAndClickTab(page, teamId, "設定");
    const right_after = await activeTabLabel(page);
    expect(right_after).toBe("設定");

    // チャンク解決・再レンダーが落ち着くまで待ってから再確認する
    await page.waitForTimeout(5000);
    expect(
      await activeTabLabel(page),
      "クリック直後は「設定」だったが、その後 activeTab が戻った。" +
        "ストアの reset() が走っている可能性がある",
    ).toBe("設定");

    // 設定タブの中身まで到達していること (タブのハイライトだけでなく本文も出る)
    await expect(page.locator('[data-testid="team-settings-tab"]')).toBeVisible({
      timeout: 15000,
    });
  });
});
