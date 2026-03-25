import type { Page } from "@playwright/test";
import { EnvConfig } from "../config/config";

/**
 * Supabase REST API でログインし、page.evaluate でブラウザの localStorage にセッションを注入する。
 * storageState による Web Locks 競合を回避する。
 *
 * @param page Playwright の Page オブジェクト
 * @param options ログインオプション（email/password/navigateTo）
 */
export async function supabaseLogin(
  page: Page,
  options?: {
    email?: string;
    password?: string;
    /** ログイン後に遷移するパス（デフォルト: /dashboard） */
    navigateTo?: string;
  },
): Promise<void> {
  // 認証情報を取得（引数 > 環境変数 > デフォルト値）
  let email = options?.email;
  let password = options?.password;

  if (!email || !password) {
    try {
      const testEnv = EnvConfig.getTestEnvironment();
      email = email || testEnv.credentials.email;
      password = password || testEnv.credentials.password;
    } catch {
      email = email || "e2e-test@swimhub.com";
      password = password || "E2ETest123!";
    }
  }

  const navigateTo = options?.navigateTo || "/dashboard";

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

  // 1. Supabase REST API でログイン
  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
    },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `Supabase REST API ログインに失敗しました (${response.status}): ${errorBody}`,
    );
  }

  const data = await response.json();
  const { access_token, refresh_token, expires_in, user } = data;

  if (!access_token || !refresh_token || !user) {
    throw new Error("Supabase REST API のレスポンスに必要なフィールドがありません");
  }

  // 2. @supabase/ssr の createBrowserClient は Cookie にセッションを保存する
  // Cookie 名の形式: sb-<project-ref>-auth-token (base64 チャンク分割される場合もある)
  const url = new URL(supabaseUrl);
  const projectRef = url.hostname.split(".")[0];
  const cookieBaseName = `sb-${projectRef}-auth-token`;

  const sessionData = JSON.stringify({
    access_token,
    refresh_token,
    expires_in,
    expires_at: Math.floor(Date.now() / 1000) + expires_in,
    token_type: "bearer",
    user,
  });

  // 3. ベースURL に移動してから Cookie を設定
  await page.goto("/login", { waitUntil: "domcontentloaded" });

  // Cookie + localStorage 両方にセッションを設定（アプリの実装に依存しないように）
  const baseUrl = page.url();
  const domain = new URL(baseUrl).hostname;

  // Cookie にセッションを設定（@supabase/ssr が使う形式）
  // Supabase SSR はセッションを base64 でチャンク分割して Cookie に保存する
  const encodedSession = Buffer.from(sessionData).toString("base64");
  // チャンクサイズ: 3180 バイト（Supabase のデフォルト）
  const chunkSize = 3180;
  const chunks = [];
  for (let i = 0; i < encodedSession.length; i += chunkSize) {
    chunks.push(encodedSession.slice(i, i + chunkSize));
  }

  if (chunks.length === 1) {
    await page.context().addCookies([
      {
        name: cookieBaseName,
        value: `base64-${chunks[0]}`,
        domain,
        path: "/",
        sameSite: "Lax",
        secure: false,
      },
    ]);
  } else {
    // 複数チャンクの場合
    for (let i = 0; i < chunks.length; i++) {
      await page.context().addCookies([
        {
          name: `${cookieBaseName}.${i}`,
          value: `base64-${chunks[i]}`,
          domain,
          path: "/",
          sameSite: "Lax",
          secure: false,
        },
      ]);
    }
  }

  // localStorage にもセッションを設定（フォールバック）
  await page.evaluate(
    ({ key, value }) => {
      localStorage.setItem(key, value);
    },
    { key: cookieBaseName, value: sessionData },
  );

  // 4. ターゲットページに遷移して認証状態を確認
  await page.goto(navigateTo, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {
    // networkidle がタイムアウトしても続行（Supabase リアルタイム接続のため）
  });

  // 5. ログイン状態を確認（ダッシュボードまたはサイドバー要素の存在）
  // /login にリダイレクトされていないことを確認
  const currentUrl = page.url();
  if (currentUrl.includes("/login")) {
    throw new Error(
      `セッション注入後もログインページにリダイレクトされました。URL: ${currentUrl}`,
    );
  }
}
