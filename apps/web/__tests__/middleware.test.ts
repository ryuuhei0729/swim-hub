/**
 * Issue #17: CSP ヘッダーテスト — swim-hub
 *
 * Sprint Contract 検証観点:
 *   [Issue #17] CSP ヘッダー (強制モード, swim-hub 固有) が付与される
 *     - default-src 'self'
 *     - script-src 'self' 'unsafe-inline'
 *     - style-src 'self' 'unsafe-inline'
 *     - img-src 'self' data: blob: https://*.supabase.co https://*.r2.dev
 *     - connect-src に Supabase / Stripe / Google OAuth が含まれる
 *     - frame-src 'none' / frame-ancestors 'none'
 *     - object-src 'none'
 *     ※ Report-Only ではなく Content-Security-Policy ヘッダーを使用すること
 *
 *   swim-hub の Issue #27 ヘッダー 4 種は既に実装済み (参考パターン) であり
 *   今回のスコープはこれを維持しつつ CSP を追加することの確認。
 *
 * テスト対象: middleware.ts (apps/web/middleware.ts)
 *
 * 注: swim-hub の vitest.config.ts は `@` → apps/web/ にエイリアス設定
 */

import { NextRequest, NextResponse } from "next/server";
import { describe, expect, it, vi } from "vitest";

// updateSession をモック
vi.mock("@/lib/supabase-auth/middleware", () => ({
  updateSession: vi.fn().mockImplementation((_req: NextRequest) => {
    return Promise.resolve(NextResponse.next());
  }),
}));

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------
function makeGetRequest(path: string = "/"): NextRequest {
  return new NextRequest(`http://localhost${path}`, { method: "GET" });
}

// ---------------------------------------------------------------------------
// テスト本体
// ---------------------------------------------------------------------------
describe("swim-hub middleware — セキュリティヘッダー", () => {
  // -------------------------------------------------------------------------
  // 既存実装の確認: セキュリティヘッダー 4 種 (参考パターン、維持確認)
  // -------------------------------------------------------------------------
  describe("[維持確認] X-Frame-Options / X-Content-Type-Options / Referrer-Policy / Permissions-Policy", () => {
    it("X-Frame-Options: DENY が設定される", async () => {
      const { middleware } = await import("../middleware");
      const res = await middleware(makeGetRequest("/"));
      expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    });

    it("X-Content-Type-Options: nosniff が設定される", async () => {
      const { middleware } = await import("../middleware");
      const res = await middleware(makeGetRequest("/"));
      expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    });

    it("Referrer-Policy: strict-origin-when-cross-origin が設定される", async () => {
      const { middleware } = await import("../middleware");
      const res = await middleware(makeGetRequest("/"));
      expect(res.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    });

    it("Permissions-Policy: camera=(), microphone=(), geolocation=() が設定される", async () => {
      const { middleware } = await import("../middleware");
      const res = await middleware(makeGetRequest("/"));
      expect(res.headers.get("Permissions-Policy")).toBe(
        "camera=(), microphone=(), geolocation=()",
      );
    });
  });

  // -------------------------------------------------------------------------
  // Issue #17: CSP ヘッダー (swim-hub 固有)
  // -------------------------------------------------------------------------
  describe("[Issue #17] Content-Security-Policy", () => {
    it("Content-Security-Policy ヘッダーが存在する (Report-Only ではない)", async () => {
      const { middleware } = await import("../middleware");
      const res = await middleware(makeGetRequest("/"));
      expect(res.headers.get("Content-Security-Policy")).not.toBeNull();
      expect(res.headers.get("Content-Security-Policy-Report-Only")).toBeNull();
    });

    it("default-src 'self' が含まれる", async () => {
      const { middleware } = await import("../middleware");
      const res = await middleware(makeGetRequest("/"));
      const csp = res.headers.get("Content-Security-Policy") ?? "";
      expect(csp).toContain("default-src 'self'");
    });

    it("script-src 'self' 'unsafe-inline' が含まれる", async () => {
      const { middleware } = await import("../middleware");
      const res = await middleware(makeGetRequest("/"));
      const csp = res.headers.get("Content-Security-Policy") ?? "";
      expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    });

    it("style-src 'self' 'unsafe-inline' が含まれる", async () => {
      const { middleware } = await import("../middleware");
      const res = await middleware(makeGetRequest("/"));
      const csp = res.headers.get("Content-Security-Policy") ?? "";
      expect(csp).toContain("style-src 'self' 'unsafe-inline'");
    });

    it("img-src に data: blob: https://*.supabase.co https://*.r2.dev が含まれる", async () => {
      const { middleware } = await import("../middleware");
      const res = await middleware(makeGetRequest("/"));
      const csp = res.headers.get("Content-Security-Policy") ?? "";
      expect(csp).toContain("img-src");
      expect(csp).toContain("data:");
      expect(csp).toContain("blob:");
      expect(csp).toContain("https://*.supabase.co");
      expect(csp).toContain("https://*.r2.dev");
    });

    it("connect-src に Supabase (https + wss) が含まれる", async () => {
      const { middleware } = await import("../middleware");
      const res = await middleware(makeGetRequest("/"));
      const csp = res.headers.get("Content-Security-Policy") ?? "";
      expect(csp).toContain("https://*.supabase.co");
      expect(csp).toContain("wss://*.supabase.co");
    });

    it("connect-src に Stripe と Google OAuth が含まれる", async () => {
      const { middleware } = await import("../middleware");
      const res = await middleware(makeGetRequest("/"));
      const csp = res.headers.get("Content-Security-Policy") ?? "";
      expect(csp).toContain("https://api.stripe.com");
      expect(csp).toContain("https://oauth2.googleapis.com");
      expect(csp).toContain("https://www.googleapis.com");
    });

    it("frame-src 'none' が含まれる", async () => {
      const { middleware } = await import("../middleware");
      const res = await middleware(makeGetRequest("/"));
      const csp = res.headers.get("Content-Security-Policy") ?? "";
      expect(csp).toContain("frame-src 'none'");
    });

    it("frame-ancestors 'none' が含まれる", async () => {
      const { middleware } = await import("../middleware");
      const res = await middleware(makeGetRequest("/"));
      const csp = res.headers.get("Content-Security-Policy") ?? "";
      expect(csp).toContain("frame-ancestors 'none'");
    });

    it("object-src 'none' が含まれる", async () => {
      const { middleware } = await import("../middleware");
      const res = await middleware(makeGetRequest("/"));
      const csp = res.headers.get("Content-Security-Policy") ?? "";
      expect(csp).toContain("object-src 'none'");
    });

    it("base-uri 'self' が含まれる", async () => {
      const { middleware } = await import("../middleware");
      const res = await middleware(makeGetRequest("/"));
      const csp = res.headers.get("Content-Security-Policy") ?? "";
      expect(csp).toContain("base-uri 'self'");
    });

    it("form-action 'self' が含まれる", async () => {
      const { middleware } = await import("../middleware");
      const res = await middleware(makeGetRequest("/"));
      const csp = res.headers.get("Content-Security-Policy") ?? "";
      expect(csp).toContain("form-action 'self'");
    });

    it("script-src に 'wasm-unsafe-eval' と blob: が含まれる (ffmpeg.wasm 用)", async () => {
      const { middleware } = await import("../middleware");
      const res = await middleware(makeGetRequest("/"));
      const csp = res.headers.get("Content-Security-Policy") ?? "";
      expect(csp).toContain("'wasm-unsafe-eval'");
      expect(csp).toContain("script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' blob:");
    });

    it("media-src に blob: と R2 S3 互換エンドポイントが含まれる (動画再生用)", async () => {
      const { middleware } = await import("../middleware");
      const res = await middleware(makeGetRequest("/"));
      const csp = res.headers.get("Content-Security-Policy") ?? "";
      expect(csp).toContain("media-src 'self' blob: https://*.r2.cloudflarestorage.com");
    });

    it("worker-src に blob: が含まれる (ffmpeg.wasm Worker 用)", async () => {
      const { middleware } = await import("../middleware");
      const res = await middleware(makeGetRequest("/"));
      const csp = res.headers.get("Content-Security-Policy") ?? "";
      expect(csp).toContain("worker-src 'self' blob:");
    });
  });
});
