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
 *
 * --- Round2 (Reviewer Critical #2 対応): カレンダー連携コールドスタート復旧 統合テスト ---
 * [DLH-10] 正常復旧 — 永続フラグあり + flow=calendar-connect + provider_refresh_token あり
 *          → saveGoogleCalendarRefreshToken が呼ばれ、成功 Alert が表示される
 * [DLH-11] 誤爆防止 — 永続フラグあり(TTL内) だが無関係なメール確認 URL (flow なし・
 *          provider_refresh_token なし) → 復旧処理に入らず、通常の setSession のみ実行され、
 *          カレンダー関連の Alert / API 呼び出しは発生しない
 * [DLH-12] token 欠落 — 永続フラグあり + flow=calendar-connect だが refresh_token なし
 *          → googleCalendarPermissionDenied の Alert が表示され、保存 API は呼ばれない
 * [DLH-13] 保存 API 失敗 — 正常復旧条件は揃うが saveGoogleCalendarRefreshToken が失敗を返す
 *          → エラー Alert が表示され、リトライやフラグ復活は起きない (再度 consume しても false)
 * [DLH-14] Warning3 — 復旧中の #error= コールバックは googleCalendarPermissionDenied を表示し、
 *          フラグが無い通常のメール確認の #error= は従来どおり tokenExpired を表示する (回帰防止)
 */

import React from "react";
import { describe, it, vi, beforeEach, expect } from "vitest";
import { render, act } from "@testing-library/react";
import AsyncStorage from "@react-native-async-storage/async-storage";

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

    // Googleカレンダー連携復旧 (Round2)
    saveGoogleCalendarRefreshToken: vi.fn(),
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

vi.mock("@/lib/google-calendar-api", () => ({
  saveGoogleCalendarRefreshToken: mocks.saveGoogleCalendarRefreshToken,
}));

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

// =============================================================================
// Round2: Googleカレンダー連携コールドスタート復旧 統合テスト
// (Reviewer Critical #2 — 誤爆判定を「永続フラグ AND (flow クエリ OR provider_refresh_token)」
//  に強化したことの検証。AsyncStorage のデフォルトモックは getItem→null のため、
//  「フラグあり」を再現するケースでは明示的に mockResolvedValueOnce で上書きする)
// =============================================================================

describe("[DLH-10] 正常復旧 — フラグあり + flow=calendar-connect + provider_refresh_token あり", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.oauthGuardActive = false;
    mocks.setInitialUrl(null);
    mocks.setSession.mockResolvedValue({ error: null });
    mocks.saveGoogleCalendarRefreshToken.mockResolvedValue({ success: true });
    setupImmediateInitialSession();
  });

  it("saveGoogleCalendarRefreshToken が呼ばれ、成功 Alert が表示される", async () => {
    // 永続フラグが「有効期限内」で存在する状態を再現する
    vi.mocked(AsyncStorage.getItem).mockResolvedValueOnce(String(Date.now()));

    await act(async () => {
      renderAuthProvider();
      await new Promise((r) => setTimeout(r, 0));
    });

    await act(async () => {
      mocks.fireLinkingUrl(
        "swimhub://auth/callback?flow=calendar-connect#access_token=at-recover&refresh_token=rt-recover&provider_refresh_token=prt-recover",
      );
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mocks.setSession).toHaveBeenCalledWith({
      access_token: "at-recover",
      refresh_token: "rt-recover",
    });
    expect(mocks.saveGoogleCalendarRefreshToken).toHaveBeenCalledWith(
      "at-recover",
      "prt-recover",
    );
    expect(mocks.alertFn).toHaveBeenCalled();
    const [title, message] = mocks.alertFn.mock.calls[0] as [string, string];
    expect(title).toBe("お知らせ");
    expect(message).toBe("Googleカレンダー連携が完了しました");
  });
});

describe("[DLH-11] 誤爆防止 — フラグあり(TTL内) だが無関係なメール確認 URL", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.oauthGuardActive = false;
    mocks.setInitialUrl(null);
    mocks.setSession.mockResolvedValue({ error: null });
    setupImmediateInitialSession();
  });

  it("flow クエリも provider_refresh_token も無いメール確認 URL では復旧処理に入らず、通常の setSession のみ実行される", async () => {
    // 別の中断済みカレンダー連携から残った、TTL内の永続フラグを再現する
    vi.mocked(AsyncStorage.getItem).mockResolvedValueOnce(String(Date.now()));

    await act(async () => {
      renderAuthProvider();
      await new Promise((r) => setTimeout(r, 0));
    });

    await act(async () => {
      mocks.fireLinkingUrl(
        "swimhub://auth/callback#access_token=at-mail&refresh_token=rt-mail",
      );
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mocks.setSession).toHaveBeenCalledWith({
      access_token: "at-mail",
      refresh_token: "rt-mail",
    });
    // 誤爆していれば saveGoogleCalendarRefreshToken 呼び出しや成功/失敗 Alert が発生するはずだが、
    // 通常のメール確認完了時は何の Alert も出さない (onAuthStateChange 側に処理を委ねる)
    expect(mocks.saveGoogleCalendarRefreshToken).not.toHaveBeenCalled();
    expect(mocks.alertFn).not.toHaveBeenCalled();
  });
});

describe("[DLH-12] token 欠落 — フラグあり + flow=calendar-connect だが refresh_token なし", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.oauthGuardActive = false;
    mocks.setInitialUrl(null);
    setupImmediateInitialSession();
  });

  it("googleCalendarPermissionDenied の Alert が表示され、保存 API は呼ばれない", async () => {
    vi.mocked(AsyncStorage.getItem).mockResolvedValueOnce(String(Date.now()));

    await act(async () => {
      renderAuthProvider();
      await new Promise((r) => setTimeout(r, 0));
    });

    await act(async () => {
      // access_token はあるが refresh_token が無いため setSession 分岐に入らない
      mocks.fireLinkingUrl("swimhub://auth/callback?flow=calendar-connect#access_token=at-only");
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mocks.setSession).not.toHaveBeenCalled();
    expect(mocks.saveGoogleCalendarRefreshToken).not.toHaveBeenCalled();
    expect(mocks.alertFn).toHaveBeenCalled();
    const [, message] = mocks.alertFn.mock.calls[0] as [string, string];
    // auth.mobile.googleCalendarPermissionDenied (ja.json 実値)
    expect(message).toContain("Googleカレンダーのアクセス権限が取得できませんでした");
  });
});

describe("[DLH-13] 保存 API 失敗 — エラー Alert のみでリトライ・フラグ復活が無い", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.oauthGuardActive = false;
    mocks.setInitialUrl(null);
    mocks.setSession.mockResolvedValue({ error: null });
    setupImmediateInitialSession();
  });

  it("保存 API が失敗を返すとローカライズ済みエラー Alert が表示される (POST は1回のみ)", async () => {
    vi.mocked(AsyncStorage.getItem).mockResolvedValueOnce(String(Date.now()));
    mocks.saveGoogleCalendarRefreshToken.mockResolvedValueOnce({
      success: false,
      error: "quota exceeded for calendar api",
    });

    await act(async () => {
      renderAuthProvider();
      await new Promise((r) => setTimeout(r, 0));
    });

    await act(async () => {
      mocks.fireLinkingUrl(
        "swimhub://auth/callback?flow=calendar-connect#access_token=at-fail&refresh_token=rt-fail&provider_refresh_token=prt-fail",
      );
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mocks.saveGoogleCalendarRefreshToken).toHaveBeenCalledTimes(1);
    expect(mocks.alertFn).toHaveBeenCalledTimes(1);
    const [title, message] = mocks.alertFn.mock.calls[0] as [string, string];
    expect(title).toBe("エラー");
    // localizeAuthError が未知のメッセージを genericWithDetail 経由でラップする
    expect(message).toBe("認証エラーが発生しました: quota exceeded for calendar api");
  });

  it("フラグは consume 済みのため、直後に無関係なディープリンクが来ても復旧処理は再発火しない", async () => {
    vi.mocked(AsyncStorage.getItem)
      .mockResolvedValueOnce(String(Date.now())) // 1回目 (このテストの復旧フロー)
      .mockResolvedValueOnce(null); // 2回目以降はフラグ無し (consume 済み)
    mocks.saveGoogleCalendarRefreshToken.mockResolvedValueOnce({
      success: false,
      error: "quota exceeded for calendar api",
    });

    await act(async () => {
      renderAuthProvider();
      await new Promise((r) => setTimeout(r, 0));
    });

    await act(async () => {
      mocks.fireLinkingUrl(
        "swimhub://auth/callback?flow=calendar-connect#access_token=at-fail&refresh_token=rt-fail&provider_refresh_token=prt-fail",
      );
      await new Promise((r) => setTimeout(r, 0));
    });

    mocks.alertFn.mockClear();
    mocks.saveGoogleCalendarRefreshToken.mockClear();

    await act(async () => {
      // 通常のメール確認リンクが直後に届いても、フラグは既に消費済みなので
      // カレンダー復旧処理は再実行されない
      mocks.fireLinkingUrl(
        "swimhub://auth/callback#access_token=at-later&refresh_token=rt-later",
      );
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mocks.saveGoogleCalendarRefreshToken).not.toHaveBeenCalled();
    expect(mocks.alertFn).not.toHaveBeenCalled();
  });
});

describe("[DLH-14] Warning3 — 復旧中に #error= が付いたコールバックを受けた場合", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.oauthGuardActive = false;
    mocks.setInitialUrl(null);
    setupImmediateInitialSession();
  });

  it("フラグあり + flow=calendar-connect + error の場合、tokenExpired ではなく googleCalendarPermissionDenied が表示される", async () => {
    vi.mocked(AsyncStorage.getItem).mockResolvedValueOnce(String(Date.now()));

    await act(async () => {
      renderAuthProvider();
      await new Promise((r) => setTimeout(r, 0));
    });

    await act(async () => {
      mocks.fireLinkingUrl("swimhub://auth/callback?flow=calendar-connect#error=access_denied");
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mocks.setSession).not.toHaveBeenCalled();
    expect(mocks.saveGoogleCalendarRefreshToken).not.toHaveBeenCalled();
    expect(mocks.alertFn).toHaveBeenCalled();
    const [, message] = mocks.alertFn.mock.calls[0] as [string, string];
    expect(message).toContain("Googleカレンダーのアクセス権限が取得できませんでした");
    expect(message).not.toContain("有効期限");
  });

  it("フラグなしの通常メール確認で #error= を受けた場合は、従来どおり tokenExpired が表示される (回帰防止)", async () => {
    // AsyncStorage.getItem のデフォルト (null) を使用 = フラグ無し
    await act(async () => {
      renderAuthProvider();
      await new Promise((r) => setTimeout(r, 0));
    });

    await act(async () => {
      mocks.fireLinkingUrl("swimhub://auth/callback#error=access_denied");
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mocks.alertFn).toHaveBeenCalled();
    const [, message] = mocks.alertFn.mock.calls[0] as [string, string];
    expect(message).toContain("有効期限");
  });
});
