// middleware.ts - Next.js 15 Edge Middleware
import { routing } from "@/i18n/routing";
import { updateSession } from "@/lib/supabase-auth/middleware";
import createMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";

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

// next-intl middleware を生成 (locale プレフィックス判定 + リダイレクト)
const intlMiddleware = createMiddleware(routing);

function applySecurityHeaders(response: NextResponse): void {
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.headers.set("Content-Security-Policy", CSP);
}

export async function middleware(request: NextRequest) {
  // Step 1: next-intl middleware で locale 判定 / リダイレクト
  // localePrefix: "always" のため /dashboard 等は /ja/dashboard へ 308 リダイレクト
  const intlResponse = intlMiddleware(request);

  // next-intl がリダイレクト (3xx) を返した場合は
  // CSP 等のセキュリティヘッダーを付与してから即座に return する
  // (status code で判定。location ヘッダー依存は next-intl の内部実装に依存しすぎるため避ける)
  if (intlResponse.status >= 300 && intlResponse.status < 400) {
    applySecurityHeaders(intlResponse);
    return intlResponse;
  }

  // Step 2: Supabase Auth セッション更新と認証ガード
  // 認証ガード内でリダイレクトが発生する場合もあるが、その場合も CSP は付与する
  const response = await updateSession(request);

  // Step 3: CSP / セキュリティヘッダー付与 (next-intl リダイレクトでない全レスポンスに対して)
  applySecurityHeaders(response);

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - api/* (Route Handlers; ロケールリダイレクトと Supabase 認証 chain を通さない)
     * - 静的アセット (画像)
     */
    "/((?!_next/static|_next/image|favicon.ico|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
