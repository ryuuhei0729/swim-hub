/**
 * createCallbackSupabaseClient (src/web/createCallbackSupabaseClient.ts) の
 * 単体テスト。
 *
 * Sprint Contract: OAuth/メール確認コールバックの Route Handler で使う Supabase
 * サーバークライアントを構築する。cookies.getAll() は cookieStore (next/headers の
 * cookies()) を優先し、request.cookies.getAll() は同名キーが無い場合のみ穴埋め
 * する。setAll() は cookiesToSet 配列に蓄積するだけで、実際の Set-Cookie ヘッダー
 * 反映は呼び出し側 (applyCookies) の責務。
 *
 * @supabase/ssr の createServerClient は vi.mock で差し替え、渡された
 * { cookies: { getAll, setAll } } 設定をこのテストから直接呼び出して観測する
 * (createServerClient 自体の実装は @supabase/ssr 側の責務であり、ここでは
 * 「どう呼び出しているか」だけを検証する)。
 *
 * 移植元: swimhub-scanner/apps/web/src/app/api/auth/callback/route.ts と
 * swimhub-timer の同等ファイルの createCallbackSupabaseClient 部分
 * (byte-identical)。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import type { cookies as cookiesFn } from "next/headers";

const createServerClientMock = vi.fn();
vi.mock("@supabase/ssr", () => ({
  createServerClient: (...args: unknown[]) => createServerClientMock(...args),
}));

import { createCallbackSupabaseClient } from "../../src/web/createCallbackSupabaseClient";

type CookieStore = Awaited<ReturnType<typeof cookiesFn>>;
type CookieListItem = { name: string; value: string };
type CookiesConfig = {
  cookies: {
    getAll: () => CookieListItem[];
    setAll: (list: { name: string; value: string; options?: Record<string, unknown> }[]) => void;
  };
};

function makeCookieStore(list: CookieListItem[]): CookieStore {
  return { getAll: () => list } as unknown as CookieStore;
}

function makeRequestWithCookies(cookieHeader: string): NextRequest {
  return new NextRequest("http://localhost:3000/api/auth/callback", {
    headers: cookieHeader ? { cookie: cookieHeader } : {},
  });
}

function lastConfig(): CookiesConfig {
  const calls = createServerClientMock.mock.calls;
  return calls[calls.length - 1][2] as CookiesConfig;
}

const ORIGINAL_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
};

function restoreEnvVar(key: "NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_ANON_KEY") {
  const original = ORIGINAL_ENV[key];
  if (original === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = original;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  createServerClientMock.mockImplementation((_url: string, _key: string, config: unknown) => ({
    __config: config,
    auth: {},
  }));
});

afterEach(() => {
  restoreEnvVar("NEXT_PUBLIC_SUPABASE_URL");
  restoreEnvVar("NEXT_PUBLIC_SUPABASE_ANON_KEY");
});

describe("createCallbackSupabaseClient — 環境変数未設定時は null (V-40, V-41)", () => {
  it("[V-40] NEXT_PUBLIC_SUPABASE_URL が未設定なら null を返す", () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";

    const result = createCallbackSupabaseClient(makeRequestWithCookies(""), makeCookieStore([]));

    expect(result).toBeNull();
    expect(createServerClientMock).not.toHaveBeenCalled();
  });

  it("[V-41] NEXT_PUBLIC_SUPABASE_ANON_KEY が未設定なら null を返す", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const result = createCallbackSupabaseClient(makeRequestWithCookies(""), makeCookieStore([]));

    expect(result).toBeNull();
    expect(createServerClientMock).not.toHaveBeenCalled();
  });
});

describe("createCallbackSupabaseClient — 正常系 (V-42)", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  });

  it("[V-42] 環境変数が両方揃っていれば { supabase, cookiesToSet: [] } を返し、createServerClient に URL/anonKey を渡す", () => {
    const result = createCallbackSupabaseClient(makeRequestWithCookies(""), makeCookieStore([]));

    expect(result).not.toBeNull();
    expect(result?.cookiesToSet).toEqual([]);
    expect(result?.supabase).toBeDefined();
    expect(createServerClientMock).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "anon-key",
      expect.objectContaining({
        cookies: expect.objectContaining({
          getAll: expect.any(Function),
          setAll: expect.any(Function),
        }),
      }),
    );
  });
});

describe("createCallbackSupabaseClient — getAll() の優先順位 (V-43)", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  });

  it("[V-43a] 同名キーは cookieStore.getAll() の値が優先され、request.cookies.getAll() の値は無視される", () => {
    const cookieStore = makeCookieStore([{ name: "sb-access-token", value: "from-store" }]);
    const request = makeRequestWithCookies("sb-access-token=from-request");

    createCallbackSupabaseClient(request, cookieStore);
    const merged = lastConfig().cookies.getAll();

    expect(merged).toEqual([{ name: "sb-access-token", value: "from-store" }]);
  });

  it("[V-43b] cookieStore.getAll() に無いキーのみ request.cookies.getAll() から穴埋めされる", () => {
    const cookieStore = makeCookieStore([{ name: "sb-access-token", value: "from-store" }]);
    const request = makeRequestWithCookies(
      "sb-access-token=from-request-ignored; sb-refresh-token=from-request-only",
    );

    createCallbackSupabaseClient(request, cookieStore);
    const merged = lastConfig().cookies.getAll();

    expect(merged).toHaveLength(2);
    expect(merged).toEqual(
      expect.arrayContaining([
        { name: "sb-access-token", value: "from-store" },
        { name: "sb-refresh-token", value: "from-request-only" },
      ]),
    );
  });

  it("[V-43c] cookieStore・request 双方が空の場合は空配列を返す", () => {
    createCallbackSupabaseClient(makeRequestWithCookies(""), makeCookieStore([]));

    expect(lastConfig().cookies.getAll()).toEqual([]);
  });

  it("[V-43d] cookieStore が空で request にのみ cookie がある場合は request 側がそのまま使われる", () => {
    const request = makeRequestWithCookies("sb-refresh-token=only-in-request");

    createCallbackSupabaseClient(request, makeCookieStore([]));

    expect(lastConfig().cookies.getAll()).toEqual([
      { name: "sb-refresh-token", value: "only-in-request" },
    ]);
  });
});

describe("createCallbackSupabaseClient — setAll() は蓄積のみ行う (V-44)", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  });

  it("[V-44a] setAll() で渡した cookie がそのまま返り値の cookiesToSet 配列に蓄積される", () => {
    const result = createCallbackSupabaseClient(makeRequestWithCookies(""), makeCookieStore([]));

    lastConfig().cookies.setAll([{ name: "sb-access-token", value: "new-value", options: { maxAge: 3600 } }]);

    expect(result?.cookiesToSet).toEqual([
      { name: "sb-access-token", value: "new-value", options: { maxAge: 3600 } },
    ]);
  });

  it("[V-44b] 複数回 setAll() が呼ばれた場合は上書きではなく累積される", () => {
    const result = createCallbackSupabaseClient(makeRequestWithCookies(""), makeCookieStore([]));

    lastConfig().cookies.setAll([{ name: "a", value: "1" }]);
    lastConfig().cookies.setAll([{ name: "b", value: "2" }]);

    expect(result?.cookiesToSet).toEqual([
      { name: "a", value: "1" },
      { name: "b", value: "2" },
    ]);
  });

  it("[V-44c] setAll() が一度も呼ばれなければ cookiesToSet は空配列のまま", () => {
    const result = createCallbackSupabaseClient(makeRequestWithCookies(""), makeCookieStore([]));
    expect(result?.cookiesToSet).toEqual([]);
  });
});
