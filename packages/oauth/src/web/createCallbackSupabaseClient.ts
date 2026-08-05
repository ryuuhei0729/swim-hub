import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { cookies } from "next/headers";
import type { NextRequest } from "next/server";

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
  supabase: SupabaseClient<Database>;
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
