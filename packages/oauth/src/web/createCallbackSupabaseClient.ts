import { createServerClient } from "@supabase/ssr";
import type { cookies } from "next/headers.js";
import type { NextRequest } from "next/server.js";

/**
 * createCallbackSupabaseClient の setAll() で蓄積される Cookie。
 * 実際の Set-Cookie ヘッダーへの反映は呼び出し側 (applyCookies) の責務。
 */
export type CookieToSet = {
  name: string;
  value: string;
  options?: Record<string, unknown>;
};

export interface CallbackSupabaseClient<Database = unknown> {
  // ここは意図的に `SupabaseClient<Database>` を @supabase/supabase-js から
  // 直接 import せず、@supabase/ssr の createServerClient の戻り値型から
  // 導出する。@supabase/ssr は "exports" フィールドを持たない CJS パッケージ
  // (main: "dist/main/index.js") のため、moduleResolution によって
  // createServerClient の戻り値内部で参照される SupabaseClient と、この
  // ファイルが独自に import する SupabaseClient が別々の宣言インスタンスとして
  // 解決されることがあり (protected メンバーを持つクラスのため構造的に同一でも
  // 代入不可になる)、type-check (tsconfig.json / bundler) と build
  // (tsconfig.build.json / nodenext) で解決結果が食い違って一方だけでエラーに
  // なる問題があった。createServerClient の戻り値型を単一の情報源にすることで
  // moduleResolution の設定に依存しない解決結果になる。
  supabase: ReturnType<typeof createServerClient<Database>>;
  cookiesToSet: CookieToSet[];
}

/**
 * OAuth / メール確認コールバックの Route Handler で使う Supabase サーバークライアントを構築する。
 *
 * - `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` のどちらかが
 *   未設定の場合は null を返す。
 * - `cookies.getAll()` は cookieStore (next/headers の cookies()) を優先し、
 *   同名キーが request.cookies.getAll() に無い場合のみそちらから穴埋めする。
 * - `cookies.setAll()` は呼ばれるたびに cookiesToSet 配列に蓄積するだけで、
 *   実際のレスポンス反映は行わない。
 *
 * 移植元: swimhub-scanner / swimhub-timer の
 * apps/web/src/app/api/auth/callback/route.ts の同名関数 (byte-identical)。
 */
export function createCallbackSupabaseClient<Database = unknown>(
  request: NextRequest,
  cookieStore: Awaited<ReturnType<typeof cookies>>,
): CallbackSupabaseClient<Database> | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  const cookiesToSet: CookieToSet[] = [];
  const supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        const storeCookies = cookieStore.getAll();
        const requestCookies = request.cookies.getAll().map((c) => ({
          name: c.name,
          value: c.value || "",
        }));

        const cookieMap = new Map(storeCookies.map((c) => [c.name, c.value]));
        requestCookies.forEach((c) => {
          if (!cookieMap.has(c.name)) {
            cookieMap.set(c.name, c.value);
          }
        });

        return Array.from(cookieMap.entries()).map(([name, value]) => ({
          name,
          value,
        }));
      },
      setAll(cookies: CookieToSet[]) {
        cookiesToSet.push(...cookies);
      },
    },
  });

  return { supabase, cookiesToSet };
}
