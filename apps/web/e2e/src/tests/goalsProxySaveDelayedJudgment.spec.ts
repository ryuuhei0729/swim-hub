import { expect, test } from "@playwright/test";
import { addDays, format, subDays } from "date-fns";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { EnvConfig } from "../config/config";
import { supabaseLogin } from "../utils/supabase-login";

/**
 * 目標管理: チーム代理入力・mobile 保存分のマイルストーン判定 (遅延評価) の実機検証。
 *
 * 方式: 代理保存の時点では判定しない。メンバー本人が web の /dashboard か /goals を
 * 開いたとき、本人のセッションで GoalAPI.updateAllMilestoneStatuses(user.id) を実行する。
 *
 * 検証方法についての注記:
 *   管理者による代理保存の UI (PracticeLogClient.tsx の replace_practice_logs RPC /
 *   RecordClient.tsx の records 直接 insert) 自体は本ラウンドで変更されておらず対象外
 *   のため、フォーム操作を1つずつ再現する代わりに、これらのコンポーネントが実際に
 *   呼んでいるのと同じ書き込み (RPC 呼び出し・テーブル insert) を、管理者としてログイン
 *   した実際の認証済みクライアント (RLS が効く、サービスロールではない) から直接
 *   呼び出す。管理者と対象メンバーは同一テストアカウント (自分がチーム管理者かつ
 *   対象メンバーを兼ねる) にし、書き込み後に同じアカウントで /dashboard・/goals を
 *   開いて判定結果を確認する。
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
    return EnvConfig.getTestEnvironment().credentials.email;
  } catch {
    return "e2e-test@swimhub.com";
  }
}

function getTestPassword(): string {
  try {
    return EnvConfig.getTestEnvironment().credentials.password;
  } catch {
    return process.env.E2E_PASSWORD || process.env.E2E_TEST_PASSWORD || "E2ETest123!";
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

/** REST パスワードグラントで access_token を取得し、RLS が効く認証済みクライアントを作る。*/
async function createAuthenticatedClient(email: string, password: string): Promise<SupabaseClient> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: anonKey, Authorization: `Bearer ${anonKey}` },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    throw new Error(`ログインに失敗しました (${response.status}): ${await response.text()}`);
  }
  const { access_token } = await response.json();
  return createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${access_token}` } },
  });
}

test.describe("目標管理: 代理入力・mobile 保存分のマイルストーン判定 (遅延評価)", () => {
  test.describe.configure({ timeout: 60000 });
  test.skip(!hasRequiredEnvVars, "必要な環境変数が設定されていません。");

  let testUserId = "";
  let styleId = 0;
  let teamId = "";
  let goalId = "";
  let milestonePracticeProxyId = "";
  let milestoneRecordProxyId = "";
  let milestoneExpiredProxyId = "";
  let milestoneMobileProxyId = "";
  let milestoneGoalsDirectProxyId = "";
  let practiceProxyId = "";
  let competitionProxyId = "";
  let authenticatedClient!: SupabaseClient;

  test.beforeAll(async () => {
    const supabase = createAdminClient();
    testUserId = await findTestUserId(supabase, getTestEmail());
    styleId = await resolveFreestyle100Id(supabase);
    authenticatedClient = await createAuthenticatedClient(getTestEmail(), getTestPassword());

    // クリーンアップ
    await supabase.from("teams").delete().eq("name", "E2E-ProxyJudgmentチーム");
    await supabase.from("competitions").delete().eq("title", "E2E-ProxyJudgment大会");
    await supabase.from("practices").delete().eq("place", "E2E-ProxyJudgment会場");
    const { data: existingGoals } = await supabase
      .from("goals")
      .select("id")
      .eq("user_id", testUserId)
      .eq("target_time", 65.0);
    if (existingGoals && existingGoals.length > 0) {
      await supabase.from("milestones").delete().in("goal_id", existingGoals.map((g) => g.id));
      await supabase.from("goals").delete().in("id", existingGoals.map((g) => g.id));
    }

    // チーム (テストユーザーが admin かつ対象メンバーを兼ねる)
    const { data: team, error: teamErr } = await supabase
      .from("teams")
      .insert({
        name: "E2E-ProxyJudgmentチーム",
        invite_code: `E2E-PROXY-${Date.now()}`,
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

    const { data: goal, error: goalErr } = await supabase
      .from("goals")
      .insert({
        user_id: testUserId,
        competition_id: null,
        style_id: styleId,
        target_time: 65.0,
        start_time: 90.0,
        status: "active",
      })
      .select("id")
      .single();
    if (goalErr) throw new Error(`目標作成失敗: ${goalErr.message}`);
    goalId = goal.id;

    // M1: 練習代理入力 (set型)
    const { data: m1, error: m1Err } = await supabase
      .from("milestones")
      .insert({
        goal_id: goalId,
        title: "E2Eプロキシ練習マイルストーン",
        type: "set",
        // style は Br にして time型マイルストーン (M2, distance=100/style=Fr) と
        // 重複しないようにする (checkTimeAchievement の practice_logs 側は
        // milestone の type を区別せず distance+style が一致する practice_times を
        // 拾うため、同じ distance+style の練習ログにタイムを付けると意図せず
        // 他のマイルストーンまで達成してしまう)。
        params: { distance: 100, style: "Br", swim_category: "Swim", reps: 4, sets: 1, circle: 90 },
        deadline: format(addDays(new Date(), 60), "yyyy-MM-dd"),
        status: "in_progress",
      })
      .select("id")
      .single();
    if (m1Err) throw new Error(`マイルストーン(練習代理)作成失敗: ${m1Err.message}`);
    milestonePracticeProxyId = m1.id;

    // M2: 大会代理入力 (time型)
    const { data: m2, error: m2Err } = await supabase
      .from("milestones")
      .insert({
        goal_id: goalId,
        title: "E2Eプロキシ大会マイルストーン",
        type: "time",
        params: { distance: 100, target_time: 60, style: "Fr", swim_category: "Swim" },
        deadline: format(addDays(new Date(), 60), "yyyy-MM-dd"),
        status: "in_progress",
      })
      .select("id")
      .single();
    if (m2Err) throw new Error(`マイルストーン(大会代理)作成失敗: ${m2Err.message}`);
    milestoneRecordProxyId = m2.id;

    // M3: 期限切れ (set型、締切は過去日)。代理保存で達成させることで
    // 「未達成」の振り返りが出ないことを確認する。
    const { data: m3, error: m3Err } = await supabase
      .from("milestones")
      .insert({
        goal_id: goalId,
        title: "E2Eプロキシ期限切れマイルストーン",
        type: "set",
        params: { distance: 150, style: "Fr", swim_category: "Swim", reps: 4, sets: 1, circle: 90 },
        deadline: format(subDays(new Date(), 5), "yyyy-MM-dd"),
        status: "in_progress",
      })
      .select("id")
      .single();
    if (m3Err) throw new Error(`マイルストーン(期限切れ代理)作成失敗: ${m3Err.message}`);
    milestoneExpiredProxyId = m3.id;

    // M4: mobile 保存分 (set型、RPC も通さず直接 practice_logs/practice_times を作成)
    const { data: m4, error: m4Err } = await supabase
      .from("milestones")
      .insert({
        goal_id: goalId,
        title: "E2Eプロキシmobileマイルストーン",
        type: "set",
        params: { distance: 200, style: "Fr", swim_category: "Swim", reps: 4, sets: 1, circle: 90 },
        deadline: format(addDays(new Date(), 60), "yyyy-MM-dd"),
        status: "in_progress",
      })
      .select("id")
      .single();
    if (m4Err) throw new Error(`マイルストーン(mobile代理)作成失敗: ${m4Err.message}`);
    milestoneMobileProxyId = m4.id;

    // M5: /goals を直接開く経路の検証専用 (set型、他のマイルストーンとは別の distance)
    const { data: m5, error: m5Err } = await supabase
      .from("milestones")
      .insert({
        goal_id: goalId,
        title: "E2Eプロキシgoals直接マイルストーン",
        type: "set",
        params: { distance: 250, style: "Fr", swim_category: "Swim", reps: 4, sets: 1, circle: 90 },
        deadline: format(addDays(new Date(), 60), "yyyy-MM-dd"),
        status: "in_progress",
      })
      .select("id")
      .single();
    if (m5Err) throw new Error(`マイルストーン(goals直接代理)作成失敗: ${m5Err.message}`);
    milestoneGoalsDirectProxyId = m5.id;
  });

  test.afterAll(async () => {
    if (!testUserId) return;
    const supabase = createAdminClient();
    if (goalId) {
      await supabase.from("milestones").delete().eq("goal_id", goalId);
      await supabase.from("goals").delete().eq("id", goalId);
    }
    if (practiceProxyId) await supabase.from("practices").delete().eq("id", practiceProxyId);
    await supabase.from("practices").delete().eq("place", "E2E-ProxyJudgment会場");
    if (competitionProxyId) await supabase.from("records").delete().eq("competition_id", competitionProxyId);
    await supabase.from("competitions").delete().eq("title", "E2E-ProxyJudgment大会");
    if (teamId) {
      await supabase.from("team_memberships").delete().eq("team_id", teamId);
      await supabase.from("teams").delete().eq("id", teamId);
    }
  });

  test("[1] 練習の代理入力 (replace_practice_logs RPC) で保存したタイム付き練習記録が、本人が /dashboard を開いたときに反映されマイルストーンが achieved になる", async ({
    page,
  }) => {
    const supabase = createAdminClient();
    const { data: practice, error: practiceErr } = await supabase
      .from("practices")
      .insert({
        user_id: testUserId,
        team_id: teamId,
        date: format(new Date(), "yyyy-MM-dd"),
        place: "E2E-ProxyJudgment会場",
        note: "",
      })
      .select("id")
      .single();
    if (practiceErr) throw new Error(`練習作成失敗: ${practiceErr.message}`);
    practiceProxyId = practice.id;

    // PracticeLogClient.tsx が実際に呼ぶのと同じ RPC を、管理者としてログイン済みの
    // 認証済みクライアント (RLS 経由) から直接呼び出す。
    // 期限切れマイルストーン (milestoneExpiredProxyId, distance=150) の条件に一致する
    // メニューも同じ RPC 呼び出しに含める。理由: /dashboard を一度でも開くと
    // checkExpired が (判定 → getExpiredMilestones の順で) 走り、その時点でまだ
    // 未達成なマイルストーンは "expired" 状態に遷移してしまう
    // (updateAllMilestoneStatuses は status が not_started/in_progress の行しか
    // 拾わないため、一度 "expired" になった行はこの後どれだけ条件を満たしても二度と
    // 拾われない)。達成させたい対象は「expired に遷移する前」に条件を満たしておく
    // 必要がある。
    const { data: rpcResult, error: rpcError } = await authenticatedClient.rpc("replace_practice_logs", {
      p_practice_id: practiceProxyId,
      p_logs_data: [
        {
          user_id: testUserId,
          style: "Br",
          swim_category: "Swim",
          rep_count: 4,
          set_count: 1,
          distance: 100,
          circle: 90,
          note: "",
          practice_times: [{ set_number: 1, rep_number: 1, time: 58 }],
        },
        {
          user_id: testUserId,
          style: "Fr",
          swim_category: "Swim",
          rep_count: 4,
          set_count: 1,
          distance: 150,
          circle: 90,
          note: "",
        },
      ],
    });
    expect(rpcError).toBeNull();
    expect((rpcResult as { success?: boolean } | null)?.success).toBe(true);

    // 代理保存の時点ではまだ達成判定は走っていない。
    const { data: beforeData } = await supabase
      .from("milestones")
      .select("status")
      .eq("id", milestonePracticeProxyId)
      .single();
    expect(beforeData?.status).not.toBe("achieved");

    await supabaseLogin(page, { navigateTo: "/dashboard" });
    await page.waitForLoadState("networkidle").catch(() => {});

    await expect
      .poll(
        async () => {
          const { data } = await supabase
            .from("milestones")
            .select("status")
            .eq("id", milestonePracticeProxyId)
            .single();
          return data?.status;
        },
        { timeout: 15000, intervals: [500, 1000, 1500] },
      )
      .toBe("achieved");

    // 期限切れ条件を満たすマイルストーンも、期限切れ扱いになる前に同じ判定で achieved に
    // なっていること (シナリオ[3]の前提)。
    const { data: expiredMilestoneData } = await supabase
      .from("milestones")
      .select("status")
      .eq("id", milestoneExpiredProxyId)
      .single();
    expect(expiredMilestoneData?.status).toBe("achieved");
  });

  test("[1b] 代理保存分が /goals を直接開いた経路でも achieved になる (未判定の新しい milestone で確認)", async ({
    page,
  }) => {
    const supabase = createAdminClient();
    const { data: practice, error: practiceErr } = await supabase
      .from("practices")
      .insert({
        user_id: testUserId,
        team_id: teamId,
        date: format(new Date(), "yyyy-MM-dd"),
        place: "E2E-ProxyJudgment会場",
        note: "",
      })
      .select("id")
      .single();
    if (practiceErr) throw new Error(`練習作成失敗: ${practiceErr.message}`);

    const { error: rpcError } = await authenticatedClient.rpc("replace_practice_logs", {
      p_practice_id: practice.id,
      p_logs_data: [
        {
          user_id: testUserId,
          style: "Fr",
          swim_category: "Swim",
          rep_count: 4,
          set_count: 1,
          distance: 250,
          circle: 90,
          note: "",
        },
      ],
    });
    expect(rpcError).toBeNull();

    const { data: beforeData } = await supabase
      .from("milestones")
      .select("status")
      .eq("id", milestoneGoalsDirectProxyId)
      .single();
    expect(beforeData?.status).not.toBe("achieved");

    await supabaseLogin(page, { navigateTo: "/goals" });
    await page.waitForLoadState("networkidle").catch(() => {});

    await expect
      .poll(
        async () => {
          const { data } = await supabase
            .from("milestones")
            .select("status")
            .eq("id", milestoneGoalsDirectProxyId)
            .single();
          return data?.status;
        },
        { timeout: 15000, intervals: [500, 1000, 1500] },
      )
      .toBe("achieved");
  });

  test("[2] 大会記録の代理一括入力 (records 直接 insert) で保存した記録が、本人が開いたときに反映され time型マイルストーンが achieved になる", async ({
    page,
  }) => {
    const supabase = createAdminClient();
    const { data: competition, error: compErr } = await supabase
      .from("competitions")
      .insert({
        user_id: null,
        created_by: testUserId,
        title: "E2E-ProxyJudgment大会",
        date: format(subDays(new Date(), 1), "yyyy-MM-dd"),
        place: "テスト会場",
        pool_type: 1,
        team_id: teamId,
      })
      .select("id")
      .single();
    if (compErr) throw new Error(`大会作成失敗: ${compErr.message}`);
    competitionProxyId = competition.id;

    // RecordClient.tsx の buildRecordPayload と同じ形。管理者の認証済みクライアントから
    // 直接 insert する (RLS 経由、サービスロールではない)。
    const { error: insertError } = await authenticatedClient.from("records").insert({
      competition_id: competitionProxyId,
      user_id: testUserId,
      team_id: teamId,
      style_id: styleId,
      time: 59.5,
      note: null,
      is_relaying: false,
      pool_type: 1,
    });
    expect(insertError).toBeNull();

    const { data: beforeData } = await supabase
      .from("milestones")
      .select("status")
      .eq("id", milestoneRecordProxyId)
      .single();
    expect(beforeData?.status).not.toBe("achieved");

    await supabaseLogin(page, { navigateTo: "/dashboard" });
    await page.waitForLoadState("networkidle").catch(() => {});

    await expect
      .poll(
        async () => {
          const { data } = await supabase
            .from("milestones")
            .select("status")
            .eq("id", milestoneRecordProxyId)
            .single();
          return data?.status;
        },
        { timeout: 15000, intervals: [500, 1000, 1500] },
      )
      .toBe("achieved");
  });

  test("[3] 期限切れマイルストーンが代理保存で達成済みになった後は、ダッシュボードに「未達成」の振り返りが出ない", async ({
    page,
  }) => {
    // [1b] のテストで milestoneExpiredProxyId は既に achieved になっている前提。
    const supabase = createAdminClient();
    const { data } = await supabase
      .from("milestones")
      .select("status")
      .eq("id", milestoneExpiredProxyId)
      .single();
    expect(data?.status).toBe("achieved");

    await supabaseLogin(page, { navigateTo: "/dashboard" });
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(2000);

    // 達成済みのマイルストーンについて「振り返り」モーダルの見出しが出ないこと。
    await expect(page.getByRole("heading", { name: "マイルストーンの振り返り" })).not.toBeVisible();
  });

  test("[4] mobile 保存を模した直接 practice_logs/practice_times 作成分も、web を開くと achieved になる", async ({
    page,
  }) => {
    const supabase = createAdminClient();
    // RPC も経由せず、mobile が保存するのと同じ形で直接テーブルに insert する
    // (判定コードは呼ばない = 遅延評価の前提を再現)。
    const { data: practice, error: practiceErr } = await supabase
      .from("practices")
      .insert({
        user_id: testUserId,
        date: format(new Date(), "yyyy-MM-dd"),
        place: "E2E-ProxyJudgment会場",
        note: "",
      })
      .select("id")
      .single();
    if (practiceErr) throw new Error(`練習作成失敗: ${practiceErr.message}`);

    const { data: log, error: logErr } = await supabase
      .from("practice_logs")
      .insert({
        user_id: testUserId,
        practice_id: practice.id,
        style: "Fr",
        swim_category: "Swim",
        rep_count: 4,
        set_count: 1,
        distance: 200,
        circle: 90,
        note: "",
      })
      .select("id")
      .single();
    if (logErr) throw new Error(`練習ログ作成失敗: ${logErr.message}`);

    await supabase.from("practice_times").insert({
      user_id: testUserId,
      practice_log_id: log.id,
      set_number: 1,
      rep_number: 1,
      time: 60,
    });

    const { data: beforeData } = await supabase
      .from("milestones")
      .select("status")
      .eq("id", milestoneMobileProxyId)
      .single();
    expect(beforeData?.status).not.toBe("achieved");

    await supabaseLogin(page, { navigateTo: "/dashboard" });
    await page.waitForLoadState("networkidle").catch(() => {});

    await expect
      .poll(
        async () => {
          const { data } = await supabase
            .from("milestones")
            .select("status")
            .eq("id", milestoneMobileProxyId)
            .single();
          return data?.status;
        },
        { timeout: 15000, intervals: [500, 1000, 1500] },
      )
      .toBe("achieved");
  });
});
