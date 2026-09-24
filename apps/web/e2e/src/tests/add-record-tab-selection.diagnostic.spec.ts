import { expect, test, type Page } from "@playwright/test";
import { format, subDays } from "date-fns";
import { createClient } from "@supabase/supabase-js";
import { EnvConfig } from "../config/config";
import { supabaseLogin } from "../utils/supabase-login";

/**
 * 診断 E2E (実装ではない): 「過去大会・レースレコード0件の状態で、大会カード内の
 * 『+ 大会記録を追加』ボタンを押すと大会タブが選択された状態で開いてしまう」
 * というユーザー報告の実ブラウザ再現。
 *
 * jsdom (単体/結合テスト) では supabase 以外すべて実物を使った結線でも
 * 再現しなかった (AddRecordFromPastCompetitionZeroRecords.e2e.diagnostic.test.tsx)。
 * PM の新仮説: dev サーバーの HMR がストア/クロージャを汚染している可能性。
 * 本テストは実ブラウザ・実 dev サーバー・実ローカル Supabase で再現するかを見る。
 *
 * 再現条件 (ユーザー確認済み):
 *   - 過去日、大会だけ (エントリー/記録なし)、レースレコード0件
 *   - カード内の「+ 大会記録を追加」(下部クイック追加ボタンとは別物)
 *   - 個人大会・チーム大会の両方
 */

let hasRequiredEnvVars = false;
try {
  EnvConfig.getTestEnvironment();
  hasRequiredEnvVars = true;
} catch (error) {
  console.error("環境変数の検証に失敗しました:", error instanceof Error ? error.message : error);
}

// 個人/チームで別日にする (同日だとカードが2枚並び、ボタンの取り違えテストにも
// なってしまうため。日付を分けて各テストが1枚のカードだけを相手にする)。
const PERSONAL_PAST_DATE = format(subDays(new Date(), 14), "yyyy-MM-dd");
const TEAM_PAST_DATE = format(subDays(new Date(), 15), "yyyy-MM-dd");
const PERSONAL_TITLE = "診断E2E個人大会タブ選択";
const TEAM_TITLE = "診断E2Eチーム大会タブ選択";

test.describe("診断: 過去大会・記録0件で「記録を追加」を押したときの初期タブ (実ブラウザ)", () => {
  test.describe.configure({ timeout: 90000 });

  test.skip(
    !hasRequiredEnvVars,
    "必要な環境変数が設定されていません。E2E_BASE_URL, E2E_EMAIL, E2E_PASSWORD を設定してください。",
  );

  let personalCompetitionId: string | null = null;
  let teamCompetitionId: string | null = null;

  test.beforeAll(async () => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY environment variable is not set.");
    }

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
    if (!testUser) {
      throw new Error(`E2E テストユーザーが見つかりません: ${testEmail}`);
    }

    // (authenticated)/layout は onboarding_completed=false のユーザーを /onboarding へ
    // 強制リダイレクトする (billing-e2e-manual.spec.ts と同型の対処)。本テストの
    // 検証対象ではないため、DB 側で完了済みに更新してからダッシュボードへ入る。
    await supabase.from("users").update({ onboarding_completed: true }).eq("id", testUser.id);

    // --- クリーンアップ (このスペック専用の識別可能なタイトルのみ対象) ---
    await supabase.from("competitions").delete().eq("title", PERSONAL_TITLE);
    await supabase.from("competitions").delete().eq("title", TEAM_TITLE);
    await supabase.from("teams").delete().eq("name", "診断E2Eチーム");

    // --- 個人大会 (team_id なし、過去日、records 0件) ---
    const { data: personalComp, error: personalErr } = await supabase
      .from("competitions")
      .insert({
        user_id: testUser.id,
        title: PERSONAL_TITLE,
        date: PERSONAL_PAST_DATE,
        place: "診断用プール",
        pool_type: 0,
        team_id: null,
      })
      .select("id")
      .single();
    if (personalErr) throw new Error(`個人大会シード失敗: ${personalErr.message}`);
    personalCompetitionId = personalComp.id;

    // --- チーム作成 + テストユーザーを admin として参加させる ---
    const { data: team, error: teamErr } = await supabase
      .from("teams")
      .insert({
        name: "診断E2Eチーム",
        invite_code: `E2E-DIAG-${Date.now()}`,
        created_by: testUser.id,
      })
      .select("id")
      .single();
    if (teamErr) throw new Error(`チーム作成失敗: ${teamErr.message}`);

    const { error: memberErr } = await supabase.from("team_memberships").insert({
      team_id: team.id,
      user_id: testUser.id,
      role: "admin",
      status: "approved",
      is_active: true,
      joined_at: new Date().toISOString(),
    });
    if (memberErr) throw new Error(`チームメンバーシップ作成失敗: ${memberErr.message}`);

    // --- チーム大会 (team_id あり、過去日、records 0件) ---
    const { data: teamComp, error: teamCompErr } = await supabase
      .from("competitions")
      .insert({
        user_id: testUser.id,
        title: TEAM_TITLE,
        date: TEAM_PAST_DATE,
        place: "診断用チームプール",
        pool_type: 0,
        team_id: team.id,
        entry_status: "closed",
      })
      .select("id")
      .single();
    if (teamCompErr) throw new Error(`チーム大会シード失敗: ${teamCompErr.message}`);
    teamCompetitionId = teamComp.id;

    console.log(
      `✅ シード完了: personal=${personalCompetitionId} team=${teamCompetitionId} personalDate=${PERSONAL_PAST_DATE} teamDate=${TEAM_PAST_DATE}`,
    );
  });

  test.beforeEach(async ({ page }) => {
    await supabaseLogin(page);
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
  });

  /**
   * DayDetailModal 内には「大会記録を追加」という同一文言のボタンが2つ存在する:
   *   1. 下部クイック追加セクション (data-testid="add-record-button"。新規の空大会
   *      作成フォームを開く。これはユーザーが言っているボタンではない)
   *   2. 大会カード内のプレースホルダ (records=0件のときのみ表示。data-testid 無し。
   *      onAddRecord({ competitionId }) → onClose() を呼ぶ。これがユーザーが
   *      言っている「+ 大会記録を追加」)
   * data-testid を持たない方を明示的に選ぶ (jsdom 診断テストと同じ誤選択を避ける)。
   */
  async function clickCardAddRecordButton(page: Page) {
    const candidates = page.locator("button", { hasText: "大会記録を追加" });
    const count = await candidates.count();
    for (let i = 0; i < count; i++) {
      const btn = candidates.nth(i);
      const testId = await btn.getAttribute("data-testid");
      if (!testId) {
        await btn.click();
        return;
      }
    }
    throw new Error("カード内の「大会記録を追加」ボタンが見つからない (候補: " + count + "件)");
  }

  /**
   * PM 追加仮説: ユーザーのスクショは幅750px程度の狭いビューポートだった。
   * aria-selected だけでなく、
   *   - 実際にどちらのパネル (role="tabpanel") の中身が見えているか
   *     (competition-tab-date = 大会パネル固有 / record-add-button = レコードパネル固有)
   *   - タブバー (レースレコードタブのボタン) 自体が画面内 (ビューポート幅内) に
   *     収まっているか (収まっていないと「選択中のタブが視界外」になりうる)
   * も確認する。screenshotPrefix ごとにスクリーンショットを保存する。
   */
  async function assertRecordTabSelected(
    page: Page,
    expectedTitle: string,
    screenshotPrefix: string,
  ) {
    await page.waitForSelector('[role="tab"]', { timeout: 10000 });

    const recordTab = page.getByRole("tab", { name: "レースレコード" });
    const competitionTab = page.getByRole("tab", { name: "大会" });

    await expect(recordTab).toBeVisible();
    await expect(competitionTab).toBeVisible();

    const titleInput = page.locator('input[value="' + expectedTitle + '"]');
    await expect(titleInput)
      .toBeVisible({ timeout: 5000 })
      .catch(() => {
        console.log("⚠️ タイトル入力欄の value 確認に失敗 (別セレクタの可能性)");
      });

    const recordSelected = await recordTab.getAttribute("aria-selected");
    const competitionSelected = await competitionTab.getAttribute("aria-selected");

    // 実際にどちらのパネル内容が見えているか (aria-selected とは独立に確認する)。
    // hidden 属性で切り替わる role="tabpanel" のうち、実際に表示されている方を見る。
    const recordPanelMarkerVisible = await page
      .locator('[data-testid="record-add-button"]')
      .isVisible()
      .catch(() => false);
    const competitionPanelMarkerVisible = await page
      .locator('[data-testid="competition-tab-date"]')
      .isVisible()
      .catch(() => false);

    // タブバー (レースレコードボタン) がビューポート内に収まっているか
    // (横スクロールしないと見えない状態だと「選択中タブが視界外」になりうる)。
    const viewportSize = page.viewportSize();
    const recordTabBox = await recordTab.boundingBox();
    const tabBarWithinViewport =
      !!viewportSize &&
      !!recordTabBox &&
      recordTabBox.x >= 0 &&
      recordTabBox.x + recordTabBox.width <= viewportSize.width;

    console.log(
      `[診断結果][vp=${viewportSize?.width}x${viewportSize?.height}] title=${expectedTitle} ` +
        `record.aria-selected=${recordSelected} competition.aria-selected=${competitionSelected} ` +
        `recordPanelVisible=${recordPanelMarkerVisible} competitionPanelVisible=${competitionPanelMarkerVisible} ` +
        `tabBarWithinViewport=${tabBarWithinViewport} recordTabBox=${JSON.stringify(recordTabBox)}`,
    );

    const screenshotPath = `/private/tmp/claude-501/-Users-ryuuhei-0729-SwimHub/4f13f8ad-c71c-4bb3-b588-552ba11d688f/scratchpad/${screenshotPrefix}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`[スクリーンショット] ${screenshotPath}`);

    expect(recordSelected).toBe("true");
    expect(competitionSelected).toBe("false");
    expect(recordPanelMarkerVisible).toBe(true);
    expect(competitionPanelMarkerVisible).toBe(false);
  }

  async function openCardAndClickAddRecord(page: Page, date: string) {
    await page.waitForSelector('[data-testid="calendar-day"]', { timeout: 15000 });
    const dayCell = page.locator(`[data-testid="calendar-day"][data-date="${date}"]`);
    await dayCell.click();

    await page.waitForSelector(
      '[data-testid="day-detail-modal"], [data-testid="record-detail-modal"]',
      { timeout: 10000 },
    );
    await page.waitForTimeout(1000);

    await clickCardAddRecordButton(page);
  }

  const VIEWPORTS = [
    { name: "mobile-375x812", width: 375, height: 812 },
    { name: "user-750x1000", width: 750, height: 1000 },
    { name: "tablet-768x1024", width: 768, height: 1024 },
    { name: "desktop-1280x720", width: 1280, height: 720 },
  ];

  for (const vp of VIEWPORTS) {
    test(`[診断E2E-個人-${vp.name}] 個人の過去大会・記録0件でカード内「記録を追加」を押すと record タブが選択される`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await openCardAndClickAddRecord(page, PERSONAL_PAST_DATE);
      await assertRecordTabSelected(page, PERSONAL_TITLE, `personal-${vp.name}`);
    });

    test(`[診断E2E-チーム-${vp.name}] チームの過去大会・記録0件でカード内「記録を追加」を押すと record タブが選択される`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await openCardAndClickAddRecord(page, TEAM_PAST_DATE);
      await assertRecordTabSelected(page, TEAM_TITLE, `team-${vp.name}`);
    });
  }
});
