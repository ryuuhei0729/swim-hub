/**
 * AuthProvider テスト
 *
 * Sprint Contract: モバイル画像・動画アップロード修正
 * 対象: getAccessToken() ヘルパー追加 および token リフレッシュ動作
 *
 * 検証観点:
 * [AP-01] getAccessToken() — 有効なセッションがある場合に access_token を返す
 * [AP-02] getAccessToken() — セッションが期限切れの場合に refreshSession() を呼んで新しい access_token を返す
 * [AP-03] getAccessToken() — セッションが null の場合に null を返す
 * [AP-04] getAccessToken() — 内部で例外が投げられた場合 null を返す (クラッシュしない)
 * [AP-05] useAuth — session が onAuthStateChange に応じて更新される
 * [AP-06] useAuth — TOKEN_REFRESHED イベントで session が新しいセッションに更新される
 * [AP-07] updateOnboardingCompleted — 正常系
 * [AP-08] updateOnboardingCompleted — user null のとき Error を返す
 * [AP-09] updateOnboardingCompleted — DB 更新失敗時に Error を返す
 * [AP-10] オンボーディング状態 — 圏外・タイムアウトで取得できなくても完了済みの利用者を
 *         オンボーディングへ送らない (端末キャッシュを使い、電波が戻ったら問い合わせ直す)
 * [AP-11] 保護者アカウントの判定 — is_guardian_account RPC の結果で決め、圏外では端末の値を使う
 * [AP-12] ログアウト — 保護者アカウントはこの端末だけログアウトする (共有アカウントのため)
 */

import React from "react";
import { describe, it, vi, beforeEach, expect } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";

// expo-auth-session が expo-modules-core の CodedError を必要とするが、
// vitest.setup.ts のモックに含まれていない。ここで補完する。
// AuthProvider → google-auth.ts → expo-auth-session → expo-modules-core の順で
// import されるため、CodedError が解決できないとクラッシュする。
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

// expo-web-browser を stub (useGoogleAuth が import)
vi.mock("expo-web-browser", () => ({
  maybeCompleteAuthSession: vi.fn(),
  openAuthSessionAsync: vi.fn(),
}));

// vi.hoisted でモック関数を先に定義（hoisting 問題を回避）
const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  refreshSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  fromFn: vi.fn(),
  rpcFn: vi.fn(
    async (_fn: string): Promise<{ data: boolean | null; error: unknown }> => ({
      data: false,
      error: null,
    }),
  ),
  signOut: vi.fn(async () => ({ error: null })),
  initRevenueCat: vi.fn(),
  loginRevenueCat: vi.fn(),
  logoutRevenueCat: vi.fn(),
  addCustomerInfoListener: vi.fn(() => () => {}),
  getQueryClient: vi.fn(() => ({
    clear: vi.fn(),
    invalidateQueries: vi.fn(),
  })),
  // Linking: AuthProvider のディープリンクハンドラが使用する
  getInitialURL: vi.fn(async () => null),
  addEventListener: vi.fn(() => ({ remove: vi.fn() })),
}));

// supabase クライアントモック
vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: mocks.getSession,
      refreshSession: mocks.refreshSession,
      onAuthStateChange: mocks.onAuthStateChange,
      signOut: mocks.signOut,
    },
    from: mocks.fromFn,
    rpc: mocks.rpcFn,
  },
  // signOut の後片付けで呼ばれる
  clearMmkvCaches: vi.fn(),
}));

// react-native: Linking を AuthProvider のディープリンクハンドラ用に追加
// (__mocks__/react-native.ts の alias に加えて Linking を補完)
vi.mock("react-native", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("react-native");
  return {
    ...actual,
    Linking: {
      getInitialURL: mocks.getInitialURL,
      addEventListener: mocks.addEventListener,
    },
  };
});

// RevenueCat モック
vi.mock("@/lib/revenucat", () => ({
  initRevenueCat: mocks.initRevenueCat,
  loginRevenueCat: mocks.loginRevenueCat,
  logoutRevenueCat: mocks.logoutRevenueCat,
  addCustomerInfoListener: mocks.addCustomerInfoListener,
}));

// QueryProvider モック
vi.mock("@/providers/QueryProvider", () => ({
  getQueryClient: mocks.getQueryClient,
  clearQueryCache: () => mocks.getQueryClient().clear(),
  bindQueryCacheOwner: vi.fn(),
}));

import AsyncStorage from "@react-native-async-storage/async-storage";
import { onlineManager } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "@/contexts/AuthProvider";

// --------------------------------------------------------------------------
// テスト用ユーティリティコンポーネント
// --------------------------------------------------------------------------

/**
 * getAccessToken() を呼び出し結果を onResult に渡すコンポーネント
 */
const GetAccessTokenConsumer: React.FC<{ onResult: (token: string | null) => void }> = ({
  onResult,
}) => {
  const { getAccessToken } = useAuth();
  return (
    <button
      onClick={async () => {
        const token = await getAccessToken();
        onResult(token);
      }}
    >
      get-token
    </button>
  );
};

/**
 * updateOnboardingCompleted() を呼び出すコンポーネント
 */
const UpdateOnboardingConsumer: React.FC<{
  value: boolean;
  onResult: (result: { error: Error | null }) => void;
}> = ({ value, onResult }) => {
  const { updateOnboardingCompleted } = useAuth();
  return (
    <button
      onClick={async () => {
        const result = await updateOnboardingCompleted(value);
        onResult(result);
      }}
    >
      update-onboarding
    </button>
  );
};

/**
 * session.access_token を表示するコンポーネント
 */
const SessionDisplay: React.FC = () => {
  const { session } = useAuth();
  return <span data-testid="token">{session?.access_token ?? "none"}</span>;
};

/** AuthProvider を被せてコンポーネントをレンダリングするユーティリティ */
function renderWithAuth(children: React.ReactNode) {
  return render(<AuthProvider>{children}</AuthProvider>);
}

/**
 * onAuthStateChange のコールバックを捕捉して後からイベントを発火できるセットアップ
 */
function setupAuthStateChangeMock() {
  let capturedCallback: ((event: string, session: unknown) => void) | null = null;

  mocks.onAuthStateChange.mockImplementation(
    (callback: (event: string, session: unknown) => void) => {
      capturedCallback = callback;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    },
  );

  return {
    fireAuthEvent: (event: string, session: unknown) => {
      capturedCallback?.(event, session);
    },
  };
}

/** デフォルトの from() モック設定（select().eq().single() チェーン用） */
function setupDefaultFromMock(overrides?: {
  update?: ReturnType<typeof vi.fn>;
}) {
  const defaultUpdate = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ error: null }),
  });

  mocks.fromFn.mockReturnValue({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi
      .fn()
      .mockResolvedValue({ data: { onboarding_completed: true }, error: null }),
    update: overrides?.update ?? defaultUpdate,
  });
}

/** INITIAL_SESSION を即発火させる onAuthStateChange のデフォルト設定 */
function setupImmediateInitialSession(
  session: unknown = { user: { id: "user-1" }, access_token: "initial-token" },
) {
  mocks.onAuthStateChange.mockImplementation(
    (cb: (event: string, session: unknown) => void) => {
      cb("INITIAL_SESSION", session);
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    },
  );
}

// --------------------------------------------------------------------------
// テスト本体
// --------------------------------------------------------------------------

describe("[AP-01] getAccessToken() — 有効なセッション", () => {
  beforeEach(() => {
    setupImmediateInitialSession();
    setupDefaultFromMock();
  });

  it("supabase.auth.getSession() が有効な access_token を返すとき、その access_token を返す", async () => {
    mocks.getSession.mockResolvedValueOnce({
      data: { session: { access_token: "valid-token-123" } },
    });

    const onResult = vi.fn();
    renderWithAuth(<GetAccessTokenConsumer onResult={onResult} />);

    await act(async () => {
      screen.getByText("get-token").click();
    });

    expect(onResult).toHaveBeenCalledWith("valid-token-123");
    // refreshSession は呼ばれないこと
    expect(mocks.refreshSession).not.toHaveBeenCalled();
  });
});

describe("[AP-02] getAccessToken() — 期限切れセッション (リフレッシュ)", () => {
  beforeEach(() => {
    setupImmediateInitialSession();
    setupDefaultFromMock();
  });

  it("getSession() が access_token null のとき refreshSession() が呼ばれ、新しい access_token が返る", async () => {
    mocks.getSession.mockResolvedValueOnce({
      data: { session: { access_token: null } },
    });
    mocks.refreshSession.mockResolvedValueOnce({
      data: { session: { access_token: "refreshed-token-456" } },
    });

    const onResult = vi.fn();
    renderWithAuth(<GetAccessTokenConsumer onResult={onResult} />);

    await act(async () => {
      screen.getByText("get-token").click();
    });

    expect(mocks.refreshSession).toHaveBeenCalled();
    expect(onResult).toHaveBeenCalledWith("refreshed-token-456");
  });

  it("getSession() が session=null のとき refreshSession() が呼ばれ、新しい access_token が返る", async () => {
    mocks.getSession.mockResolvedValueOnce({ data: { session: null } });
    mocks.refreshSession.mockResolvedValueOnce({
      data: { session: { access_token: "brand-new-token" } },
    });

    const onResult = vi.fn();
    renderWithAuth(<GetAccessTokenConsumer onResult={onResult} />);

    await act(async () => {
      screen.getByText("get-token").click();
    });

    expect(onResult).toHaveBeenCalledWith("brand-new-token");
  });
});

describe("[AP-03] getAccessToken() — セッション完全 null", () => {
  beforeEach(() => {
    setupImmediateInitialSession(null);
    setupDefaultFromMock();
  });

  it("getSession() が null を返し refreshSession() も null session を返すとき null を返す", async () => {
    mocks.getSession.mockResolvedValueOnce({ data: { session: null } });
    mocks.refreshSession.mockResolvedValueOnce({ data: { session: null } });

    const onResult = vi.fn();
    renderWithAuth(<GetAccessTokenConsumer onResult={onResult} />);

    await act(async () => {
      screen.getByText("get-token").click();
    });

    expect(onResult).toHaveBeenCalledWith(null);
  });
});

describe("[AP-04] getAccessToken() — 内部例外", () => {
  beforeEach(() => {
    setupImmediateInitialSession(null);
    setupDefaultFromMock();
  });

  it("getSession() が例外をスローしても getAccessToken() は null を返し、アプリがクラッシュしない", async () => {
    mocks.getSession.mockRejectedValueOnce(new Error("Network error"));

    const onResult = vi.fn();
    renderWithAuth(<GetAccessTokenConsumer onResult={onResult} />);

    await act(async () => {
      screen.getByText("get-token").click();
    });

    // try/catch で null を返す実装になっているので null が返る
    expect(onResult).toHaveBeenCalledWith(null);
  });

  it("refreshSession() が例外をスローしても getAccessToken() は null を返す", async () => {
    mocks.getSession.mockResolvedValueOnce({ data: { session: null } });
    mocks.refreshSession.mockRejectedValueOnce(new Error("Refresh network error"));

    const onResult = vi.fn();
    renderWithAuth(<GetAccessTokenConsumer onResult={onResult} />);

    await act(async () => {
      screen.getByText("get-token").click();
    });

    expect(onResult).toHaveBeenCalledWith(null);
  });
});

describe("[AP-05] useAuth — session が onAuthStateChange に応じて更新される", () => {
  it("onAuthStateChange が SIGNED_IN イベントを発行すると authState.session.access_token が更新される", async () => {
    vi.clearAllMocks();
    const { fireAuthEvent } = setupAuthStateChangeMock();
    setupDefaultFromMock();

    renderWithAuth(<SessionDisplay />);

    await act(async () => {
      fireAuthEvent("SIGNED_IN", {
        user: { id: "user-1" },
        access_token: "signed-in-token",
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId("token").textContent).toBe("signed-in-token");
    });
  });
});

describe("[AP-06] useAuth — TOKEN_REFRESHED イベント", () => {
  it("TOKEN_REFRESHED イベントが来ると authState.session が新しいセッションに更新される", async () => {
    vi.clearAllMocks();
    const { fireAuthEvent } = setupAuthStateChangeMock();
    setupDefaultFromMock();

    renderWithAuth(<SessionDisplay />);

    // 初期ログイン
    await act(async () => {
      fireAuthEvent("SIGNED_IN", { user: { id: "user-1" }, access_token: "old-token" });
    });

    // TOKEN_REFRESHED でトークン更新
    await act(async () => {
      fireAuthEvent("TOKEN_REFRESHED", {
        user: { id: "user-1" },
        access_token: "new-refreshed-token",
      });
    });

    await waitFor(() => {
      expect(screen.getByTestId("token").textContent).toBe("new-refreshed-token");
    });
  });
});

describe("[AP-07] updateOnboardingCompleted — 正常系", () => {
  beforeEach(() => {
    setupImmediateInitialSession({ user: { id: "user-1" }, access_token: "tok" });
  });

  it("value=true を渡すと supabase.from('users').update({ onboarding_completed: true }) が呼ばれる", async () => {
    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
    setupDefaultFromMock({ update: mockUpdate });

    const onResult = vi.fn();
    renderWithAuth(<UpdateOnboardingConsumer value={true} onResult={onResult} />);

    await act(async () => {
      screen.getByText("update-onboarding").click();
    });

    expect(mocks.fromFn).toHaveBeenCalledWith("users");
    expect(mockUpdate).toHaveBeenCalledWith({ onboarding_completed: true });
  });

  it("DB 更新成功後に { error: null } を返す", async () => {
    setupDefaultFromMock();

    const onResult = vi.fn();
    renderWithAuth(<UpdateOnboardingConsumer value={true} onResult={onResult} />);

    await act(async () => {
      screen.getByText("update-onboarding").click();
    });

    await waitFor(() => {
      expect(onResult).toHaveBeenCalledWith({ error: null });
    });
  });
});

describe("[AP-08] updateOnboardingCompleted — user null", () => {
  it("authState.user が null のとき supabase は呼ばれず { error: Error('User not authenticated') } を返す", async () => {
    vi.clearAllMocks();
    // SIGNED_OUT → user が null
    setupImmediateInitialSession(null);
    setupDefaultFromMock();

    const updateSpy = vi.fn();
    mocks.fromFn.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      update: updateSpy,
    });

    const onResult = vi.fn();
    renderWithAuth(<UpdateOnboardingConsumer value={true} onResult={onResult} />);

    await act(async () => {
      screen.getByText("update-onboarding").click();
    });

    await waitFor(() => {
      expect(onResult).toHaveBeenCalled();
      const result = onResult.mock.calls[0]![0] as { error: Error | null }; // 直前の toHaveBeenCalled で存在は保証済み
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error?.message).toContain("User not authenticated");
    });

    // update は呼ばれない
    expect(updateSpy).not.toHaveBeenCalled();
  });
});

describe("[AP-09] updateOnboardingCompleted — DB 更新失敗", () => {
  beforeEach(() => {
    setupImmediateInitialSession({ user: { id: "user-1" }, access_token: "tok" });
  });

  it("supabase.from().update() がエラーを返すとき { error: Error(message) } を返す", async () => {
    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: { message: "DB connection failed" } }),
    });
    setupDefaultFromMock({ update: mockUpdate });

    const onResult = vi.fn();
    renderWithAuth(<UpdateOnboardingConsumer value={true} onResult={onResult} />);

    await act(async () => {
      screen.getByText("update-onboarding").click();
    });

    await waitFor(() => {
      expect(onResult).toHaveBeenCalled();
      const result = onResult.mock.calls[0]![0] as { error: Error | null }; // 直前の toHaveBeenCalled で存在は保証済み
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error?.message).toContain("DB connection failed");
    });
  });
});

// --------------------------------------------------------------------------
// [AP-10] オンボーディング状態 — 通信できないとき
// --------------------------------------------------------------------------

/** onboardingCompleted を表示するコンポーネント */
const OnboardingDisplay: React.FC = () => {
  const { onboardingCompleted } = useAuth();
  return <span data-testid="onboarding">{String(onboardingCompleted)}</span>;
};

/** postgrest-js が fetch の失敗を包んで返す形 (Error ではないプレーンオブジェクト) */
const NETWORK_FAILURE = {
  message: "TypeError: Network request failed",
  details: "",
  hint: "",
  code: "",
};

/**
 * users.select().eq().single() の結果を順に差し替える。
 * サブスクリプション取得 (user_subscriptions) も同じチェーンを使うため、テーブル名で振り分ける。
 */
function setupSingleResult(...results: Array<{ data: unknown; error: unknown }>) {
  const single = vi.fn();
  for (const result of results) single.mockResolvedValueOnce(result);
  single.mockResolvedValue(results[results.length - 1]);
  const chain = (singleFn: ReturnType<typeof vi.fn>) => ({
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: singleFn,
    update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
  });
  const usersChain = chain(single);
  const otherChain = chain(vi.fn().mockResolvedValue({ data: null, error: null }));
  mocks.fromFn.mockImplementation((table: string) => (table === "users" ? usersChain : otherChain));
}

/** 端末に覚えている onboarding_completed を差し替える ("1" / "0" / null) */
function setupCachedOnboarding(value: "1" | "0" | null) {
  vi.mocked(AsyncStorage.getItem).mockImplementation(async (key: string) =>
    key === "onboarding-completed:user-1" ? value : null,
  );
}

describe("[AP-10] オンボーディング状態 — 通信できないとき", () => {
  beforeEach(() => {
    onlineManager.setOnline(true);
    vi.mocked(AsyncStorage.setItem).mockClear();
    setupImmediateInitialSession();
  });

  it("圏外で取得に失敗しても、完了済みを覚えていれば完了として扱う", async () => {
    setupCachedOnboarding("1");
    setupSingleResult({ data: null, error: NETWORK_FAILURE });

    renderWithAuth(<OnboardingDisplay />);

    await waitFor(() => expect(screen.getByTestId("onboarding").textContent).toBe("true"));
  });

  it("覚えている値が無くても、通信エラーなら未完了扱いにせず完了として扱う", async () => {
    setupCachedOnboarding(null);
    setupSingleResult({ data: null, error: NETWORK_FAILURE });

    renderWithAuth(<OnboardingDisplay />);

    await waitFor(() => expect(screen.getByTestId("onboarding").textContent).toBe("true"));
  });

  it("未完了を覚えていれば、通信エラーでも未完了のまま", async () => {
    setupCachedOnboarding("0");
    setupSingleResult({ data: null, error: NETWORK_FAILURE });

    renderWithAuth(<OnboardingDisplay />);

    await waitFor(() => expect(screen.getByTestId("onboarding").textContent).toBe("false"));
  });

  it("タイムアウトも通信エラーとして扱う", async () => {
    setupCachedOnboarding("1");
    setupSingleResult({
      data: null,
      error: { message: "TimeoutError: Network request timed out", code: "" },
    });

    renderWithAuth(<OnboardingDisplay />);

    await waitFor(() => expect(screen.getByTestId("onboarding").textContent).toBe("true"));
  });

  it("通信以外の失敗 (行が無い等) は従来どおり未完了として扱う", async () => {
    setupCachedOnboarding("1");
    setupSingleResult({ data: null, error: { message: "no rows", code: "PGRST116" } });

    renderWithAuth(<OnboardingDisplay />);

    await waitFor(() => expect(screen.getByTestId("onboarding").textContent).toBe("false"));
  });

  it("取得できた値を端末に覚える", async () => {
    setupCachedOnboarding(null);
    setupSingleResult({ data: { onboarding_completed: true }, error: null });

    renderWithAuth(<OnboardingDisplay />);

    await waitFor(() => expect(screen.getByTestId("onboarding").textContent).toBe("true"));
    await waitFor(() =>
      expect(AsyncStorage.setItem).toHaveBeenCalledWith("onboarding-completed:user-1", "1"),
    );
  });

  it("圏外で確定できなかった場合、電波が戻ったら問い合わせ直してサーバーの値に合わせる", async () => {
    setupCachedOnboarding(null);
    setupSingleResult(
      { data: null, error: NETWORK_FAILURE },
      { data: { onboarding_completed: false }, error: null },
    );

    renderWithAuth(<OnboardingDisplay />);
    await waitFor(() => expect(screen.getByTestId("onboarding").textContent).toBe("true"));

    await act(async () => {
      onlineManager.setOnline(false);
      onlineManager.setOnline(true);
    });

    await waitFor(() => expect(screen.getByTestId("onboarding").textContent).toBe("false"));
  });
});

// --------------------------------------------------------------------------
// [AP-11] 保護者アカウントの判定
// --------------------------------------------------------------------------

/** isGuardian を表示するコンポーネント */
const GuardianDisplay: React.FC = () => {
  const { isGuardian } = useAuth();
  return <span data-testid="guardian">{String(isGuardian)}</span>;
};

/** 端末に覚えている「保護者かどうか」を差し替える ("1" / "0" / null) */
function setupCachedGuardian(value: "1" | "0" | null) {
  vi.mocked(AsyncStorage.getItem).mockImplementation(async (key: string) =>
    key === "is-guardian:user-1" ? value : null,
  );
}

describe("[AP-11] 保護者アカウントの判定", () => {
  beforeEach(() => {
    onlineManager.setOnline(true);
    vi.mocked(AsyncStorage.setItem).mockClear();
    mocks.rpcFn.mockReset();
    setupImmediateInitialSession();
    setupSingleResult({ data: { onboarding_completed: true }, error: null });
  });

  it("is_guardian_account が true を返せば保護者として扱い、端末に覚える", async () => {
    setupCachedGuardian(null);
    mocks.rpcFn.mockResolvedValue({ data: true, error: null });

    renderWithAuth(<GuardianDisplay />);

    await waitFor(() => expect(screen.getByTestId("guardian").textContent).toBe("true"));
    expect(mocks.rpcFn).toHaveBeenCalledWith("is_guardian_account");
    await waitFor(() =>
      expect(AsyncStorage.setItem).toHaveBeenCalledWith("is-guardian:user-1", "1"),
    );
  });

  it("is_guardian_account が false を返せば通常のアカウント", async () => {
    setupCachedGuardian(null);
    mocks.rpcFn.mockResolvedValue({ data: false, error: null });

    renderWithAuth(<GuardianDisplay />);

    await waitFor(() => expect(screen.getByTestId("guardian").textContent).toBe("false"));
  });

  it("圏外でも、保護者だと覚えていれば保護者として扱う (通常版の画面を出さない)", async () => {
    setupCachedGuardian("1");
    mocks.rpcFn.mockResolvedValue({ data: null, error: NETWORK_FAILURE });

    renderWithAuth(<GuardianDisplay />);

    await waitFor(() => expect(screen.getByTestId("guardian").textContent).toBe("true"));
  });

  it("圏外で覚えている値も無ければ通常扱いにし、電波が戻ったら問い合わせ直す", async () => {
    setupCachedGuardian(null);
    mocks.rpcFn
      .mockResolvedValueOnce({ data: null, error: NETWORK_FAILURE })
      .mockResolvedValue({ data: true, error: null });

    renderWithAuth(<GuardianDisplay />);
    await waitFor(() => expect(screen.getByTestId("guardian").textContent).toBe("false"));

    await act(async () => {
      onlineManager.setOnline(false);
      onlineManager.setOnline(true);
    });

    await waitFor(() => expect(screen.getByTestId("guardian").textContent).toBe("true"));
  });

  it("通信以外の失敗 (RPC が無い等) は通常扱い", async () => {
    setupCachedGuardian(null);
    mocks.rpcFn.mockResolvedValue({
      data: null,
      error: { message: "function not found", code: "PGRST202" },
    });

    renderWithAuth(<GuardianDisplay />);

    await waitFor(() => expect(screen.getByTestId("guardian").textContent).toBe("false"));
  });
});

// --------------------------------------------------------------------------
// [AP-12] ログアウト
// --------------------------------------------------------------------------

/** signOut を呼ぶボタン */
const SignOutButton: React.FC = () => {
  const { signOut, isGuardian } = useAuth();
  return (
    <>
      <span data-testid="guardian">{String(isGuardian)}</span>
      <button type="button" onClick={() => void signOut()}>
        signout
      </button>
    </>
  );
};

describe("[AP-12] ログアウト", () => {
  beforeEach(() => {
    onlineManager.setOnline(true);
    mocks.rpcFn.mockReset();
    mocks.signOut.mockClear();
    setupImmediateInitialSession();
    setupSingleResult({ data: { onboarding_completed: true }, error: null });
    setupCachedGuardian(null);
  });

  it("保護者アカウントは scope: local でログアウトする (他の保護者の端末を締め出さない)", async () => {
    mocks.rpcFn.mockResolvedValue({ data: true, error: null });
    renderWithAuth(<SignOutButton />);
    await waitFor(() => expect(screen.getByTestId("guardian").textContent).toBe("true"));

    await act(async () => {
      screen.getByText("signout").click();
    });

    await waitFor(() => expect(mocks.signOut).toHaveBeenCalledTimes(1));
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("通常のアカウントは今まで通り (scope 指定なし = 全端末) でログアウトする", async () => {
    mocks.rpcFn.mockResolvedValue({ data: false, error: null });
    renderWithAuth(<SignOutButton />);
    await waitFor(() => expect(screen.getByTestId("guardian").textContent).toBe("false"));

    await act(async () => {
      screen.getByText("signout").click();
    });

    await waitFor(() => expect(mocks.signOut).toHaveBeenCalledTimes(1));
    expect(mocks.signOut).toHaveBeenCalledWith(undefined);
  });
});
