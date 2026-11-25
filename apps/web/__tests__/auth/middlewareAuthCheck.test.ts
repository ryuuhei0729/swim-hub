/**
 * updateSession: ログイン判定に getClaims() を使うことの回帰テスト
 *
 * 背景:
 *   以前は middleware が全リクエストで supabase.auth.getUser() を呼び、Auth サーバーへの
 *   往復が全ページの表示に乗っていた。getClaims() はトークンを手元で検証する。
 *   判定の結果 (ログインへ送るかどうか) は従来と同じであることを確かめる。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const auth = vi.hoisted(() => ({
  getClaims: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({ auth })),
}));

const ORIGINAL_ENV = { ...process.env };

// protectedRouteRedirectTo.test.ts と同じ理由で、Headers を NextRequest 側の実体に合わせる
const JSDOM_HEADERS = globalThis.Headers;
const UNDICI_HEADERS = new NextRequest("http://localhost/", { headers: new JSDOM_HEADERS() })
  .headers.constructor as typeof Headers;

beforeEach(() => {
  globalThis.Headers = UNDICI_HEADERS;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key-for-test";
  auth.getClaims.mockReset();
  auth.getUser.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  globalThis.Headers = JSDOM_HEADERS;
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

async function run(path: string) {
  const { updateSession } = await import("@/lib/supabase-auth/middleware");
  const res = await updateSession(
    new NextRequest(`http://localhost${path}`, { method: "GET", headers: new Headers() }),
  );
  const location = res.headers.get("location");
  return location ? new URL(location, "http://localhost").pathname : null;
}

const LOGGED_IN = { data: { claims: { sub: "user-1" }, header: {}, signature: new Uint8Array() }, error: null };

describe("updateSession: getClaims() によるログイン判定", () => {
  it("トークンが有効なら保護されたページをそのまま表示し、Auth サーバーへ getUser() で問い合わせない", async () => {
    auth.getClaims.mockResolvedValue(LOGGED_IN);

    expect(await run("/ja/dashboard")).toBeNull();
    expect(auth.getClaims).toHaveBeenCalledTimes(1);
    expect(auth.getUser).not.toHaveBeenCalled();
  });

  it("ログイン済みでログイン画面を開くと、Auth サーバーで確かめたうえでダッシュボードへ送る (従来どおり)", async () => {
    auth.getClaims.mockResolvedValue(LOGGED_IN);
    auth.getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });

    expect(await run("/ja/login")).toBe("/ja/dashboard");
    expect(await run("/ja")).toBe("/ja/dashboard");
  });

  it("トークンの署名は正しいがセッションが無効 (別端末でログアウト等) なら、ログイン画面を表示する (無限リダイレクトにしない)", async () => {
    auth.getClaims.mockResolvedValue(LOGGED_IN);
    auth.getUser.mockResolvedValue({ data: { user: null }, error: new Error("session_not_found") });

    expect(await run("/ja/login")).toBeNull();
    expect(await run("/ja")).toBeNull();
  });

  it("ログイン画面でのセッション確認が通信エラーで失敗したら、ログイン画面を表示する", async () => {
    auth.getClaims.mockResolvedValue(LOGGED_IN);
    auth.getUser.mockRejectedValue(new TypeError("fetch failed"));

    expect(await run("/ja/login")).toBeNull();
  });

  it("セッションが無ければログインへ送る", async () => {
    auth.getClaims.mockResolvedValue({ data: null, error: null });

    expect(await run("/ja/dashboard")).toBe("/ja/login");
  });

  it("トークンの検証に失敗したらログインへ送る", async () => {
    auth.getClaims.mockResolvedValue({ data: null, error: new Error("Invalid JWT signature") });

    expect(await run("/ja/dashboard")).toBe("/ja/login");
  });

  it("通信エラーなどで例外が投げられても落ちずに、未ログインとして扱う (従来の getUser() と同じ)", async () => {
    auth.getClaims.mockRejectedValue(new TypeError("fetch failed"));

    expect(await run("/ja/dashboard")).toBe("/ja/login");
  });

  it("sub の無い claims はログインとみなさない", async () => {
    auth.getClaims.mockResolvedValue({ data: { claims: {}, header: {}, signature: new Uint8Array() }, error: null });

    expect(await run("/ja/dashboard")).toBe("/ja/login");
  });
});
