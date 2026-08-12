/**
 * Issue #17: CSP ヘッダーテスト — swim-hub
 *
 * Sprint Contract 検証観点:
 *   [Issue #17] CSP ヘッダー (強制モード, swim-hub 固有) が付与される
 *     - default-src 'self'
 *     - script-src 'self' 'nonce-<random>' (M-1: 'unsafe-inline' は使用しない)
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

// updateSession をモック。
// 実際の updateSession (lib/supabase-auth/middleware.ts) は内部で
// `NextResponse.next({ request })` を呼び、request ヘッダーをそのまま
// x-middleware-override-headers 経由でレンダリングに引き渡す。
// x-nonce 伝播 (attachNonceRequestHeaderOverride) の検証にはこの挙動の再現が必須なため、
// モックも同じ呼び出しをする (実装を書き直さず、実際の副作用だけを再現する)。
vi.mock("@/lib/supabase-auth/middleware", () => ({
  updateSession: vi.fn().mockImplementation((req: NextRequest) => {
    return Promise.resolve(
      NextResponse.next({ request: { headers: new Headers(req.headers) } }),
    );
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

    // M-1 (Sprint Contract V22): 'unsafe-inline' は script-src から除去され、
    // リクエストごとの nonce に置き換わっている。
    it("script-src に 'unsafe-inline' が含まれない (M-1)", async () => {
      const { middleware } = await import("../middleware");
      const res = await middleware(makeGetRequest("/"));
      const csp = res.headers.get("Content-Security-Policy") ?? "";
      const scriptSrc = csp.split(";").find((d) => d.trim().startsWith("script-src")) ?? "";
      expect(scriptSrc).not.toContain("'unsafe-inline'");
    });

    it("script-src に 'self' とリクエストごとの nonce-<random> が含まれる (M-1)", async () => {
      const { middleware } = await import("../middleware");
      const res1 = await middleware(makeGetRequest("/"));
      const res2 = await middleware(makeGetRequest("/"));
      const csp1 = res1.headers.get("Content-Security-Policy") ?? "";
      const csp2 = res2.headers.get("Content-Security-Policy") ?? "";
      const nonceMatch1 = csp1.match(/'nonce-([^']+)'/);
      const nonceMatch2 = csp2.match(/'nonce-([^']+)'/);
      expect(csp1).toContain("script-src 'self' 'nonce-");
      expect(nonceMatch1?.[1]).toBeTruthy();
      expect(nonceMatch2?.[1]).toBeTruthy();
      // リクエストごとに異なる nonce が生成される (固定値の nonce は CSP を無意味化するため)
      expect(nonceMatch1?.[1]).not.toBe(nonceMatch2?.[1]);
    });

    it("同じリクエストで CSP ヘッダーの nonce と x-nonce (レンダリング用リクエストヘッダー override) が一致する (M-1)", async () => {
      // "/" は next-intl の localePrefix:"always" によって /ja へ 308 リダイレクトされ、
      // その場合 middleware() は intlResponse を早期 return し updateSession に到達しない
      // (このレスポンスでページはレンダリングされないため x-nonce override は不要という
      // 正しい挙動)。x-nonce 伝播を検証するにはロケール確定済みのパスを使う必要がある。
      const { middleware } = await import("../middleware");
      const res = await middleware(makeGetRequest("/ja"));
      const csp = res.headers.get("Content-Security-Policy") ?? "";
      const nonceInCsp = csp.match(/'nonce-([^']+)'/)?.[1];
      expect(nonceInCsp).toBeTruthy();
      expect(res.headers.get("x-middleware-request-x-nonce")).toBe(nonceInCsp);
    });

    // C-1 (再検証): Next.js は「リクエストヘッダーの Content-Security-Policy」から
    // 自前で nonce を正規表現抽出し、RSC の自動生成インラインスクリプト
    // (self.__next_f.push(...)) にその nonce を適用する (app-render.js の
    // getScriptNonceFromHeader)。x-nonce だけでは JSON-LD 用の値しか伝わらず、
    // Next.js 自身が生成するスクリプトには届かない。この経路が意図通り機能しているかを
    // 「リクエストヘッダーに Content-Security-Policy がオーバーライドされ、
    // レスポンスヘッダーの CSP と同一の nonce を含む」ことで検証する
    // (Playwright 不在のため、これが HTTP レベルで到達できる最大限の証拠)。
    it("C-1: リクエストヘッダーの Content-Security-Policy が override され、レスポンスの CSP と同じ nonce を含む", async () => {
      const { middleware } = await import("../middleware");
      const res = await middleware(makeGetRequest("/ja"));
      const responseCsp = res.headers.get("Content-Security-Policy") ?? "";
      const nonceInResponseCsp = responseCsp.match(/'nonce-([^']+)'/)?.[1];
      expect(nonceInResponseCsp).toBeTruthy();

      const overrideKeys = (res.headers.get("x-middleware-override-headers") ?? "")
        .split(",")
        .map((k) => k.trim());
      expect(overrideKeys).toContain("content-security-policy");

      const requestCsp = res.headers.get("x-middleware-request-content-security-policy") ?? "";
      const nonceInRequestCsp = requestCsp.match(/'nonce-([^']+)'/)?.[1];
      expect(nonceInRequestCsp).toBe(nonceInResponseCsp);
    });

    // 撤去確認: 自作の attachNonceRequestHeaderOverride() (内部プロトコル依存ヘルパー) は
    // C-1 の修正で撤去され、公式パターン (new NextRequest(request, {headers})) に
    // 置換されたはず。middleware.ts のソースを直接確認する (静的レビューの一部を
    // テストとして固定化しておく = 将来の回帰防止)。
    it("C-1: 自作の x-nonce override ヘルパーが撤去され、公式の NextRequest 差し替えパターンに置換されている", async () => {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const source = fs.readFileSync(
        path.resolve(__dirname, "../middleware.ts"),
        "utf-8",
      );
      expect(source).not.toContain("attachNonceRequestHeaderOverride");
      expect(source).toContain("new NextRequest(request");
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
      const scriptSrc = csp.split(";").find((d) => d.trim().startsWith("script-src")) ?? "";
      expect(scriptSrc).toContain("'self'");
      expect(scriptSrc).toContain("'wasm-unsafe-eval'");
      expect(scriptSrc).toContain("blob:");
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
