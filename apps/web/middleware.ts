// middleware.ts - Next.js 15 Edge Middleware
import { updateSession } from "@/lib/supabase-auth/middleware";
import { type NextRequest } from "next/server";

// Cloudflare Workers 対応: Edge Runtime を使用
export const runtime = "experimental-edge";

// NEXT_PUBLIC_SUPABASE_URL の origin を CSP connect-src に動的注入
// ローカル Supabase (http://127.0.0.1:54321) やセルフホストなど *.supabase.co に
// マッチしない URL でもブラウザからの fetch/WebSocket を許可する
const SUPABASE_ORIGIN = (() => {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    return url ? new URL(url).origin : "";
  } catch {
    return "";
  }
})();
const SUPABASE_WS_ORIGIN = SUPABASE_ORIGIN.replace(/^http/, "ws");

// R2 公開 URL が custom domain の場合、*.r2.dev ではマッチしないため origin を動的注入
const R2_PUBLIC_ORIGIN = (() => {
  try {
    const url = process.env.NEXT_PUBLIC_R2_PUBLIC_URL;
    return url ? new URL(url).origin : "";
  } catch {
    return "";
  }
})();

const CSP = [
  "default-src 'self'",
  // ffmpeg.wasm は unpkg から取得した core.js/core.wasm を blob: URL 経由で実行するため
  // script-src に blob: と 'wasm-unsafe-eval' が必要
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob:",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  [
    "img-src 'self' data: blob: https://*.supabase.co https://*.r2.dev https://*.r2.cloudflarestorage.com",
    R2_PUBLIC_ORIGIN,
  ]
    .filter(Boolean)
    .join(" "),
  // <video> の blob: プレビュー、および R2 presigned URL (S3 互換エンドポイント)
  "media-src 'self' blob: https://*.r2.cloudflarestorage.com",
  "font-src 'self'",
  [
    "connect-src 'self'",
    SUPABASE_ORIGIN,
    SUPABASE_WS_ORIGIN,
    "https://*.supabase.co",
    "wss://*.supabase.co",
    "https://api.stripe.com",
    "https://oauth2.googleapis.com",
    "https://www.googleapis.com",
    "https://*.r2.cloudflarestorage.com",
    // ffmpeg.wasm コアの取得先
    "https://unpkg.com",
  ]
    .filter(Boolean)
    .join(" "),
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

export async function middleware(request: NextRequest) {
  const response = await updateSession(request);

  // セキュリティヘッダー（next.config.mjs の headers() から移動）
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.headers.set("Content-Security-Policy", CSP);

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
