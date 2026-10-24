import { expect, test } from "@playwright/test";
import { addDays, format, subDays } from "date-fns";
import { createClient } from "@supabase/supabase-js";
import { EnvConfig } from "../config/config";
import { supabaseLogin } from "../utils/supabase-login";

// マイルストーンは「作った後に登録した記録」(練習日・大会日も作成日の前日以降) だけで達成になる (2026-10-15)。
// このテストで作る記録より前に作ったことにして、日付・登録順の条件と切り離す
const MILESTONE_CREATED_AT = subDays(new Date(), 30).toISOString();

/**
 * 目標管理 (goals) の実機回帰テスト。実ブラウザ・実 dev サーバー・実ローカル
 * Supabase で以下を検証する:
 *   - TimeSecondsInput: 目標タイム欄・マイルストーンの目標タイム欄
 *     (time型)/平均目標タイム欄 (reps_time型) への1文字ずつの入力が崩れず、
 *     blur で正規化される。途中入力のまま保存しようとするとエラーになり保存されない。
 *   - 目標フォームに初期タイム欄は無く、目標タイム欄の右に「種目 × 大会の水路」の自己ベストが
 *     エントリーと同じ緑のラベル「ベストタイム: {time}」で出る (Sprint Contract v4 V4-1)。
 *     新規大会の水路ボタン (V4-2) で切り替わり、入力欄の値は変わらない。
 *   - チーム離脱後、対象大会が解決できなくなった目標は一覧 (GoalList) でも
 *     編集ボタンが無く「大会情報なし」表示になる。水路が分からないので目標タイムの横に
 *     Best 差 (Best-x.xx) を出さず、カードに進捗バーは無い。
 *   - ダッシュボードの練習記録入力からタイム付き練習ログを保存すると、
 *     直後にマイルストーンが achieved になる (作成分岐・更新分岐の両方)。
 *
 * 実機調査で判明した重要な事実 (詳細は各テスト内のコメント参照):
 *   Dashboard 上でユーザーが実際にクリックできる「+」(新規追加) も、既存ログの
 *   編集アイコンも、すべて PracticeTabModal (usePracticeTabSave 経由) を開く。
 *   ダッシュボードの練習保存経路はこれだけなので、本ファイルの「ダッシュボード練習記録
 *   入力→即時達成」検証は PracticeTabModal (usePracticeTabSave) 経由で行う。これは
 *   同時にタブモーダル経由の練習保存が (作成分岐・更新分岐の両方とも) 問題なく動作して
 *   いるかの実機確認も兼ねる。
 */

let hasRequiredEnvVars = false;
try {
  EnvConfig.getTestEnvironment();
  hasRequiredEnvVars = true;
} catch (error) {
  console.error("環境変数の検証に失敗しました:", error instanceof Error ? error.message : error);
}

function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY environment variable is not set.");
  }
  return createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function getTestEmail(): string {
  try {
    const env = EnvConfig.getTestEnvironment();
    return env.credentials.email;
  } catch {
    return "e2e-test@swimhub.com";
  }
}

async function findTestUserId(
  supabase: ReturnType<typeof createAdminClient>,
  email: string,
): Promise<string> {
  const targetEmail = email.toLowerCase();
  let page = 1;
  const perPage = 500;
  for (;;) {
    const { data: users, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`ユーザー一覧取得エラー: ${error.message}`);
    const found = users?.users?.find((u) => u.email?.toLowerCase() === targetEmail);
    if (found) return found.id;
    if (!users?.users?.length || users.users.length < perPage) {
      throw new Error(`テストユーザーが見つかりません: ${email}`);
    }
    page++;
  }
}

async function resolveFreestyle100Id(supabase: ReturnType<typeof createAdminClient>): Promise<number> {
  const { data } = await supabase.from("styles").select("id").eq("style", "Fr").eq("distance", 100).single();
  return data?.id ?? 3;
}

test.describe("目標管理 実機回帰テスト (時間入力・チーム離脱・マイルストーン即時達成)", () => {
  test.describe.configure({ timeout: 60000 });
  test.skip(!hasRequiredEnvVars, "必要な環境変数が設定されていません。");

  test.describe("TimeSecondsInput: 1文字ずつの入力・ベストラベル", () => {
    let testUserId = "";
    let styleId = 0;

    test.beforeAll(async () => {
      const supabase = createAdminClient();
      testUserId = await findTestUserId(supabase, getTestEmail());
      styleId = await resolveFreestyle100Id(supabase);

      // クリーンアップ
      await supabase
        .from("competitions")
        .delete()
        .eq("user_id", testUserId)
        .ilike("title", "E2E-Goals時間入力%");
      await supabase.from("records").delete().eq("user_id", testUserId).eq("note", "E2E-Goalsベストタイム");

      // ベストタイムラベル用の自己ベスト。短水路 (pool_type=0) は GoalCreateModal の新規大会作成時の
      // デフォルト poolType=0 と一致させる。長水路 (pool_type=1) は水路の切り替えの確認用。
      // リレー引き継ぎ (is_relaying=true) の速い記録も入れ、ラベルに採られないことを見る。
      const { data: comp } = await supabase
        .from("competitions")
        .insert({
          user_id: testUserId,
          title: "E2E-Goals時間入力ベスト大会",
          date: format(subDays(new Date(), 100), "yyyy-MM-dd"),
          place: "テスト会場",
          pool_type: 0,
        })
        .select("id")
        .single();

      await supabase.from("records").insert([
        { user_id: testUserId, competition_id: comp!.id, style_id: styleId, pool_type: 0, time: 58.3, is_relaying: false, note: "E2E-Goalsベストタイム" },
        { user_id: testUserId, competition_id: comp!.id, style_id: styleId, pool_type: 0, time: 52.1, is_relaying: true, note: "E2E-Goalsベストタイム" },
        { user_id: testUserId, competition_id: comp!.id, style_id: styleId, pool_type: 1, time: 61.2, is_relaying: false, note: "E2E-Goalsベストタイム" },
      ]);
    });

    test.afterAll(async () => {
      if (!testUserId) return;
      const supabase = createAdminClient();
      await supabase.from("records").delete().eq("user_id", testUserId).eq("note", "E2E-Goalsベストタイム");
      await supabase
        .from("competitions")
        .delete()
        .eq("user_id", testUserId)
        .ilike("title", "E2E-Goals時間入力%");
    });

    test.beforeEach(async ({ page }) => {
      await supabaseLogin(page);
    });

    test("目標タイム欄に '1:30.50' を1文字ずつ入力しても表示が崩れず、blur で 90.5 秒に確定する", async ({
      page,
    }) => {
      await page.goto("/goals");
      await page.waitForLoadState("domcontentloaded");
      await page.waitForLoadState("networkidle").catch(() => {});

      const createButton = page.locator('button:has-text("新規目標作成")').first();
      await createButton.waitFor({ state: "visible", timeout: 15000 });
      await createButton.click();

      const modal = page.locator('[role="dialog"]');
      await modal.waitFor({ state: "visible", timeout: 10000 });

      await modal.locator('input[type="radio"][value="new"]').click();
      await modal.locator('input[placeholder="大会名"]').fill("E2E-Goals時間入力大会-目標作成");
      await modal.locator('[data-testid="goal-style-distance-100"]').click();
      await modal.locator('[data-testid="goal-style-stroke-Fr"]').click();

      const targetTimeInput = modal.locator('input[placeholder="2.00.00"]').first();
      await targetTimeInput.click();
      await targetTimeInput.pressSequentially("1:30.50", { delay: 30 });

      // blur 前: 入力した文字列がそのまま表示されている (途中の parse で潰れていない)
      await expect(targetTimeInput).toHaveValue("1:30.50");

      await modal.locator('input[placeholder="大会名"]').click(); // blur させる
      await expect(targetTimeInput).toHaveValue("1:30.50"); // 90.5秒の正規化表示 = 同じ文字列

      // モーダルを閉じずにキャンセルし、DBに保存はしない (本テストの関心事は表示のみ)
      await page.keyboard.press("Escape").catch(() => {});
    });

    test("初期タイム欄は無く、種目と大会 (水路) が揃うと目標タイム欄の右にベストタイムラベルが出て、水路ボタンで切り替わる", async ({
      page,
    }) => {
      await page.goto("/goals");
      await page.waitForLoadState("domcontentloaded");
      await page.waitForLoadState("networkidle").catch(() => {});

      const createButton = page.locator('button:has-text("新規目標作成")').first();
      await createButton.waitFor({ state: "visible", timeout: 15000 });
      await createButton.click();

      const modal = page.locator('[role="dialog"]');
      await modal.waitFor({ state: "visible", timeout: 10000 });

      // 初期タイム欄 (入力欄・ラベル) は無い。「ベストタイムから取得」ボタンも無い
      await expect(modal.locator('[data-testid="goal-start-time"]')).toHaveCount(0);
      await expect(modal).not.toContainText("初期タイム");
      await expect(modal.locator('button:has-text("ベストタイムから取得")')).toHaveCount(0);

      const bestLabel = modal.locator('[data-testid="goal-best-time-label"]');
      // 種目が未選択・水路が未確定のあいだはラベルを出さない (「記録なし」「—」も出さない)
      await expect(bestLabel).toHaveCount(0);

      // 新規大会 (既定は短水路) + 100m Fr を選ぶと、短水路の自己ベスト (シード 58.30。
      // isRelaying=false なのでリレー引き継ぎ 52.10 は出さない) がエントリーと同じ緑のラベルで出る
      await modal.locator('input[type="radio"][value="new"]').click();
      await expect(modal.locator("select")).toHaveCount(0); // 水路の select は廃止 (ボタンにした)
      await modal.locator('input[placeholder="大会名"]').fill("E2E-Goals時間入力大会-ベストラベル");
      await modal.locator('[data-testid="goal-style-distance-100"]').click();
      await modal.locator('[data-testid="goal-style-stroke-Fr"]').click();
      await expect(bestLabel).toHaveText("ベストタイム: 58.30", { timeout: 15000 });
      await expect(bestLabel).toHaveClass(/bg-green-100/);

      // 目標タイムを入れてから水路ボタンで長水路に変えると、ラベルだけが長水路の自己ベスト (シード 1:01.20) に変わる (入力欄の値は変わらない)
      const targetTimeInput = modal.locator('input[placeholder="2.00.00"]').first();
      await targetTimeInput.click();
      await targetTimeInput.pressSequentially("57.50", { delay: 30 });
      await modal.locator('input[placeholder="大会名"]').click(); // blur させる
      const longButton = modal.locator('[data-testid="goal-new-competition-pool-type-1"]');
      await longButton.click();
      await expect(longButton).toHaveAttribute("aria-pressed", "true");
      await expect(bestLabel).toHaveText("ベストタイム: 1:01.20", { timeout: 15000 });
      await expect(targetTimeInput).toHaveValue("57.50");

      // 短水路に戻すと再び 58.30
      await modal.locator('[data-testid="goal-new-competition-pool-type-0"]').click();
      await expect(bestLabel).toHaveText("ベストタイム: 58.30", { timeout: 15000 });
      await expect(targetTimeInput).toHaveValue("57.50");

      await page.keyboard.press("Escape").catch(() => {});
    });
  });

  test.describe("チーム離脱後の目標: 一覧で編集不可・大会情報なし・進捗バー非表示", () => {
    let testUserId = "";
    let teamId = "";
    let goalId = "";

    test.beforeAll(async () => {
      const supabase = createAdminClient();
      testUserId = await findTestUserId(supabase, getTestEmail());
      const styleId = await resolveFreestyle100Id(supabase);

      // クリーンアップ
      const { data: existingGoals } = await supabase
        .from("goals")
        .select("id")
        .eq("user_id", testUserId)
        .eq("target_time", 61.0);
      if (existingGoals && existingGoals.length > 0) {
        await supabase.from("milestones").delete().in("goal_id", existingGoals.map((g) => g.id));
        await supabase.from("goals").delete().in("id", existingGoals.map((g) => g.id));
      }
      await supabase.from("teams").delete().eq("name", "E2E-Goals離脱チーム");

      const { data: team, error: teamErr } = await supabase
        .from("teams")
        .insert({
          name: "E2E-Goals離脱チーム",
          invite_code: `E2E-Goals-LEAVE-${Date.now()}`,
          created_by: testUserId,
        })
        .select("id")
        .single();
      if (teamErr) throw new Error(`チーム作成失敗: ${teamErr.message}`);
      teamId = team.id;

      await supabase.from("team_memberships").insert({
        team_id: teamId,
        user_id: testUserId,
        role: "admin",
        status: "approved",
        is_active: true,
        joined_at: new Date().toISOString(),
      });

      // team_id ありの大会は user_id を null にする (pgTAP 16 番のフィクスチャと同じ形)。
      // user_id にテストユーザー自身を入れてしまうと、RLS の「自分が作成した大会」
      // 経路で見えてしまい、チーム離脱後も可視のままになってしまう
      // (実際に本テストの1回目の実行でこの誤りにより赤になった)。
      const { data: teamComp, error: compErr } = await supabase
        .from("competitions")
        .insert({
          user_id: null,
          created_by: testUserId,
          title: "E2E-Goals離脱チーム大会",
          date: format(addDays(new Date(), 30), "yyyy-MM-dd"),
          place: "テストチームプール",
          pool_type: 1,
          team_id: teamId,
        })
        .select("id")
        .single();
      if (compErr) throw new Error(`チーム大会作成失敗: ${compErr.message}`);

      const { data: goal, error: goalErr } = await supabase
        .from("goals")
        .insert({
          user_id: testUserId,
          competition_id: teamComp.id,
          style_id: styleId,
          target_time: 61.0,
          status: "active",
        })
        .select("id")
        .single();
      if (goalErr) throw new Error(`目標作成失敗: ${goalErr.message}`);
      goalId = goal.id;

      // チームを離脱させる (membership を削除。RLS 経由の getSelectableCompetitions() から
      // 見えなくなり、useGoalsQuery の select が competition: null を返すようになる)。
      await supabase.from("team_memberships").delete().eq("team_id", teamId).eq("user_id", testUserId);
    });

    test.afterAll(async () => {
      if (!testUserId) return;
      const supabase = createAdminClient();
      if (goalId) {
        await supabase.from("milestones").delete().eq("goal_id", goalId);
        await supabase.from("goals").delete().eq("id", goalId);
      }
      await supabase.from("competitions").delete().eq("title", "E2E-Goals離脱チーム大会");
      if (teamId) {
        await supabase.from("team_memberships").delete().eq("team_id", teamId);
        await supabase.from("teams").delete().eq("id", teamId);
      }
    });

    test.beforeEach(async ({ page }) => {
      await supabaseLogin(page);
    });

    test("離脱済みチーム大会を対象大会にした目標は、一覧で編集不可・「大会情報なし」表示・進捗バー非表示になる", async ({
      page,
    }) => {
      await page.goto("/goals");
      await page.waitForLoadState("domcontentloaded");
      await page.waitForLoadState("networkidle").catch(() => {});

      await page.waitForSelector('h1:has-text("目標管理")', { timeout: 15000 });

      // 対象の goal カードを id ベースで一意に特定する data-testid が無いため、
      // 「大会情報なし」テキストを含むカードを探す (離脱済み目標は本テストで
      // 1件だけシードしているため、このテキストの出現自体が本ケースの特定になる)。
      const unavailableText = page.locator("text=大会情報なし").first();
      await expect(unavailableText).toBeVisible({ timeout: 15000 });

      const card = page.locator('[class*="cursor-pointer"][class*="rounded-lg"]').filter({
        hasText: "大会情報なし",
      });
      await expect(card).toHaveCount(1);

      // 編集ボタンが無いこと (aria-label="編集" のボタンがこのカード内に存在しない)
      await expect(card.getByLabel("編集")).toHaveCount(0);
      // 削除ボタンは存在する (編集だけが不可であることの対照)
      await expect(card.getByLabel("削除")).toHaveCount(1);
      // 編集できない理由の文言
      await expect(card).toContainText("大会情報がないため編集できません");

      // 水路が分からないため Best 差 (Best-x.xx) は出さない。目標タイム (61.00 → 1:01.00) は出す。
      // カードに進捗バーは無い。
      await expect(card).toContainText("1:01.00");
      await expect(card).not.toContainText("Best");
      await expect(card.locator(".bg-blue-600.h-2")).toHaveCount(0);
    });
  });

  test.describe("ダッシュボード練習記録入力 → マイルストーン即時達成 (作成・更新分岐)", () => {
    let testUserId = "";
    let goalId = "";
    let milestoneCreateId = "";
    let milestoneUpdateId = "";
    let practiceCreateId = "";
    let practiceUpdateId = "";

    // 「今日」を基準に、月内に収まる形で2つの日付を作る (月末/月初でも同月に収まるよう
    // day<=15 なら先へ、day>15 なら手前へオフセットする)。
    const now = new Date();
    const towardMonth = now.getDate() <= 15 ? addDays : subDays;
    const dateCreate = format(towardMonth(now, 5), "yyyy-MM-dd");
    const dateUpdate = format(towardMonth(now, 10), "yyyy-MM-dd");

    test.beforeAll(async () => {
      const supabase = createAdminClient();
      testUserId = await findTestUserId(supabase, getTestEmail());
      const styleId = await resolveFreestyle100Id(supabase);

      // クリーンアップ (本テスト専用の日付・タイトルのみ対象)
      await supabase.from("practices").delete().eq("user_id", testUserId).eq("place", "E2E-Goals練習会場");
      const { data: existingGoals } = await supabase
        .from("goals")
        .select("id")
        .eq("user_id", testUserId)
        .eq("target_time", 62.0);
      if (existingGoals && existingGoals.length > 0) {
        await supabase.from("milestones").delete().in("goal_id", existingGoals.map((g) => g.id));
        await supabase.from("goals").delete().in("id", existingGoals.map((g) => g.id));
      }

      const { data: goal, error: goalErr } = await supabase
        .from("goals")
        .insert({
          user_id: testUserId,
          competition_id: null,
          style_id: styleId,
          target_time: 62.0,
          status: "active",
        })
        .select("id")
        .single();
      if (goalErr) throw new Error(`目標作成失敗: ${goalErr.message}`);
      goalId = goal.id;

      // 作成分岐用マイルストーン: usePracticeLogForm の新規メニューのデフォルト値
      // (style=Fr, swimCategory=Swim, distance=100, reps=4, sets=1) と完全一致させる
      // (フォームの値を一切変更せず保存ボタンを押すだけで達成条件を満たすようにするため)。
      const { data: mCreate, error: mCreateErr } = await supabase
        .from("milestones")
        .insert({
          goal_id: goalId,
          created_at: MILESTONE_CREATED_AT,
          title: "E2E-Goals作成分岐マイルストーン",
          type: "set",
          params: { distance: 100, style: "Fr", swim_category: "Swim", reps: 4, sets: 1, circle: 90 },
          deadline: format(addDays(new Date(), 60), "yyyy-MM-dd"),
          status: "in_progress",
        })
        .select("id")
        .single();
      if (mCreateErr) throw new Error(`マイルストーン(作成分岐)作成失敗: ${mCreateErr.message}`);
      milestoneCreateId = mCreate.id;

      // 更新分岐用マイルストーン: swim_category だけ "Pull" にして作成分岐と衝突しないようにする。
      const { data: mUpdate, error: mUpdateErr } = await supabase
        .from("milestones")
        .insert({
          goal_id: goalId,
          created_at: MILESTONE_CREATED_AT,
          title: "E2E-Goals更新分岐マイルストーン",
          type: "set",
          params: { distance: 100, style: "Fr", swim_category: "Pull", reps: 4, sets: 1, circle: 90 },
          deadline: format(addDays(new Date(), 60), "yyyy-MM-dd"),
          status: "in_progress",
        })
        .select("id")
        .single();
      if (mUpdateErr) throw new Error(`マイルストーン(更新分岐)作成失敗: ${mUpdateErr.message}`);
      milestoneUpdateId = mUpdate.id;

      // 作成分岐用: ログ0件の空の practice (「add-new-button」を出すため)
      const { data: pCreate, error: pCreateErr } = await supabase
        .from("practices")
        .insert({
          user_id: testUserId,
          date: dateCreate,
          place: "E2E-Goals練習会場",
          note: "",
        })
        .select("id")
        .single();
      if (pCreateErr) throw new Error(`練習(作成分岐)作成失敗: ${pCreateErr.message}`);
      practiceCreateId = pCreate.id;

      // 更新分岐用: 既存ログ1件 (swim_category=Swim。更新分岐マイルストーンの Pull とは
      // 意図的に不一致にしておき、編集で Pull に変えたときに初めて達成させる)。
      const { data: pUpdate, error: pUpdateErr } = await supabase
        .from("practices")
        .insert({
          user_id: testUserId,
          date: dateUpdate,
          place: "E2E-Goals練習会場",
          note: "",
        })
        .select("id")
        .single();
      if (pUpdateErr) throw new Error(`練習(更新分岐)作成失敗: ${pUpdateErr.message}`);
      practiceUpdateId = pUpdate.id;

      const { error: logErr } = await supabase.from("practice_logs").insert({
        user_id: testUserId,
        practice_id: practiceUpdateId,
        style: "Fr",
        swim_category: "Swim",
        rep_count: 4,
        set_count: 1,
        distance: 100,
        circle: 90,
        note: "",
      });
      if (logErr) throw new Error(`練習ログ(更新分岐)作成失敗: ${logErr.message}`);
    });

    test.afterAll(async () => {
      if (!testUserId) return;
      const supabase = createAdminClient();
      if (goalId) {
        await supabase.from("milestones").delete().eq("goal_id", goalId);
        await supabase.from("goals").delete().eq("id", goalId);
      }
      await supabase.from("practices").delete().eq("user_id", testUserId).eq("place", "E2E-Goals練習会場");
    });

    test.beforeEach(async ({ page }) => {
      await supabaseLogin(page, { navigateTo: "/dashboard" });
    });

    test("[作成分岐/タブモーダル経由] 空の練習に新規ログを追加して保存すると、直後にマイルストーンが achieved になる", async ({
      page,
    }) => {
      // Dashboard の「+」(day-add-button) も、練習カード内の「メニュー追加」
      // (add-new-button) も、両方とも PracticeTabModal (usePracticeTabSave) を開く。
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.waitForSelector('[data-testid="calendar-day"]', { timeout: 15000 });

      const dayCell = page.locator(`[data-testid="calendar-day"][data-date="${dateCreate}"]`);
      await dayCell.click();

      await page.waitForSelector(
        '[data-testid="practice-detail-modal"], [data-testid="day-detail-modal"]',
        { timeout: 10000 },
      );

      const addButton = page.locator('[data-testid="add-new-button"]').first();
      await addButton.waitFor({ state: "visible", timeout: 10000 });
      await addButton.click();

      const formModal = page.locator('[data-testid="practice-tab-modal"]');
      await formModal.waitFor({ state: "visible", timeout: 10000 });

      // PracticeTabModal.executeSave は「未編集のデフォルトメニュー (100m×4等) は
      // opt-in」の方針により、
      // `!hasMenuChanges && originalLogIds.length === 0` の場合は submitLogs を
      // 空配列にして何も保存しない (このガードに気づかず単に保存ボタンを押すだけの
      // 版では practice_logs が1件も作成されずマイルストーンも達成されなかった)。
      // メニュー自体の値 (style/swimCategory/distance/reps/sets) は作成分岐マイルストーンの
      // 条件と完全一致させてあるため変更したくないので、milestone の判定に影響しない
      // メモ欄だけを編集して「編集した」状態にする。
      await formModal.locator('[data-testid="practice-log-note-1"]').fill("E2E-Goals作成分岐メモ");

      await formModal.locator('[data-testid="practice-tab-modal-save"]').click();
      await expect(formModal).toBeHidden({ timeout: 10000 });

      const supabase = createAdminClient();
      await expect
        .poll(
          async () => {
            const { data } = await supabase
              .from("milestones")
              .select("status")
              .eq("id", milestoneCreateId)
              .single();
            return data?.status;
          },
          { timeout: 15000, intervals: [500, 1000, 1500] },
        )
        .toBe("achieved");
    });

    test("[更新分岐/タブモーダル経由] 既存ログを編集して条件を満たすと、直後にマイルストーンが achieved になる", async ({
      page,
    }) => {
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.waitForSelector('[data-testid="calendar-day"]', { timeout: 15000 });

      const dayCell = page.locator(`[data-testid="calendar-day"][data-date="${dateUpdate}"]`);
      await dayCell.click();

      await page.waitForSelector(
        '[data-testid="practice-detail-modal"], [data-testid="day-detail-modal"]',
        { timeout: 10000 },
      );

      // 保存前提: 更新分岐マイルストーンはまだ達成していない (既存ログは swim_category=Swim で
      // 条件の Pull と不一致のため)。
      const supabaseBefore = createAdminClient();
      const { data: beforeData } = await supabaseBefore
        .from("milestones")
        .select("status")
        .eq("id", milestoneUpdateId)
        .single();
      expect(beforeData?.status).not.toBe("achieved");

      const editButton = page.locator('[data-testid="edit-practice-log-button"]').first();
      await editButton.waitFor({ state: "visible", timeout: 10000 });
      await editButton.click();

      // edit-practice-log-button も PracticeTabModal を開く (作成分岐のコメント参照)。
      const formModal = page.locator('[data-testid="practice-tab-modal"]');
      await formModal.waitFor({ state: "visible", timeout: 10000 });

      // PracticeTabModal (goals とは別スコープの既知の不具合、対応済み報告・
      // goals スプリットの対象外): モーダル表示直後 (~300ms〜1秒程度) にチップを
      // クリックすると、変更が数百ms後に元の値へ無言で巻き戻ることがある
      // (原因の手がかり: 「編集モード: 練習IDに紐づく既存ログを全件 fetch して
      // menus に初期化」useEffect の非同期コールバックが、ユーザーの編集後に
      // 遅れて解決し menus を DB の元の値で上書きしていると見られる)。
      // モーダルを開いてから1.5秒以上待ってから編集する、というのが正しい確認手順。
      await page.waitForTimeout(1500);
      // 泳法カテゴリを Swim → Pull に変更し、マイルストーンの条件に一致させる
      // (既存ログ由来のメニューは id を持つため usePracticeTabSave の diff.toUpdate 経路 =
      // updatePracticeLogForTabSave(=updatePracticeLog) が skipMilestoneUpdate=true で呼ばれる)。
      await formModal.locator('[data-testid="practice-swim-category-Pull"]').click();
      await formModal.locator('[data-testid="practice-tab-modal-save"]').click();
      await expect(formModal).toBeHidden({ timeout: 10000 });

      const supabase = createAdminClient();
      await expect
        .poll(
          async () => {
            const { data } = await supabase
              .from("milestones")
              .select("status")
              .eq("id", milestoneUpdateId)
              .single();
            return data?.status;
          },
          { timeout: 15000, intervals: [500, 1000, 1500] },
        )
        .toBe("achieved");
    });
  });

  test.describe("マイルストーンの目標タイム欄: 1文字ずつの入力・途中入力のまま保存できない", () => {
    let testUserId = "";
    let goalId = "";

    test.beforeAll(async () => {
      const supabase = createAdminClient();
      testUserId = await findTestUserId(supabase, getTestEmail());
      const styleId = await resolveFreestyle100Id(supabase);

      const { data: existingGoals } = await supabase
        .from("goals")
        .select("id")
        .eq("user_id", testUserId)
        .eq("target_time", 63.0);
      if (existingGoals && existingGoals.length > 0) {
        await supabase.from("milestones").delete().in("goal_id", existingGoals.map((g) => g.id));
        await supabase.from("goals").delete().in("id", existingGoals.map((g) => g.id));
      }

      const { data: goal, error: goalErr } = await supabase
        .from("goals")
        .insert({
          user_id: testUserId,
          competition_id: null,
          style_id: styleId,
          target_time: 63.0,
          status: "active",
        })
        .select("id")
        .single();
      if (goalErr) throw new Error(`目標作成失敗: ${goalErr.message}`);
      goalId = goal.id;
    });

    test.afterAll(async () => {
      if (!testUserId || !goalId) return;
      const supabase = createAdminClient();
      await supabase.from("milestones").delete().eq("goal_id", goalId);
      await supabase.from("goals").delete().eq("id", goalId);
    });

    test.beforeEach(async ({ page }) => {
      await supabaseLogin(page);
    });

    async function openMilestoneCreateModal(page: import("@playwright/test").Page) {
      await page.goto("/goals");
      await page.waitForLoadState("domcontentloaded");
      await page.waitForLoadState("networkidle").catch(() => {});

      // 目標タイム 1:03.00 (63.0秒) で一意に識別できるカードを選択する。
      const card = page
        .locator('[class*="cursor-pointer"][class*="rounded-lg"]')
        .filter({ hasText: "1:03.00" });
      await card.first().click();

      const addButton = page.locator('button:has-text("追加")').first();
      await addButton.waitFor({ state: "visible", timeout: 15000 });
      await addButton.click();

      const modal = page.locator('[role="dialog"]');
      await modal.waitFor({ state: "visible", timeout: 10000 });
      return modal;
    }

    test("[time型] 目標タイム欄に '45.50' を1文字ずつ入力しても表示が崩れず、blur で正規化される", async ({
      page,
    }) => {
      const modal = await openMilestoneCreateModal(page);

      const targetTimeInput = modal.locator('input[placeholder="2.00.00"]').first();
      await targetTimeInput.click();
      await targetTimeInput.clear();
      await targetTimeInput.pressSequentially("45.50", { delay: 30 });
      await expect(targetTimeInput).toHaveValue("45.50");

      await modal.locator('input[type="text"]').first().click(); // タイトル欄をクリックして blur させる
      await expect(targetTimeInput).toHaveValue("45.50");

      await page.keyboard.press("Escape").catch(() => {});
    });

    test("[time型] 目標タイム欄を '45.' (途中入力) のまま作成しようとすると保存されずエラーが表示される", async ({
      page,
    }) => {
      const modal = await openMilestoneCreateModal(page);

      const targetTimeInput = modal.locator('input[placeholder="2.00.00"]').first();
      await targetTimeInput.click();
      await targetTimeInput.clear();
      await targetTimeInput.pressSequentially("45.", { delay: 30 });

      await modal.locator('button[type="submit"]').click();

      // 保存されず、モーダルが開いたままエラーが表示される。
      await expect(modal).toBeVisible();
      await expect(modal.getByText("有効なタイム形式で入力してください")).toBeVisible({
        timeout: 5000,
      });

      await page.keyboard.press("Escape").catch(() => {});
    });

    test("[reps_time型] 平均目標タイム欄に '1:05.00' を1文字ずつ入力しても表示が崩れない", async ({
      page,
    }) => {
      const modal = await openMilestoneCreateModal(page);

      // マイルストーンタイプを「練習平均タイム目標」(reps_time) に切り替える。
      await modal.locator('label:has(input[value="reps_time"])').click();

      const averageTimeInput = modal.locator('input[placeholder="2.00.00"]').first();
      await averageTimeInput.click();
      await averageTimeInput.clear();
      await averageTimeInput.pressSequentially("1:05.00", { delay: 30 });
      await expect(averageTimeInput).toHaveValue("1:05.00");

      await modal.locator('input[type="text"]').first().click();
      await expect(averageTimeInput).toHaveValue("1:05.00");

      await page.keyboard.press("Escape").catch(() => {});
    });
  });
});
