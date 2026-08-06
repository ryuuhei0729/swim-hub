import type { NextResponse } from "next/server.js";
import type { CookieToSet } from "./createCallbackSupabaseClient.js";

/**
 * createCallbackSupabaseClient / handleAuthCallback が蓄積した cookiesToSet を
 * 実際の NextResponse に反映する。
 *
 * options をスプレッドした「後」に sameSite:"lax" / secure:NODE_ENV==="production" /
 * path:"/" を強制上書きする (この順序により、呼び出し元が渡す options でこれら3属性を
 * 上書きできない設計になっている)。httpOnly・maxAge 等それ以外の options はそのまま保持する。
 *
 * 移植元: swimhub-scanner / swimhub-timer の
 * apps/web/src/app/api/auth/callback/route.ts の applyCookies (byte-identical)。
 */
export function applyCookies(response: NextResponse, cookiesToSet: CookieToSet[]): void {
  cookiesToSet.forEach((cookie) => {
    response.cookies.set(cookie.name, cookie.value, {
      ...(cookie.options as Record<string, string | boolean | number | Date>),
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
  });
}
