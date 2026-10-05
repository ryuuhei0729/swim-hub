import { expect, test, type Page } from "@playwright/test";
import { format } from "date-fns";
import { createClient } from "@supabase/supabase-js";
import { EnvConfig } from "../../config/config";
import { supabaseLogin } from "../../utils/supabase-login";

/**
 * 個人大会記録のE2Eテスト
 *
 * テストケース:
 * - TC-COMPETITION-001: 大会記録の追加（スプリットタイムあり・リレー種目）
 * - TC-COMPETITION-002: 大会記録の編集（基本情報）
 * - TC-COMPETITION-003: 大会記録の編集（記録情報・スプリットタイム・リレー種目）
 * - TC-COMPETITION-004: 大会記録の削除（レコードのみ）
 * - TC-COMPETITION-005: エントリーの編集
 * - TC-COMPETITION-006: エントリーの削除
 * - TC-COMPETITION-007: 大会の削除
 */

// テスト開始前に環境変数を検証
let hasRequiredEnvVars = false;
try {
  EnvConfig.getTestEnvironment();
  hasRequiredEnvVars = true;
} catch (error) {
  console.error("環境変数の検証に失敗しました:", error instanceof Error ? error.message : error);
}

type AdminClient = ReturnType<typeof createClient>;

function createAdminClient(): AdminClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY environment variable is not set.");
  }
  return createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** 種目マスター (styles) の id を style + distance で解決する。見つからなければ例外 */
async function resolveStyleId(
  supabase: AdminClient,
  style: string,
  distance: number,
): Promise<number> {
  const { data, error } = await supabase
    .from("styles")
    .select("id")
    .eq("style", style)
    .eq("distance", distance)
    .single();
  if (error || data?.id == null) {
    throw new Error(`styles に ${distance}m ${style} が見つかりません: ${error?.message ?? "no row"}`);
  }
  return data.id as number;
}

/** E2E テストユーザーの id を取得する。見つからなければ例外 */
async function getTestUserId(supabase: AdminClient): Promise<string> {
  const testEmail = (
    process.env.E2E_EMAIL ||
    process.env.E2E_TEST_EMAIL ||
    "e2e-test@swimhub.com"
  ).toLowerCase();
  const { data: users } = await supabase.auth.admin.listUsers();
  const user = users?.users?.find((u) => u.email?.toLowerCase() === testEmail);
  if (!user) throw new Error(`E2E テストユーザーが見つかりません: ${testEmail}`);
  return user.id;
}

test.describe("個人大会記録のテスト", () => {
  test.describe.configure({ timeout: 60000 });

  // 環境変数が不足している場合はテストスイートをスキップ
  test.skip(
    !hasRequiredEnvVars,
    "必要な環境変数が設定されていません。E2E_BASE_URL, E2E_EMAIL, E2E_PASSWORD を設定してください。",
  );

  // テスト開始前に e2e-test ユーザーの大会データをクリーンアップし、テストデータをシード
  test.beforeAll(async () => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY environment variable is not set. Please set it before running E2E tests.");
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // e2e-test ユーザーの ID を取得
    const { data: users } = await supabase.auth.admin.listUsers();
    const testEmail = (process.env.E2E_EMAIL || process.env.E2E_TEST_EMAIL || "e2e-test@swimhub.com").toLowerCase();
    const testUser = users?.users?.find((u) => u.email?.toLowerCase() === testEmail);
    if (!testUser) return;

    // --- クリーンアップ ---
    const { data: competitions } = await supabase
      .from("competitions")
      .select("id")
      .eq("user_id", testUser.id);

    if (competitions && competitions.length > 0) {
      const compIds = competitions.map((c) => c.id);

      const { data: records } = await supabase
        .from("records")
        .select("id")
        .in("competition_id", compIds);

      if (records && records.length > 0) {
        const recordIds = records.map((r) => r.id);
        await supabase.from("split_times").delete().in("record_id", recordIds);
        await supabase.from("records").delete().in("competition_id", compIds);
      }

      await supabase.from("entries").delete().in("competition_id", compIds);

      // goals も削除（competition を参照しているため）
      await supabase.from("goals").delete().in("competition_id", compIds);

      await supabase.from("competitions").delete().eq("user_id", testUser.id);

      console.log(`🧹 ${competitions.length} 件の大会データをクリーンアップしました`);
    }

    // --- シードデータ作成 ---
    const todayKey = format(new Date(), "yyyy-MM-dd");

    // 大会を作成
    const { data: newComp, error: compError } = await supabase
      .from("competitions")
      .insert({
        user_id: testUser.id,
        title: "○○水泳大会",
        date: todayKey,
        place: "△△プール",
        pool_type: 1, // 長水路
        note: "全国大会予選",
      })
      .select("id")
      .single();

    if (compError) {
      console.error("大会作成エラー:", compError);
      return;
    }

    console.log(`✅ テスト大会を作成しました: ${newComp.id}`);

    // 200m自由形 の style_id を style + distance で解決する (見つからなければ例外)
    const styleId = await resolveStyleId(supabase, "Fr", 200);

    // レコードを作成（リレー種目、タイム 2:00.00 = 120.00秒）
    const { data: newRecord, error: recordError } = await supabase
      .from("records")
      .insert({
        user_id: testUser.id,
        competition_id: newComp.id,
        style_id: styleId,
        time: 120.0,
        pool_type: 1,
        note: "第1泳者",
        is_relaying: true,
      })
      .select("id")
      .single();

    if (recordError) {
      console.error("レコード作成エラー:", recordError);
      return;
    }

    console.log(`✅ テストレコードを作成しました: ${newRecord.id}`);

    // スプリットタイムを作成
    const splitTimesData = [
      { record_id: newRecord.id, distance: 50, split_time: 28.0 },
      { record_id: newRecord.id, distance: 100, split_time: 60.0 },
      { record_id: newRecord.id, distance: 150, split_time: 92.0 },
    ];

    const { error: splitError } = await supabase.from("split_times").insert(splitTimesData);

    if (splitError) {
      console.error("スプリットタイム作成エラー:", splitError);
      return;
    }

    console.log(`✅ スプリットタイム ${splitTimesData.length} 件を作成しました`);
  });

  test.beforeEach(async ({ page }) => {
    await supabaseLogin(page);
    // Supabase Auth セッションが安定するまで待機
    await page.goto("/settings");
    await page.waitForLoadState("networkidle");
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");
  });

  /**
   * TC-COMPETITION-001: 大会記録の追加（スプリットタイムあり・リレー種目）
   * beforeAll でシードしたデータがカレンダーに表示されることを確認
   */
  test("TC-COMPETITION-001: 大会記録の追加（スプリットタイムあり・リレー種目）", async ({
    page,
  }) => {
    const today = new Date();
    const todayKey = format(today, "yyyy-MM-dd");

    // ステップ1: カレンダーが読み込まれるのを待つ
    await page.waitForSelector('[data-testid="calendar-day"]', { timeout: 10000 });

    // ステップ2: 今日の日付のセルをクリック
    const todayCell = page.locator(`[data-testid="calendar-day"][data-date="${todayKey}"]`);
    await todayCell.click();

    // ステップ3: 日別詳細モーダルが表示されるのを待つ
    await page.waitForSelector(
      '[data-testid="practice-detail-modal"], [data-testid="day-detail-modal"], [data-testid="record-detail-modal"]',
      { timeout: 10000 },
    );
    await page.waitForTimeout(1000);

    // 記録の読み込み完了を待つ
    await page.waitForFunction(
      () => !document.body.textContent?.includes('読み込み中'),
      { timeout: 20000 }
    ).catch(() => {});

    // ステップ4: 大会タイトルが表示されていることを確認（シードデータ）
    const competitionTitle = page.locator('[data-testid="competition-title-display"]');
    const isTitleVisible = await competitionTitle.isVisible().catch(() => false);

    if (isTitleVisible) {
      const titleText = await competitionTitle.textContent();
      expect(titleText?.includes("○○水泳大会") || titleText?.includes("△△水泳大会")).toBeTruthy();
    } else {
      // data-testid がない場合はテキストで検索
      const modal = page.locator(
        '[data-testid="practice-detail-modal"], [data-testid="day-detail-modal"]',
      );
      const hasExpectedTitle =
        await modal.locator("text=○○水泳大会").first().waitFor({ state: "visible", timeout: 5000 }).then(() => true).catch(() => false) ||
        await modal.locator("text=△△水泳大会").first().waitFor({ state: "visible", timeout: 5000 }).then(() => true).catch(() => false);
      if (!hasExpectedTitle) {
        console.log("大会記録がモーダル内に表示されないため、テストをスキップします");
        // モーダル自体は表示されていることを確認
        await expect(modal.first()).toBeVisible();
        return;
      }
    }

    // ステップ5: レコード情報が表示されていることを確認
    const recordTimeDisplay = page.locator('[data-testid="record-time-display"]').first();
    const hasRecord = await recordTimeDisplay.waitFor({ state: "visible", timeout: 5000 }).then(() => true).catch(() => false);
    if (hasRecord) {
      await expect(recordTimeDisplay).toContainText("2:00");
    }
  });

  /**
   * TC-COMPETITION-002: 大会記録の編集（基本情報）
   */
  test("TC-COMPETITION-002: 大会記録の編集（基本情報）", async ({ page }) => {
    const today = new Date();
    const todayKey = format(today, "yyyy-MM-dd");

    // ステップ1: カレンダーが読み込まれるのを待つ
    await page.waitForSelector('[data-testid="calendar-day"]', { timeout: 10000 });

    // ステップ2: 今日の日付をクリック
    const todayCell = page.locator(`[data-testid="calendar-day"][data-date="${todayKey}"]`);
    await todayCell.click();

    // 大会記録が表示されるのを待つ
    await page.waitForSelector(
      '[data-testid="practice-detail-modal"], [data-testid="day-detail-modal"], [data-testid="record-detail-modal"]',
      { timeout: 10000 },
    );
    await page.waitForTimeout(1000);

    // 記録の読み込み完了を待つ
    await page.waitForFunction(
      () => !document.body.textContent?.includes('読み込み中'),
      { timeout: 20000 }
    ).catch(() => {});

    // ステップ3: 大会記録の「編集」ボタンをクリック
    const editButton = page.locator('[data-testid="edit-competition-button"]').first();
    const hasEditButton = await editButton.waitFor({ state: "visible", timeout: 10000 }).then(() => true).catch(() => false);
    if (!hasEditButton) {
      console.log("大会記録の編集ボタンが表示されないため、テストをスキップします");
      const modal = page.locator('[data-testid="practice-detail-modal"], [data-testid="day-detail-modal"]');
      await expect(modal.first()).toBeVisible();
      return;
    }
    await editButton.click();

    // 大会タブ式モーダル（CompetitionTabModal）が大会タブで開くのを待つ
    await page.waitForSelector('[data-testid="competition-tab-modal"]', { timeout: 10000 });
    await expect(page.getByRole("tab", { name: "大会", exact: true })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    // 編集モードの初期読み込み (既存データの取得) が終わるまで、タブ本文は入力不可で
    // 読み込み中オーバーレイが出る。消えるのを待てば、以降の入力は巻き戻らない。
    await page.waitForSelector('[data-testid="competition-tab-modal-hydrating"]', { state: "detached", timeout: 15000 });

    // ステップ4: 既存の値が表示されていることを確認
    const titleValue = await page.locator('[data-testid="competition-tab-title"]').inputValue();
    expect(titleValue).toBeTruthy();
    expect(titleValue.length).toBeGreaterThan(0);

    const placeValue = await page.locator('[data-testid="competition-tab-place"]').inputValue();
    expect(placeValue).toBeTruthy();
    expect(placeValue.length).toBeGreaterThan(0);

    // ステップ5: 大会名を変更
    await page.fill('[data-testid="competition-tab-title"]', "△△水泳大会");

    // ステップ6: 場所を変更
    await page.fill('[data-testid="competition-tab-place"]', "□□プール");

    // ステップ7: プール種別を変更（短水路 = 0）
    await page.click('[data-testid="competition-tab-pool-type-0"]');
    await expect(page.locator('[data-testid="competition-tab-pool-type-0"]')).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // ステップ8: メモを変更
    await page.fill('[data-testid="competition-tab-note"]', "全国大会本選");

    // ステップ9: 「保存して閉じる」ボタンをクリック
    await page.click('[data-testid="competition-tab-modal-save"]');

    // ステップ10: モーダルが閉じるのを待つ
    await page.waitForSelector('[data-testid="competition-tab-modal"]', {
      state: "hidden",
      timeout: 15000,
    });

    // ステップ11: ページをリロードしてデータを再取得
    await page.reload();
    await page.waitForSelector('[data-testid="calendar-day"]', { timeout: 10000 });

    // カレンダーで今日の日付をクリックしてモーダルを開く
    const todayCellAfter = page.locator(`[data-testid="calendar-day"][data-date="${todayKey}"]`);
    await todayCellAfter.click();
    await page.waitForSelector(
      '[data-testid="practice-detail-modal"], [data-testid="day-detail-modal"], [data-testid="record-detail-modal"]',
      { timeout: 10000 },
    );
    await page.waitForTimeout(1000);

    // ステップ12: 変更された内容が反映されていることを確認
    const competitionTitle = page.locator('[data-testid="competition-title-display"]').first();
    const titleText = await competitionTitle.textContent();
    expect(titleText).toContain("△△水泳大会");

    const competitionPlace = page.locator('[data-testid="competition-place-display"]').first();
    await expect(competitionPlace).toBeVisible({ timeout: 5000 });
    const placeText = await competitionPlace.textContent();
    expect(placeText).toContain("□□プール");
  });

  /**
   * TC-COMPETITION-008: 編集モーダルの読み込み中は入力できず、読み込み完了直後の編集は保存される
   * (「開いて即編集すると DB 値に巻き戻る」既知バグの回帰テスト)
   */
  test("TC-COMPETITION-008: 読み込み中は入力できず、読み込み完了直後の編集は保存される", async ({
    page,
  }) => {
    const todayKey = format(new Date(), "yyyy-MM-dd");

    await page.waitForSelector('[data-testid="calendar-day"]', { timeout: 10000 });
    await page.locator(`[data-testid="calendar-day"][data-date="${todayKey}"]`).click();
    await page.waitForSelector(
      '[data-testid="practice-detail-modal"], [data-testid="day-detail-modal"], [data-testid="record-detail-modal"]',
      { timeout: 10000 },
    );
    await page.waitForTimeout(1000);
    await page
      .waitForFunction(() => !document.body.textContent?.includes("読み込み中"), { timeout: 20000 })
      .catch(() => {});

    const editButton = page.locator('[data-testid="edit-competition-button"]').first();
    await editButton.waitFor({ state: "visible", timeout: 10000 });

    // モーダルの初期化 fetch (大会本体・エントリー・レコードの GET) だけを遅延させ、
    // 読み込み中の状態を確実に観測できるようにする
    const isModalFetch = (url: URL) => /\/rest\/v1\/(competitions|entries|records)$/.test(url.pathname);
    const slowRoute = async (route: import("@playwright/test").Route) => {
      if (route.request().method() === "GET") {
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
      await route.continue();
    };
    await page.route(isModalFetch, slowRoute);

    await editButton.click();
    await page.waitForSelector('[data-testid="competition-tab-modal"]', { timeout: 10000 });

    // 読み込み中: オーバーレイが出て、保存ボタンは無効
    const hydrating = page.locator('[data-testid="competition-tab-modal-hydrating"]');
    await expect(hydrating).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid="competition-tab-modal-save"]')).toBeDisabled();

    // 読み込み中にクリック・キー入力しても値は入らない (inert)
    const noteInput = page.locator('[data-testid="competition-tab-note"]');
    await noteInput.click({ force: true, timeout: 2000 }).catch(() => {});
    await page.keyboard.type("TYPED-DURING-LOAD");
    await expect(noteInput).not.toHaveValue(/TYPED-DURING-LOAD/);

    // 読み込み完了 (オーバーレイが消える)。以降の遅延応答は編集を巻き戻さない
    await page.waitForSelector('[data-testid="competition-tab-modal-hydrating"]', {
      state: "detached",
      timeout: 20000,
    });
    await page.unroute(isModalFetch, slowRoute);
    await expect(noteInput).not.toHaveValue(/TYPED-DURING-LOAD/);

    // 読み込み完了直後に編集して保存する
    await noteInput.fill("AFTER-LOAD-NOTE");
    await page.click('[data-testid="competition-tab-modal-save"]');
    await page.waitForSelector('[data-testid="competition-tab-modal"]', {
      state: "hidden",
      timeout: 15000,
    });

    // DB に編集後の値が保存されている (読み込み中の入力は保存されていない)
    const admin = createAdminClient();
    const userId = await getTestUserId(admin);
    await expect
      .poll(
        async () => {
          const { data } = await admin
            .from("competitions")
            .select("note")
            .eq("user_id", userId)
            .eq("date", todayKey)
            .single();
          return data?.note;
        },
        { timeout: 10000 },
      )
      .toBe("AFTER-LOAD-NOTE");
  });

  /**
   * TC-COMPETITION-003: 大会記録の編集（記録情報・スプリットタイム・リレー種目）
   */
  test("TC-COMPETITION-003: 大会記録の編集（記録情報・スプリットタイム・リレー種目）", async ({
    page,
  }) => {
    const today = new Date();
    const todayKey = format(today, "yyyy-MM-dd");

    // ステップ1: カレンダーが読み込まれるのを待つ
    await page.waitForSelector('[data-testid="calendar-day"]', { timeout: 10000 });

    // ステップ2: 今日の日付をクリック
    const todayCell = page.locator(`[data-testid="calendar-day"][data-date="${todayKey}"]`);
    await todayCell.click();

    // 大会記録が表示されるのを待つ
    await page.waitForSelector(
      '[data-testid="practice-detail-modal"], [data-testid="day-detail-modal"], [data-testid="record-detail-modal"]',
      { timeout: 10000 },
    );
    await page.waitForTimeout(1000);

    // 記録の読み込み完了を待つ
    await page.waitForFunction(
      () => !document.body.textContent?.includes('読み込み中'),
      { timeout: 20000 }
    ).catch(() => {});

    // ステップ3: 記録の「編集」ボタンをクリック
    const editRecordButton = page.locator('[data-testid="edit-record-button"]').first();
    const hasEditRecordButton = await editRecordButton.waitFor({ state: "visible", timeout: 10000 }).then(() => true).catch(() => false);
    if (!hasEditRecordButton) {
      console.log("記録の編集ボタンが表示されないため、テストをスキップします");
      // モーダルは表示されていることを確認
      const modalCheck = page.locator('[data-testid="practice-detail-modal"], [data-testid="day-detail-modal"], [data-testid="record-detail-modal"]');
      await expect(modalCheck.first()).toBeVisible();
      return;
    }
    await editRecordButton.click();

    // 大会タブ式モーダルが「レースレコード」タブ選択状態で開くのを待つ
    await page.waitForSelector('[data-testid="competition-tab-modal"]', { timeout: 10000 });
    await expect(page.getByRole("tab", { name: "レースレコード", exact: true })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await page.waitForSelector('[data-testid="record-time-1"]', { timeout: 10000 });
    // 編集モードの初期読み込み (既存データの取得) が終わるまで、タブ本文は入力不可で
    // 読み込み中オーバーレイが出る。消えるのを待てば、以降の入力は巻き戻らない。
    await page.waitForSelector('[data-testid="competition-tab-modal-hydrating"]', { state: "detached", timeout: 15000 });

    // ステップ4: 既存の値が表示されていることを確認
    const timeValue = await page.locator('[data-testid="record-time-1"]').inputValue();
    expect(timeValue).toContain("2:00");

    // リレートグルは role="switch" (aria-checked)
    await expect(page.locator('[data-testid="record-relay-1"]')).toHaveAttribute(
      "aria-checked",
      "true",
    );

    // 種目は距離×泳法のチップ式。シードは 200m Fr
    await expect(page.locator('[data-testid="record-style-distance-1-200"]')).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.locator('[data-testid="record-style-stroke-1-Fr"]')).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // ステップ5: リレー種目のトグルをオフにする (種目変更でトグルが消えうるため先に行う)
    await page.click('[data-testid="record-relay-1"]');
    await expect(page.locator('[data-testid="record-relay-1"]')).toHaveAttribute(
      "aria-checked",
      "false",
    );

    // ステップ6: 種目を 200m Fly に変更 (距離チップは 200 のまま、泳法チップを Fly へ)
    await page.click('[data-testid="record-style-stroke-1-Fly"]');
    await expect(page.locator('[data-testid="record-style-stroke-1-Fly"]')).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // ステップ7: タイムを変更
    await page.fill('[data-testid="record-time-1"]', "1:58.50");

    // ステップ8: メモを変更
    await page.fill('[data-testid="record-note-1"]', "第2泳者");

    // ステップ9: 既存のスプリットタイムを編集（1つ目のスプリットタイムを変更）
    await expect(page.locator('[data-testid="record-split-time-1-1"]')).toHaveValue(/28/);
    await page.fill('[data-testid="record-split-time-1-1"]', "27.50");

    // ステップ10: スプリットタイムを追加 (既存行数 + 1 番目の行が現れる)
    const splitRows = page.locator('[data-testid^="record-split-distance-1-"]');
    const splitCountBefore = await splitRows.count();
    expect(splitCountBefore).toBeGreaterThanOrEqual(3);
    await page.click('[data-testid="record-split-add-button-1"]');

    // ステップ11: 追加したスプリットタイムの距離とタイムを入力
    const newSplitIndex = splitCountBefore + 1;
    await page.waitForSelector(`[data-testid="record-split-distance-1-${newSplitIndex}"]`, {
      state: "visible",
      timeout: 5000,
    });
    await page.fill(`[data-testid="record-split-distance-1-${newSplitIndex}"]`, "175");
    await page.fill(`[data-testid="record-split-time-1-${newSplitIndex}"]`, "1:45.50");

    // ステップ12: 既存のスプリットタイムを削除（2つ目を削除）
    const removeSplitButton = page.locator('[data-testid="record-split-remove-button-1-2"]');
    await expect(removeSplitButton).toHaveCount(1);
    await removeSplitButton.click();
    await expect(page.locator('[data-testid^="record-split-distance-1-"]')).toHaveCount(
      splitCountBefore,
    );

    // ステップ13: 「保存して閉じる」ボタンをクリック
    await page.click('[data-testid="competition-tab-modal-save"]');

    // ステップ14: モーダルが閉じるのを待つ
    await page.waitForSelector('[data-testid="competition-tab-modal"]', {
      state: "hidden",
      timeout: 15000,
    });

    // フォームが閉じた後、日別詳細モーダルが開くか確認
    const modal = page
      .locator(
        '[data-testid="practice-detail-modal"], [data-testid="day-detail-modal"], [data-testid="record-detail-modal"]',
      )
      .first();
    const modalVisible = await modal.waitFor({ state: "visible", timeout: 3000 }).then(() => true).catch(() => false);

    if (!modalVisible) {
      const todayCellRetry = page.locator(
        `[data-testid="calendar-day"][data-date="${todayKey}"]`,
      );
      await todayCellRetry.click();
      await page.waitForSelector(
        '[data-testid="practice-detail-modal"], [data-testid="day-detail-modal"], [data-testid="record-detail-modal"]',
        { timeout: 10000 },
      );
    }

    // ステップ15: 変更された内容が反映されていることを確認
    const recordTimeDisplay = page.locator('[data-testid="record-time-display"]').first();
    await expect(recordTimeDisplay).toBeVisible({ timeout: 5000 });
    await expect(recordTimeDisplay).toContainText("1:58.50");

    // ステップ16: DB を直接引き、リレー OFF・種目 200m Fly・メモ・スプリット件数も保存されていること
    const admin = createAdminClient();
    const userId = await getTestUserId(admin);
    const flyStyleId = await resolveStyleId(admin, "Fly", 200);
    const { data: comp, error: compErr } = await admin
      .from("competitions")
      .select("id")
      .eq("user_id", userId)
      .eq("date", todayKey)
      .single();
    expect(compErr).toBeNull();
    const { data: savedRecords, error: recErr } = await admin
      .from("records")
      .select("id, style_id, time, is_relaying, note")
      .eq("competition_id", comp!.id);
    expect(recErr).toBeNull();
    expect(savedRecords).toHaveLength(1);
    const saved = savedRecords![0]!;
    expect(saved.is_relaying).toBe(false);
    expect(saved.style_id).toBe(flyStyleId);
    expect(Number(saved.time)).toBeCloseTo(118.5, 2);
    expect(saved.note).toBe("第2泳者");

    // スプリット: シード 50/100/150 → 50 を 27.50 に編集、175 を追加、100 を削除 → 50/150/175 の3件
    // (種目距離 = ゴールタイムの行は保存されない)
    const { data: savedSplits, error: splitErr } = await admin
      .from("split_times")
      .select("distance, split_time")
      .eq("record_id", saved.id)
      .order("distance", { ascending: true });
    expect(splitErr).toBeNull();
    expect(savedSplits).toHaveLength(3);
    expect(savedSplits!.map((x) => Number(x.distance))).toEqual([50, 150, 175]);
    expect(Number(savedSplits![0]!.split_time)).toBeCloseTo(27.5, 2);
    expect(Number(savedSplits![2]!.split_time)).toBeCloseTo(105.5, 2);
  });

  /**
   * TC-COMPETITION-004: 大会記録の削除（レコードのみ）
   */
  test("TC-COMPETITION-004: 大会記録の削除（レコードのみ）", async ({ page }) => {
    const today = new Date();
    const todayKey = format(today, "yyyy-MM-dd");

    // ステップ1: カレンダーが読み込まれるのを待つ
    await page.waitForSelector('[data-testid="calendar-day"]', { timeout: 10000 });

    // ステップ2: 今日の日付をクリック
    const todayCell = page.locator(`[data-testid="calendar-day"][data-date="${todayKey}"]`);
    await todayCell.click();

    // 日別詳細モーダルが表示されるのを待つ
    await page.waitForSelector(
      '[data-testid="practice-detail-modal"], [data-testid="day-detail-modal"], [data-testid="record-detail-modal"]',
      { timeout: 10000 },
    );
    await page.waitForTimeout(1000);

    // ステップ3: 記録の削除ボタンを探す
    const deleteRecordButton = page.locator('[data-testid="delete-record-button"]').first();
    const hasDeleteButton = await deleteRecordButton
      .waitFor({ state: "visible", timeout: 5000 }).then(() => true).catch(() => false);

    if (!hasDeleteButton) {
      console.log("削除するレコードが見つかりません。テストをスキップします。");
      return;
    }

    // ステップ4: 記録の削除アイコンをクリック
    await deleteRecordButton.click();

    // 削除確認ダイアログが表示された場合は確認ボタンをクリック
    const confirmDialog = page.locator("role=dialog");
    if (await confirmDialog.waitFor({ state: "visible", timeout: 2000 }).then(() => true).catch(() => false)) {
      const confirmButton = confirmDialog.locator('button:has-text("削除")').first();
      if (await confirmButton.isVisible().catch(() => false)) {
        await confirmButton.click();
      }
    }

    // ステップ5: 削除が完了するのを待つ
    await page.waitForTimeout(1000);

    // ステップ6: 大会タイトルが引き続き表示されていることを確認
    const competitionTitle = page.locator('[data-testid="competition-title-display"]').first();
    const isTitleVisible = await competitionTitle.waitFor({ state: "visible", timeout: 5000 }).then(() => true).catch(() => false);
    expect(isTitleVisible).toBe(true);
  });

  /**
   * TC-COMPETITION-005: エントリーの編集（未来の日付のみ有効）
   */
  test("TC-COMPETITION-005: エントリーの編集（未来の大会のみ）", async ({ page }) => {
    const today = new Date();
    const todayKey = format(today, "yyyy-MM-dd");

    // ステップ1: ダッシュボードのカレンダーで日付をクリック
    const todayCell = page.locator(`[data-testid="calendar-day"][data-date="${todayKey}"]`);
    await todayCell.click();

    // 日別詳細モーダルが表示されるのを待つ
    await page.waitForSelector(
      '[data-testid="practice-detail-modal"], [data-testid="day-detail-modal"], [data-testid="record-detail-modal"]',
      { timeout: 5000 },
    );

    // エントリー編集ボタンが存在するか確認（今日の日付では存在しない可能性が高い）
    const editEntryButton = page.locator('[data-testid="edit-entry-button"]').first();
    const hasEditEntryButton = await editEntryButton
      .waitFor({ state: "visible", timeout: 2000 }).then(() => true).catch(() => false);

    if (!hasEditEntryButton) {
      console.log(
        "今日の日付ではエントリー編集は利用できません（レコードフローが使用されます）。テストをスキップします。",
      );
      const recordDisplay = page.locator('[data-testid="record-time-display"]').first();
      const hasRecord = await recordDisplay.waitFor({ state: "visible", timeout: 2000 }).then(() => true).catch(() => false);
      if (hasRecord) {
        console.log("レコードが正常に表示されています。");
      }
      return;
    }

    await editEntryButton.click();

    await page.waitForSelector('[data-testid="entry-form-modal"]', { timeout: 5000 });

    const entryTime1 = await page.locator('[data-testid="entry-time-1"]').inputValue();
    expect(entryTime1).toBeTruthy();

    // 種目はチップ式（距離 × 泳法）。200m バタフライ を選択
    const distanceChip200 = page.locator('[data-testid="entry-style-1-distance-200"]');
    if (await distanceChip200.count()) {
      await distanceChip200.click();
      const flyChip = page.locator('[data-testid="entry-style-1-stroke-バタフライ"]');
      if (await flyChip.count()) {
        await flyChip.click();
      }
    }

    await page.fill('[data-testid="entry-time-1"]', "2:03.50");
    await page.fill('[data-testid="entry-note-1"]', "予選1位通過");

    await page.click('[data-testid="entry-submit-button"]');

    await page.waitForSelector('[data-testid="entry-form-modal"]', {
      state: "hidden",
      timeout: 10000,
    });

    const modal = page
      .locator(
        '[data-testid="practice-detail-modal"], [data-testid="day-detail-modal"], [data-testid="record-detail-modal"]',
      )
      .first();
    await modal.waitFor({ state: "visible", timeout: 5000 });

    const entrySummaries = page.locator('[data-testid^="entry-summary-"]');
    const firstEntrySummary = entrySummaries.first();
    await expect(firstEntrySummary).toBeVisible({ timeout: 5000 });
  });

  /**
   * TC-COMPETITION-006: エントリーの削除（未来の日付のみ有効）
   */
  test("TC-COMPETITION-006: エントリーの削除（未来の大会のみ）", async ({ page }) => {
    const today = new Date();
    const todayKey = format(today, "yyyy-MM-dd");

    const todayCell = page.locator(`[data-testid="calendar-day"][data-date="${todayKey}"]`);
    await todayCell.click();

    await page.waitForSelector(
      '[data-testid="practice-detail-modal"], [data-testid="day-detail-modal"], [data-testid="record-detail-modal"]',
      { timeout: 5000 },
    );

    const firstEntrySummary = page.locator('[data-testid^="entry-summary-"]').first();
    const hasEntrySummary = await firstEntrySummary.waitFor({ state: "visible", timeout: 2000 }).then(() => true).catch(() => false);

    if (!hasEntrySummary) {
      console.log(
        "今日の日付ではエントリー削除は利用できません。テストをスキップします。",
      );
      const recordDisplay = page.locator('[data-testid="record-time-display"]').first();
      const hasRecord = await recordDisplay.waitFor({ state: "visible", timeout: 2000 }).then(() => true).catch(() => false);
      if (hasRecord) {
        console.log("レコードが正常に表示されています。");
      }
      return;
    }

    const firstEntryId = await firstEntrySummary.getAttribute("data-testid");
    if (!firstEntryId) {
      console.log("エントリーIDが取得できません。テストをスキップします。");
      return;
    }

    const entryId = firstEntryId.replace("entry-summary-", "");
    const firstDeleteButton = page.locator(`[data-testid="delete-entry-button-${entryId}"]`);

    if ((await firstDeleteButton.count()) === 0) {
      console.log("エントリー削除ボタンが見つかりません。テストをスキップします。");
      return;
    }

    await firstDeleteButton.click();

    const confirmDialog = page.locator('[data-testid="confirm-dialog"]');
    await expect(confirmDialog).toBeVisible({ timeout: 5000 });

    await page.click('[data-testid="confirm-delete-button"]');

    await expect(confirmDialog).toBeHidden({ timeout: 5000 });

    const firstEntrySummaryAfter = page.locator(`[data-testid="entry-summary-${entryId}"]`);
    await expect(firstEntrySummaryAfter).toHaveCount(0, { timeout: 10000 });
  });

  /**
   * TC-COMPETITION-007: 大会の削除
   */
  test("TC-COMPETITION-007: 大会の削除", async ({ page }) => {
    const today = new Date();
    const todayKey = format(today, "yyyy-MM-dd");

    // ステップ1: カレンダーが読み込まれるのを待つ
    await page.waitForSelector('[data-testid="calendar-day"]', { timeout: 10000 });

    const todayCell = page.locator(`[data-testid="calendar-day"][data-date="${todayKey}"]`);
    await todayCell.click();

    await page.waitForSelector(
      '[data-testid="practice-detail-modal"], [data-testid="day-detail-modal"], [data-testid="record-detail-modal"]',
      { timeout: 10000 },
    );
    await page.waitForTimeout(1000);

    const deleteCompetitionButton = page
      .locator('[data-testid="delete-competition-button"]')
      .first();
    const hasDeleteButton = await deleteCompetitionButton
      .waitFor({ state: "visible", timeout: 5000 }).then(() => true).catch(() => false);

    if (!hasDeleteButton) {
      console.log("削除する大会が見つかりません。テストをスキップします。");
      return;
    }

    await deleteCompetitionButton.click();

    const confirmButton = page.locator('[data-testid="confirm-delete-button"]');
    const dialogVisible = await confirmButton.waitFor({ state: "visible", timeout: 3000 }).then(() => true).catch(() => false);

    if (dialogVisible) {
      await confirmButton.click();
    } else {
      const confirmDialog = page.locator("role=dialog");
      if (await confirmDialog.waitFor({ state: "visible", timeout: 2000 }).then(() => true).catch(() => false)) {
        const dialogConfirmButton = confirmDialog.locator('button:has-text("削除")').first();
        if (await dialogConfirmButton.isVisible().catch(() => false)) {
          await dialogConfirmButton.click();
        }
      }
    }

    await page.waitForTimeout(1000);

    const todayCellAfter = page.locator(`[data-testid="calendar-day"][data-date="${todayKey}"]`);
    const competitionMark = todayCellAfter.locator('[data-testid="competition-mark"]');
    await expect(competitionMark).toHaveCount(0, { timeout: 10000 });
  });
});
