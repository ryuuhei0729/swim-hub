import { expect, test } from "@playwright/test";
import { format, subDays } from "date-fns";
import { createClient } from "@supabase/supabase-js";
import { EnvConfig } from "../config/config";
import { supabaseLogin } from "../utils/supabase-login";

/**
 * 目標管理のE2Eテスト
 *
 * テストケース:
 * - TC-GOALS-001: 目標の新規作成 (修正版: StyleChipSelector対応 + 骨抜きフォールバック撤去)
 * - TC-GOALS-002: 目標の編集 (既存・変更なし)
 * - TC-GOALS-003: 目標の削除 (既存・変更なし)
 * - TC-GOALS-004: 目標達成マーク (修正版: /dashboard 経由)
 * - TC-GOALS-004b: 「達成できなかった」振り返りメモの永続化 (新規)
 * - TC-GOALS-005: 目標一覧表示 (既存・変更なし)
 * - TC-GOALS-006: チーム大会を対象大会に選択して目標作成 (新規)
 */

// テスト開始前に環境変数を検証
let hasRequiredEnvVars = false;
try {
  EnvConfig.getTestEnvironment();
  hasRequiredEnvVars = true;
} catch (error) {
  console.error("環境変数の検証に失敗しました:", error instanceof Error ? error.message : error);
}

/** Supabase サービスロールクライアントを作成するヘルパー */
function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY environment variable is not set. Please set it before running E2E tests.",
    );
  }
  return createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** テストユーザーのメールアドレスを取得 */
function getTestEmail(): string {
  try {
    const env = EnvConfig.getTestEnvironment();
    return env.credentials.email;
  } catch {
    return "e2e-test@swimhub.com";
  }
}

/** ページネーション対応でテストユーザーの ID を取得 */
async function findTestUserId(
  supabase: ReturnType<typeof createAdminClient>,
  email: string,
): Promise<string | null> {
  const targetEmail = email.toLowerCase();
  let page = 1;
  const perPage = 500;
  for (;;) {
    const { data: users, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.error("ユーザー一覧取得エラー:", error);
      return null;
    }
    const found = users?.users?.find((u) => u.email?.toLowerCase() === targetEmail);
    if (found) return found.id;
    if (!users?.users?.length || users.users.length < perPage) return null;
    page++;
  }
}

// 種目マスター (styles.style='Fr', distance=100) の id。既存 seed で不変であることを
// 前提にせず、実行時に解決する (下記 resolveFreestyle100Id)。
async function resolveFreestyle100Id(supabase: ReturnType<typeof createAdminClient>): Promise<number> {
  const { data } = await supabase
    .from("styles")
    .select("id")
    .eq("style", "Fr")
    .eq("distance", 100)
    .single();
  return data?.id ?? 3;
}

test.describe("目標管理のテスト", () => {
  test.describe.configure({ timeout: 60000 });
  test.skip(!hasRequiredEnvVars, "必要な環境変数が設定されていません。");

  test.describe("大会目標 (goals) の対象大会が未来日のケース", () => {
    let testUserId = "";
    let teamId = "";
    let teamCompetitionId = "";

    test.beforeAll(async () => {
      const supabase = createAdminClient();
      const testEmail = getTestEmail();
      const foundId = await findTestUserId(supabase, testEmail);
      if (!foundId) {
        console.error(`テストユーザー ${testEmail} が見つかりません`);
        return;
      }
      testUserId = foundId;

      // --- クリーンアップ: ゴールとマイルストーンを削除 ---
      const { data: goals } = await supabase.from("goals").select("id").eq("user_id", testUserId);
      if (goals && goals.length > 0) {
        const goalIds = goals.map((g) => g.id);
        await supabase.from("milestones").delete().in("goal_id", goalIds);
        await supabase.from("goals").delete().eq("user_id", testUserId);
      }

      // テスト用個人大会・チーム・チーム大会をクリーンアップ (E2E目標テスト用のもの)
      await supabase.from("competitions").delete().eq("user_id", testUserId).eq("title", "E2E目標テスト大会");
      await supabase.from("competitions").delete().eq("user_id", testUserId).eq("title", "E2E目標テストチーム大会");
      await supabase.from("teams").delete().eq("name", "E2E目標テストチーム").eq("created_by", testUserId);

      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 30);
      const futureDateKey = format(futureDate, "yyyy-MM-dd");

      // --- 個人大会 + 目標 (TC-GOALS-002/003/005 用シード) ---
      const { data: newComp, error: compError } = await supabase
        .from("competitions")
        .insert({
          user_id: testUserId,
          title: "E2E目標テスト大会",
          date: futureDateKey,
          place: "テスト会場",
          pool_type: 1,
        })
        .select("id")
        .single();
      if (compError) {
        console.error("大会作成エラー:", compError);
        return;
      }

      const styleId = await resolveFreestyle100Id(supabase);

      const { error: goalError } = await supabase.from("goals").insert({
        user_id: testUserId,
        competition_id: newComp.id,
        style_id: styleId,
        target_time: 60.0,
        status: "active",
      });
      if (goalError) {
        console.error("目標作成エラー:", goalError);
      }

      // --- TC-GOALS-006 用: チーム + チーム大会 (テストユーザーを admin として参加) ---
      const { data: team, error: teamErr } = await supabase
        .from("teams")
        .insert({
          name: "E2E目標テストチーム",
          invite_code: `E2E-GOALS-${Date.now()}`,
          created_by: testUserId,
        })
        .select("id")
        .single();
      if (teamErr) {
        console.error("チーム作成エラー:", teamErr);
        return;
      }
      teamId = team.id;

      const { error: memberErr } = await supabase.from("team_memberships").insert({
        team_id: teamId,
        user_id: testUserId,
        role: "admin",
        status: "approved",
        is_active: true,
        joined_at: new Date().toISOString(),
      });
      if (memberErr) {
        console.error("チームメンバーシップ作成エラー:", memberErr);
      }

      const { data: teamComp, error: teamCompErr } = await supabase
        .from("competitions")
        .insert({
          user_id: testUserId,
          title: "E2E目標テストチーム大会",
          date: futureDateKey,
          place: "テストチームプール",
          pool_type: 1,
          team_id: teamId,
        })
        .select("id")
        .single();
      if (teamCompErr) {
        console.error("チーム大会作成エラー:", teamCompErr);
        return;
      }
      teamCompetitionId = teamComp.id;
    });

    test.afterAll(async () => {
      if (!testUserId) return;
      const supabase = createAdminClient();
      const { data: goals } = await supabase.from("goals").select("id").eq("user_id", testUserId);
      if (goals && goals.length > 0) {
        await supabase.from("milestones").delete().in("goal_id", goals.map((g) => g.id));
        await supabase.from("goals").delete().eq("user_id", testUserId);
      }
      await supabase.from("competitions").delete().eq("user_id", testUserId).eq("title", "E2E目標テスト大会");
      await supabase.from("competitions").delete().eq("user_id", testUserId).eq("title", "E2E目標テストチーム大会");
      await supabase.from("competitions").delete().eq("user_id", testUserId).ilike("title", "E2Eテスト大会%");
      if (teamId) {
        await supabase.from("team_memberships").delete().eq("team_id", teamId);
        await supabase.from("teams").delete().eq("id", teamId);
      }
    });

    test.beforeEach(async ({ page }) => {
      await supabaseLogin(page);
    });

    /**
     * TC-GOALS-005: 目標一覧表示 (既存・変更なし)
     */
    test("TC-GOALS-005: 目標一覧表示", async ({ page }) => {
      await page.goto("/goals");
      await page.waitForLoadState("domcontentloaded");
      // 直前の supabaseLogin() の遷移先 (/dashboard) から /goals への2回目の goto は
      // networkidle まで待たないと、クライアント側 useAuth() のセッション再水和が
      // 完了する前にフォーム操作を始めてしまい、handleSubmit の `if (!user) return;`
      // に無言で早期returnされる (実機確認で判明した flaky の真因)。
      await page.waitForLoadState("networkidle").catch(() => {});

      await page.waitForSelector('h1:has-text("目標管理")', { timeout: 15000 });
      await expect(page.locator('h1:has-text("目標管理")')).toBeVisible();

      const createButton = page.locator('button:has-text("新規目標作成")').first();
      await expect(createButton).toBeVisible();

      const goalItems = page.locator('[class*="cursor-pointer"][class*="rounded-lg"]');
      await expect
        .poll(async () => goalItems.count(), { timeout: 10000 })
        .toBeGreaterThan(0);
    });

    /**
     * TC-GOALS-001: 目標の新規作成 (修正版)
     *
     * Phase 0 で発覚した問題点の修正:
     *   - allTextInputs.nth(1) を目標タイム欄と誤認していた (実際は場所欄) →
     *     プレースホルダー "2.00.00" で構造的に特定する (nth() インデックス決め打ち廃止)。
     *   - 「モーダルが閉じなければキャンセルして url だけ見る」骨抜きフォールバックを撤去し、
     *     モーダルが閉じる (=保存成功) ことを厳格に要求する。
     *   - U4 (種目選択の StyleChipSelector 化) に対応し、<select> ではなく
     *     data-testid="goal-style-distance-*" / "goal-style-stroke-*" のチップを操作する。
     */
    test("TC-GOALS-001: 目標の新規作成", async ({ page }) => {
      await page.goto("/goals");
      await page.waitForLoadState("domcontentloaded");
      // 直前の supabaseLogin() の遷移先 (/dashboard) から /goals への2回目の goto は
      // networkidle まで待たないと、クライアント側 useAuth() のセッション再水和が
      // 完了する前にフォーム操作を始めてしまい、handleSubmit の `if (!user) return;`
      // に無言で早期returnされる (実機確認で判明した flaky の真因)。
      await page.waitForLoadState("networkidle").catch(() => {});

      const goalItems = page.locator('[class*="cursor-pointer"][class*="rounded-lg"]');
      const countBefore = await goalItems.count();

      const createButton = page.locator('button:has-text("新規目標作成")').first();
      await createButton.waitFor({ state: "visible", timeout: 15000 });
      await createButton.click();

      const modal = page.locator('[role="dialog"]');
      await modal.waitFor({ state: "visible", timeout: 10000 });

      // 「新規大会を作成」ラジオボタンを選択
      await modal.locator('input[type="radio"][value="new"]').click();

      // 大会名 (プレースホルダーで構造的に特定)
      await modal.locator('input[placeholder="大会名"]').fill("E2Eテスト大会-新規作成");

      // 種目: 100m 自由形 (距離チップ → 泳法チップの順で選択)
      await modal.locator('[data-testid="goal-style-distance-100"]').click();
      await modal.locator('[data-testid="goal-style-stroke-Fr"]').click();

      // 目標タイム欄はプレースホルダー "2.00.00" の *先頭* を構造的に特定する
      // (目標タイムが初期タイムより先に描画されるため .first() で確定できる)
      const targetTimeInput = modal.locator('input[placeholder="2.00.00"]').first();
      await targetTimeInput.fill("1.00.00");

      const submitButton = modal.locator('button[type="submit"]:has-text("作成")');
      await submitButton.click();

      // モーダルが閉じる (=保存成功) ことを厳格に確認する。
      // Phase 0 の「閉じなければキャンセルしてURLだけ見る」フォールバックは撤去済み。
      await expect(modal).toBeHidden({ timeout: 10000 });

      // 一覧に新規カードが増えていることを件数で確認 (before/after 比較)
      await expect
        .poll(async () => goalItems.count(), { timeout: 10000 })
        .toBeGreaterThan(countBefore);
    });

    /**
     * TC-GOALS-002: 目標の編集 (既存・変更なし。Phase 0 実機確認で正常動作確認済み)
     */
    test("TC-GOALS-002: 目標の編集", async ({ page }) => {
      await page.goto("/goals");
      await page.waitForLoadState("domcontentloaded");
      // 直前の supabaseLogin() の遷移先 (/dashboard) から /goals への2回目の goto は
      // networkidle まで待たないと、クライアント側 useAuth() のセッション再水和が
      // 完了する前にフォーム操作を始めてしまい、handleSubmit の `if (!user) return;`
      // に無言で早期returnされる (実機確認で判明した flaky の真因)。
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.waitForTimeout(3000);

      const goalItems = page.locator('[class*="cursor-pointer"][class*="rounded-lg"]');
      const goalCount = await goalItems.count();

      if (goalCount === 0) {
        console.log("目標が存在しないため、テストをスキップします");
        test.skip();
        return;
      }

      const firstGoalCard = goalItems.first();
      const editButton = firstGoalCard.locator('button[aria-label="編集"]');
      const editButtonVisible = await editButton.isVisible().catch(() => false);

      if (!editButtonVisible) {
        const pageEditButton = page.locator('button[aria-label="編集"], button[title="編集"]').first();
        const pageEditVisible = await pageEditButton.isVisible().catch(() => false);

        if (!pageEditVisible) {
          console.log("編集ボタンが見つからないため、テストをスキップします");
          expect(page.url()).toContain("/goals");
          return;
        }
        await pageEditButton.click();
      } else {
        await editButton.click();
      }

      const dialogVisible = await page
        .locator('[role="dialog"]')
        .waitFor({ state: "visible", timeout: 15000 })
        .then(() => true)
        .catch(() => false);

      if (!dialogVisible) {
        console.log("編集ダイアログが開かないため、テストをスキップします");
        expect(page.url()).toContain("/goals");
        return;
      }

      const modal = page.locator('[role="dialog"]');
      await expect(modal).toBeVisible();

      const targetTimeInput = modal
        .locator('input[placeholder*="分:秒"], input[id*="target"], input[type="text"]')
        .first();
      if (await targetTimeInput.isVisible().catch(() => false)) {
        await targetTimeInput.clear();
        await targetTimeInput.fill("0:59.00");
      }

      const updateButton = modal.locator('button[type="submit"], button:has-text("更新")').first();
      if (await updateButton.isVisible().catch(() => false)) {
        await updateButton.click();
        await page
          .waitForSelector('[role="dialog"]', { state: "hidden", timeout: 15000 })
          .catch(() => {
            console.log("ダイアログが閉じるのを待ちきれませんでした");
          });
      }
    });

    /**
     * TC-GOALS-003: 目標の削除 (既存・変更なし。Phase 0 実機確認で正常動作確認済み)
     */
    test("TC-GOALS-003: 目標の削除", async ({ page }) => {
      await page.goto("/goals");
      await page.waitForLoadState("domcontentloaded");
      // 直前の supabaseLogin() の遷移先 (/dashboard) から /goals への2回目の goto は
      // networkidle まで待たないと、クライアント側 useAuth() のセッション再水和が
      // 完了する前にフォーム操作を始めてしまい、handleSubmit の `if (!user) return;`
      // に無言で早期returnされる (実機確認で判明した flaky の真因)。
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.waitForTimeout(3000);

      const goalItems = page.locator('[class*="cursor-pointer"][class*="rounded-lg"]');
      const goalCountBefore = await goalItems.count();

      if (goalCountBefore === 0) {
        console.log("目標が存在しないため、テストをスキップします");
        test.skip();
        return;
      }

      await goalItems.first().click();
      await page.waitForTimeout(500);

      const deleteButton = page
        .locator('button[aria-label="削除"], button[title="削除"], [class*="TrashIcon"]')
        .first();
      if (await deleteButton.isVisible()) {
        page.on("dialog", (dialog) => dialog.accept());
        await deleteButton.click();

        await page.waitForTimeout(3000);

        const goalCountAfter = await goalItems.count();
        expect(goalCountAfter).toBeLessThan(goalCountBefore);
      }
    });

    /**
     * TC-GOALS-006 (新規): チーム大会を対象大会に選択して目標作成
     *
     * 前提: beforeAll でテストユーザーを admin として参加させたチームと、
     * そのチームの未来日大会 (teamCompetitionId) をシード済み。
     */
    test("TC-GOALS-006: チーム大会を対象大会に選択して目標作成", async ({ page }) => {
      test.skip(!teamCompetitionId, "チーム大会のシードに失敗しているためスキップします");

      await page.goto("/goals");
      await page.waitForLoadState("domcontentloaded");
      // 直前の supabaseLogin() の遷移先 (/dashboard) から /goals への2回目の goto は
      // networkidle まで待たないと、クライアント側 useAuth() のセッション再水和が
      // 完了する前にフォーム操作を始めてしまい、handleSubmit の `if (!user) return;`
      // に無言で早期returnされる (実機確認で判明した flaky の真因)。
      await page.waitForLoadState("networkidle").catch(() => {});

      const createButton = page.locator('button:has-text("新規目標作成")').first();
      await createButton.waitFor({ state: "visible", timeout: 15000 });
      await createButton.click();

      const modal = page.locator('[role="dialog"]');
      await modal.waitFor({ state: "visible", timeout: 10000 });

      // 「既存の大会から選択」(デフォルト) のまま、大会一覧の読み込みを待つ
      const competitionSelect = modal.locator("select").first();
      await expect(async () => {
        const optionCount = await competitionSelect.locator("option").count();
        expect(optionCount).toBeGreaterThan(1); // プレースホルダー以外に1件以上
      }).toPass({ timeout: 10000 });

      // 「個人」optgroup とチーム名 optgroup が両方存在することを確認。
      // teamNames (useTeamsQuery) は competitions の取得と並行して非同期に解決されるため、
      // 一瞬 t("form.teamCompetitionGroupFallback") ("チーム大会") のまま描画されることがある。
      // 単発チェックだとこの過渡状態を掴んで flaky になるため toPass() でポーリングする。
      await expect(async () => {
        const optgroupLabels = await competitionSelect.locator("optgroup").evaluateAll((els) =>
          els.map((el) => el.getAttribute("label")),
        );
        expect(optgroupLabels).toContain("個人");
        expect(optgroupLabels).toContain("E2E目標テストチーム");
      }).toPass({ timeout: 10000 });

      // チームの大会を選択 (value = competition id で直接指定できる)
      await competitionSelect.selectOption({ value: teamCompetitionId });

      // 種目・目標タイムを入力
      await modal.locator('[data-testid="goal-style-distance-100"]').click();
      await modal.locator('[data-testid="goal-style-stroke-Fr"]').click();
      await modal.locator('input[placeholder="2.00.00"]').first().fill("1.05.00");

      await modal.locator('button[type="submit"]:has-text("作成")').click();
      await expect(modal).toBeHidden({ timeout: 10000 });

      // 作成された goal.competition_id がチーム大会の id と一致することを service-role で確認
      const supabase = createAdminClient();
      await expect
        .poll(
          async () => {
            const { data } = await supabase
              .from("goals")
              .select("id")
              .eq("user_id", testUserId)
              .eq("competition_id", teamCompetitionId);
            return data?.length ?? 0;
          },
          { timeout: 10000 },
        )
        .toBeGreaterThan(0);
    });
  });

  test.describe.serial("目標達成マーク (期限切れ振り返り、/dashboard 経由)", () => {
    let testUserId = "";
    let achievedFlowGoalId = "";
    let reflectionFlowGoalId = "";

    test.beforeAll(async () => {
      const supabase = createAdminClient();
      const testEmail = getTestEmail();
      const foundId = await findTestUserId(supabase, testEmail);
      if (!foundId) {
        console.error(`テストユーザー ${testEmail} が見つかりません`);
        return;
      }
      testUserId = foundId;

      // クリーンアップ (前 describe とは独立したシードにするため、ここでも goals を空にする)
      const { data: existingGoals } = await supabase.from("goals").select("id").eq("user_id", testUserId);
      if (existingGoals && existingGoals.length > 0) {
        await supabase.from("milestones").delete().in("goal_id", existingGoals.map((g) => g.id));
        await supabase.from("goals").delete().eq("user_id", testUserId);
      }
      await supabase
        .from("competitions")
        .delete()
        .eq("user_id", testUserId)
        .in("title", ["E2E目標テスト期限切れ大会A", "E2E目標テスト期限切れ大会B"]);

      const pastDateA = format(subDays(new Date(), 10), "yyyy-MM-dd");
      const pastDateB = format(subDays(new Date(), 5), "yyyy-MM-dd");
      const styleId = await resolveFreestyle100Id(supabase);

      // A: TC-GOALS-004 (達成した！) 用。日付をより過去にして getExpiredGoals() の
      // 「大会日付の降順」ソートで B より後 (=2番目) に表示されるようにする。
      const { data: compA, error: compAErr } = await supabase
        .from("competitions")
        .insert({
          user_id: testUserId,
          title: "E2E目標テスト期限切れ大会A",
          date: pastDateA,
          place: "テスト会場",
          pool_type: 1,
        })
        .select("id")
        .single();
      if (compAErr) {
        console.error("大会A作成エラー:", compAErr);
        return;
      }

      // B: TC-GOALS-004b (達成できなかった) 用。pastDateB (Aより新しい過去日) にして
      // getExpiredGoals() の先頭 (expiredGoals[0]) に来るようにする。
      const { data: compB, error: compBErr } = await supabase
        .from("competitions")
        .insert({
          user_id: testUserId,
          title: "E2E目標テスト期限切れ大会B",
          date: pastDateB,
          place: "テスト会場",
          pool_type: 1,
        })
        .select("id")
        .single();
      if (compBErr) {
        console.error("大会B作成エラー:", compBErr);
        return;
      }

      const { data: goalA, error: goalAErr } = await supabase
        .from("goals")
        .insert({
          user_id: testUserId,
          competition_id: compA.id,
          style_id: styleId,
          target_time: 60.0,
          status: "active",
        })
        .select("id")
        .single();
      if (goalAErr) console.error("目標A作成エラー:", goalAErr);
      achievedFlowGoalId = goalA?.id ?? "";

      const { data: goalB, error: goalBErr } = await supabase
        .from("goals")
        .insert({
          user_id: testUserId,
          competition_id: compB.id,
          style_id: styleId,
          target_time: 60.0,
          status: "active",
        })
        .select("id")
        .single();
      if (goalBErr) console.error("目標B作成エラー:", goalBErr);
      reflectionFlowGoalId = goalB?.id ?? "";
    });

    test.afterAll(async () => {
      if (!testUserId) return;
      const supabase = createAdminClient();
      const ids = [achievedFlowGoalId, reflectionFlowGoalId].filter(Boolean);
      if (ids.length > 0) {
        await supabase.from("milestones").delete().in("goal_id", ids);
        await supabase.from("goals").delete().in("id", ids);
      }
      await supabase
        .from("competitions")
        .delete()
        .eq("user_id", testUserId)
        .in("title", ["E2E目標テスト期限切れ大会A", "E2E目標テスト期限切れ大会B"]);
    });

    test.beforeEach(async ({ page }) => {
      await supabaseLogin(page, { navigateTo: "/dashboard" });
    });

    /**
     * TC-GOALS-004 (修正版): 期限切れ目標の振り返りモーダルが /dashboard で自動表示される
     *
     * Phase 0 で発覚した問題点の修正:
     *   GoalDetail.tsx に「達成」ボタンは存在しない。達成操作は /dashboard の
     *   GoalReflectionModal (競技会日が過去になった goal に対してログイン時に自動表示)
     *   からのみ到達可能。既存シードは futureDate (30日後) を使っており構造的に
     *   到達不能だったため、過去日の competition でシードし直し、/goals ではなく
     *   /dashboard を検証対象にする。
     *
     * getExpiredGoals() は大会日付の降順ソートのため、compB (pastDateB、より新しい
     * 過去日) が expiredGoals[0] として先に表示される。このテストでは
     * 「達成した！」を押し、compB に紐づく goalB が最初に処理されることを確認する。
     */
    test("TC-GOALS-004: 期限切れ目標の振り返りモーダルが /dashboard で自動表示される", async ({
      page,
    }) => {
      test.skip(!reflectionFlowGoalId, "期限切れ目標のシードに失敗しているためスキップします");

      // v1.1 F-M で GoalReflectionModal にも role="dialog" / aria-modal="true" が
      // 追加された (Phase B 時点では他の goals モーダル群と異なり欠落していた)。
      // 見出しテキストによる確認は role セレクタでも代替可能になったが、
      // 「自動表示された最初のモーダルの見出し」を確認する意図が読み取りやすいため
      // そのまま維持する。
      await expect(page.getByRole("heading", { name: "大会目標の振り返り" })).toBeVisible({
        timeout: 15000,
      });

      await page.locator('button:has-text("達成した！")').click();

      // モーダルが閉じる (次の期限切れ目標が無ければ) か、次の目標 (goalA) に
      // 切り替わることを確認する。いずれにせよ goalB の status は achieved になる。
      await expect
        .poll(
          async () => {
            const supabase = createAdminClient();
            const { data } = await supabase
              .from("goals")
              .select("status")
              .eq("id", reflectionFlowGoalId)
              .single();
            return data?.status;
          },
          { timeout: 10000 },
        )
        .toBe("achieved");
    });

    /**
     * TC-GOALS-004b (新規): 「達成できなかった」選択時に reflection_note が保存される
     *
     * M3 (goals.reflection_note 追加) 実装後に初めて成立するテスト。Phase 0 時点では
     * この値は画面上で組み立てられるだけで永続化されず握りつぶされていた。
     * 前テスト (TC-GOALS-004) で goalB (reflectionFlowGoalId) は achieved 済みのため、
     * 本テストでは残っている goalA (achievedFlowGoalId) が /dashboard の
     * GoalReflectionModal に表示される。
     */
    test("TC-GOALS-004b: 「達成できなかった」選択時に reflection_note が保存される", async ({
      page,
    }) => {
      test.skip(!achievedFlowGoalId, "期限切れ目標のシードに失敗しているためスキップします");

      // NOTE: role="dialog" の経緯は TC-GOALS-004 のコメント参照 (v1.1 で追加済み)。
      await expect(page.getByRole("heading", { name: "大会目標の振り返り" })).toBeVisible({
        timeout: 15000,
      });

      await page.locator('button:has-text("達成できなかった")').click();

      // 振り返り選択肢が表示され、1つ選択して保存する
      const goalTooHighOption = page.locator('label:has-text("目標タイムが高すぎた") input[type="checkbox"]');
      await goalTooHighOption.check();
      await page.locator('button:has-text("保存")').click();

      await expect
        .poll(
          async () => {
            const supabase = createAdminClient();
            const { data } = await supabase
              .from("goals")
              .select("status, reflection_note")
              .eq("id", achievedFlowGoalId)
              .single();
            return data;
          },
          { timeout: 10000 },
        )
        .toMatchObject({
          status: "cancelled",
        });

      // reflection_note が空でないことを個別に確認 (toMatchObject の部分一致では
      // 「非空文字列であること」を直接表現できないため別assertionにする)
      const supabase = createAdminClient();
      const { data: finalGoal } = await supabase
        .from("goals")
        .select("reflection_note")
        .eq("id", achievedFlowGoalId)
        .single();
      expect(finalGoal?.reflection_note).toBeTruthy();
      expect(finalGoal?.reflection_note).toContain("目標タイムが高すぎた");
    });
  });
});
