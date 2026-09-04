/**
 * 項目1 (Sprint Contract, Phase A RED): OAuth ログインが全ユーザーを /ja/ に着地させる
 * (既存バグ) の回帰テスト。
 *
 * 対象4箇所 (いずれもクライアントコンポーネントで NextIntlClientProvider の内側,
 * Planner実測):
 *   - components/auth/AuthUI.tsx:43 (デッドコードだがバレル export のため直す)
 *   - contexts/AuthProvider.tsx:154
 *   - components/settings/IdentityLinkSettings.tsx:94
 *   - components/settings/GoogleCalendarSyncSettings.tsx:44
 *
 * 根本原因 (Planner実測):
 *   4箇所はいずれも redirect_to (または redirectTo 自体) の値に locale を含めずに
 *   `${origin}/...` を組み立てている。この値は最終的に OAuth コールバック処理
 *   (lib/supabase-auth/middleware.ts の /?code=... ハンドリング → /api/auth/callback
 *   route handler → @ryuuhei0729/swimhub-oauth の handleAuthCallback) を経て
 *   `NextResponse.redirect(origin + redirectTo)` という「生の HTTP リダイレクト」で
 *   着地する。redirect_to に locale が含まれていないと、この生リダイレクトの着地先
 *   パスにも locale が無く、Next.js (next-intl) 側のミドルウェアが
 *   localeDetection:false + defaultLocale:"ja" によって常に /ja/ を強制する。
 *
 * 修正方針: redirect_to の値自体に「現在の locale」(useLocale()) を埋め込む。
 *   例: `/dashboard` → `/${locale}/dashboard`
 *   この着地は next-intl の router / localizeHref を一切通らない生 HTTP リダイレクト
 *   のため、二重 prefix (`/en/en/onboarding` 等) にはならない (Planner実測)。
 *
 * 現状 (実装前) の期待: 本ファイルの「locale埋め込み」系アサーションは全て RED。
 * 「デフォルト値」系 (locale決め打ちでない部分、たとえば calendar_connect=true が
 * 残っていること) は非退行として GREEN のままのはず。
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuthProvider, useAuth } from "@/contexts/AuthProvider";

const mocks = vi.hoisted(() => ({
  useLocale: vi.fn(() => "ja"),
  // @/lib/supabase の supabase.auth.* (AuthUI.tsx が直接使う / AuthProvider.tsx が
  // supabaseClient として使う。同一シングルトンなので共有する)
  supabaseSignInWithOAuth: vi.fn().mockResolvedValue({
    data: { url: "https://accounts.google.com/o/oauth2/dummy" },
    error: null,
  }),
  supabaseOnAuthStateChange: vi.fn(() => ({
    data: { subscription: { unsubscribe: vi.fn() } },
  })),
  supabaseGetSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
  // @/contexts (バレル) の useAuth() モック。IdentityLinkSettings /
  // GoogleCalendarSyncSettings が使う。AuthProvider.tsx 自体のテストは
  // "@/contexts/AuthProvider" を直接 import するのでこのモックの影響を受けない。
  contextLinkIdentity: vi.fn().mockResolvedValue({
    data: { url: "https://accounts.google.com/link/dummy" },
    error: null,
  }),
  contextGetUserIdentities: vi.fn().mockResolvedValue({ data: { identities: [] }, error: null }),
  contextSignInWithOAuth: vi.fn().mockResolvedValue({ error: null }),
  routerRefresh: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: mocks.useLocale,
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      signInWithOAuth: mocks.supabaseSignInWithOAuth,
      onAuthStateChange: mocks.supabaseOnAuthStateChange,
      getSession: mocks.supabaseGetSession,
    },
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.routerRefresh, push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/hooks/useSubscription", () => ({
  useSubscription: () => ({ subscription: null, refreshSubscription: vi.fn() }),
}));

vi.mock("@/providers/QueryProvider", () => ({
  getQueryClient: () => ({ clear: vi.fn() }),
}));

vi.mock("@/contexts", () => ({
  useAuth: () => ({
    user: { id: "user-1" },
    session: { access_token: "token" },
    loading: false,
    supabase: {
      auth: {
        linkIdentity: mocks.contextLinkIdentity,
        getUserIdentities: mocks.contextGetUserIdentities,
      },
    },
    signInWithOAuth: mocks.contextSignInWithOAuth,
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.useLocale.mockReturnValue("ja");
  mocks.supabaseSignInWithOAuth.mockResolvedValue({
    data: { url: "https://accounts.google.com/o/oauth2/dummy" },
    error: null,
  });
  mocks.supabaseOnAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: vi.fn() } },
  });
  mocks.supabaseGetSession.mockResolvedValue({ data: { session: null }, error: null });
  mocks.contextLinkIdentity.mockResolvedValue({
    data: { url: "https://accounts.google.com/link/dummy" },
    error: null,
  });
  mocks.contextGetUserIdentities.mockResolvedValue({ data: { identities: [] }, error: null });
  mocks.contextSignInWithOAuth.mockResolvedValue({ error: null });
});

// ---------------------------------------------------------------------------
// AuthUI.tsx (デッドコード。実消費者ゼロだがバレル export のため直す対象)
// ---------------------------------------------------------------------------
// NOTE: `mock.calls[0]!` を多用する。各テストは直前に `toHaveBeenCalledTimes(1)` 相当の
// 呼び出しを確認済み。
describe("AuthUI.tsx — Google認証ボタンの redirectTo に現在の locale が埋め込まれる", () => {
  async function renderAndClick() {
    const { AuthUI } = await import("@/components/auth/AuthUI");
    render(<AuthUI />);
    fireEvent.click(screen.getByRole("button"));
  }

  it("[V-B4-01] locale='ja' の場合、redirectTo は完全一致で http://localhost:3000/api/auth/callback?redirect_to=/ja/dashboard", async () => {
    mocks.useLocale.mockReturnValue("ja");
    await renderAndClick();

    await waitFor(() => {
      expect(mocks.supabaseSignInWithOAuth).toHaveBeenCalledTimes(1);
    });
    expect(mocks.supabaseSignInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: "http://localhost:3000/api/auth/callback?redirect_to=/ja/dashboard",
      },
    });
  });

  it("[V-B4-02] locale='en' の場合、redirectTo は完全一致で http://localhost:3000/api/auth/callback?redirect_to=/en/dashboard (locale決め打ちでないことの確認)", async () => {
    mocks.useLocale.mockReturnValue("en");
    await renderAndClick();

    await waitFor(() => {
      expect(mocks.supabaseSignInWithOAuth).toHaveBeenCalledTimes(1);
    });
    expect(mocks.supabaseSignInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: "http://localhost:3000/api/auth/callback?redirect_to=/en/dashboard",
      },
    });
    // 二重 prefix ("/en/en/dashboard") になっていないことの明示的な否定
    expect(mocks.supabaseSignInWithOAuth).not.toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          redirectTo: expect.stringContaining("/en/en/"),
        }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// contexts/AuthProvider.tsx:154 — signInWithOAuth のデフォルト redirectTo
// (呼び出し側が options.redirectTo を渡さない場合。login/page.tsx の
// Apple ログインボタン等がこの経路を通る)
// ---------------------------------------------------------------------------
describe("AuthProvider.tsx — signInWithOAuth のデフォルト redirectTo に現在の locale が埋め込まれる", () => {
  function Consumer() {
    const { signInWithOAuth } = useAuth();
    return (
      <button
        type="button"
        onClick={() => {
          void signInWithOAuth("google");
        }}
      >
        login
      </button>
    );
  }

  function renderProviderAndClick() {
    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>,
    );
    fireEvent.click(screen.getByRole("button"));
  }

  it("[V-B4-03] locale='ja' の場合、options を渡さない呼び出しの redirectTo は http://localhost:3000/?redirect_to=/ja/onboarding", async () => {
    mocks.useLocale.mockReturnValue("ja");
    await renderProviderAndClick();

    await waitFor(() => {
      expect(mocks.supabaseSignInWithOAuth).toHaveBeenCalledTimes(1);
    });
    const call = mocks.supabaseSignInWithOAuth.mock.calls[0]![0];
    expect(call.provider).toBe("google");
    expect(call.options.redirectTo).toBe("http://localhost:3000/?redirect_to=/ja/onboarding");
  });

  it("[V-B4-04] locale='de' の場合、redirectTo は http://localhost:3000/?redirect_to=/de/onboarding (locale決め打ちでないことの確認、二重prefixでもない)", async () => {
    mocks.useLocale.mockReturnValue("de");
    await renderProviderAndClick();

    await waitFor(() => {
      expect(mocks.supabaseSignInWithOAuth).toHaveBeenCalledTimes(1);
    });
    const call = mocks.supabaseSignInWithOAuth.mock.calls[0]![0];
    expect(call.options.redirectTo).toBe("http://localhost:3000/?redirect_to=/de/onboarding");
    expect(call.options.redirectTo).not.toContain("/de/de/");
  });
});

// ---------------------------------------------------------------------------
// components/settings/IdentityLinkSettings.tsx:94 — handleLink の redirectTo
// ---------------------------------------------------------------------------
describe("IdentityLinkSettings.tsx — アカウント連携の redirectTo に現在の locale が埋め込まれる", () => {
  async function renderAndClickLink(provider: "Google" | "Apple") {
    const { default: IdentityLinkSettings } = await import(
      "@/components/settings/IdentityLinkSettings"
    );
    render(<IdentityLinkSettings />);
    await waitFor(() => {
      expect(mocks.contextGetUserIdentities).toHaveBeenCalled();
    });
    const linkButtons = await screen.findAllByText("linkButton");
    const index = provider === "Google" ? 0 : 1;
    fireEvent.click(linkButtons[index]!);
  }

  it("[V-B4-05] locale='ja' の場合、Google連携の redirectTo は http://localhost:3000/?redirect_to=/ja/settings", async () => {
    mocks.useLocale.mockReturnValue("ja");
    await renderAndClickLink("Google");

    await waitFor(() => {
      expect(mocks.contextLinkIdentity).toHaveBeenCalledTimes(1);
    });
    expect(mocks.contextLinkIdentity).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: "http://localhost:3000/?redirect_to=/ja/settings" },
    });
  });

  it("[V-B4-06] locale='zh' の場合、redirectTo は http://localhost:3000/?redirect_to=/zh/settings (locale決め打ちでないことの確認)", async () => {
    mocks.useLocale.mockReturnValue("zh");
    await renderAndClickLink("Google");

    await waitFor(() => {
      expect(mocks.contextLinkIdentity).toHaveBeenCalledTimes(1);
    });
    expect(mocks.contextLinkIdentity).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: "http://localhost:3000/?redirect_to=/zh/settings" },
    });
  });
});

// ---------------------------------------------------------------------------
// components/settings/GoogleCalendarSyncSettings.tsx:44 — handleConnectGoogle の
// callbackUrl (calendar_connect=true を維持したまま locale を埋め込む必要がある)
// ---------------------------------------------------------------------------
describe("GoogleCalendarSyncSettings.tsx — カレンダー連携の redirectTo に現在の locale が埋め込まれる", () => {
  async function renderAndClickConnect() {
    const { default: GoogleCalendarSyncSettings } = await import(
      "@/components/settings/GoogleCalendarSyncSettings"
    );
    render(
      <GoogleCalendarSyncSettings profile={{ google_calendar_enabled: false } as never} onUpdate={vi.fn()} />,
    );
    fireEvent.click(screen.getByText("disconnected.connectButton"));
  }

  it("[V-B4-07] locale='ja' の場合、redirectTo は完全一致で http://localhost:3000/api/auth/callback?calendar_connect=true&redirect_to=/ja/settings (calendar_connect=true が維持されていること)", async () => {
    mocks.useLocale.mockReturnValue("ja");
    await renderAndClickConnect();

    await waitFor(() => {
      expect(mocks.contextSignInWithOAuth).toHaveBeenCalledTimes(1);
    });
    const [, options] = mocks.contextSignInWithOAuth.mock.calls[0]!;
    expect(options.redirectTo).toBe(
      "http://localhost:3000/api/auth/callback?calendar_connect=true&redirect_to=/ja/settings",
    );
  });

  it("[V-B4-08] locale='ko' の場合、redirectTo は http://localhost:3000/api/auth/callback?calendar_connect=true&redirect_to=/ko/settings (locale決め打ちでないことの確認)", async () => {
    mocks.useLocale.mockReturnValue("ko");
    await renderAndClickConnect();

    await waitFor(() => {
      expect(mocks.contextSignInWithOAuth).toHaveBeenCalledTimes(1);
    });
    const [, options] = mocks.contextSignInWithOAuth.mock.calls[0]!;
    expect(options.redirectTo).toBe(
      "http://localhost:3000/api/auth/callback?calendar_connect=true&redirect_to=/ko/settings",
    );
    expect(options.redirectTo).not.toContain("/ko/ko/");
  });
});
