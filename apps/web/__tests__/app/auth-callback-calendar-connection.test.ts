// QA Phase B (セキュリティ修正検証): /api/auth/callback の handleCalendarConnection が
// session.provider_refresh_token を set_google_refresh_token RPC に渡す前に必ず暗号化することを
// 検証する。修正前は平文のまま RPC に渡していた (apps/web/app/api/google-calendar/connect/route.ts
// の mobile 経路とは非対称だった) バグの再発防止テスト。
//
// 検証観点 (このセッションで追加された Sprint Contract 項目):
//   1. RPC に渡る p_token が暗号化済み (enc:v1: プレフィックス) であり、平文がそのまま渡らないこと
//   2. 既に暗号化済みの値が来た場合は再暗号化 (二重暗号化) されないこと
//   3. TOKEN_ENCRYPTION_KEY 未設定時: ログイン自体は成功するが、トークンは保存されずエラーログが出る
//   4. encrypt() が例外を投げた場合でも handleCalendarConnection は throw せずログインは成功する
//   5. mobile 経路 (google-calendar/connect/route.ts) と同じ encrypt()/decrypt() 実装を使っており、
//      両経路で生成されたトークンが読み出し側 (lib/google-calendar-auth.ts が使う decrypt()) と
//      同じ形式で復号できること
//
// トートロジー回避: route.ts の暗号化ロジックを再実装せず、実ハンドラ (GET / POST) をそのまま import
// し、依存 (next/headers の cookies, @supabase/ssr, @supabase/supabase-js) のみを vi.mock で
// 差し替える。@/lib/encryption は「実装」を使い (isEncrypted/decrypt は完全に実物)、encrypt() だけを
// 実装へのフォワードとしてスパイして呼び出し有無を観測できるようにする。これにより
// 「暗号化されたかどうか」を文字列のプレフィックス判定と実際の復号ラウンドトリップで検証でき、
// アサーションが実装のコピーにならないようにしている。
//
// 継ぎ目の移動 (Phase 4 Sprint 2): route.ts の GET (auth/callback) は共有パッケージ
// (@ryuuhei0729/swimhub-oauth/web の handleAuthCallback) へ委譲するようになり、
// onSessionEstablished に渡される supabase クライアントは共有パッケージ内部の
// createCallbackSupabaseClient (@supabase/ssr の createServerClient) が生成する。
// そのため @/lib/supabase-server ではなく @supabase/ssr をモックする (rpc/from も
// このクライアントに直接ぶら下がる形に変わる)。POST (google-calendar/connect) 側は
// 従来通り @supabase/supabase-js の createClient を直接使うため変更なし。
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { decrypt as realDecrypt, isEncrypted as realIsEncrypted } from "@/lib/encryption";

// --- @/lib/encryption: encrypt() のみスパイ (デフォルトは実装にフォワード)。isEncrypted/decrypt は実物。
const { encryptSpy } = vi.hoisted(() => ({ encryptSpy: vi.fn() }));

vi.mock("@/lib/encryption", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/encryption")>();
  encryptSpy.mockImplementation(actual.encrypt);
  return {
    ...actual,
    encrypt: (plaintext: string) => encryptSpy(plaintext),
  };
});

vi.mock("next/headers", () => ({
  cookies: vi.fn().mockResolvedValue({ getAll: () => [] }),
}));

const exchangeCodeForSession = vi.fn();
const rpc = vi.fn();
const updateEq = vi.fn();
const fromMock = vi.fn();

vi.mock("@supabase/ssr", () => ({
  createServerClient: vi.fn(() => ({
    auth: { verifyOtp: vi.fn(), exchangeCodeForSession },
    rpc,
    from: fromMock,
  })),
}));

// --- mobile 経路 (google-calendar/connect/route.ts) が使う @supabase/supabase-js のモック。
// vi.mock はファイル内のスコープ位置に関係なく先頭に巻き上げられるため、参照する vi.fn() も
// トップレベルで宣言する (describe 内で宣言すると巻き上げ後に参照エラーになるため)。
const getUserMock = vi.fn();
const rpcMobile = vi.fn();
const fromMobileEq = vi.fn();
const fromMobile = vi.fn();

vi.mock("@supabase/supabase-js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@supabase/supabase-js")>();
  return {
    ...actual,
    createClient: vi.fn(() => ({
      auth: { getUser: (...args: unknown[]) => getUserMock(...args) },
      rpc: (...args: unknown[]) => rpcMobile(...args),
      from: (...args: unknown[]) => fromMobile(...args),
    })),
  };
});

import { GET } from "@/app/api/auth/callback/route";

function makeRequest(url: string): NextRequest {
  return new NextRequest(url);
}

function location(res: Response): string {
  return res.headers.get("location") ?? "";
}

const ORIGIN = "http://localhost:3000";
const PLAINTEXT_REFRESH_TOKEN = "google-plaintext-refresh-token-xyz";
const TEST_ENCRYPTION_KEY = "qa-test-token-encryption-key-do-not-use-in-prod";

function makeGoogleUser(overrides: Record<string, unknown> = {}) {
  return { id: "user-1", app_metadata: { providers: ["google"] }, ...overrides };
}

// 継ぎ目の移動に伴う修正: 新しい route.ts (共有パッケージへの委譲後) は
// handleCalendarConnection に渡すユーザーを `data.user` (トップレベル) ではなく
// `session.user` から取る。これは @supabase/auth-js の実際の Session 型
// (session.user は必須フィールド) に合わせた挙動であり、実際の Supabase レスポンスでは
// data.session.user と data.user は同一ユーザーを指す。そのため user を session に
// ネストさせて、実際の Supabase の契約に忠実なモックにする (アサーションは無変更)。
function makeSession(
  providerRefreshToken: string | null,
  user: Record<string, unknown> = makeGoogleUser(),
  overrides: Record<string, unknown> = {},
) {
  return { access_token: "t", provider_refresh_token: providerRefreshToken, user, ...overrides };
}

/** calendar_connect=true の OAuth code フローを叩くための共通リクエスト生成 */
function makeCalendarConnectRequest(): NextRequest {
  return makeRequest(`${ORIGIN}/api/auth/callback?code=pkce-code&calendar_connect=true`);
}

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("TOKEN_ENCRYPTION_KEY", TEST_ENCRYPTION_KEY);
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

  // デフォルトは成功系: rpc / users.update().eq() ともに成功
  rpc.mockResolvedValue({ error: null });
  updateEq.mockResolvedValue({ error: null });
  fromMock.mockImplementation((table: string) => {
    if (table === "users") {
      return { update: () => ({ eq: updateEq }) };
    }
    throw new Error(`unexpected table: ${table}`);
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  consoleErrorSpy.mockRestore();
});

// NOTE: `mock.calls[0]!` を多用する。各テストは直前に `toHaveBeenCalledTimes(1)` で
// 呼び出し回数を確認済み。
describe("GET /api/auth/callback — calendar_connect=true: provider_refresh_token の暗号化 (セキュリティ修正検証)", () => {
  it("V-ENC-01: 平文の provider_refresh_token が暗号化されて RPC に渡り、平文のまま渡らないこと", async () => {
    exchangeCodeForSession.mockResolvedValue({
      data: { session: makeSession(PLAINTEXT_REFRESH_TOKEN), user: makeGoogleUser() },
      error: null,
    });

    const res = await GET(makeCalendarConnectRequest());

    expect(rpc).toHaveBeenCalledTimes(1);
    const rpcArgs = rpc.mock.calls[0]![1] as { p_user_id: string; p_token: string };

    // 修正の核心: RPC に渡る p_token は平文そのものではない
    expect(rpcArgs.p_token).not.toBe(PLAINTEXT_REFRESH_TOKEN);
    // 暗号化済みプレフィックス (enc:v1:) を持つこと
    expect(realIsEncrypted(rpcArgs.p_token)).toBe(true);
    // 実際に復号すると元の平文に戻ること (ラウンドトリップ検証)
    expect(realDecrypt(rpcArgs.p_token)).toBe(PLAINTEXT_REFRESH_TOKEN);
    // encrypt() が実際に1回呼ばれたこと
    expect(encryptSpy).toHaveBeenCalledTimes(1);
    expect(encryptSpy).toHaveBeenCalledWith(PLAINTEXT_REFRESH_TOKEN);

    // トークン保存成功時のみ google_calendar_enabled が更新される
    expect(updateEq).toHaveBeenCalledWith("id", "user-1");
    expect(location(res)).toBe(`${ORIGIN}/dashboard?calendar_connected=true`);
  });

  it("V-ENC-02: 既に暗号化済みの provider_refresh_token は再暗号化 (二重暗号化) されないこと", async () => {
    // 事前に一度だけ実装で暗号化した値を用意 (前段のRPC呼び出しとは無関係な独立した暗号化)
    const alreadyEncrypted = encryptSpy.getMockImplementation()!(PLAINTEXT_REFRESH_TOKEN) as string;
    encryptSpy.mockClear();

    exchangeCodeForSession.mockResolvedValue({
      data: { session: makeSession(alreadyEncrypted), user: makeGoogleUser() },
      error: null,
    });

    const res = await GET(makeCalendarConnectRequest());

    // 二重暗号化されていれば IV が変わり別の文字列になるはずだが、そうならないこと
    expect(encryptSpy).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledTimes(1);
    const rpcArgs = rpc.mock.calls[0]![1] as { p_token: string };
    expect(rpcArgs.p_token).toBe(alreadyEncrypted);
    expect(realDecrypt(rpcArgs.p_token)).toBe(PLAINTEXT_REFRESH_TOKEN);
    expect(location(res)).toBe(`${ORIGIN}/dashboard?calendar_connected=true`);
  });

  it("V-ENC-03: TOKEN_ENCRYPTION_KEY が未設定でもログインは成功するが、トークンは保存されずエラーログが出る", async () => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", "");

    exchangeCodeForSession.mockResolvedValue({
      data: { session: makeSession(PLAINTEXT_REFRESH_TOKEN), user: makeGoogleUser() },
      error: null,
    });

    const res = await GET(makeCalendarConnectRequest());

    // ログイン自体は成功 (auth_failed 等のエラーページに落ちない)。
    // ただしカレンダー連携自体は失敗しているため calendar_connected=true は付与されない
    // (仕様変更: 連携の成否を calendar_connected に正しく反映する)。
    expect(location(res)).toBe(`${ORIGIN}/dashboard`);
    expect(location(res)).not.toContain("error=");

    // トークンは保存されない (RPCも users update も呼ばれない)
    expect(encryptSpy).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
    expect(updateEq).not.toHaveBeenCalled();

    // エラーログが出る (connect/route.ts と同じ文言)
    const loggedKeyMissing = consoleErrorSpy.mock.calls.some((call) =>
      call.some((arg) => typeof arg === "string" && arg.includes("TOKEN_ENCRYPTION_KEY is not set")),
    );
    expect(loggedKeyMissing).toBe(true);
  });

  it("V-ENC-04: encrypt() が例外を投げてもログインは成功し、throw が外に伝播しない", async () => {
    encryptSpy.mockImplementationOnce(() => {
      throw new Error("simulated encryption failure");
    });

    exchangeCodeForSession.mockResolvedValue({
      data: { session: makeSession(PLAINTEXT_REFRESH_TOKEN), user: makeGoogleUser() },
      error: null,
    });

    const res = await GET(makeCalendarConnectRequest());

    // ログイン自体は成功 (handleCalendarConnection の例外が catch されて呼び出し元に伝播しない)。
    // カレンダー連携自体は失敗しているため calendar_connected=true は付与されない
    // (仕様変更: 連携の成否を calendar_connected に正しく反映する)。
    expect(location(res)).toBe(`${ORIGIN}/dashboard`);
    expect(location(res)).not.toContain("error=");

    // 暗号化に失敗しているのでRPCも users update も呼ばれない
    expect(rpc).not.toHaveBeenCalled();
    expect(updateEq).not.toHaveBeenCalled();

    const loggedEncryptionFailure = consoleErrorSpy.mock.calls.some((call) =>
      call.some(
        (arg) =>
          (typeof arg === "string" && arg.includes("暗号化に失敗")) ||
          (arg instanceof Error && arg.message === "simulated encryption failure"),
      ),
    );
    expect(loggedEncryptionFailure).toBe(true);
  });

  it("境界値: refreshToken が null (Googleだがトークン無し) の場合は暗号化処理に到達せずエラーを返す", async () => {
    exchangeCodeForSession.mockResolvedValue({
      data: { session: makeSession(null), user: makeGoogleUser() },
      error: null,
    });

    const res = await GET(makeCalendarConnectRequest());

    expect(encryptSpy).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
    // カレンダー連携エラーは無視されログイン自体は成功するが、連携自体は失敗しているため
    // calendar_connected=true は付与されない (仕様変更)。
    expect(location(res)).toBe(`${ORIGIN}/dashboard`);
    expect(location(res)).not.toContain("error=");
  });

  it("google プロバイダでないユーザーは暗号化処理自体を通らない", async () => {
    const emailUser = makeGoogleUser({ app_metadata: { providers: ["email"] } });
    exchangeCodeForSession.mockResolvedValue({
      data: {
        session: makeSession(PLAINTEXT_REFRESH_TOKEN, emailUser),
        user: emailUser,
      },
      error: null,
    });

    const res = await GET(makeCalendarConnectRequest());

    expect(encryptSpy).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
    // google 以外のプロバイダでは連携対象がなく実際には何も連携されていないため、
    // ログイン自体は成功するが calendar_connected=true は付与されない (仕様変更)。
    expect(location(res)).toBe(`${ORIGIN}/dashboard`);
    expect(location(res)).not.toContain("error=");
  });
});

describe("mobile 経路 (google-calendar/connect/route.ts) との対称性", () => {
  // POST /api/google-calendar/connect は @supabase/supabase-js の createClient を直接使う
  // (auth/callback 側は @/lib/supabase-server 経由なので無関係)。モック自体はファイル先頭で定義済み。
  beforeEach(() => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
    getUserMock.mockReset().mockResolvedValue({
      data: { user: { id: "mobile-user-1" } },
      error: null,
    });
    rpcMobile.mockReset().mockResolvedValue({ error: null });
    fromMobileEq.mockReset().mockResolvedValue({ error: null });
    fromMobile.mockReset().mockImplementation((table: string) => {
      if (table === "users") {
        return { update: () => ({ eq: fromMobileEq }) };
      }
      throw new Error(`unexpected table: ${table}`);
    });
  });

  it("V-ENC-05: web (OAuthコールバック) と mobile (connect API) は同じ encrypt()/decrypt() で相互に復号可能な形式を生成する", async () => {
    // mobile 経路: POST /api/google-calendar/connect
    const { POST } = await import("@/app/api/google-calendar/connect/route");
    const mobileRequest = new NextRequest(`${ORIGIN}/api/google-calendar/connect`, {
      method: "POST",
      headers: { Authorization: "Bearer mobile-access-token", "Content-Type": "application/json" },
      body: JSON.stringify({ providerRefreshToken: PLAINTEXT_REFRESH_TOKEN }),
    });

    const mobileRes = await POST(mobileRequest);
    expect(mobileRes.status).toBe(200);
    expect(rpcMobile).toHaveBeenCalledTimes(1);
    const mobileTokenArg = rpcMobile.mock.calls[0]![1] as { p_token: string };

    // web 経路: GET /api/auth/callback?calendar_connect=true
    exchangeCodeForSession.mockResolvedValue({
      data: { session: makeSession(PLAINTEXT_REFRESH_TOKEN), user: makeGoogleUser() },
      error: null,
    });
    await GET(makeCalendarConnectRequest());
    const webTokenArg = rpc.mock.calls[0]![1] as { p_token: string };

    // どちらも enc:v1: プレフィックスを持ち、同じ decrypt() で元の平文に戻る
    // (IV がランダムなためバイト列自体は一致しないが、"読み出し側が同じ decrypt() で
    //  復号できる同一形式である" ことがここで保証される)
    expect(realIsEncrypted(mobileTokenArg.p_token)).toBe(true);
    expect(realIsEncrypted(webTokenArg.p_token)).toBe(true);
    expect(realDecrypt(mobileTokenArg.p_token)).toBe(PLAINTEXT_REFRESH_TOKEN);
    expect(realDecrypt(webTokenArg.p_token)).toBe(PLAINTEXT_REFRESH_TOKEN);
  });
});
