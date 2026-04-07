import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createClient as createCookieClient } from "@/lib/supabase-auth/server";

export interface AuthenticatedRequest {
  uid: string;
  email: string | undefined;
}

export interface VerifyAuthResult {
  auth: AuthenticatedRequest;
  supabase: SupabaseClient;
}

async function verifyBearerToken(
  accessToken: string,
): Promise<{ result: VerifyAuthResult } | { error: NextResponse }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return {
      error: NextResponse.json(
        { error: "サーバー設定エラー" },
        { status: 500 },
      ),
    };
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      error: NextResponse.json(
        { error: "認証が必要です" },
        { status: 401 },
      ),
    };
  }

  return {
    result: {
      auth: { uid: user.id, email: user.email },
      supabase,
    },
  };
}

/**
 * Supabase セッションを検証する。
 * Authorization: Bearer <token> があれば Bearer token 認証を使用。
 * なければ cookie 認証にフォールバック。
 */
export async function verifyAuth(
  request: NextRequest,
): Promise<{ result: VerifyAuthResult } | { error: NextResponse }> {
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const accessToken = authHeader.substring(7);
    return verifyBearerToken(accessToken);
  }

  const supabase = await createCookieClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      error: NextResponse.json(
        { error: "認証が必要です" },
        { status: 401 },
      ),
    };
  }

  return {
    result: {
      auth: { uid: user.id, email: user.email },
      supabase: supabase as unknown as SupabaseClient,
    },
  };
}
