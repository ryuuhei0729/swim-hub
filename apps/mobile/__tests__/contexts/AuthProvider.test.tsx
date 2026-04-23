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
 */

import React from "react";
import { describe, it, vi, beforeEach, expect } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";

// vi.hoisted でモック関数を先に定義（hoisting 問題を回避）
const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  refreshSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  fromFn: vi.fn(),
  initRevenueCat: vi.fn(),
  loginRevenueCat: vi.fn(),
  logoutRevenueCat: vi.fn(),
  addCustomerInfoListener: vi.fn(() => () => {}),
  getQueryClient: vi.fn(() => ({
    clear: vi.fn(),
    invalidateQueries: vi.fn(),
  })),
}));

// supabase クライアントモック
vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: mocks.getSession,
      refreshSession: mocks.refreshSession,
      onAuthStateChange: mocks.onAuthStateChange,
    },
    from: mocks.fromFn,
  },
}));

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
}));

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
    vi.clearAllMocks();
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
    vi.clearAllMocks();
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
    vi.clearAllMocks();
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
    vi.clearAllMocks();
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
    vi.clearAllMocks();
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
      const result = onResult.mock.calls[0][0] as { error: Error | null };
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error?.message).toContain("User not authenticated");
    });

    // update は呼ばれない
    expect(updateSpy).not.toHaveBeenCalled();
  });
});

describe("[AP-09] updateOnboardingCompleted — DB 更新失敗", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      const result = onResult.mock.calls[0][0] as { error: Error | null };
      expect(result.error).toBeInstanceOf(Error);
      expect(result.error?.message).toContain("DB connection failed");
    });
  });
});
