/**
 * バグ1 (最重要): ログイン後 404「二重 locale プレフィックス」の回帰テスト (RED, Phase A)
 *
 * Sprint Contract 検証観点:
 *   [V-B1-01] login/page.tsx: redirect_to=/ja/dashboard (locale付き) でログイン成功すると、
 *             router.push には locale を除去した /dashboard が渡される
 *   [V-B1-02] login/page.tsx: redirect_to=/dashboard (locale無し) でも /dashboard のまま
 *             (非退行)
 *   [V-B1-03] login/page.tsx: redirect_to 無し (null) でも /dashboard のまま (非退行)
 *   [V-B1-04] login/page.tsx: redirect_to=/en/mypage (他ロケール) でも /mypage が渡される
 *   [V-B1-05]〜[V-B1-08] login/email/page.tsx で同様の4ケース
 *   [V-B1-09]〜[V-B1-12] EmailSignInForm.tsx (ログイン成功時) で同様の4ケース
 *
 * 設計判断 (PM確定, 2026-08-25 / Reviewer Critical対応で 2026-08-30 に更新):
 *   - 3箇所 (login/page.tsx, login/email/page.tsx, EmailSignInForm.tsx) は
 *     いずれも `utils/localeRedirect.ts` の `resolveSafeLocalRedirect()` に集約されている
 *     (個別に `stripLocale()`/`getSafeRedirectUrl()` を直書きしているわけではない)。
 *     `resolveSafeLocalRedirect` は多層 locale (`/ja/ja/...`) が来ても `stripLocale` を
 *     不動点 (これ以上剥がせなくなる) まで繰り返し適用してから `getSafeRedirectUrl` で
 *     検証する。`utils/redirect.ts` 自体への `stripLocale` 組み込みは引き続き禁止
 *     (OAuth コールバック経路 `lib/supabase-auth/middleware.ts:30` が
 *     locale付きの `redirect_to` に依存しているため)。
 *   - 「stripLocale を先、getSafeRedirectUrl を後」の順序はスタイルの選択ではなく
 *     セキュリティ上の要請である。逆順 (getSafeRedirectUrl を先に通す) だと
 *     `/ja//evil.com` が `getSafeRedirectUrl` の "//" 拒否チェックを素通りしてしまい、
 *     その後の stripLocale で locale だけが剥がされて `//evil.com`
 *     (プロトコル相対 URL) が露出する。この順序退行はミューテーションテストで検出できる
 *     ことを別途確認済み (オープンリダイレクト防御ブロック参照)。
 *   - このテストは3箇所の呼び出し側だけを見る。`utils/redirect.ts` 自体は変更されない
 *     前提であり、本ファイルは `getSafeRedirectUrl` を一切モックしない
 *     (実装を使う)。理由: `LoginPageRedesign.test.tsx` は
 *     `vi.mock("@/utils/redirect", ...)` で `getSafeRedirectUrl` を
 *     `url => url ?? "/"` に差し替えているため、そちらの既存テストでは
 *     `resolveSafeLocalRedirect` との組み合わせ (locale 除去) を検証できない。
 *     本ファイルは実装をそのまま使うことで「redirect_to → resolveSafeLocalRedirect
 *     → router.push」という実際のデータフローを検証する。
 *
 * 検証できる範囲の限界 (重要):
 *   `@/i18n/navigation` の useRouter をこのファイルでスタブしているため、
 *   next-intl の localizeHref が実際に prefix を1回だけ足す (または重複させない) という
 *   実挙動そのものはこのユニットテストでは検証できない。検証できるのは
 *   「呼び出し側が router.push に渡す文字列が locale なしに正規化されているか」まで。
 *   実際に `/ja/ja/dashboard` にならないことの実機的な保証は E2E
 *   (e2e/src/tests/login-redesign.spec.ts の TC-LR-003 / TC-LR-015 / TC-LR-015b) が担う。
 *
 * 現状 (実装前) の期待:
 *   [V-B1-01][V-B1-04][V-B1-05][V-B1-08][V-B1-09][V-B1-12] は RED になるのが正しい
 *   (現在の実装は getSafeRedirectUrl の戻り値をそのまま push しており、
 *   locale プレフィックスが残ったままのため)。
 *   [V-B1-02][V-B1-03][V-B1-06][V-B1-07][V-B1-10][V-B1-11] は現状でも GREEN のはず
 *   (locale が最初から付いていない/無い入力なので stripLocale を通しても通さなくても
 *   結果が変わらない)。
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  searchParamsGet: vi.fn((_key: string) => null as string | null),
  signIn: vi.fn(),
  signInWithOAuth: vi.fn(),
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
  Link: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => ({ get: mocks.searchParamsGet }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/contexts", () => ({
  useAuth: () => ({
    user: { id: "user-1" },
    session: { access_token: "token" },
    loading: false,
    signIn: mocks.signIn,
    signInWithOAuth: mocks.signInWithOAuth,
  }),
}));

import LoginPage from "../../app/[locale]/(unauthenticated)/login/page";
import LoginEmailPage from "../../app/[locale]/(unauthenticated)/login/email/page";
import { EmailSignInForm } from "../../components/auth/EmailSignInForm";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.signIn.mockResolvedValue({ error: null });
});

// ---------------------------------------------------------------------------
// login/page.tsx (OAuth ログイン成功後の useEffect リダイレクト)
// ---------------------------------------------------------------------------

describe("login/page.tsx — ログイン成功後の redirect_to は locale を除去して push される", () => {
  it("[V-B1-01] redirect_to=/ja/dashboard (locale付き) → push は完全一致で /dashboard", async () => {
    mocks.searchParamsGet.mockImplementation((key: string) =>
      key === "redirect_to" ? "/ja/dashboard" : null,
    );

    render(<LoginPage />);

    await waitFor(() => {
      expect(mocks.push).toHaveBeenCalledTimes(1);
    });
    expect(mocks.push).toHaveBeenCalledWith("/dashboard");
  });

  it("[V-B1-02] redirect_to=/dashboard (locale無し) → push はそのまま /dashboard (非退行)", async () => {
    mocks.searchParamsGet.mockImplementation((key: string) =>
      key === "redirect_to" ? "/dashboard" : null,
    );

    render(<LoginPage />);

    await waitFor(() => {
      expect(mocks.push).toHaveBeenCalledTimes(1);
    });
    expect(mocks.push).toHaveBeenCalledWith("/dashboard");
  });

  it("[V-B1-03] redirect_to 無し (null) → push は /dashboard (非退行)", async () => {
    mocks.searchParamsGet.mockImplementation(() => null);

    render(<LoginPage />);

    await waitFor(() => {
      expect(mocks.push).toHaveBeenCalledTimes(1);
    });
    expect(mocks.push).toHaveBeenCalledWith("/dashboard");
  });

  it("[V-B1-04] redirect_to=/en/mypage (他ロケール) → push は完全一致で /mypage", async () => {
    mocks.searchParamsGet.mockImplementation((key: string) =>
      key === "redirect_to" ? "/en/mypage" : null,
    );

    render(<LoginPage />);

    await waitFor(() => {
      expect(mocks.push).toHaveBeenCalledTimes(1);
    });
    expect(mocks.push).toHaveBeenCalledWith("/mypage");
  });
});

// ---------------------------------------------------------------------------
// login/email/page.tsx (メールログイン画面。認証済み状態での useEffect リダイレクト)
// ---------------------------------------------------------------------------

describe("login/email/page.tsx — 認証済みアクセス時の redirect_to は locale を除去して push される", () => {
  it("[V-B1-05] redirect_to=/ja/dashboard (locale付き) → push は完全一致で /dashboard", async () => {
    mocks.searchParamsGet.mockImplementation((key: string) =>
      key === "redirect_to" ? "/ja/dashboard" : null,
    );

    render(<LoginEmailPage />);

    await waitFor(() => {
      expect(mocks.push).toHaveBeenCalledTimes(1);
    });
    expect(mocks.push).toHaveBeenCalledWith("/dashboard");
  });

  it("[V-B1-06] redirect_to=/dashboard (locale無し) → push はそのまま /dashboard (非退行)", async () => {
    mocks.searchParamsGet.mockImplementation((key: string) =>
      key === "redirect_to" ? "/dashboard" : null,
    );

    render(<LoginEmailPage />);

    await waitFor(() => {
      expect(mocks.push).toHaveBeenCalledTimes(1);
    });
    expect(mocks.push).toHaveBeenCalledWith("/dashboard");
  });

  it("[V-B1-07] redirect_to 無し (null) → push は /dashboard (非退行)", async () => {
    mocks.searchParamsGet.mockImplementation(() => null);

    render(<LoginEmailPage />);

    await waitFor(() => {
      expect(mocks.push).toHaveBeenCalledTimes(1);
    });
    expect(mocks.push).toHaveBeenCalledWith("/dashboard");
  });

  it("[V-B1-08] redirect_to=/en/mypage (他ロケール) → push は完全一致で /mypage", async () => {
    mocks.searchParamsGet.mockImplementation((key: string) =>
      key === "redirect_to" ? "/en/mypage" : null,
    );

    render(<LoginEmailPage />);

    await waitFor(() => {
      expect(mocks.push).toHaveBeenCalledTimes(1);
    });
    expect(mocks.push).toHaveBeenCalledWith("/mypage");
  });
});

// ---------------------------------------------------------------------------
// EmailSignInForm.tsx (メール+パスワード送信成功後の router.push)
// ---------------------------------------------------------------------------

describe("EmailSignInForm.tsx — ログイン成功後の redirect_to は locale を除去して push される", () => {
  function fillAndSubmit() {
    fireEvent.change(screen.getByTestId("email-input"), {
      target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByTestId("password-input"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByTestId("login-button"));
  }

  it("[V-B1-09] redirect_to=/ja/dashboard (locale付き) → push は完全一致で /dashboard", async () => {
    mocks.searchParamsGet.mockImplementation((key: string) =>
      key === "redirect_to" ? "/ja/dashboard" : null,
    );

    render(<EmailSignInForm />);
    fillAndSubmit();

    await waitFor(() => {
      expect(mocks.push).toHaveBeenCalledTimes(1);
    });
    expect(mocks.push).toHaveBeenCalledWith("/dashboard");
  });

  it("[V-B1-10] redirect_to=/dashboard (locale無し) → push はそのまま /dashboard (非退行)", async () => {
    mocks.searchParamsGet.mockImplementation((key: string) =>
      key === "redirect_to" ? "/dashboard" : null,
    );

    render(<EmailSignInForm />);
    fillAndSubmit();

    await waitFor(() => {
      expect(mocks.push).toHaveBeenCalledTimes(1);
    });
    expect(mocks.push).toHaveBeenCalledWith("/dashboard");
  });

  it("[V-B1-11] redirect_to 無し (null) → push は /dashboard (非退行)", async () => {
    mocks.searchParamsGet.mockImplementation(() => null);

    render(<EmailSignInForm />);
    fillAndSubmit();

    await waitFor(() => {
      expect(mocks.push).toHaveBeenCalledTimes(1);
    });
    expect(mocks.push).toHaveBeenCalledWith("/dashboard");
  });

  it("[V-B1-12] redirect_to=/en/mypage (他ロケール) → push は完全一致で /mypage", async () => {
    mocks.searchParamsGet.mockImplementation((key: string) =>
      key === "redirect_to" ? "/en/mypage" : null,
    );

    render(<EmailSignInForm />);
    fillAndSubmit();

    await waitFor(() => {
      expect(mocks.push).toHaveBeenCalledTimes(1);
    });
    expect(mocks.push).toHaveBeenCalledWith("/mypage");
  });
});

// ---------------------------------------------------------------------------
// 🔴 追加 (Phase B QA, PM 発見の論点): オープンリダイレクト — 適用順序が
// 逆 (stripLocale(getSafeRedirectUrl(x))) だと `/ja//evil.com` のようなペイロードが
// getSafeRedirectUrl の "//" チェックをすり抜けた後に stripLocale が locale だけを
// 剥がして "//evil.com" (プロトコル相対 URL) を露出させてしまう。
// 正しい順序 (getSafeRedirectUrl(stripLocale(x))) では、stripLocale が先に
// "//evil.com" を作り、それを getSafeRedirectUrl の "//" 拒否ロジックが弾いて
// "/dashboard" にフォールバックする。
//
// 3 呼び出し箇所すべてで、この攻撃ペイロードに対して push が "/dashboard" 完全一致
// (="/ja//evil.com" でも "//evil.com" でもない) で呼ばれることを確認する。
// ---------------------------------------------------------------------------
describe("🔴 オープンリダイレクト防御: stripLocale → getSafeRedirectUrl の適用順序ガード", () => {
  const maliciousCases: Array<[string, string]> = [
    ["/ja//evil.com", "locale付き + プロトコル相対ペイロード"],
    ["/ja/\\evil.com", "locale付き + バックスラッシュペイロード"],
    ["/en//evil.com", "他locale付き + プロトコル相対ペイロード"],
    ["//evil.com", "locale無し + プロトコル相対ペイロード (対照ケース: 順序に関わらず安全なはず)"],
  ];

  describe("login/page.tsx", () => {
    for (const [payload, label] of maliciousCases) {
      it(`redirect_to=${payload} (${label}) → push は完全一致で /dashboard`, async () => {
        mocks.searchParamsGet.mockImplementation((key: string) =>
          key === "redirect_to" ? payload : null,
        );

        render(<LoginPage />);

        await waitFor(() => {
          expect(mocks.push).toHaveBeenCalledTimes(1);
        });
        expect(mocks.push).toHaveBeenCalledWith("/dashboard");
        expect(mocks.push).not.toHaveBeenCalledWith("//evil.com");
        expect(mocks.push).not.toHaveBeenCalledWith(payload);
      });
    }
  });

  describe("login/email/page.tsx", () => {
    for (const [payload, label] of maliciousCases) {
      it(`redirect_to=${payload} (${label}) → push は完全一致で /dashboard`, async () => {
        mocks.searchParamsGet.mockImplementation((key: string) =>
          key === "redirect_to" ? payload : null,
        );

        render(<LoginEmailPage />);

        await waitFor(() => {
          expect(mocks.push).toHaveBeenCalledTimes(1);
        });
        expect(mocks.push).toHaveBeenCalledWith("/dashboard");
        expect(mocks.push).not.toHaveBeenCalledWith("//evil.com");
        expect(mocks.push).not.toHaveBeenCalledWith(payload);
      });
    }
  });

  describe("EmailSignInForm.tsx", () => {
    function fillAndSubmit() {
      fireEvent.change(screen.getByTestId("email-input"), {
        target: { value: "user@example.com" },
      });
      fireEvent.change(screen.getByTestId("password-input"), {
        target: { value: "password123" },
      });
      fireEvent.click(screen.getByTestId("login-button"));
    }

    for (const [payload, label] of maliciousCases) {
      it(`redirect_to=${payload} (${label}) → push は完全一致で /dashboard`, async () => {
        mocks.searchParamsGet.mockImplementation((key: string) =>
          key === "redirect_to" ? payload : null,
        );

        render(<EmailSignInForm />);
        fillAndSubmit();

        await waitFor(() => {
          expect(mocks.push).toHaveBeenCalledTimes(1);
        });
        expect(mocks.push).toHaveBeenCalledWith("/dashboard");
        expect(mocks.push).not.toHaveBeenCalledWith("//evil.com");
        expect(mocks.push).not.toHaveBeenCalledWith(payload);
      });
    }
  });

  // 非攻撃の境界値 (参考): stripLocale が "/" を返すケース。
  // "/ja" 単体は攻撃ペイロードではないため /dashboard への強制フォールバックは
  // 期待しない。stripLocale("/ja") === "/" → getSafeRedirectUrl("/") === "/" が
  // 正しい結果であることを固定する (誤って /dashboard にトートロジー的に
  // assert しない)。
  it("[境界値] redirect_to=/ja (locale単体) → stripLocale が「/」を返し、push は「/」", async () => {
    mocks.searchParamsGet.mockImplementation((key: string) =>
      key === "redirect_to" ? "/ja" : null,
    );

    render(<LoginPage />);

    await waitFor(() => {
      expect(mocks.push).toHaveBeenCalledTimes(1);
    });
    expect(mocks.push).toHaveBeenCalledWith("/");
  });
});

// ---------------------------------------------------------------------------
// 🔴 追加 (Phase B 再検証, Reviewer Critical指摘): 二重 locale (/ja/ja/...) の
// redirect_to。バグ1本体の404再現URLそのものが redirect_to として渡されるケースが
// Phase A/B で1件も無かった穴。stripLocale は1レイヤーしか剥がさないため、
// 1回だけ適用する実装だと /ja/ja/dashboard → /ja/dashboard (剥がし残し) →
// push後 next-intl が再度 /ja を足して /ja/ja/dashboard に戻り 404 が再発する。
// resolveSafeLocalRedirect は for(;;) ループで剥がし切るまで繰り返す設計。
// ---------------------------------------------------------------------------
describe("🔴 二重 locale (/ja/ja/...) の redirect_to: 剥がし切るまで繰り返すことの確認", () => {
  const doubleLocaleCases: Array<[string, string]> = [
    ["/ja/ja/dashboard", "/dashboard"],
    ["/ja/ja//evil.com", "/dashboard"], // 多層 + プロトコル相対の複合。getSafeRedirectUrl の "//" 拒否で /dashboard
    ["/ja/ja", "/"], // 剥がし切ると "/" に収束する (非攻撃の境界値)
    ["/jazz/foo", "/jazz/foo"], // locale と類似するが実際は locale ではないパスは誤って削られない
  ];

  describe("login/page.tsx", () => {
    for (const [payload, expected] of doubleLocaleCases) {
      it(`redirect_to=${payload} → push は完全一致で ${expected}`, async () => {
        mocks.searchParamsGet.mockImplementation((key: string) =>
          key === "redirect_to" ? payload : null,
        );

        render(<LoginPage />);

        await waitFor(() => {
          expect(mocks.push).toHaveBeenCalledTimes(1);
        });
        expect(mocks.push).toHaveBeenCalledWith(expected);
      });
    }
  });

  describe("login/email/page.tsx", () => {
    for (const [payload, expected] of doubleLocaleCases) {
      it(`redirect_to=${payload} → push は完全一致で ${expected}`, async () => {
        mocks.searchParamsGet.mockImplementation((key: string) =>
          key === "redirect_to" ? payload : null,
        );

        render(<LoginEmailPage />);

        await waitFor(() => {
          expect(mocks.push).toHaveBeenCalledTimes(1);
        });
        expect(mocks.push).toHaveBeenCalledWith(expected);
      });
    }
  });

  describe("EmailSignInForm.tsx", () => {
    function fillAndSubmit() {
      fireEvent.change(screen.getByTestId("email-input"), {
        target: { value: "user@example.com" },
      });
      fireEvent.change(screen.getByTestId("password-input"), {
        target: { value: "password123" },
      });
      fireEvent.click(screen.getByTestId("login-button"));
    }

    for (const [payload, expected] of doubleLocaleCases) {
      it(`redirect_to=${payload} → push は完全一致で ${expected}`, async () => {
        mocks.searchParamsGet.mockImplementation((key: string) =>
          key === "redirect_to" ? payload : null,
        );

        render(<EmailSignInForm />);
        fillAndSubmit();

        await waitFor(() => {
          expect(mocks.push).toHaveBeenCalledTimes(1);
        });
        expect(mocks.push).toHaveBeenCalledWith(expected);
      });
    }
  });
});
