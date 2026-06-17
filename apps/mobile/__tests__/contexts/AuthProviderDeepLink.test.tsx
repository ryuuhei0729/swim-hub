/**
 * AuthProvider — ディープリンクハンドラ ユニットテスト
 *
 * Sprint Contract: メール確認リンクのディープリンク復帰修正
 *
 * 検証観点:
 * [DLH-01] cold start — Linking.getInitialURL() が auth callback URL を返すとき setSession が呼ばれる
 * [DLH-02] warm start — Linking.addEventListener "url" イベントで setSession が呼ばれる
 * [DLH-03] cleanup — unmount 時に Linking subscription が remove される
 * [DLH-04] oauthSessionGuard — active=true のとき setSession が呼ばれない
 * [DLH-05] error 経路 — URL に #error= が含まれるとき Alert が表示され setSession は呼ばれない
 * [DLH-06] tokens missing 経路 — access_token/refresh_token なしのとき Alert が表示される
 * [DLH-07] setSession error — setSession が error を返すとき Alert が表示される
 * [DLH-08] 無関係 URL は無視される
 * [DLH-09] getInitialURL reject — Promise が reject してもクラッシュしない
 */

import React from "react";
import { describe, it, vi, beforeEach, expect } from "vitest";
import { render, act } from "@testing-library/react";

// expo-auth-session が expo-modules-core の CodedError を必要とするが、
// vitest.setup.ts のモックに含まれていない。ここで補完する。
vi.mock("expo-modules-core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("expo-modules-core")>();
  class CodedError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }
  return { ...actual, CodedError };
});

// expo-auth-session を stub (AuthProvider → google-auth.ts → makeRedirectUri)
vi.mock("expo-auth-session", () => ({
  makeRedirectUri: vi.fn(
    ({ native }: { native?: string }) => native ?? "swimhub://auth/callback",
  ),
  ResponseType: { Token: "token", Code: "code" },
}));

// expo-web-browser (useGoogleAuth / IdentityLinkSettings が import)
vi.mock("expo-web-browser", () => ({
  maybeCompleteAuthSession: vi.fn(),
  openAuthSessionAsync: vi.fn(),
}));

// ---- vi.hoisted: モック関数を事前定義 ----------------------------------------

const mocks = vi.hoisted(() => {
  // Linking イベントハンドラを捕捉する仕組み
  let linkingUrlHandler: ((event: { url: string }) => void) | null = null;
  let initialUrl: string | null = null;
  const linkingSubscriptionRemove = vi.fn();

  return {
    // Linking
    getInitialURL: vi.fn(async () => initialUrl),
    addEventListener: vi.fn((_event: string, handler: (e: { url: string }) => void) => {
      linkingUrlHandler = handler;
      return { remove: linkingSubscriptionRemove };
    }),
    fireLinkingUrl: (url: string) => {
      linkingUrlHandler?.({ url });
    },
    setInitialUrl: (url: string | null) => {
      initialUrl = url;
    },
    linkingSubscriptionRemove,

    // Alert
    alertFn: vi.fn(),

    // supabase auth
    setSession: vi.fn(),
    onAuthStateChange: vi.fn(),
    getSession: vi.fn(),
    fromFn: vi.fn(),

    // RevenueCat
    initRevenueCat: vi.fn(),
    loginRevenueCat: vi.fn(),
    logoutRevenueCat: vi.fn(),
    addCustomerInfoListener: vi.fn(() => () => {}),

    // QueryProvider
    getQueryClient: vi.fn(() => ({ clear: vi.fn(), invalidateQueries: vi.fn() })),

    // oauthSessionGuard (mutable)
    oauthGuardActive: false as boolean,
  };
});

// ---- モック設定 ---------------------------------------------------------------

// react-native: vitest.config.ts の alias で __mocks__/react-native.ts に向いているが、
// vi.mock() factory は alias より優先されるので上書きできる。
// Linking がないため、ここで追加する。
vi.mock("react-native", async () => {
  // __mocks__/react-native.ts の内容を importOriginal で取得
  const actual = await vi.importActual<Record<string, unknown>>("react-native");
  return {
    ...actual,
    Alert: { alert: mocks.alertFn },
    Linking: {
      getInitialURL: mocks.getInitialURL,
      addEventListener: mocks.addEventListener,
    },
  };
});

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      setSession: mocks.setSession,
      onAuthStateChange: mocks.onAuthStateChange,
      getSession: mocks.getSession,
    },
    from: mocks.fromFn,
  },
}));

vi.mock("@/lib/google-auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/google-auth")>("@/lib/google-auth");
  return {
    ...actual,
    getRedirectUri: vi.fn(() => "swimhub://auth/callback"),
    // oauthSessionGuard の active は mocks.oauthGuardActive に委譲
    get oauthSessionGuard() {
      return {
        get active() {
          return mocks.oauthGuardActive;
        },
        set active(v: boolean) {
          mocks.oauthGuardActive = v;
        },
      };
    },
  };
});

vi.mock("@/lib/revenucat", () => ({
  initRevenueCat: mocks.initRevenueCat,
  loginRevenueCat: mocks.loginRevenueCat,
  logoutRevenueCat: mocks.logoutRevenueCat,
  addCustomerInfoListener: mocks.addCustomerInfoListener,
}));

vi.mock("@/providers/QueryProvider", () => ({
  getQueryClient: mocks.getQueryClient,
}));

// ---- インポート（モック設定後に行う）------------------------------------------

import { AuthProvider } from "@/contexts/AuthProvider";

// ---- ヘルパー -----------------------------------------------------------------

function setupImmediateInitialSession(
  session: unknown = { user: { id: "uid-1" }, access_token: "tok" },
) {
  mocks.onAuthStateChange.mockImplementation(
    (cb: (event: string, session: unknown) => void) => {
      cb("INITIAL_SESSION", session);
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    },
  );

  mocks.fromFn.mockReturnValue({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: { onboarding_completed: true },
      error: null,
    }),
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    }),
  });
}

function renderAuthProvider() {
  return render(<AuthProvider><div /></AuthProvider>);
}

// ---- テスト本体 ---------------------------------------------------------------

describe("[DLH-01] cold start — getInitialURL が auth callback URL を返すとき setSession を呼ぶ", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.oauthGuardActive = false;
    mocks.setSession.mockResolvedValue({ error: null });
    setupImmediateInitialSession({ user: { id: "uid-1" }, access_token: "tok" });
  });

  it("有効な access_token + refresh_token を持つ initial URL で setSession が呼ばれる", async () => {
    const callbackUrl =
      "swimhub://auth/callback#access_token=at-cold&refresh_token=rt-cold&expires_in=3600&token_type=bearer";
    mocks.setInitialUrl(callbackUrl);

    await act(async () => {
      renderAuthProvider();
      // getInitialURL の promise chain を消化
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mocks.setSession).toHaveBeenCalledWith({
      access_token: "at-cold",
      refresh_token: "rt-cold",
    });
  });

  it("initial URL が null のときは setSession は呼ばれない", async () => {
    mocks.setInitialUrl(null);

    await act(async () => {
      renderAuthProvider();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mocks.setSession).not.toHaveBeenCalled();
  });
});

describe("[DLH-02] warm start — addEventListener 'url' イベントで setSession を呼ぶ", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.oauthGuardActive = false;
    mocks.setInitialUrl(null);
    mocks.setSession.mockResolvedValue({ error: null });
    setupImmediateInitialSession({ user: { id: "uid-1" }, access_token: "tok" });
  });

  it("warm link イベントで access_token + refresh_token があれば setSession が呼ばれる", async () => {
    const callbackUrl =
      "swimhub://auth/callback#access_token=at-warm&refresh_token=rt-warm";

    await act(async () => {
      renderAuthProvider();
      await new Promise((r) => setTimeout(r, 0));
    });

    await act(async () => {
      mocks.fireLinkingUrl(callbackUrl);
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mocks.setSession).toHaveBeenCalledWith({
      access_token: "at-warm",
      refresh_token: "rt-warm",
    });
  });
});

describe("[DLH-03] cleanup — unmount 時に Linking subscription が remove される", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.oauthGuardActive = false;
    mocks.setInitialUrl(null);
    setupImmediateInitialSession();
  });

  it("unmount すると addEventListener の remove が呼ばれる", async () => {
    let unmount: () => void;

    await act(async () => {
      const result = renderAuthProvider();
      unmount = result.unmount;
      await new Promise((r) => setTimeout(r, 0));
    });

    act(() => {
      unmount();
    });

    expect(mocks.linkingSubscriptionRemove).toHaveBeenCalled();
  });
});

describe("[DLH-04] oauthSessionGuard — active=true のとき setSession が呼ばれない", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // テスト間汚染を防ぐため、各テスト前に guard を明示的に false にリセット
    mocks.oauthGuardActive = false;
    mocks.setInitialUrl(null);
    setupImmediateInitialSession({ user: { id: "uid-1" }, access_token: "tok" });
  });

  it("oauthSessionGuard.active が true のときは warm link でも setSession が呼ばれない", async () => {
    mocks.oauthGuardActive = true;

    await act(async () => {
      renderAuthProvider();
      await new Promise((r) => setTimeout(r, 0));
    });

    await act(async () => {
      mocks.fireLinkingUrl(
        "swimhub://auth/callback#access_token=at-oauth&refresh_token=rt-oauth",
      );
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mocks.setSession).not.toHaveBeenCalled();
  });
});

describe("[DLH-05] error 経路 — URL に #error= があるとき Alert が表示され setSession は呼ばれない", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.oauthGuardActive = false;
    mocks.setInitialUrl(null);
    setupImmediateInitialSession();
  });

  it("error フラグメントの URL では Alert.alert が呼ばれる", async () => {
    await act(async () => {
      renderAuthProvider();
      await new Promise((r) => setTimeout(r, 0));
    });

    await act(async () => {
      mocks.fireLinkingUrl("swimhub://auth/callback#error=access_denied");
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mocks.alertFn).toHaveBeenCalled();
    expect(mocks.setSession).not.toHaveBeenCalled();
  });

  it("error フラグメントの URL では Alert の第2引数に tokenExpired メッセージが含まれる", async () => {
    await act(async () => {
      renderAuthProvider();
      await new Promise((r) => setTimeout(r, 0));
    });

    await act(async () => {
      mocks.fireLinkingUrl("swimhub://auth/callback#error=otp_expired");
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mocks.alertFn).toHaveBeenCalled();
    const [, message] = mocks.alertFn.mock.calls[0] as [string, string];
    // i18n モックが ja.json を返すので「認証トークンの有効期限が切れました」
    expect(message).toContain("有効期限");
  });
});

describe("[DLH-06] tokens missing 経路 — access_token なし refresh_token なし で Alert", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.oauthGuardActive = false;
    mocks.setInitialUrl(null);
    setupImmediateInitialSession();
  });

  it("access_token が空文字のとき Alert が呼ばれ setSession は呼ばれない", async () => {
    await act(async () => {
      renderAuthProvider();
      await new Promise((r) => setTimeout(r, 0));
    });

    await act(async () => {
      // isEmailAuthCallback は access_token キーの存在で通過する (値は問わない)
      // extractTokensFromUrl は "" を返し、"" は falsy → tokensNotReceived 分岐
      mocks.fireLinkingUrl("swimhub://auth/callback#access_token=");
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mocks.alertFn).toHaveBeenCalled();
    expect(mocks.setSession).not.toHaveBeenCalled();
  });
});

describe("[DLH-07] setSession error — setSession が error を返すとき Alert が表示される", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.oauthGuardActive = false;
    mocks.setInitialUrl(null);
    mocks.setSession.mockResolvedValue({ error: { message: "Invalid JWT" } });
    setupImmediateInitialSession();
  });

  it("setSession が error を返すとき Alert.alert が呼ばれる", async () => {
    await act(async () => {
      renderAuthProvider();
      await new Promise((r) => setTimeout(r, 0));
    });

    await act(async () => {
      mocks.fireLinkingUrl(
        "swimhub://auth/callback#access_token=at&refresh_token=rt",
      );
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mocks.setSession).toHaveBeenCalled();
    expect(mocks.alertFn).toHaveBeenCalled();
    const [, message] = mocks.alertFn.mock.calls[0] as [string, string];
    // auth.supabaseErrors.invalidToken = 「認証トークンが無効です」
    expect(message).toContain("無効");
  });
});

describe("[DLH-08] 無関係 URL は無視される", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.oauthGuardActive = false;
    mocks.setInitialUrl(null);
    setupImmediateInitialSession();
  });

  it("https:// の URL は setSession も Alert も呼ばない", async () => {
    await act(async () => {
      renderAuthProvider();
      await new Promise((r) => setTimeout(r, 0));
    });

    await act(async () => {
      mocks.fireLinkingUrl(
        "https://swim-hub.app/auth/callback#access_token=at&refresh_token=rt",
      );
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mocks.setSession).not.toHaveBeenCalled();
    expect(mocks.alertFn).not.toHaveBeenCalled();
  });

  it("swimhub:// だが /auth/callback でない URL は無視される", async () => {
    await act(async () => {
      renderAuthProvider();
      await new Promise((r) => setTimeout(r, 0));
    });

    await act(async () => {
      mocks.fireLinkingUrl("swimhub://practice/123");
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mocks.setSession).not.toHaveBeenCalled();
    expect(mocks.alertFn).not.toHaveBeenCalled();
  });
});

describe("[DLH-09] getInitialURL reject — Promise が reject してもクラッシュしない", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.oauthGuardActive = false;
    setupImmediateInitialSession({ user: { id: "uid-1" }, access_token: "tok" });
  });

  it("getInitialURL が reject しても setSession / Alert は呼ばれず、アプリがクラッシュしない", async () => {
    // Linking.getInitialURL の Promise を reject させる (ネットワーク/権限エラー想定)
    mocks.getInitialURL.mockRejectedValueOnce(new Error("Linking unavailable"));

    await act(async () => {
      renderAuthProvider();
      await new Promise((r) => setTimeout(r, 0));
    });

    // reject は .catch() で握り潰されるので setSession / Alert は呼ばれない
    expect(mocks.setSession).not.toHaveBeenCalled();
    expect(mocks.alertFn).not.toHaveBeenCalled();
  });

  it("getInitialURL が reject した後も warm link は正常に動作する", async () => {
    mocks.getInitialURL.mockRejectedValueOnce(new Error("Linking unavailable"));
    mocks.setSession.mockResolvedValue({ error: null });

    await act(async () => {
      renderAuthProvider();
      await new Promise((r) => setTimeout(r, 0));
    });

    // reject 後でも warm link ハンドラは動作する
    await act(async () => {
      mocks.fireLinkingUrl(
        "swimhub://auth/callback#access_token=at-warm&refresh_token=rt-warm",
      );
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mocks.setSession).toHaveBeenCalledWith({
      access_token: "at-warm",
      refresh_token: "rt-warm",
    });
  });
});
