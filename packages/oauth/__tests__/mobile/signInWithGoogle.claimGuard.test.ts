/**
 * signInWithGoogle (src/mobile/useGoogleAuth.ts) の単体テスト
 * — メインの制御フローと claimOAuthCode ガードの検証。
 *
 * PM承認の設計判断1: signInWithGoogle は素の async 関数 (React フックではない)。
 * loading 状態や i18n ローカライズは持たない — それらは呼び出し側 (各アプリの
 * UI 層) の責務。
 *
 * 核心的価値: tokens.code がある場合は必ず claimOAuthCode を経由する。これは
 * scanner/swim-hub の既存 useGoogleAuth (hooks/useGoogleAuth.ts) には無かった
 * ガードであり、このパッケージ化によって初めて両アプリにも適用される安全策。
 * timer の既存実装 (claimOAuthCode 導入済み) の挙動を踏襲する。
 *
 * expo-web-browser / expo-auth-session はネイティブ専用モジュールに依存するため
 * vi.mock で完全に差し替える。claimOAuthCode (src/mobile/claimOAuthCode.ts) は
 * モックせず実物を使う — 「他所が先に claim 済み」という前提条件を、テスト側で
 * ロジックを複製するのではなく実際に claimOAuthCode を呼んで作るため
 * (トートロジー回避)。supabase は素の vi.fn() ベースの config 引数として注入する
 * (React フックではないため、モジュールをモックする必要が無い)。
 *
 * 注意: claimOAuthCode のモジュールスコープ状態はテスト間でリセットされないため、
 * 本ファイル内・他ファイル (signInWithGoogle.raceIntegration.test.ts) とも
 * 一意な code 文字列を用いる。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

vi.mock("expo-web-browser", () => ({
  openAuthSessionAsync: vi.fn(),
  maybeCompleteAuthSession: vi.fn(),
}));
vi.mock("expo-auth-session", () => ({
  makeRedirectUri: vi.fn(() => "swimhub-test://auth/callback"),
}));

import * as WebBrowser from "expo-web-browser";
import { signInWithGoogle } from "../../src/mobile/useGoogleAuth";
import { claimOAuthCode } from "../../src/mobile/claimOAuthCode";

const mockOpenAuthSessionAsync = WebBrowser.openAuthSessionAsync as unknown as ReturnType<typeof vi.fn>;

interface SupabaseAuthMock {
  signInWithOAuth: ReturnType<typeof vi.fn>;
  exchangeCodeForSession: ReturnType<typeof vi.fn>;
  setSession: ReturnType<typeof vi.fn>;
}

function makeSupabaseMock(): { auth: SupabaseAuthMock } {
  return {
    auth: {
      signInWithOAuth: vi.fn().mockResolvedValue({
        data: { url: "https://accounts.google.com/o/oauth2/mock-auth" },
        error: null,
      }),
      exchangeCodeForSession: vi.fn(),
      setSession: vi.fn(),
    },
  };
}

function asSupabase(mock: { auth: SupabaseAuthMock }): SupabaseClient {
  return mock as unknown as SupabaseClient;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("signInWithGoogle — signInWithOAuth 呼び出し内容 (V-19, V-20, V-21)", () => {
  it("[V-19] additionalScopes が基本スコープに追加結合されて signInWithOAuth に渡る", async () => {
    const supabase = makeSupabaseMock();
    mockOpenAuthSessionAsync.mockResolvedValue({ type: "dismiss" });

    await signInWithGoogle({
      supabase: asSupabase(supabase),
      scheme: "swimhub-test",
      additionalScopes: ["https://www.googleapis.com/auth/calendar.events"],
    });

    expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "google",
        options: expect.objectContaining({
          scopes: expect.stringContaining("https://www.googleapis.com/auth/calendar.events"),
        }),
      }),
    );
  });

  it("[V-20] queryParams が signInWithOAuth の options.queryParams にそのまま渡る", async () => {
    const supabase = makeSupabaseMock();
    mockOpenAuthSessionAsync.mockResolvedValue({ type: "dismiss" });

    await signInWithGoogle({
      supabase: asSupabase(supabase),
      scheme: "swimhub-test",
      queryParams: { access_type: "offline", prompt: "consent" },
    });

    expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          queryParams: { access_type: "offline", prompt: "consent" },
        }),
      }),
    );
  });

  it("[V-21] skipBrowserRedirect:true が常に指定される", async () => {
    const supabase = makeSupabaseMock();
    mockOpenAuthSessionAsync.mockResolvedValue({ type: "dismiss" });

    await signInWithGoogle({ supabase: asSupabase(supabase), scheme: "swimhub-test" });

    expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({ skipBrowserRedirect: true }),
      }),
    );
  });
});

describe("signInWithGoogle — signInWithOAuth 失敗 / ブラウザ非成功時 (V-22, V-23, V-24)", () => {
  it("[V-22] signInWithOAuth がエラーを返す場合、ブラウザを開かず success:false を返す", async () => {
    const supabase = makeSupabaseMock();
    supabase.auth.signInWithOAuth.mockResolvedValue({
      data: { url: null },
      error: new Error("oauth failed"),
    });

    const result = await signInWithGoogle({ supabase: asSupabase(supabase), scheme: "swimhub-test" });

    expect(mockOpenAuthSessionAsync).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
  });

  it("[V-22] signInWithOAuth が data.url を返さない場合も success:false を返す", async () => {
    const supabase = makeSupabaseMock();
    supabase.auth.signInWithOAuth.mockResolvedValue({ data: { url: null }, error: null });

    const result = await signInWithGoogle({ supabase: asSupabase(supabase), scheme: "swimhub-test" });

    expect(mockOpenAuthSessionAsync).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
  });

  it.each(["cancel", "dismiss"] as const)(
    "[V-23] openAuthSessionAsync の結果が type:%s の場合 success:false を返す",
    async (type) => {
      const supabase = makeSupabaseMock();
      mockOpenAuthSessionAsync.mockResolvedValue({ type });

      const result = await signInWithGoogle({ supabase: asSupabase(supabase), scheme: "swimhub-test" });

      expect(result.success).toBe(false);
      expect(supabase.auth.exchangeCodeForSession).not.toHaveBeenCalled();
    },
  );

  it("[V-24] browserOptions が指定されていれば openAuthSessionAsync の第3引数にそのまま渡る", async () => {
    const supabase = makeSupabaseMock();
    mockOpenAuthSessionAsync.mockResolvedValue({ type: "dismiss" });
    const browserOptions = { showInRecents: true };

    await signInWithGoogle({ supabase: asSupabase(supabase), scheme: "swimhub-test", browserOptions });

    expect(mockOpenAuthSessionAsync).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining(browserOptions),
    );
  });
});

describe("signInWithGoogle — code 経路と claimOAuthCode ガード (V-26〜V-30)", () => {
  it("[V-26] tokens.code がある場合、claim に勝てば exchangeCodeForSession を実行し成功を返す", async () => {
    const code = "claim-guard-v26-001";
    const supabase = makeSupabaseMock();
    supabase.auth.exchangeCodeForSession.mockResolvedValue({
      data: { session: { access_token: "t" } },
      error: null,
    });
    mockOpenAuthSessionAsync.mockResolvedValue({
      type: "success",
      url: `swimhub-test://auth/callback?code=${code}`,
    });

    const result = await signInWithGoogle({ supabase: asSupabase(supabase), scheme: "swimhub-test" });

    expect(supabase.auth.exchangeCodeForSession).toHaveBeenCalledWith(code);
    expect(result).toEqual({ success: true });
  });

  it("[V-27] claim に勝ったが exchangeCodeForSession がエラーを返すと success:false を返す", async () => {
    const code = "claim-guard-v27-001";
    const supabase = makeSupabaseMock();
    supabase.auth.exchangeCodeForSession.mockResolvedValue({
      data: { session: null },
      error: { message: "invalid_grant" },
    });
    mockOpenAuthSessionAsync.mockResolvedValue({
      type: "success",
      url: `swimhub-test://auth/callback?code=${code}`,
    });

    const result = await signInWithGoogle({ supabase: asSupabase(supabase), scheme: "swimhub-test" });

    expect(result.success).toBe(false);
  });

  it("[V-28] 既に他所で claim 済み (claimed:false) で相手が成功していた場合、exchangeCodeForSession を呼ばず相手の結果を反映する", async () => {
    const code = "claim-guard-v28-success-001";
    const winnerClaim = claimOAuthCode(code);
    if (!winnerClaim.claimed) throw new Error("test setup failed: code should not be claimed yet");
    winnerClaim.resolve({ success: true });

    const supabase = makeSupabaseMock();
    mockOpenAuthSessionAsync.mockResolvedValue({
      type: "success",
      url: `swimhub-test://auth/callback?code=${code}`,
    });

    const result = await signInWithGoogle({ supabase: asSupabase(supabase), scheme: "swimhub-test" });

    expect(supabase.auth.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(result).toEqual({ success: true });
  });

  it("[V-29] 既に他所で claim 済み (claimed:false) で相手が失敗していた場合、success:false を返す (無条件で成功扱いにしない)", async () => {
    const code = "claim-guard-v29-failure-001";
    const winnerClaim = claimOAuthCode(code);
    if (!winnerClaim.claimed) throw new Error("test setup failed: code should not be claimed yet");
    winnerClaim.resolve({ success: false });

    const supabase = makeSupabaseMock();
    mockOpenAuthSessionAsync.mockResolvedValue({
      type: "success",
      url: `swimhub-test://auth/callback?code=${code}`,
    });

    const result = await signInWithGoogle({ supabase: asSupabase(supabase), scheme: "swimhub-test" });

    expect(supabase.auth.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
  });

  it("[V-30] 同一 code で2回逐次呼び出すと、1回目が claim・交換を行い、2回目は交換をやり直さない", async () => {
    const code = "claim-guard-v30-sequential-001";
    const supabase = makeSupabaseMock();
    supabase.auth.exchangeCodeForSession.mockResolvedValue({
      data: { session: { access_token: "t" } },
      error: null,
    });
    mockOpenAuthSessionAsync.mockResolvedValue({
      type: "success",
      url: `swimhub-test://auth/callback?code=${code}`,
    });

    const first = await signInWithGoogle({ supabase: asSupabase(supabase), scheme: "swimhub-test" });
    const second = await signInWithGoogle({ supabase: asSupabase(supabase), scheme: "swimhub-test" });

    expect(supabase.auth.exchangeCodeForSession).toHaveBeenCalledTimes(1);
    expect(first).toEqual({ success: true });
    expect(second).toEqual({ success: true });
  });
});

describe("signInWithGoogle — implicit フォールバック / トークン欠如 (V-31, V-32)", () => {
  it("[V-31] code が無く accessToken+refreshToken がある場合は setSession にフォールバックする", async () => {
    const supabase = makeSupabaseMock();
    supabase.auth.setSession.mockResolvedValue({ data: { session: { access_token: "at" } }, error: null });
    mockOpenAuthSessionAsync.mockResolvedValue({
      type: "success",
      url: "swimhub-test://auth/callback#access_token=at&refresh_token=rt&expires_in=3600&token_type=bearer",
    });

    const result = await signInWithGoogle({ supabase: asSupabase(supabase), scheme: "swimhub-test" });

    expect(supabase.auth.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(supabase.auth.setSession).toHaveBeenCalledWith({ access_token: "at", refresh_token: "rt" });
    expect(result).toEqual({ success: true });
  });

  it("[V-31] setSession がエラーを返す場合は success:false を返す", async () => {
    const supabase = makeSupabaseMock();
    supabase.auth.setSession.mockResolvedValue({
      data: { session: null },
      error: { message: "bad session" },
    });
    mockOpenAuthSessionAsync.mockResolvedValue({
      type: "success",
      url: "swimhub-test://auth/callback#access_token=at&refresh_token=rt",
    });

    const result = await signInWithGoogle({ supabase: asSupabase(supabase), scheme: "swimhub-test" });

    expect(result.success).toBe(false);
  });

  it("[V-32] code も accessToken/refreshToken も無い場合は tokens_not_received エラーを返す", async () => {
    const supabase = makeSupabaseMock();
    mockOpenAuthSessionAsync.mockResolvedValue({
      type: "success",
      url: "swimhub-test://auth/callback",
    });

    const result = await signInWithGoogle({ supabase: asSupabase(supabase), scheme: "swimhub-test" });

    expect(result.success).toBe(false);
    expect(result.error?.message).toBe("tokens_not_received");
  });

  it("[V-32] コールバック URL に error が含まれる場合も success:false を返す (交換系メソッドは呼ばれない)", async () => {
    const supabase = makeSupabaseMock();
    mockOpenAuthSessionAsync.mockResolvedValue({
      type: "success",
      url: "swimhub-test://auth/callback?error=access_denied",
    });

    const result = await signInWithGoogle({ supabase: asSupabase(supabase), scheme: "swimhub-test" });

    expect(result.success).toBe(false);
    expect(supabase.auth.exchangeCodeForSession).not.toHaveBeenCalled();
    expect(supabase.auth.setSession).not.toHaveBeenCalled();
  });
});

describe("signInWithGoogle — onExchangeResult コールバック (V-25, V-33, V-34)", () => {
  it("[V-25/V-33] code 経路の成功時、onExchangeResult に method:'code' と実際の session/tokens が渡る", async () => {
    const code = "claim-guard-v33-context-001";
    const supabase = makeSupabaseMock();
    const session = { access_token: "t", user: { id: "u1" } };
    supabase.auth.exchangeCodeForSession.mockResolvedValue({ data: { session }, error: null });
    mockOpenAuthSessionAsync.mockResolvedValue({
      type: "success",
      url: `swimhub-test://auth/callback?code=${code}`,
    });
    const onExchangeResult = vi.fn();

    await signInWithGoogle({ supabase: asSupabase(supabase), scheme: "swimhub-test", onExchangeResult });

    expect(onExchangeResult).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "code",
        session,
        tokens: expect.objectContaining({ code }),
      }),
    );
  });

  it("[V-25/V-33] implicit 経路の成功時、onExchangeResult に method:'implicit' が渡る", async () => {
    const supabase = makeSupabaseMock();
    const session = { access_token: "at", user: { id: "u1" } };
    supabase.auth.setSession.mockResolvedValue({ data: { session }, error: null });
    mockOpenAuthSessionAsync.mockResolvedValue({
      type: "success",
      url: "swimhub-test://auth/callback#access_token=at&refresh_token=rt",
    });
    const onExchangeResult = vi.fn();

    await signInWithGoogle({ supabase: asSupabase(supabase), scheme: "swimhub-test", onExchangeResult });

    expect(onExchangeResult).toHaveBeenCalledWith(expect.objectContaining({ method: "implicit", session }));
  });

  it("[V-33] onExchangeResult が {success:false} を返すと、本来 success:true になるはずだった結果を上書きする", async () => {
    const code = "claim-guard-v33-override-001";
    const supabase = makeSupabaseMock();
    supabase.auth.exchangeCodeForSession.mockResolvedValue({
      data: { session: { access_token: "t" } },
      error: null,
    });
    mockOpenAuthSessionAsync.mockResolvedValue({
      type: "success",
      url: `swimhub-test://auth/callback?code=${code}`,
    });
    const blockedError = new Error("blocked by onExchangeResult");
    const onExchangeResult = vi.fn().mockResolvedValue({ success: false, error: blockedError });

    const result = await signInWithGoogle({
      supabase: asSupabase(supabase),
      scheme: "swimhub-test",
      onExchangeResult,
    });

    expect(result.success).toBe(false);
  });

  it("[V-34] onExchangeResult が void を返す場合は交換結果 (success:true) をそのまま維持する", async () => {
    const code = "claim-guard-v34-noop-001";
    const supabase = makeSupabaseMock();
    supabase.auth.exchangeCodeForSession.mockResolvedValue({
      data: { session: { access_token: "t" } },
      error: null,
    });
    mockOpenAuthSessionAsync.mockResolvedValue({
      type: "success",
      url: `swimhub-test://auth/callback?code=${code}`,
    });
    const onExchangeResult = vi.fn().mockReturnValue(undefined);

    const result = await signInWithGoogle({
      supabase: asSupabase(supabase),
      scheme: "swimhub-test",
      onExchangeResult,
    });

    expect(result).toEqual({ success: true });
  });

  it("[V-34] onExchangeResult が {success:true} を明示的に返す場合も成功結果を維持する", async () => {
    const code = "claim-guard-v34-explicit-true-001";
    const supabase = makeSupabaseMock();
    supabase.auth.exchangeCodeForSession.mockResolvedValue({
      data: { session: { access_token: "t" } },
      error: null,
    });
    mockOpenAuthSessionAsync.mockResolvedValue({
      type: "success",
      url: `swimhub-test://auth/callback?code=${code}`,
    });
    const onExchangeResult = vi.fn().mockResolvedValue({ success: true });

    const result = await signInWithGoogle({
      supabase: asSupabase(supabase),
      scheme: "swimhub-test",
      onExchangeResult,
    });

    expect(result).toEqual({ success: true });
  });
});

/**
 * Reviewer 指摘 (敵対的レビュー): 上の V-19〜V-34 は exchangeCodeForSession /
 * signInWithOAuth / setSession に対して mockResolvedValue しか使っておらず、
 * これらが reject (例外) した場合の挙動が一切検証されていなかった。
 *
 * claim に勝った側の交換呼び出しが例外を投げると、(修正前の実装では)
 * outcome.resolve が呼ばれないまま signInWithGoogle 自体が reject してしまい、
 * 同じ code の result を待つ負けた側が永久にハングする Critical バグを
 * このテストスイートは検出できていなかった (App Developer 修正対応)。
 *
 * 以下は現在の実装が正しく修正されているかを検証する。単一呼び出しの
 * 「reject せず success:false で解決するか」だけを検証する範囲はここに置き、
 * 「claim に負けた側がハングしないか」という複数呼び出し間の伝播は
 * signInWithGoogle.raceIntegration.test.ts (V-93, V-94) 側で検証する。
 */
describe("signInWithGoogle — 交換系メソッド/フックが reject・throw しても必ず resolve する (V-88〜V-91)", () => {
  it("[V-88] claim に勝った状態で exchangeCodeForSession が reject しても、signInWithGoogle は例外を投げず success:false で解決する", async () => {
    const code = "claim-guard-v88-exchange-reject-001";
    const supabase = makeSupabaseMock();
    supabase.auth.exchangeCodeForSession.mockRejectedValue(new Error("network down"));
    mockOpenAuthSessionAsync.mockResolvedValue({
      type: "success",
      url: `swimhub-test://auth/callback?code=${code}`,
    });

    await expect(
      signInWithGoogle({ supabase: asSupabase(supabase), scheme: "swimhub-test" }),
    ).resolves.toEqual({ success: false, error: expect.any(Error) });
  });

  it("[V-89] setSession (implicit フォールバック) が reject しても、signInWithGoogle は例外を投げず success:false で解決する", async () => {
    const supabase = makeSupabaseMock();
    supabase.auth.setSession.mockRejectedValue(new Error("bad refresh token"));
    mockOpenAuthSessionAsync.mockResolvedValue({
      type: "success",
      url: "swimhub-test://auth/callback#access_token=at&refresh_token=rt",
    });

    await expect(
      signInWithGoogle({ supabase: asSupabase(supabase), scheme: "swimhub-test" }),
    ).resolves.toEqual({ success: false, error: expect.any(Error) });
  });

  it("[V-90] onExchangeResult が同期的に throw しても、signInWithGoogle は例外を投げず success:false で解決する", async () => {
    const code = "claim-guard-v90-hook-sync-throw-001";
    const supabase = makeSupabaseMock();
    supabase.auth.exchangeCodeForSession.mockResolvedValue({
      data: { session: { access_token: "t" } },
      error: null,
    });
    mockOpenAuthSessionAsync.mockResolvedValue({
      type: "success",
      url: `swimhub-test://auth/callback?code=${code}`,
    });
    const onExchangeResult = vi.fn(() => {
      throw new Error("hook exploded synchronously");
    });

    await expect(
      signInWithGoogle({ supabase: asSupabase(supabase), scheme: "swimhub-test", onExchangeResult }),
    ).resolves.toEqual({ success: false, error: expect.any(Error) });
  });

  it("[V-91] onExchangeResult が返す Promise が reject しても、signInWithGoogle は例外を投げず success:false で解決する", async () => {
    const code = "claim-guard-v91-hook-async-reject-001";
    const supabase = makeSupabaseMock();
    supabase.auth.exchangeCodeForSession.mockResolvedValue({
      data: { session: { access_token: "t" } },
      error: null,
    });
    mockOpenAuthSessionAsync.mockResolvedValue({
      type: "success",
      url: `swimhub-test://auth/callback?code=${code}`,
    });
    const onExchangeResult = vi.fn().mockRejectedValue(new Error("hook exploded asynchronously"));

    await expect(
      signInWithGoogle({ supabase: asSupabase(supabase), scheme: "swimhub-test", onExchangeResult }),
    ).resolves.toEqual({ success: false, error: expect.any(Error) });
  });
});

describe("signInWithGoogle — 内部でどんな例外が起きても Promise<SignInWithGoogleResult> として必ず解決する契約 (V-92)", () => {
  type FailureCase = [label: string, setup: (supabase: { auth: SupabaseAuthMock }) => void];

  const FAILURE_CASES: FailureCase[] = [
    [
      "signInWithOAuth が reject する",
      (supabase) => {
        supabase.auth.signInWithOAuth.mockRejectedValue(new Error("oauth endpoint down"));
      },
    ],
    [
      "exchangeCodeForSession が reject する (code 経路)",
      (supabase) => {
        mockOpenAuthSessionAsync.mockResolvedValue({
          type: "success",
          url: "swimhub-test://auth/callback?code=claim-guard-v92-each-exchange-001",
        });
        supabase.auth.exchangeCodeForSession.mockRejectedValue(new Error("network down"));
      },
    ],
    [
      "setSession が reject する (implicit 経路)",
      (supabase) => {
        mockOpenAuthSessionAsync.mockResolvedValue({
          type: "success",
          url: "swimhub-test://auth/callback#access_token=at&refresh_token=rt",
        });
        supabase.auth.setSession.mockRejectedValue(new Error("bad refresh token"));
      },
    ],
  ];

  it.each(FAILURE_CASES)(
    "[V-92] %s 場合でも signInWithGoogle は reject せず success:false で解決する",
    async (_label, setup) => {
      const supabase = makeSupabaseMock();
      setup(supabase);

      await expect(
        signInWithGoogle({ supabase: asSupabase(supabase), scheme: "swimhub-test" }),
      ).resolves.toMatchObject({ success: false });
    },
  );

  it("[V-92] onExchangeResult が throw する場合でも signInWithGoogle は reject せず success:false で解決する", async () => {
    const supabase = makeSupabaseMock();
    supabase.auth.exchangeCodeForSession.mockResolvedValue({
      data: { session: { access_token: "t" } },
      error: null,
    });
    mockOpenAuthSessionAsync.mockResolvedValue({
      type: "success",
      url: "swimhub-test://auth/callback?code=claim-guard-v92-each-hook-001",
    });
    const onExchangeResult = vi.fn(() => {
      throw new Error("hook exploded");
    });

    await expect(
      signInWithGoogle({ supabase: asSupabase(supabase), scheme: "swimhub-test", onExchangeResult }),
    ).resolves.toMatchObject({ success: false });
  });
});
