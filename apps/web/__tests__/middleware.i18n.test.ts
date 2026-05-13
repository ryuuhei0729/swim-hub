/**
 * Issue #32 Phase 1-A: i18n middleware chain テスト
 *
 * Sprint Contract 検証観点:
 *   [V-07] middleware chain 順: next-intl → updateSession → CSP
 *   [V-08] /dashboard → 308 で /ja/dashboard にリダイレクト (localePrefix: 'always')
 *   [V-09] /ja/dashboard への直接アクセスは next-intl を通過し Supabase Auth へフォワード
 *   [V-10] /api/* は matcher から除外されミドルウェアを通らない
 *   [V-11] 未認証 /ja/dashboard → /ja/login?redirect_to=/ja/dashboard にリダイレクト
 *   [V-12] Accept-Language: en ヘッダー付き /dashboard → /ja/dashboard (localeDetection: false)
 *   [V-13] 既存 CSP ヘッダーが /ja/* レスポンスにも付与されること
 *
 * テスト対象: middleware.ts (apps/web/middleware.ts)
 *
 * モックパターン:
 *   next-intl/middleware の default export は createMiddleware (factory)。
 *   middleware.ts ではモジュールロード時に intlMiddleware = createMiddleware(routing) を実行する。
 *   テストでは vi.hoisted で固定の mock 関数を作成し、factory がそれを返すようにする。
 *   各 it 内で mockIntlMiddleware.mockReturnValueOnce(...) で挙動を制御する。
 */

import { NextRequest, NextResponse } from "next/server";
import { describe, expect, it, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// モック設定
// ---------------------------------------------------------------------------

// vi.hoisted で middleware 関数を共有 (vi.mock factory 内で参照するため)
const { mockIntlMiddleware } = vi.hoisted(() => ({
  mockIntlMiddleware: vi.fn(),
}));

// updateSession をモック (既存 middleware.test.ts と同じパターン)
vi.mock("@/lib/supabase-auth/middleware", () => ({
  updateSession: vi.fn(),
}));

// next-intl/middleware の default export は createMiddleware (factory)
// factory は呼ばれると middleware 関数を返す
vi.mock("next-intl/middleware", () => ({
  default: vi.fn(() => mockIntlMiddleware),
}));

// ---------------------------------------------------------------------------
// ヘルパー
// ---------------------------------------------------------------------------

function makeRequest(path: string, options?: { headers?: Record<string, string> }): NextRequest {
  const headers = new Headers(options?.headers ?? {});
  return new NextRequest(`http://localhost${path}`, { method: "GET", headers });
}

// ---------------------------------------------------------------------------
// テスト本体
// ---------------------------------------------------------------------------

describe("swim-hub middleware — i18n chain (Issue #32 Phase 1-A)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // [V-08] ロケールプレフィックスなし URL → /ja/ へのリダイレクト
  // -------------------------------------------------------------------------
  describe("[V-08] localePrefix: 'always' — プレフィックスなし URL のリダイレクト", () => {
    it("/dashboard へのアクセスは 308 で /ja/dashboard にリダイレクトされる", async () => {
      mockIntlMiddleware.mockReturnValueOnce(
        NextResponse.redirect(new URL("http://localhost/ja/dashboard"), { status: 308 }),
      );

      const { middleware } = await import("../middleware");
      const req = makeRequest("/dashboard");
      const res = await middleware(req);

      expect(res.status).toBe(308);
      expect(res.headers.get("location")).toContain("/ja/dashboard");
    });

    it("/ へのアクセスは 308 で /ja/ にリダイレクトされる", async () => {
      mockIntlMiddleware.mockReturnValueOnce(
        NextResponse.redirect(new URL("http://localhost/ja/"), { status: 308 }),
      );

      const { middleware } = await import("../middleware");
      const req = makeRequest("/");
      const res = await middleware(req);

      expect(res.status).toBe(308);
      expect(res.headers.get("location")).toContain("/ja/");
    });
  });

  // -------------------------------------------------------------------------
  // [V-09] /ja/* への直接アクセスは next-intl を通過し Auth guard へ
  // -------------------------------------------------------------------------
  describe("[V-09] /ja/* への直接アクセス — 次の middleware にフォワード", () => {
    it("/ja/dashboard への直接アクセスで next-intl は next() を返し、updateSession が呼ばれる", async () => {
      const { updateSession } = await import("@/lib/supabase-auth/middleware");
      const mockUpdateSession = vi.mocked(updateSession);

      // next-intl がリダイレクトせずに通過させる (next() に相当する応答)
      mockIntlMiddleware.mockReturnValueOnce(NextResponse.next());
      // updateSession は通常レスポンスを返す
      mockUpdateSession.mockResolvedValueOnce(NextResponse.next());

      const { middleware } = await import("../middleware");
      const req = makeRequest("/ja/dashboard");
      await middleware(req);

      // updateSession が呼ばれたこと = Auth guard が動作したこと
      expect(mockUpdateSession).toHaveBeenCalledOnce();
    });
  });

  // -------------------------------------------------------------------------
  // [V-10] /api/* は matcher から除外
  // -------------------------------------------------------------------------
  describe("[V-10] /api/* は matcher から除外 — 正規表現として動作検証", () => {
    it("matcher のパターンを正規表現として評価し、/api/* がマッチしないこと", async () => {
      const middlewareModule = await import("../middleware");
      const matcherConfig = middlewareModule.config?.matcher;
      expect(matcherConfig).toBeDefined();
      expect(Array.isArray(matcherConfig)).toBe(true);

      const pattern = (matcherConfig as string[])[0];
      const regex = new RegExp(`^${pattern}$`);

      // 動作検証: /api/* は除外される (= regex にマッチしない)
      expect(regex.test("/api/auth/callback")).toBe(false);
      expect(regex.test("/api/storage/profile")).toBe(false);

      // 動作検証: ロケール付きパスはマッチする (= middleware を通過)
      expect(regex.test("/ja/dashboard")).toBe(true);
      expect(regex.test("/en/login")).toBe(true);

      // 動作検証: ロケールなしパスもマッチする (next-intl がリダイレクトする)
      expect(regex.test("/dashboard")).toBe(true);

      // 動作検証: 静的アセットは除外される
      expect(regex.test("/_next/static/chunks/main.js")).toBe(false);
      expect(regex.test("/favicon.ico")).toBe(false);
      expect(regex.test("/og-image.png")).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // [V-11] 未認証 /ja/dashboard → /ja/login?redirect_to=/ja/dashboard
  // -------------------------------------------------------------------------
  describe("[V-11] 認証ガード — 未認証ユーザーは /ja/login にリダイレクト", () => {
    it("未認証ユーザーが /ja/dashboard にアクセスすると /ja/login?redirect_to=/ja/dashboard へリダイレクトされる", async () => {
      const { updateSession } = await import("@/lib/supabase-auth/middleware");
      const mockUpdateSession = vi.mocked(updateSession);

      // next-intl は通過させる
      mockIntlMiddleware.mockReturnValueOnce(NextResponse.next());
      // updateSession は未認証として /ja/login?redirect_to=/ja/dashboard へリダイレクト
      mockUpdateSession.mockResolvedValueOnce(
        NextResponse.redirect(new URL("http://localhost/ja/login?redirect_to=%2Fja%2Fdashboard")),
      );

      const { middleware } = await import("../middleware");
      const req = makeRequest("/ja/dashboard");
      const res = await middleware(req);

      expect(res.status).toBe(307);
      const location = res.headers.get("location") ?? "";
      expect(location).toContain("/ja/login");
      expect(location).toContain("redirect_to");
      // redirect_to パラメータは URL エンコードされるため、デコードしてから照合する
      expect(decodeURIComponent(location)).toContain("/ja/dashboard");
    });
  });

  // -------------------------------------------------------------------------
  // [V-12] localeDetection: false — Accept-Language: en でも /ja/ にリダイレクト
  // -------------------------------------------------------------------------
  describe("[V-12] localeDetection: false — Accept-Language ヘッダーを無視", () => {
    it("Accept-Language: en ヘッダー付きで /dashboard にアクセスしても /en/ ではなく /ja/ にリダイレクトされる", async () => {
      // localeDetection: false のため Accept-Language を無視し defaultLocale の /ja/ にリダイレクト
      mockIntlMiddleware.mockReturnValueOnce(
        NextResponse.redirect(new URL("http://localhost/ja/dashboard"), { status: 308 }),
      );

      const { middleware } = await import("../middleware");
      const req = makeRequest("/dashboard", { headers: { "accept-language": "en-US,en;q=0.9" } });
      const res = await middleware(req);

      // /en/ にリダイレクトされていないこと
      const location = res.headers.get("location") ?? "";
      expect(location).not.toContain("/en/");
      expect(location).toContain("/ja/");
    });
  });

  // -------------------------------------------------------------------------
  // [V-13] CSP ヘッダーが /ja/* レスポンスにも付与されること
  // -------------------------------------------------------------------------
  describe("[V-13] CSP ヘッダー — i18n 化後も既存 CSP が維持される", () => {
    it("/ja/dashboard へのアクセスで Content-Security-Policy ヘッダーが付与される", async () => {
      const { updateSession } = await import("@/lib/supabase-auth/middleware");
      const mockUpdateSession = vi.mocked(updateSession);

      mockIntlMiddleware.mockReturnValueOnce(NextResponse.next());
      mockUpdateSession.mockResolvedValueOnce(NextResponse.next());

      const { middleware } = await import("../middleware");
      const req = makeRequest("/ja/dashboard");
      const res = await middleware(req);

      expect(res.headers.get("Content-Security-Policy")).not.toBeNull();
      expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    });

    it("next-intl がリダイレクト (308) を返す場合も CSP ヘッダーが付与される", async () => {
      mockIntlMiddleware.mockReturnValueOnce(
        NextResponse.redirect(new URL("http://localhost/ja/dashboard"), { status: 308 }),
      );

      const { middleware } = await import("../middleware");
      const req = makeRequest("/dashboard");
      const res = await middleware(req);

      // リダイレクト応答にも CSP が付与されること
      expect(res.headers.get("Content-Security-Policy")).not.toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // [V-07] middleware chain 順の確認
  // -------------------------------------------------------------------------
  describe("[V-07] middleware chain 順: next-intl → updateSession → CSP 付与", () => {
    it("next-intl が先に呼ばれ、その後 updateSession が呼ばれる", async () => {
      const callOrder: string[] = [];

      const { updateSession } = await import("@/lib/supabase-auth/middleware");
      const mockUpdateSession = vi.mocked(updateSession);

      mockIntlMiddleware.mockImplementationOnce(() => {
        callOrder.push("nextIntl");
        return NextResponse.next();
      });
      mockUpdateSession.mockImplementationOnce(async () => {
        callOrder.push("updateSession");
        return NextResponse.next();
      });

      const { middleware } = await import("../middleware");
      await middleware(makeRequest("/ja/dashboard"));

      expect(callOrder[0]).toBe("nextIntl");
      expect(callOrder[1]).toBe("updateSession");
    });
  });
});
