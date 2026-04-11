// middleware.ts - Next.js 15 Edge Middleware
import { updateSession } from "@/lib/supabase-auth/middleware";
import { type NextRequest } from "next/server";

// Cloudflare Workers 対応: Edge Runtime を使用
export const runtime = "experimental-edge";

export async function middleware(request: NextRequest) {
  const response = await updateSession(request);

  // セキュリティヘッダー（next.config.mjs の headers() から移動）
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

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
