/**
 * handleAuthCallback (src/web/handleAuthCallback.ts) の単体テスト。
 *
 * Sprint Contract: token_hash+type (verifyOtp, メール確認/パスワードリセット) と
 * code (exchangeCodeForSession, OAuth PKCE) の両フローを1つの Route Handler
 * ロジックに統合する。PM承認の設計判断:
 *   4. getDefaultRedirectForOtpType は省略可能。省略時は全 OTP タイプで
 *      defaultRedirectPath を使う。
 *   5. exchangeCodeForSession 成功後の session 存在チェックを token_hash経路・
 *      code経路の両方で統一して行う (元々 swim-hub の route.ts のみが行っていた
 *      安全な挙動を共有パッケージのデフォルト挙動にする。scanner/timer の
 *      既存 route.ts には code 経路のこのチェックが無かった)。
 *
 * トートロジー回避: route.ts のロジックを再実装せず、
 * createCallbackSupabaseClient (同パッケージ内の協働モジュール) だけを
 * vi.mock で差し替え、verifyOtp / exchangeCodeForSession の呼び出し有無・引数・
 * レスポンスの Location ヘッダー・Set-Cookie ヘッダーを観測する。
 * validateRedirectPath / applyCookies は実物を使う (それぞれ専用のテストファイルで
 * 別途厳密に検証済みであり、ここでは実際の配線 = 統合が正しいことを検証する)。
 *
 * 参照パターン: swim-hub/apps/web/__tests__/app/auth-callback-route.test.ts
 * (`new NextRequest(url)` 直接生成 + `vi.mock` パターン) を config ベースの API
 * に合わせて踏襲。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({ getAll: () => [] }),
}));

const verifyOtp = vi.fn();
const exchangeCodeForSession = vi.fn();
const createCallbackSupabaseClientMock = vi.fn();

vi.mock("../../src/web/createCallbackSupabaseClient", () => ({
  createCallbackSupabaseClient: (...args: unknown[]) => createCallbackSupabaseClientMock(...args),
}));

import { handleAuthCallback } from "../../src/web/handleAuthCallback";

const ORIGIN = "http://localhost:3000";
const LOGIN_PATH = "/login";
const DEFAULT_REDIRECT_PATH = "/dashboard";

function makeRequest(url: string): NextRequest {
  return new NextRequest(url);
}

function location(res: Response): string {
  return res.headers.get("location") ?? "";
}

function baseConfig(request: NextRequest, overrides: Record<string, unknown> = {}) {
  return {
    request,
    defaultRedirectPath: DEFAULT_REDIRECT_PATH,
    loginPath: LOGIN_PATH,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  createCallbackSupabaseClientMock.mockReturnValue({
    supabase: { auth: { verifyOtp, exchangeCodeForSession } },
    cookiesToSet: [],
  });
});

describe("handleAuthCallback — token_hash フロー (verifyOtp) 正常系 (V-63)", () => {
  it("[V-63] 正当な type + getDefaultRedirectForOtpType 省略時、verifyOtp のみが呼ばれ defaultRedirectPath へ遷移する", async () => {
    verifyOtp.mockResolvedValue({ data: { session: { access_token: "t" } }, error: null });
    const request = makeRequest(`${ORIGIN}/api/auth/callback?token_hash=abc123&type=signup`);

    const res = await handleAuthCallback(baseConfig(request));

    expect(verifyOtp).toHaveBeenCalledWith({ type: "signup", token_hash: "abc123" });
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(location(res)).toBe(`${ORIGIN}${DEFAULT_REDIRECT_PATH}`);
  });

  it.each(["signup", "recovery", "email_change", "email", "magiclink"] as const)(
    "[V-78] getDefaultRedirectForOtpType 省略時、type=%s でも defaultRedirectPath へ統一される",
    async (type) => {
      verifyOtp.mockResolvedValue({ data: { session: { access_token: "t" } }, error: null });
      const request = makeRequest(`${ORIGIN}/api/auth/callback?token_hash=abc123&type=${type}`);

      const res = await handleAuthCallback(baseConfig(request));

      expect(location(res)).toBe(`${ORIGIN}${DEFAULT_REDIRECT_PATH}`);
    },
  );
});

describe("handleAuthCallback — getDefaultRedirectForOtpType を渡した場合 (V-79)", () => {
  it("[V-79] type ごとに異なる遷移先を返すコールバックが尊重される", async () => {
    verifyOtp.mockResolvedValue({ data: { session: { access_token: "t" } }, error: null });
    const getDefaultRedirectForOtpType = vi.fn((type: string) =>
      type === "recovery" ? "/update-password" : "/onboarding",
    );
    const request = makeRequest(`${ORIGIN}/api/auth/callback?token_hash=abc123&type=recovery`);

    const res = await handleAuthCallback(baseConfig(request, { getDefaultRedirectForOtpType }));

    expect(getDefaultRedirectForOtpType).toHaveBeenCalledWith("recovery");
    expect(location(res)).toBe(`${ORIGIN}/update-password`);
  });
});

describe("handleAuthCallback — type 不正・欠落 (V-64, V-65, V-66)", () => {
  it("[V-64] type がホワイトリスト外 (invite 等) の場合 invalid_request へ、verifyOtp は呼ばれない", async () => {
    const request = makeRequest(`${ORIGIN}/api/auth/callback?token_hash=abc123&type=invite`);
    const res = await handleAuthCallback(baseConfig(request));

    expect(verifyOtp).not.toHaveBeenCalled();
    expect(location(res)).toBe(`${ORIGIN}${LOGIN_PATH}?error=invalid_request`);
  });

  it("[V-65] type パラメータが無い場合も invalid_request へ", async () => {
    const request = makeRequest(`${ORIGIN}/api/auth/callback?token_hash=abc123`);
    const res = await handleAuthCallback(baseConfig(request));

    expect(verifyOtp).not.toHaveBeenCalled();
    expect(location(res)).toBe(`${ORIGIN}${LOGIN_PATH}?error=invalid_request`);
  });

  it("[V-66] type が空文字の場合も invalid_request へ", async () => {
    const request = makeRequest(`${ORIGIN}/api/auth/callback?token_hash=abc123&type=`);
    const res = await handleAuthCallback(baseConfig(request));

    expect(verifyOtp).not.toHaveBeenCalled();
    expect(location(res)).toBe(`${ORIGIN}${LOGIN_PATH}?error=invalid_request`);
  });
});

describe("handleAuthCallback — code フロー正常系・missing_code (V-67, V-68)", () => {
  it("[V-67] token_hash も code も無い場合 missing_code へ (verifyOtp・exchangeCodeForSession とも呼ばれない)", async () => {
    const request = makeRequest(`${ORIGIN}/api/auth/callback`);
    const res = await handleAuthCallback(baseConfig(request));

    expect(verifyOtp).not.toHaveBeenCalled();
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(location(res)).toBe(`${ORIGIN}${LOGIN_PATH}?error=missing_code`);
  });

  it("[V-68] token_hash が空文字の場合は falsy として code 分岐にフォールバックする", async () => {
    exchangeCodeForSession.mockResolvedValue({
      data: { session: { access_token: "t" } },
      error: null,
    });
    const request = makeRequest(`${ORIGIN}/api/auth/callback?token_hash=&code=pkce-code`);

    const res = await handleAuthCallback(baseConfig(request));

    expect(verifyOtp).not.toHaveBeenCalled();
    expect(exchangeCodeForSession).toHaveBeenCalledWith("pkce-code");
    expect(location(res)).toBe(`${ORIGIN}${DEFAULT_REDIRECT_PATH}`);
  });

  it("回帰: token_hash が無く code のみの場合は exchangeCodeForSession が呼ばれ defaultRedirectPath へ遷移する", async () => {
    exchangeCodeForSession.mockResolvedValue({
      data: { session: { access_token: "t" } },
      error: null,
    });
    const request = makeRequest(`${ORIGIN}/api/auth/callback?code=pkce-code`);

    const res = await handleAuthCallback(baseConfig(request));

    expect(exchangeCodeForSession).toHaveBeenCalledWith("pkce-code");
    expect(location(res)).toBe(`${ORIGIN}${DEFAULT_REDIRECT_PATH}`);
  });
});

describe("handleAuthCallback — createCallbackSupabaseClient が null (config_error) (V-69, V-70)", () => {
  it("[V-69] token_hash 経路で null が返る場合 config_error へ", async () => {
    createCallbackSupabaseClientMock.mockReturnValue(null);
    const request = makeRequest(`${ORIGIN}/api/auth/callback?token_hash=abc123&type=signup`);

    const res = await handleAuthCallback(baseConfig(request));

    expect(location(res)).toBe(`${ORIGIN}${LOGIN_PATH}?error=config_error`);
  });

  it("[V-70] code 経路で null が返る場合 config_error へ", async () => {
    createCallbackSupabaseClientMock.mockReturnValue(null);
    const request = makeRequest(`${ORIGIN}/api/auth/callback?code=pkce-code`);

    const res = await handleAuthCallback(baseConfig(request));

    expect(location(res)).toBe(`${ORIGIN}${LOGIN_PATH}?error=config_error`);
  });
});

describe("handleAuthCallback — verifyOtp のエラー (V-71, V-72)", () => {
  it("[V-71] error.code がある場合はそのコードをそのまま error クエリに反映する (例: otp_expired)", async () => {
    verifyOtp.mockResolvedValue({
      data: { session: null },
      error: { code: "otp_expired", message: "Token has expired or is invalid" },
    });
    const request = makeRequest(`${ORIGIN}/api/auth/callback?token_hash=expired&type=signup`);

    const res = await handleAuthCallback(baseConfig(request));

    expect(location(res)).toBe(`${ORIGIN}${LOGIN_PATH}?error=otp_expired`);
  });

  it("[V-72] error.code が無い場合は auth_failed へ", async () => {
    verifyOtp.mockResolvedValue({
      data: { session: null },
      error: { message: "invalid token" },
    });
    const request = makeRequest(`${ORIGIN}/api/auth/callback?token_hash=tampered&type=signup`);

    const res = await handleAuthCallback(baseConfig(request));

    expect(location(res)).toBe(`${ORIGIN}${LOGIN_PATH}?error=auth_failed`);
  });
});

describe("handleAuthCallback — exchangeCodeForSession のエラー (V-73)", () => {
  it("[V-73] exchangeCodeForSession がエラーを返すと auth_failed へ", async () => {
    exchangeCodeForSession.mockResolvedValue({ data: { session: null }, error: { message: "boom" } });
    const request = makeRequest(`${ORIGIN}/api/auth/callback?code=bad-code`);

    const res = await handleAuthCallback(baseConfig(request));

    expect(location(res)).toBe(`${ORIGIN}${LOGIN_PATH}?error=auth_failed`);
  });
});

describe("handleAuthCallback — session 未生成 (session_creation_failed) 両経路統一 (V-74, V-75)", () => {
  it("[V-74] token_hash 経路: verifyOtp が成功扱い (error:null) でも session が無い場合 session_creation_failed へ", async () => {
    verifyOtp.mockResolvedValue({ data: { session: null }, error: null });
    const request = makeRequest(`${ORIGIN}/api/auth/callback?token_hash=abc123&type=signup`);

    const res = await handleAuthCallback(baseConfig(request));

    expect(location(res)).toBe(`${ORIGIN}${LOGIN_PATH}?error=session_creation_failed`);
  });

  it("[V-75] PM決定5: code 経路でも exchangeCodeForSession が成功扱い (error:null) だが session が無い場合 session_creation_failed へ (scanner/timer の既存実装にはこのチェックが無かった箇所)", async () => {
    exchangeCodeForSession.mockResolvedValue({ data: { session: null, user: null }, error: null });
    const request = makeRequest(`${ORIGIN}/api/auth/callback?code=pkce-code`);

    const res = await handleAuthCallback(baseConfig(request));

    expect(location(res)).toBe(`${ORIGIN}${LOGIN_PATH}?error=session_creation_failed`);
  });
});

describe("handleAuthCallback — 例外の catch 丸め (V-76, V-77)", () => {
  it("[V-76] verifyOtp が例外を throw した場合 auth_failed へ", async () => {
    verifyOtp.mockRejectedValue(new Error("network error"));
    const request = makeRequest(`${ORIGIN}/api/auth/callback?token_hash=abc123&type=signup`);

    const res = await handleAuthCallback(baseConfig(request));

    expect(location(res)).toBe(`${ORIGIN}${LOGIN_PATH}?error=auth_failed`);
  });

  it("[V-77] exchangeCodeForSession が例外を throw した場合 auth_failed へ", async () => {
    exchangeCodeForSession.mockRejectedValue(new Error("network error"));
    const request = makeRequest(`${ORIGIN}/api/auth/callback?code=pkce-code`);

    const res = await handleAuthCallback(baseConfig(request));

    expect(location(res)).toBe(`${ORIGIN}${LOGIN_PATH}?error=auth_failed`);
  });
});

describe("handleAuthCallback — redirect_to の検証 (V-80, V-81)", () => {
  it("[V-80] 正当な redirect_to はデフォルト遷移先 (type別含む) より優先される", async () => {
    verifyOtp.mockResolvedValue({ data: { session: { access_token: "t" } }, error: null });
    const request = makeRequest(
      `${ORIGIN}/api/auth/callback?token_hash=abc123&type=signup&redirect_to=%2Fteam%2Fjoin`,
    );

    const res = await handleAuthCallback(baseConfig(request));

    expect(location(res)).toBe(`${ORIGIN}/team/join`);
  });

  it("[V-81] redirect_to が不正 (外部オリジン) な場合は defaultRedirectPath にフォールバックする (type別デフォルトには戻らない)", async () => {
    verifyOtp.mockResolvedValue({ data: { session: { access_token: "t" } }, error: null });
    const getDefaultRedirectForOtpType = vi.fn(() => "/onboarding");
    const request = makeRequest(
      `${ORIGIN}/api/auth/callback?token_hash=abc123&type=signup&redirect_to=${encodeURIComponent(
        "https://evil.com/phish",
      )}`,
    );

    const res = await handleAuthCallback(baseConfig(request, { getDefaultRedirectForOtpType }));

    expect(location(res)).toBe(`${ORIGIN}${DEFAULT_REDIRECT_PATH}`);
  });
});

describe("handleAuthCallback — onSessionEstablished (V-82, V-83, V-84, V-87)", () => {
  it("[V-82] token_hash 経路の成功時、onSessionEstablished に session と {flow:'otp'} が渡る", async () => {
    const session = { access_token: "t", user: { id: "u1" } };
    verifyOtp.mockResolvedValue({ data: { session }, error: null });
    const onSessionEstablished = vi.fn();
    const request = makeRequest(`${ORIGIN}/api/auth/callback?token_hash=abc123&type=signup`);

    await handleAuthCallback(baseConfig(request, { onSessionEstablished }));

    expect(onSessionEstablished).toHaveBeenCalledWith(
      session,
      expect.objectContaining({ flow: "otp", request }),
    );
  });

  it("[V-83] code 経路の成功時、onSessionEstablished に session と {flow:'code'} が渡る", async () => {
    const session = { access_token: "t", user: { id: "u1" } };
    exchangeCodeForSession.mockResolvedValue({ data: { session }, error: null });
    const onSessionEstablished = vi.fn();
    const request = makeRequest(`${ORIGIN}/api/auth/callback?code=pkce-code`);

    await handleAuthCallback(baseConfig(request, { onSessionEstablished }));

    expect(onSessionEstablished).toHaveBeenCalledWith(
      session,
      expect.objectContaining({ flow: "code", request }),
    );
  });

  it("[V-84] onSessionEstablished が例外を throw した場合も auth_failed に丸められる", async () => {
    verifyOtp.mockResolvedValue({ data: { session: { access_token: "t" } }, error: null });
    const onSessionEstablished = vi.fn().mockRejectedValue(new Error("hook failed"));
    const request = makeRequest(`${ORIGIN}/api/auth/callback?token_hash=abc123&type=signup`);

    const res = await handleAuthCallback(baseConfig(request, { onSessionEstablished }));

    expect(location(res)).toBe(`${ORIGIN}${LOGIN_PATH}?error=auth_failed`);
  });

  it("[V-87] onSessionEstablished はエラーパス (session_creation_failed) では呼ばれない", async () => {
    verifyOtp.mockResolvedValue({ data: { session: null }, error: null });
    const onSessionEstablished = vi.fn();
    const request = makeRequest(`${ORIGIN}/api/auth/callback?token_hash=abc123&type=signup`);

    await handleAuthCallback(baseConfig(request, { onSessionEstablished }));

    expect(onSessionEstablished).not.toHaveBeenCalled();
  });

  it("[V-87] onSessionEstablished はエラーパス (auth_failed) では呼ばれない", async () => {
    verifyOtp.mockResolvedValue({ data: { session: null }, error: { message: "bad" } });
    const onSessionEstablished = vi.fn();
    const request = makeRequest(`${ORIGIN}/api/auth/callback?token_hash=abc123&type=signup`);

    await handleAuthCallback(baseConfig(request, { onSessionEstablished }));

    expect(onSessionEstablished).not.toHaveBeenCalled();
  });
});

describe("handleAuthCallback — token_hash と code の併存 (V-85)", () => {
  it("[V-85] token_hash が優先され、verifyOtp のみが呼ばれ exchangeCodeForSession は呼ばれない", async () => {
    verifyOtp.mockResolvedValue({ data: { session: { access_token: "t" } }, error: null });
    const request = makeRequest(
      `${ORIGIN}/api/auth/callback?token_hash=abc123&type=signup&code=some-pkce-code`,
    );

    const res = await handleAuthCallback(baseConfig(request));

    expect(verifyOtp).toHaveBeenCalledWith({ type: "signup", token_hash: "abc123" });
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(location(res)).toBe(`${ORIGIN}${DEFAULT_REDIRECT_PATH}`);
  });
});

describe("handleAuthCallback — Cookie 反映 (V-86)", () => {
  it("[V-86a] token_hash 経路のエラー時も cookiesToSet があれば Set-Cookie に反映される", async () => {
    createCallbackSupabaseClientMock.mockReturnValue({
      supabase: { auth: { verifyOtp, exchangeCodeForSession } },
      cookiesToSet: [{ name: "sb-pkce-verifier", value: "abc" }],
    });
    verifyOtp.mockResolvedValue({ data: { session: null }, error: { message: "bad" } });
    const request = makeRequest(`${ORIGIN}/api/auth/callback?token_hash=abc123&type=signup`);

    const res = await handleAuthCallback(baseConfig(request));

    expect(location(res)).toBe(`${ORIGIN}${LOGIN_PATH}?error=auth_failed`);
    expect(res.cookies.get("sb-pkce-verifier")?.value).toBe("abc");
  });

  it("[V-86b] code 経路の成功時に cookiesToSet があれば Set-Cookie に反映される", async () => {
    createCallbackSupabaseClientMock.mockReturnValue({
      supabase: { auth: { verifyOtp, exchangeCodeForSession } },
      cookiesToSet: [{ name: "sb-access-token", value: "xyz" }],
    });
    exchangeCodeForSession.mockResolvedValue({
      data: { session: { access_token: "t" } },
      error: null,
    });
    const request = makeRequest(`${ORIGIN}/api/auth/callback?code=pkce-code`);

    const res = await handleAuthCallback(baseConfig(request));

    expect(location(res)).toBe(`${ORIGIN}${DEFAULT_REDIRECT_PATH}`);
    expect(res.cookies.get("sb-access-token")?.value).toBe("xyz");
  });
});
