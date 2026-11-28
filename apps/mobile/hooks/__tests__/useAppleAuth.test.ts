// @vitest-environment jsdom
// =============================================================================
// useAppleAuth.test.ts - Apple認証フックのユニットテスト
// =============================================================================

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.hoisted() を使用してモック状態を先に定義
const mocks = vi.hoisted(() => ({
  platformOS: "ios" as string,
  isAvailableAsync: vi.fn(),
  signInAsync: vi.fn(),
  signInWithIdToken: vi.fn(),
  updateUser: vi.fn(),
  localizeSupabaseAuthError: vi.fn(),
  supabaseEnabled: true,
  signInWithOAuth: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  setSession: vi.fn(),
  openAuthSessionAsync: vi.fn(),
  claimOAuthCode: vi.fn(),
  saveLastLoginMethod: vi.fn(),
}));

// Platform モック
vi.mock("react-native", async () => {
  const actual = await vi.importActual("react-native");
  return {
    ...actual,
    Platform: {
      get OS() {
        return mocks.platformOS;
      },
      select: <T>(obj: { ios?: T; android?: T; default?: T }): T | undefined => {
        if (mocks.platformOS === "ios") return obj.ios ?? obj.default;
        if (mocks.platformOS === "android") return obj.android ?? obj.default;
        return obj.default;
      },
    },
  };
});

// AppleAuthentication モック
vi.mock("expo-apple-authentication", () => ({
  isAvailableAsync: mocks.isAvailableAsync,
  signInAsync: mocks.signInAsync,
  AppleAuthenticationScope: {
    FULL_NAME: 0,
    EMAIL: 1,
  },
}));

// Supabase モック
vi.mock("@/lib/supabase", () => ({
  get supabase() {
    if (!mocks.supabaseEnabled) return null;
    return {
      auth: {
        signInWithIdToken: mocks.signInWithIdToken,
        updateUser: mocks.updateUser,
        signInWithOAuth: mocks.signInWithOAuth,
        exchangeCodeForSession: mocks.exchangeCodeForSession,
        setSession: mocks.setSession,
      },
    };
  },
}));

// Android のブラウザ認証で使うモジュールのモック
vi.mock("expo-web-browser", () => ({
  openAuthSessionAsync: mocks.openAuthSessionAsync,
}));

vi.mock("@ryuuhei0729/swimhub-oauth/mobile", () => ({
  claimOAuthCode: mocks.claimOAuthCode,
}));

vi.mock("@/lib/google-auth", () => ({
  getRedirectUri: () => "swimhub://auth/callback",
  extractTokensFromUrl: (url: string) => {
    const params = new URL(url).searchParams;
    return {
      code: params.get("code") ?? undefined,
      error: params.get("error") ?? undefined,
    };
  },
  oauthSessionGuard: { active: false },
  localizeOAuthErrorCode: (code: string) => `oauth:${code}`,
}));

vi.mock("@/lib/lastLoginMethod", () => ({
  saveLastLoginMethod: mocks.saveLastLoginMethod,
}));

// authErrorLocalizer モック
vi.mock("@/utils/authErrorLocalizer", () => ({
  localizeSupabaseAuthError: mocks.localizeSupabaseAuthError,
}));

// useAppleAuth をインポート（モック設定後）
import { useAppleAuth } from "../useAppleAuth";

describe("useAppleAuth", () => {
  beforeEach(() => {

    // デフォルト状態にリセット
    mocks.platformOS = "ios";
    mocks.supabaseEnabled = true;

    // AppleAuthentication モックをリセット
    mocks.isAvailableAsync.mockResolvedValue(true);
    mocks.signInAsync.mockResolvedValue({
      identityToken: "mock-identity-token",
      fullName: null,
    });

    // Supabase auth モックをリセット
    mocks.signInWithIdToken.mockResolvedValue({ error: null });
    mocks.updateUser.mockResolvedValue({ error: null });

    // Android のブラウザ認証のモックをリセット
    mocks.signInWithOAuth.mockResolvedValue({
      data: { url: "https://test.supabase.co/auth/v1/authorize?provider=apple" },
      error: null,
    });
    mocks.openAuthSessionAsync.mockResolvedValue({
      type: "success",
      url: "swimhub://auth/callback?code=apple-code",
    });
    mocks.claimOAuthCode.mockReturnValue({ claimed: true, resolve: vi.fn() });
    mocks.exchangeCodeForSession.mockResolvedValue({
      data: { session: { access_token: "at" } },
      error: null,
    });
    mocks.saveLastLoginMethod.mockResolvedValue(undefined);

    // localizeSupabaseAuthError モックをリセット
    mocks.localizeSupabaseAuthError.mockImplementation((error: { message?: string }) => {
      const message = error?.message || "";
      if (message.includes("invalid")) return "認証情報が正しくありません";
      if (message.includes("timeout")) return "接続がタイムアウトしました。再度お試しください";
      return `ローカライズ済み: ${message}`;
    });
  });

  describe("初期状態", () => {
    it("iOSでは isAvailable が true", () => {
      mocks.platformOS = "ios";
      const { result } = renderHook(() => useAppleAuth());

      expect(result.current.isAvailable).toBe(true);
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it("Android でも isAvailable が true（ブラウザで認証する）", () => {
      mocks.platformOS = "android";
      const { result } = renderHook(() => useAppleAuth());

      expect(result.current.isAvailable).toBe(true);
    });

    it("iOS / Android 以外では isAvailable が false", () => {
      mocks.platformOS = "web";
      const { result } = renderHook(() => useAppleAuth());

      expect(result.current.isAvailable).toBe(false);
    });
  });

  describe("signInWithApple - Android（ブラウザ認証）", () => {
    beforeEach(() => {
      mocks.platformOS = "android";
    });

    it("Supabase の Apple OAuth をブラウザで開き、code を交換してログインする", async () => {
      const { result } = renderHook(() => useAppleAuth());

      let signInResult: { success: boolean; error?: Error | null };
      await act(async () => {
        signInResult = await result.current.signInWithApple();
      });

      expect(signInResult!.success).toBe(true);
      expect(mocks.signInWithOAuth).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "apple",
          options: expect.objectContaining({
            redirectTo: "swimhub://auth/callback",
            skipBrowserRedirect: true,
          }),
        }),
      );
      expect(mocks.openAuthSessionAsync).toHaveBeenCalledWith(
        "https://test.supabase.co/auth/v1/authorize?provider=apple",
        "swimhub://auth/callback",
      );
      expect(mocks.exchangeCodeForSession).toHaveBeenCalledWith("apple-code");
      expect(mocks.saveLastLoginMethod).toHaveBeenCalledWith("apple");
      expect(mocks.isAvailableAsync).not.toHaveBeenCalled();
      expect(mocks.signInAsync).not.toHaveBeenCalled();
      expect(result.current.loading).toBe(false);
    });

    it("ブラウザを閉じた場合はキャンセルとして扱う", async () => {
      mocks.openAuthSessionAsync.mockResolvedValue({ type: "cancel" });
      const { result } = renderHook(() => useAppleAuth());

      let signInResult: { success: boolean; error?: Error | null };
      await act(async () => {
        signInResult = await result.current.signInWithApple();
      });

      expect(signInResult!.success).toBe(false);
      expect(result.current.error).toBe("oauth:auth_cancelled");
      expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
      expect(mocks.saveLastLoginMethod).not.toHaveBeenCalled();
    });

    it("code の交換に失敗した場合はエラーを表示する", async () => {
      mocks.exchangeCodeForSession.mockResolvedValue({
        data: { session: null },
        error: { message: "invalid grant" },
      });
      const { result } = renderHook(() => useAppleAuth());

      let signInResult: { success: boolean; error?: Error | null };
      await act(async () => {
        signInResult = await result.current.signInWithApple();
      });

      expect(signInResult!.success).toBe(false);
      expect(result.current.error).toBe("oauth:invalid grant");
      expect(mocks.saveLastLoginMethod).not.toHaveBeenCalled();
    });
  });

  describe("signInWithApple - Platform チェック", () => {
    it("iOS / Android 以外では早期リターンしてエラーを設定", async () => {
      mocks.platformOS = "web";
      const { result } = renderHook(() => useAppleAuth());

      let signInResult: { success: boolean; error?: Error | null };
      await act(async () => {
        signInResult = await result.current.signInWithApple();
      });

      expect(signInResult!.success).toBe(false);
      expect(signInResult!.error?.message).toBe("Apple認証はiOSでのみ利用可能です");
      expect(result.current.error).toBe("Apple認証はiOSでのみ利用可能です");
      expect(mocks.isAvailableAsync).not.toHaveBeenCalled();
    });
  });

  describe("signInWithApple - Supabase チェック", () => {
    it("Supabase が undefined の場合はエラーを設定", async () => {
      mocks.supabaseEnabled = false;
      const { result } = renderHook(() => useAppleAuth());

      let signInResult: { success: boolean; error?: Error | null };
      await act(async () => {
        signInResult = await result.current.signInWithApple();
      });

      expect(signInResult!.success).toBe(false);
      expect(signInResult!.error?.message).toBe("Supabaseクライアントが初期化されていません");
      expect(result.current.error).toBe("Supabaseクライアントが初期化されていません");
      expect(mocks.isAvailableAsync).not.toHaveBeenCalled();
    });
  });

  describe("signInWithApple - AppleAuthentication.isAvailableAsync", () => {
    it("Apple認証が利用不可の場合はエラーを設定", async () => {
      mocks.isAvailableAsync.mockResolvedValue(false);
      const { result } = renderHook(() => useAppleAuth());

      let signInResult: { success: boolean; error?: Error | null };
      await act(async () => {
        signInResult = await result.current.signInWithApple();
      });

      expect(signInResult!.success).toBe(false);
      expect(signInResult!.error?.message).toBe("このデバイスではApple認証を利用できません");
      expect(result.current.error).toBe("このデバイスではApple認証を利用できません");
    });
  });

  describe("signInWithApple - AppleAuthentication.signInAsync", () => {
    it("identityToken がない場合はエラーを設定", async () => {
      mocks.signInAsync.mockResolvedValue({
        identityToken: null,
        fullName: null,
      });
      const { result } = renderHook(() => useAppleAuth());

      let signInResult: { success: boolean; error?: Error | null };
      await act(async () => {
        signInResult = await result.current.signInWithApple();
      });

      expect(signInResult!.success).toBe(false);
      expect(signInResult!.error?.message).toBe("Apple認証トークンが取得できませんでした");
      expect(result.current.error).toBe("Apple認証トークンが取得できませんでした");
    });

    it("fullName がある場合は displayName を構築", async () => {
      mocks.signInAsync.mockResolvedValue({
        identityToken: "mock-token",
        fullName: {
          familyName: "山田",
          givenName: "太郎",
        },
      });
      mocks.signInWithIdToken.mockResolvedValue({ error: null });

      const { result } = renderHook(() => useAppleAuth());

      await act(async () => {
        await result.current.signInWithApple();
      });

      expect(mocks.updateUser).toHaveBeenCalledWith({
        data: { name: "山田 太郎" },
      });
    });

    it("familyName のみの場合も displayName を構築", async () => {
      mocks.signInAsync.mockResolvedValue({
        identityToken: "mock-token",
        fullName: {
          familyName: "山田",
          givenName: null,
        },
      });
      mocks.signInWithIdToken.mockResolvedValue({ error: null });

      const { result } = renderHook(() => useAppleAuth());

      await act(async () => {
        await result.current.signInWithApple();
      });

      expect(mocks.updateUser).toHaveBeenCalledWith({
        data: { name: "山田" },
      });
    });

    it("fullName が null の場合は updateUser を呼ばない", async () => {
      mocks.signInAsync.mockResolvedValue({
        identityToken: "mock-token",
        fullName: null,
      });
      mocks.signInWithIdToken.mockResolvedValue({ error: null });

      const { result } = renderHook(() => useAppleAuth());

      await act(async () => {
        await result.current.signInWithApple();
      });

      expect(mocks.updateUser).not.toHaveBeenCalled();
    });
  });

  describe("signInWithApple - Supabase signInWithIdToken", () => {
    it("成功時は success: true を返す", async () => {
      mocks.signInWithIdToken.mockResolvedValue({ error: null });

      const { result } = renderHook(() => useAppleAuth());

      let signInResult: { success: boolean; error?: Error | null };
      await act(async () => {
        signInResult = await result.current.signInWithApple();
      });

      expect(signInResult!.success).toBe(true);
      expect(signInResult!.error).toBeUndefined();
      expect(result.current.error).toBeNull();
      expect(mocks.signInWithIdToken).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "apple",
          token: "mock-identity-token",
          nonce: expect.stringMatching(/^[0-9a-f]{64}$/),
        }),
      );
    });

    it("エラー時は localizeSupabaseAuthError を使用してエラーを設定", async () => {
      const signInError = { message: "invalid token" };
      mocks.signInWithIdToken.mockResolvedValue({ error: signInError });

      const { result } = renderHook(() => useAppleAuth());

      let signInResult: { success: boolean; error?: Error | null };
      await act(async () => {
        signInResult = await result.current.signInWithApple();
      });

      expect(signInResult!.success).toBe(false);
      expect(signInResult!.error).toBe(signInError);
      expect(mocks.localizeSupabaseAuthError).toHaveBeenCalledWith(signInError);
      expect(result.current.error).toBe("認証情報が正しくありません");
    });
  });

  describe("signInWithApple - 例外処理", () => {
    it("ERR_REQUEST_CANCELED の場合はキャンセルメッセージを設定", async () => {
      const cancelError = Object.assign(new Error("User cancelled"), {
        code: "ERR_REQUEST_CANCELED",
      });
      mocks.signInAsync.mockRejectedValue(cancelError);

      const { result } = renderHook(() => useAppleAuth());

      let signInResult: { success: boolean; error?: Error | null };
      await act(async () => {
        signInResult = await result.current.signInWithApple();
      });

      expect(signInResult!.success).toBe(false);
      expect(signInResult!.error?.message).toBe("認証がキャンセルされました");
      expect(result.current.error).toBe("認証がキャンセルされました");
    });

    it("他のエラーコードの場合は localizeSupabaseAuthError を使用", async () => {
      const otherError = Object.assign(new Error("timeout error"), {
        code: "ERR_REQUEST_FAILED",
      });
      mocks.signInAsync.mockRejectedValue(otherError);

      const { result } = renderHook(() => useAppleAuth());

      let signInResult: { success: boolean; error?: Error | null };
      await act(async () => {
        signInResult = await result.current.signInWithApple();
      });

      expect(signInResult!.success).toBe(false);
      expect(signInResult!.error).toBe(otherError);
      expect(mocks.localizeSupabaseAuthError).toHaveBeenCalledWith({ message: "timeout error" });
      expect(result.current.error).toBe("接続がタイムアウトしました。再度お試しください");
    });

    it("エラーメッセージがない場合はデフォルトメッセージを使用", async () => {
      const errorWithoutMessage = Object.assign(new Error(), {
        code: "ERR_REQUEST_UNKNOWN",
      });
      // message プロパティを空文字に設定
      Object.defineProperty(errorWithoutMessage, "message", { value: "" });
      mocks.signInAsync.mockRejectedValue(errorWithoutMessage);

      const { result } = renderHook(() => useAppleAuth());

      await act(async () => {
        await result.current.signInWithApple();
      });

      expect(mocks.localizeSupabaseAuthError).toHaveBeenCalledWith({
        message: "不明なエラーが発生しました",
      });
    });
  });

  describe("signInWithApple - loading 状態", () => {
    it("処理中は loading が true になる", async () => {
      // signInAsync を遅延させる
      let resolveSignIn: (value: unknown) => void;
      mocks.signInAsync.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveSignIn = resolve;
          }),
      );

      const { result } = renderHook(() => useAppleAuth());

      // 非同期処理を開始
      let signInPromise: Promise<unknown>;
      act(() => {
        signInPromise = result.current.signInWithApple();
      });

      // loading が true になるのを待つ
      await waitFor(() => {
        expect(result.current.loading).toBe(true);
      });

      // 非同期処理を完了
      await act(async () => {
        resolveSignIn!({
          identityToken: "token",
          fullName: null,
        });
        await signInPromise;
      });

      expect(result.current.loading).toBe(false);
    });

    it("エラー発生時も finally で loading が false になる", async () => {
      mocks.signInAsync.mockRejectedValue(new Error("test error"));

      const { result } = renderHook(() => useAppleAuth());

      await act(async () => {
        await result.current.signInWithApple();
      });

      expect(result.current.loading).toBe(false);
    });
  });

  describe("clearError", () => {
    it("エラーをクリアできる", async () => {
      mocks.platformOS = "web";
      const { result } = renderHook(() => useAppleAuth());

      // エラーを発生させる
      await act(async () => {
        await result.current.signInWithApple();
      });

      expect(result.current.error).toBe("Apple認証はiOSでのみ利用可能です");

      // エラーをクリア
      act(() => {
        result.current.clearError();
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe("統合テスト - 完全な認証フロー", () => {
    it("fullName 付きで正常に認証が完了する", async () => {
      mocks.signInAsync.mockResolvedValue({
        identityToken: "valid-token",
        fullName: {
          familyName: "田中",
          givenName: "花子",
        },
      });
      mocks.signInWithIdToken.mockResolvedValue({ error: null });
      mocks.updateUser.mockResolvedValue({ error: null });

      const { result } = renderHook(() => useAppleAuth());

      let signInResult: { success: boolean; error?: Error | null };
      await act(async () => {
        signInResult = await result.current.signInWithApple();
      });

      // 結果の検証
      expect(signInResult!.success).toBe(true);
      expect(result.current.error).toBeNull();
      expect(result.current.loading).toBe(false);

      // 呼び出しの検証
      expect(mocks.isAvailableAsync).toHaveBeenCalledTimes(1);
      expect(mocks.signInAsync).toHaveBeenCalledTimes(1);
      expect(mocks.signInWithIdToken).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "apple",
          token: "valid-token",
          nonce: expect.stringMatching(/^[0-9a-f]{64}$/),
        }),
      );
      expect(mocks.updateUser).toHaveBeenCalledWith({
        data: { name: "田中 花子" },
      });
    });

    it("fullName なしで正常に認証が完了する", async () => {
      mocks.signInAsync.mockResolvedValue({
        identityToken: "valid-token",
        fullName: null,
      });
      mocks.signInWithIdToken.mockResolvedValue({ error: null });

      const { result } = renderHook(() => useAppleAuth());

      let signInResult: { success: boolean; error?: Error | null };
      await act(async () => {
        signInResult = await result.current.signInWithApple();
      });

      expect(signInResult!.success).toBe(true);
      expect(mocks.updateUser).not.toHaveBeenCalled();
    });
  });
});
