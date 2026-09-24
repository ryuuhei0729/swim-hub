/**
 * updateSession: 未認証時のログインリダイレクトに redirect_to が付くことの回帰テスト
 *
 * 背景:
 *   middleware には認証ガードが 2 系統ある。
 *     (a) protectedRoutes に載っているパス → redirect_to 付きでログインへ
 *     (b) それ以外の非 public パス → default-deny フォールバックでログインへ (redirect_to 無し)
 *   認証自体はどちらでも守られるため、(a) への登録漏れは**静かに**起きる。
 *   漏れたルートはログイン後に元 URL へ戻れず dashboard 送りになる。
 *   チーム詳細や大会記録の URL はメンバー間で共有されるため実害が大きい。
 *
 * 検証方針:
 *   実物の updateSession を未認証ユーザーで呼び、Location を読む。
 *   protectedRoutes から該当ルートを外すと [V-02] が赤になる。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
  })),
}));

const ORIGINAL_ENV = { ...process.env };

// jsdom は独自実装の Headers を global に置くが、NextRequest が生成する headers は
// undici 由来。両者は別クラスなので instanceof が成立せず、updateSession 内の
// NextResponse.next({ request }) が "request.headers must be an instance of Headers"
// で throw する。Next 実装が参照する global を NextRequest 側の実体に合わせる。
const JSDOM_HEADERS = globalThis.Headers;
const UNDICI_HEADERS = new NextRequest("http://localhost/", { headers: new JSDOM_HEADERS() })
  .headers.constructor as typeof Headers;

beforeEach(() => {
  globalThis.Headers = UNDICI_HEADERS;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key-for-test";
});

afterEach(() => {
  globalThis.Headers = JSDOM_HEADERS;
  process.env = { ...ORIGINAL_ENV };
});

/** NextRequest は headers が Headers インスタンスであることを要求する */
function makeRequest(path: string): NextRequest {
  return new NextRequest(`http://localhost${path}`, { method: "GET", headers: new Headers() });
}

/** 未認証で path にアクセスしたときの Location を返す */
async function locationFor(path: string): Promise<URL> {
  const { updateSession } = await import("@/lib/supabase-auth/middleware");
  const res = await updateSession(makeRequest(path));
  const location = res.headers.get("location");
  if (!location) throw new Error(`no redirect for ${path} (status ${res.status})`);
  return new URL(location, "http://localhost");
}

/**
 * ログイン後に元 URL へ戻す必要があるルート。
 * 共有され得る URL (チーム詳細・大会記録・エントリー) を必ず含めること。
 */
const ROUTES_NEEDING_RETURN = [
  "/ja/dashboard",
  "/ja/practice",
  "/ja/competition",
  "/ja/mypage",
  "/ja/settings",
  "/ja/goals",
  "/ja/bulk-besttime",
  "/ja/teams",
  "/ja/teams/team-abc",
  "/ja/teams/team-abc/competitions/comp-1/entries",
  "/ja/teams/team-abc/competitions/comp-1/records",
  "/ja/teams-admin",
  "/ja/teams-admin/team-abc",
  "/ja/teams-admin/team-abc/practices/p-1/logs",
];

describe("updateSession: 未認証リダイレクトの redirect_to", () => {
  it("[V-01-control] 未認証アクセスはログインへ送られる", async () => {
    for (const path of ROUTES_NEEDING_RETURN) {
      const url = await locationFor(path);
      expect(url.pathname, path).toBe("/ja/login");
    }
  });

  it("[V-02] ログイン後に戻れるよう redirect_to に元 URL が入る", async () => {
    for (const path of ROUTES_NEEDING_RETURN) {
      const url = await locationFor(path);
      expect(url.searchParams.get("redirect_to"), path).toBe(path);
    }
  });

  it("[V-03] locale は元 URL のものが保たれる (ja に固定されない)", async () => {
    const url = await locationFor("/en/teams/team-abc");
    expect(url.pathname).toBe("/en/login");
    expect(url.searchParams.get("redirect_to")).toBe("/en/teams/team-abc");
  });

  it("[V-04-control] 公開ページは未認証でもリダイレクトされない", async () => {
    const { updateSession } = await import("@/lib/supabase-auth/middleware");
    for (const path of ["/ja/time-level", "/ja/terms", "/ja/pricing"]) {
      const res = await updateSession(makeRequest(path));
      expect(res.headers.get("location"), path).toBeNull();
    }
  });
});
