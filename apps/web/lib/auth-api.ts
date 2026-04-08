/**
 * API Route 用認証ヘルパー
 * Cookie 認証（Web）と Bearer トークン認証（モバイル）の両方に対応
 */
import { createClient, type User } from "@supabase/supabase-js";
import { getServerUser, createAuthenticatedServerClient } from "./supabase-server-auth";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@swim-hub/shared/types";
import { NextRequest } from "next/server";

interface AuthResult {
  user: User;
  supabase: SupabaseClient<Database>;
}

/**
 * API Route でユーザーを認証する
 * 1. まず Cookie 認証を試行（Web からのリクエスト）
 * 2. Cookie がなければ Authorization: Bearer トークンを試行（モバイルからのリクエスト）
 */
export async function authenticateApiRequest(request: NextRequest): Promise<AuthResult | null> {
  // 1. Cookie 認証を試行
  const cookieUser = await getServerUser();
  if (cookieUser) {
    const supabase = await createAuthenticatedServerClient();
    return { user: cookieUser, supabase };
  }

  // 2. Bearer トークンを試行
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const accessToken = authHeader.substring(7);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(accessToken);

  if (error || !user) {
    return null;
  }

  return { user, supabase };
}
