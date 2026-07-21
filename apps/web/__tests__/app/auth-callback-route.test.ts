// QA Phase B: /api/auth/callback の token_hash + type 分岐 (verifyOtp フロー) 追加に伴う検証。
// Sprint Contract 対応: V-04 (code 分岐の非破壊回帰), V-07 (token_hash + code 併存時は token_hash 優先),
// 境界値 (空文字 token_hash / 未知 type / type なし) を含む。
//
// トートロジー回避: route.ts のロジックを再実装せず、実ハンドラ (GET) をそのまま import し、
// 依存 (next/headers の cookies / @/lib/supabase-server の createRouteHandlerClient) のみ
// vi.mock で差し替える。verifyOtp / exchangeCodeForSession の呼び出し有無・引数・
// レスポンスの Location ヘッダーを観測する。
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({ getAll: () => [] }),
}));

const verifyOtp = vi.fn();
const exchangeCodeForSession = vi.fn();
const rpc = vi.fn();
const fromMock = vi.fn();
const setCookiesOnResponse = vi.fn();

vi.mock("@/lib/supabase-server", () => ({
  createRouteHandlerClient: vi.fn(() => ({
    client: {
      auth: { verifyOtp, exchangeCodeForSession },
      rpc,
      from: fromMock,
    },
    setCookiesOnResponse,
  })),
}));

import { GET } from "@/app/api/auth/callback/route";

function makeRequest(url: string): NextRequest {
  return new NextRequest(url);
}

function location(res: Response): string {
  return res.headers.get("location") ?? "";
}

const ORIGIN = "http://localhost:3000";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/auth/callback — token_hash フロー (verifyOtp)", () => {
  it("signup: 成功時に /onboarding へリダイレクトされる", async () => {
    verifyOtp.mockResolvedValue({ data: { session: { access_token: "t" } }, error: null });
    const res = await GET(
      makeRequest(`${ORIGIN}/api/auth/callback?token_hash=abc123&type=signup`),
    );
    expect(verifyOtp).toHaveBeenCalledWith({ type: "signup", token_hash: "abc123" });
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(location(res)).toBe(`${ORIGIN}/onboarding`);
  });

  it("recovery: 成功時に /update-password へリダイレクトされる", async () => {
    verifyOtp.mockResolvedValue({ data: { session: { access_token: "t" } }, error: null });
    const res = await GET(
      makeRequest(`${ORIGIN}/api/auth/callback?token_hash=abc123&type=recovery`),
    );
    expect(location(res)).toBe(`${ORIGIN}/update-password`);
  });

  it("email_change: 成功時に /settings へリダイレクトされる", async () => {
    verifyOtp.mockResolvedValue({ data: { session: { access_token: "t" } }, error: null });
    const res = await GET(
      makeRequest(`${ORIGIN}/api/auth/callback?token_hash=abc123&type=email_change`),
    );
    expect(location(res)).toBe(`${ORIGIN}/settings`);
  });

  it("email: 成功時に /settings へリダイレクトされる", async () => {
    verifyOtp.mockResolvedValue({ data: { session: { access_token: "t" } }, error: null });
    const res = await GET(makeRequest(`${ORIGIN}/api/auth/callback?token_hash=abc123&type=email`));
    expect(location(res)).toBe(`${ORIGIN}/settings`);
  });

  it("magiclink: 成功時に /dashboard へリダイレクトされる", async () => {
    verifyOtp.mockResolvedValue({ data: { session: { access_token: "t" } }, error: null });
    const res = await GET(
      makeRequest(`${ORIGIN}/api/auth/callback?token_hash=abc123&type=magiclink`),
    );
    expect(location(res)).toBe(`${ORIGIN}/dashboard`);
  });

  it("未知の type (invite) は verifyOtp を呼ばずに invalid_request へ", async () => {
    const res = await GET(
      makeRequest(`${ORIGIN}/api/auth/callback?token_hash=abc123&type=invite`),
    );
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(location(res)).toBe(`${ORIGIN}/login?error=invalid_request`);
  });

  it("境界値: type パラメータが無い場合も invalid_request へ", async () => {
    const res = await GET(makeRequest(`${ORIGIN}/api/auth/callback?token_hash=abc123`));
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(location(res)).toBe(`${ORIGIN}/login?error=invalid_request`);
  });

  it("境界値: type が空文字の場合も invalid_request へ", async () => {
    const res = await GET(makeRequest(`${ORIGIN}/api/auth/callback?token_hash=abc123&type=`));
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(location(res)).toBe(`${ORIGIN}/login?error=invalid_request`);
  });

  it("V-12: verifyOtp が otp_expired エラーを返すと /login?error=otp_expired へ (実エラーコードをそのまま反映)", async () => {
    verifyOtp.mockResolvedValue({
      data: { session: null },
      error: { code: "otp_expired", message: "Token has expired or is invalid" },
    });
    const res = await GET(
      makeRequest(`${ORIGIN}/api/auth/callback?token_hash=expired&type=signup`),
    );
    expect(location(res)).toBe(`${ORIGIN}/login?error=otp_expired`);
  });

  it("V-14: 改ざんされた token_hash で verifyOtp がエラーを返すと code なしで auth_failed へ", async () => {
    verifyOtp.mockResolvedValue({
      data: { session: null },
      error: { message: "invalid token" },
    });
    const res = await GET(
      makeRequest(`${ORIGIN}/api/auth/callback?token_hash=tampered&type=signup`),
    );
    expect(location(res)).toBe(`${ORIGIN}/login?error=auth_failed`);
  });

  it("verifyOtp が成功しても session が無い場合は session_creation_failed へ", async () => {
    verifyOtp.mockResolvedValue({ data: { session: null }, error: null });
    const res = await GET(
      makeRequest(`${ORIGIN}/api/auth/callback?token_hash=abc123&type=signup`),
    );
    expect(location(res)).toBe(`${ORIGIN}/login?error=session_creation_failed`);
  });

  it("verifyOtp が例外を throw した場合は auth_failed へ (catch 節)", async () => {
    verifyOtp.mockRejectedValue(new Error("network error"));
    const res = await GET(
      makeRequest(`${ORIGIN}/api/auth/callback?token_hash=abc123&type=signup`),
    );
    expect(location(res)).toBe(`${ORIGIN}/login?error=auth_failed`);
  });

  it("redirect_to が明示的に指定された場合はデフォルト遷移先より優先される (後方互換)", async () => {
    verifyOtp.mockResolvedValue({ data: { session: { access_token: "t" } }, error: null });
    const res = await GET(
      makeRequest(
        `${ORIGIN}/api/auth/callback?token_hash=abc123&type=signup&redirect_to=%2Fteam%2Fjoin`,
      ),
    );
    expect(location(res)).toBe(`${ORIGIN}/team/join`);
  });

  it("redirect_to が不正 (外部オリジン) な場合は type 別デフォルトではなく固定の /dashboard にフォールバックする", async () => {
    // 実装ノート: validateRedirectPath() のフォールバック先はハードコードされた /dashboard であり、
    // signup フローであっても /onboarding には戻らない。呼び出し元が redirect_to を悪用しようとした
    // 場合の実挙動を固定するための回帰テスト (Info: type 別デフォルトとの不整合)。
    verifyOtp.mockResolvedValue({ data: { session: { access_token: "t" } }, error: null });
    const res = await GET(
      makeRequest(
        `${ORIGIN}/api/auth/callback?token_hash=abc123&type=signup&redirect_to=${encodeURIComponent("https://evil.com/phish")}`,
      ),
    );
    expect(location(res)).toBe(`${ORIGIN}/dashboard`);
  });
});

describe("GET /api/auth/callback — V-07: token_hash と code が両方存在する場合", () => {
  it("token_hash が優先され、verifyOtp のみが呼ばれ exchangeCodeForSession は呼ばれない", async () => {
    verifyOtp.mockResolvedValue({ data: { session: { access_token: "t" } }, error: null });
    const res = await GET(
      makeRequest(
        `${ORIGIN}/api/auth/callback?token_hash=abc123&type=signup&code=some-pkce-code`,
      ),
    );
    expect(verifyOtp).toHaveBeenCalledWith({ type: "signup", token_hash: "abc123" });
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(location(res)).toBe(`${ORIGIN}/onboarding`);
  });
});

describe("GET /api/auth/callback — code フロー (V-04: 既存 OAuth 回帰)", () => {
  it("token_hash が無く code のみの場合は exchangeCodeForSession が呼ばれ /dashboard へ遷移する", async () => {
    exchangeCodeForSession.mockResolvedValue({
      data: { session: { access_token: "t" }, user: { id: "u1", app_metadata: {} } },
      error: null,
    });
    const res = await GET(makeRequest(`${ORIGIN}/api/auth/callback?code=pkce-code`));
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(exchangeCodeForSession).toHaveBeenCalledWith("pkce-code");
    expect(location(res)).toBe(`${ORIGIN}/dashboard`);
  });

  it("境界値: token_hash も code も無い場合は missing_code へ (空クエリ)", async () => {
    const res = await GET(makeRequest(`${ORIGIN}/api/auth/callback`));
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(location(res)).toBe(`${ORIGIN}/login?error=missing_code`);
  });

  it("境界値: token_hash が空文字の場合は falsy として code 分岐にフォールバックする", async () => {
    exchangeCodeForSession.mockResolvedValue({
      data: { session: { access_token: "t" }, user: { id: "u1", app_metadata: {} } },
      error: null,
    });
    const res = await GET(
      makeRequest(`${ORIGIN}/api/auth/callback?token_hash=&code=pkce-code`),
    );
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(exchangeCodeForSession).toHaveBeenCalledWith("pkce-code");
    expect(location(res)).toBe(`${ORIGIN}/dashboard`);
  });

  it("exchangeCodeForSession がエラーを返すと auth_failed へ (verifyOtp 追加後も維持)", async () => {
    exchangeCodeForSession.mockResolvedValue({ data: { session: null }, error: { message: "boom" } });
    const res = await GET(makeRequest(`${ORIGIN}/api/auth/callback?code=bad-code`));
    expect(location(res)).toBe(`${ORIGIN}/login?error=auth_failed`);
  });

  it("exchangeCodeForSession が成功しても session が無い場合は session_creation_failed へ", async () => {
    exchangeCodeForSession.mockResolvedValue({
      data: { session: null, user: null },
      error: null,
    });
    const res = await GET(makeRequest(`${ORIGIN}/api/auth/callback?code=pkce-code`));
    expect(location(res)).toBe(`${ORIGIN}/login?error=session_creation_failed`);
  });
});

describe("GET /api/auth/callback — V-15: 未知の type 値", () => {
  it("type=unknown_value は invalid_request を返し verifyOtp を呼ばない", async () => {
    const res = await GET(
      makeRequest(`${ORIGIN}/api/auth/callback?token_hash=abc123&type=unknown_value`),
    );
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(location(res)).toBe(`${ORIGIN}/login?error=invalid_request`);
  });
});

describe("GET /api/auth/callback — V-16: パラメータなし", () => {
  it("クエリパラメータが完全に無い場合は missing_code エラーへ (verifyOtp も exchangeCodeForSession も呼ばれない)", async () => {
    const res = await GET(makeRequest(`${ORIGIN}/api/auth/callback`));
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    expect(location(res)).toBe(`${ORIGIN}/login?error=missing_code`);
  });
});
