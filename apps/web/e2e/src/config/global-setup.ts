import { chromium, type FullConfig } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { EnvConfig } from "./config";

/**
 * テストユーザーの user_subscriptions を Premium（active）に設定する
 * E2Eテストは Premium 前提で実行するため、全機能が利用可能な状態にする
 */
async function ensurePremiumSubscription(
  supabase: ReturnType<typeof createClient>,
  userId: string,
) {
  try {
    const now = new Date();
    const premiumExpires = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

    await supabase.from("user_subscriptions").upsert(
      {
        id: userId,
        plan: "premium",
        status: "active",
        provider: "stripe",
        provider_subscription_id: `sub_e2e_test_${userId.slice(0, 8)}`,
        premium_expires_at: premiumExpires.toISOString(),
        current_period_start: now.toISOString(),
        cancel_at_period_end: false,
        stripe_customer_id: `cus_e2e_test_${userId.slice(0, 8)}`,
      },
      { onConflict: "id" },
    );
    console.log("✅ テストユーザーを Premium プランに設定しました");
  } catch (error) {
    console.warn("⚠️  Premium 設定で警告:", (error as Error).message);
  }
}

/**
 * グローバルセットアップ
 * テスト実行前の共通準備処理
 *
 * 主な処理:
 * 1. サーバーのヘルスチェック
 * 2. ログイン処理を実行してstorageStateを保存（ログイン省略のため）
 */
async function globalSetup(config: FullConfig) {
  console.log("🚀 E2Eテストのグローバルセットアップを開始");

  const { baseURL } = config.projects[0].use;

  if (!baseURL) {
    throw new Error("ベースURLが設定されていません");
  }

  // 環境変数の確認
  let testEnv: ReturnType<typeof EnvConfig.getTestEnvironment> | null = null;
  try {
    testEnv = EnvConfig.getTestEnvironment();
    console.log(`✅ テスト環境設定を確認: ${testEnv.baseUrl}`);
    console.log(`✅ テストユーザー: ${testEnv.credentials.email}`);
  } catch (error) {
    console.warn("⚠️  環境変数の確認で警告:", (error as Error).message);
    // 環境変数が設定されていない場合、標準テストユーザーを使用
    const baseUrl = config.projects[0].use.baseURL || "http://localhost:3000";
    testEnv = {
      baseUrl,
      credentials: {
        email: "e2e-test@swimhub.com",
        password: "E2ETest123!",
      },
    };
    console.log(`✅ 標準テストユーザーを使用: ${testEnv.credentials.email}`);
  }

  // Supabase接続確認とテストユーザー作成
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (supabaseServiceKey) {
    try {
      console.log("📡 Supabase接続を確認中...");
      const supabase = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      });

      // 簡単な接続テスト（ユーザー一覧取得）
      const { error: listError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 });
      if (listError) {
        console.warn(`⚠️  Supabase接続確認で警告: ${listError.message}`);
      } else {
        console.log("✅ Supabase接続を確認しました");
      }

      // テストユーザーの存在確認と作成（存在しない場合のみ作成）
      if (testEnv) {
        const targetEmail = testEnv.credentials.email.toLowerCase();
        const findUserByEmail = async () => {
          let page = 1;
          const perPage = 500;
          while (true) {
            const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
            if (error) {
              throw error;
            }
            const match = data?.users.find((user) => user.email?.toLowerCase() === targetEmail);
            if (match) {
              return match;
            }
            if (!data || data.users.length < perPage) {
              return null;
            }
            page += 1;
          }
        };
        const existingUser = await findUserByEmail();

        if (!existingUser) {
          console.log(`👤 テストユーザーを作成中: ${testEnv.credentials.email}`);
          const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
            email: testEnv.credentials.email,
            password: testEnv.credentials.password,
            email_confirm: true,
            user_metadata: {
              name: "E2Eテストユーザー",
            },
          });

          if (createError) {
            console.warn(`⚠️  テストユーザー作成で警告: ${createError.message}`);
          } else if (newUser) {
            console.log(`✅ テストユーザーを作成しました: ${testEnv.credentials.email}`);

            // users テーブルにプロフィール情報を追加（エラーは無視）
            try {
              await supabase.from("users").insert({
                id: newUser.user.id,
                name: "E2Eテストユーザー",
                gender: 0,
                bio: "E2Eテスト用ユーザー",
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              });
            } catch {
              // プロフィール作成エラーは無視（既に存在する場合など）
            }

            // user_subscriptions を Premium に設定（E2Eテストは Premium 前提で実行）
            await ensurePremiumSubscription(supabase, newUser.user.id);
          }
        } else {
          console.log(`✅ テストユーザーは既に存在します: ${testEnv.credentials.email}`);

          // 既存ユーザーのパスワードとメール確認状態を最新化
          const { error: updateError } = await supabase.auth.admin.updateUserById(existingUser.id, {
            password: testEnv.credentials.password,
            email_confirm: true,
            user_metadata: {
              ...(existingUser.user_metadata || {}),
              name: existingUser.user_metadata?.name ?? "E2Eテストユーザー",
            },
          });

          if (updateError) {
            console.warn(`⚠️  テストユーザーの更新で警告: ${updateError.message}`);
          } else {
            console.log("🔄 既存テストユーザーのパスワードを同期しました");
          }

          // プロフィールが存在しない場合のみ作成
          const { data: profile } = await supabase
            .from("users")
            .select("id")
            .eq("id", existingUser.id)
            .single();

          if (!profile) {
            try {
              await supabase.from("users").insert({
                id: existingUser.id,
                name: "E2Eテストユーザー",
                gender: 0,
                bio: "E2Eテスト用ユーザー",
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              });
            } catch {
              // 既に存在するなどのエラーは無視
            }
          }

          // user_subscriptions を Premium に設定（E2Eテストは Premium 前提で実行）
          await ensurePremiumSubscription(supabase, existingUser.id);
        }
      }
    } catch (error) {
      console.warn("⚠️  Supabase接続確認をスキップ:", (error as Error).message);
      // 接続確認に失敗してもテストは続行（CI環境では既に起動済みの可能性がある）
    }
  }

  // ブラウザ起動
  const browser = await chromium.launch({
    headless: process.env.CI ? true : false,
  });

  try {
    // 基本的なヘルスチェック
    const page = await browser.newPage();

    // サーバーの起動を待つ（リトライロジック）
    console.log(`📡 ${baseURL} への接続をテスト中...`);
    const maxRetries = 10;
    const retryDelay = 3000; // 3秒
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await page.goto(baseURL, { waitUntil: "domcontentloaded", timeout: 10000 });

        // ページタイトルチェック
        const title = await page.title();
        console.log(`✅ ページタイトル: ${title}`);

        // アプリケーションが正常に読み込まれているかチェック
        await page.waitForSelector("body", { timeout: 5000 });
        console.log("✅ アプリケーションが正常に読み込まれました");

        await page.close();
        break; // 成功したらループを抜ける
      } catch (error) {
        lastError = error as Error;
        if (attempt < maxRetries) {
          console.log(`⏳ サーバーの起動を待機中... (${attempt}/${maxRetries})`);
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
        } else {
          throw lastError;
        }
      }
    }

    // storageState によるログイン状態の保存は廃止（Web Locks デッドロック回避のため）
    // 各テストで supabaseLogin() による REST API ログイン + localStorage 注入を使用する
    console.log("ℹ️  storageState は使用しません（各テストで supabaseLogin() を使用）");
  } catch (error) {
    console.error("❌ グローバルセットアップでエラーが発生:", error);
    throw error;
  } finally {
    await browser.close();
  }
  console.log("✅ グローバルセットアップが完了しました");
}

export default globalSetup;
