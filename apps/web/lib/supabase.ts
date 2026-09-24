import { createBrowserClient } from "@supabase/ssr";
import { type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@swim-hub/shared/types";

// ブラウザ環境でSupabaseクライアントを管理（Hot Reload対応）
declare global {
  interface Window {
    __supabase_client__?: SupabaseClient<Database>;
  }
}

/**
 * Supabase環境変数を検証（クライアント側）
 * @throws {Error} 環境変数が設定されていない、または無効な場合
 */
function validateSupabaseEnv(): { url: string; anonKey: string } {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // 環境変数が設定されていない、または空文字列の場合
  if (
    !supabaseUrl ||
    !supabaseAnonKey ||
    supabaseUrl.trim() === "" ||
    supabaseAnonKey.trim() === ""
  ) {
    const missingVars: string[] = [];
    if (!supabaseUrl || supabaseUrl.trim() === "") missingVars.push("NEXT_PUBLIC_SUPABASE_URL");
    if (!supabaseAnonKey || supabaseAnonKey.trim() === "")
      missingVars.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");

    throw new Error(`Supabase環境変数が設定されていません: ${missingVars.join(", ")}`);
  }

  // URLの形式検証
  try {
    new URL(supabaseUrl);
  } catch {
    throw new Error(`Invalid NEXT_PUBLIC_SUPABASE_URL: "${supabaseUrl}" is not a valid URL`);
  }

  return { url: supabaseUrl, anonKey: supabaseAnonKey };
}

// ブラウザ用のSupabaseクライアント（シングルトン）
// 重要: Browser Clientは1箇所だけに統一することで、PKCE code verifierが確実にCookieに保存・読み取りされる
const { url, anonKey } = (() => {
  // ブラウザ環境でのみ検証（サーバー側ビルド時はクライアント生成しない）
  if (typeof window === "undefined") {
    return { url: "", anonKey: "" };
  }
  return validateSupabaseEnv();
})();

// Secure Cookie を付けてよいか判定する関数
//
// 判定軸はホスト名ではなくプロトコル。Secure 属性付き Cookie は HTTP では
// ブラウザに破棄されるため、http で配信している限り付けてはいけない。
// ホスト名で判定していた頃は、実機スマホから LAN/tailnet IP (http) で開くと
// secure: true になり認証 Cookie が保存されず、ログインしてもリダイレクトされなかった。
// 本番は https 配信なので従来どおり secure: true になる。
function shouldUseSecureCookies(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return window.location.protocol === "https:";
}

// ブラウザ環境でのみSupabaseクライアントを作成
// サーバー側（ビルド時）ではundefinedを返す
// Cookie設定は環境に応じて変更
// - ローカル開発（HTTP）: secure: false, sameSite: 'lax'
// - 本番（HTTPS）: secure: true, sameSite: 'lax'
// 重要: pathを明示的に設定することで、PKCE code verifierが確実にCookieに保存される
export const supabase: SupabaseClient<Database> | undefined =
  typeof window !== "undefined"
    ? createBrowserClient<Database>(
        url,
        anonKey,
        {
          cookieOptions: {
            sameSite: "lax",
            secure: shouldUseSecureCookies(), // http 配信時は付けない (付くと Cookie が破棄される)
            path: "/", // すべてのパスでCookieが有効になるように設定
          },
        },
      )
    : undefined;

// 後方互換性のため、createClient関数もエクスポート（supabaseを返す）
export const createClient = (): SupabaseClient<Database> => {
  if (typeof window === "undefined") {
    throw new Error("createClient()はブラウザ環境でのみ使用できます");
  }
  if (!supabase) {
    throw new Error("Supabaseクライアントが初期化されていません");
  }
  return supabase;
};
