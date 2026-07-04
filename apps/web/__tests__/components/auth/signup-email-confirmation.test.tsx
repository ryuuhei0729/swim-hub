/**
 * Sprint Contract 検証: サインアップ メール確認待ちバグ修正 (v2)
 *
 * 背景: サインアップ成功時に Supabase が仮セッション付き SIGNED_IN を発行し
 * isAuthenticated=true になると、signup/page.tsx の useEffect が即 /onboarding
 * へリダイレクトし、緑ボックス+リンクが消えるバグが存在した。
 *
 * 修正 (v3): signup/page.tsx でリダイレクト判定を
 * `isEmailVerified = !!user?.email_confirmed_at` に変更（confirmed_at フォールバック削除）。
 * さらに hasRedirectedRef で router.push の二重発火をガード。
 * メール未確認の仮セッションではリダイレクトされず緑ボックスが維持される。
 * AuthForm は onEmailConfirmationPending prop を撤去（v0 相当に戻した）。
 *
 * Verification Checklist:
 * [V-01] サインアップ成功でメール確認ボックスが表示され状態が維持される
 * [V-02] 緑ボックス内「ログイン画面に戻る」リンクが /[locale]/login に遷移する
 * [V-03] signin フローに影響がない（onSuccess コールバック分岐の確認）
 * [V-04] signup エラー時はメール確認ボックスが表示されない
 *
 * Reviewer 要求の追加検証 (v2 ガード直接テスト):
 * [V-05] email_confirmed_at=null のとき isAuthenticated=true でも /onboarding にリダイレクトされない
 * [V-06] email_confirmed_at がセット済みのとき /onboarding に遷移する
 */

import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AuthContextType } from "@swim-hub/shared/types/auth";

// ---------------------------------------------------------------------------
// モック設定
// ---------------------------------------------------------------------------

const mockSignIn = vi.fn();
const mockSignUp = vi.fn();
const mockSignInWithOAuth = vi.fn();

// useAuth のデフォルトモック（各テストで上書き可能）
// テスト用の AuthContextType ヘルパー: 型安全にモックデータを生成する
function makeAuthContext(overrides: Record<string, unknown>): AuthContextType {
  return {
    signIn: mockSignIn,
    signUp: mockSignUp,
    signInWithOAuth: mockSignInWithOAuth,
    user: null,
    session: null,
    loading: false,
    isAuthenticated: false,
    ...overrides,
  } as unknown as AuthContextType;
}

const mockUseAuth = vi.fn(() => makeAuthContext({}));

vi.mock("@/contexts", () => ({
  useAuth: () => mockUseAuth(),
}));

// useTranslations: auth namespace 内のキーを実際のキー名で返す
vi.mock("next-intl", () => ({
  useTranslations: vi.fn((namespace?: string) => {
    const translations: Record<string, string> = {
      // auth (root)
      "signin.title": "ログイン",
      "signin.subtitle": "SwimHubへようこそ",
      "signin.submitButton": "ログイン",
      "signin.loadingMessage": "ロード中...",
      "signup.title": "アカウント作成",
      "signup.subtitle": "新しいアカウントを作成",
      "signup.submitButton": "アカウント作成",
      "success.emailConfirmTitle": "確認メール送信",
      "success.emailConfirmation": "ご登録のメールアドレスに確認メールを送信しました。",
      "backToLogin": "ログイン画面に戻る",
      "forgotPassword": "パスワードを忘れた方はこちら",
      "switchToSignup": "アカウントをお持ちでない方はこちら",
      "switchToSignin": "すでにアカウントをお持ちの方はこちら",
      "googleSignin": "Googleでログイン",
      "googleSignup": "Googleでサインアップ",
      "appleSignin": "Appleでログイン",
      "appleSignup": "Appleでサインアップ",
      "orSeparator": "または",
      // auth.fields
      "fields.email": "メールアドレス",
      "fields.password": "パスワード",
      "fields.name": "名前",
      "fields.gender": "性別",
      "fields.birthday": "生年月日",
      "fields.genderMale": "男性",
      "fields.genderFemale": "女性",
      // auth.validation
      "validation.nameRequired": "名前を入力してください。",
      "validation.passwordMinLength": "パスワードは6文字以上で入力してください。",
      "validation.passwordLowercase": "パスワードに小文字を含めてください。",
      "validation.passwordUppercase": "パスワードに大文字を含めてください。",
      "validation.passwordDigit": "パスワードに数字を含めてください。",
      "validation.passwordSymbol": "パスワードに記号を含めてください。",
      // auth.errors
      "errors.unexpected": "予期しないエラーが発生しました。",
      "errors.invalidCredentials": "メールアドレスまたはパスワードが正しくありません。",
      "errors.tooManyRequests": "しばらく時間をおいてから再度お試しください。",
      "errors.userAlreadyRegistered": "このメールアドレスはすでに登録されています。",
      "errors.weakPassword": "パスワードが弱すぎます。",
      "errors.captchaRequired": "reCAPTCHAを完了してください。",
      "errors.rateLimitExceeded": "リクエストが多すぎます。しばらく待ってからお試しください。",
      "errors.networkError": "ネットワークエラーが発生しました。",
      "errors.googleFailed": "Google認証に失敗しました。",
      "errors.appleFailed": "Apple認証に失敗しました。",
      // auth.passwordRequirements
      "passwordRequirements.title": "パスワード要件",
      "passwordRequirements.minLength": "6文字以上",
      "passwordRequirements.lowercase": "小文字を含む",
      "passwordRequirements.uppercase": "大文字を含む",
      "passwordRequirements.digit": "数字を含む",
      "passwordRequirements.symbol": "記号を含む",
      // auth.signin (for SignupPage)
      "auth.signin.loadingMessage": "ロード中...",
      // common
      "common.processing": "処理中...",
    };

    return (key: string) => {
      if (!namespace || namespace === "auth") {
        return translations[key] ?? translations[`auth.${key}`] ?? key;
      }
      if (namespace === "auth.fields") {
        return translations[`fields.${key}`] ?? key;
      }
      if (namespace === "auth.validation") {
        return translations[`validation.${key}`] ?? key;
      }
      if (namespace === "auth.errors") {
        return translations[`errors.${key}`] ?? key;
      }
      if (namespace === "auth.passwordRequirements") {
        return translations[`passwordRequirements.${key}`] ?? key;
      }
      if (namespace === "auth.signin") {
        return translations[`signin.${key}`] ?? key;
      }
      if (namespace === "common") {
        return translations[`common.${key}`] ?? key;
      }
      return key;
    };
  }),
  useLocale: vi.fn(() => "ja"),
}));

// @/i18n/navigation mock
const mockRouterPush = vi.fn();
vi.mock("@/i18n/navigation", () => ({
  useRouter: vi.fn(() => ({
    push: mockRouterPush,
    replace: vi.fn(),
    prefetch: vi.fn(),
  })),
  usePathname: vi.fn(() => "/ja/signup"),
  Link: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={`/ja${href}`} {...props}>
      {children}
    </a>
  ),
  redirect: vi.fn(),
}));

// @/components/ui/LoadingSpinner mock
vi.mock("@/components/ui/LoadingSpinner", () => ({
  FullScreenLoading: ({ message }: { message: string }) => (
    <div data-testid="full-screen-loading">{message}</div>
  ),
}));

// BirthdayInput mock
vi.mock("@/components/ui/BirthdayInput", () => ({
  default: ({
    label,
    onChange,
  }: {
    label: string;
    value: string;
    onChange: (v: string) => void;
  }) => (
    <div>
      <label>{label}</label>
      <input
        type="date"
        onChange={(e) => onChange(e.target.value)}
        data-testid="birthday-input"
      />
    </div>
  ),
}));

// ---------------------------------------------------------------------------
// テスト本体
// ---------------------------------------------------------------------------

import { AuthForm } from "@/components/auth/AuthForm";
import SignupPage from "@/app/[locale]/(unauthenticated)/signup/page";

// ===========================================================================
// [V-01〜V-04] AuthForm コンポーネント単体テスト
// ===========================================================================

describe("[V-01] サインアップ成功時のメール確認ボックス表示と状態維持", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue(makeAuthContext({}));
  });

  it("signup 成功後に緑のメール確認ボックスが表示される", async () => {
    mockSignUp.mockResolvedValueOnce({ error: null });

    render(<AuthForm mode="signup" />);

    await act(async () => {
      fireEvent.change(screen.getByTestId("signup-name-input"), {
        target: { value: "テストユーザー" },
      });
      fireEvent.change(screen.getByTestId("email-input"), {
        target: { value: "test@example.com" },
      });
      fireEvent.change(screen.getByTestId("password-input"), {
        target: { value: "Test1234!" },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("signup-button"));
    });

    await waitFor(() => {
      const greenBox = document.querySelector(".bg-green-50");
      expect(greenBox).not.toBeNull();
    });
  });

  it("signup 成功後にフォームが非表示になる（緑ボックスと入れ替わる）", async () => {
    mockSignUp.mockResolvedValueOnce({ error: null });

    render(<AuthForm mode="signup" />);

    await act(async () => {
      fireEvent.change(screen.getByTestId("signup-name-input"), {
        target: { value: "テストユーザー" },
      });
      fireEvent.change(screen.getByTestId("email-input"), {
        target: { value: "test@example.com" },
      });
      fireEvent.change(screen.getByTestId("password-input"), {
        target: { value: "Test1234!" },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("signup-button"));
    });

    await waitFor(() => {
      // フォームが非表示 (message 表示中は !message && ... で隠れる)
      expect(screen.queryByTestId("auth-form")).toBeNull();
      // 緑ボックスが表示されている
      expect(document.querySelector(".bg-green-50")).not.toBeNull();
    });
  });

  it("signup 成功時に onSuccess は呼ばれない（signin 専用コールバック）", async () => {
    mockSignUp.mockResolvedValueOnce({ error: null });

    const onSuccess = vi.fn();
    render(<AuthForm mode="signup" onSuccess={onSuccess} />);

    await act(async () => {
      fireEvent.change(screen.getByTestId("signup-name-input"), {
        target: { value: "テストユーザー" },
      });
      fireEvent.change(screen.getByTestId("email-input"), {
        target: { value: "test@example.com" },
      });
      fireEvent.change(screen.getByTestId("password-input"), {
        target: { value: "Test1234!" },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("signup-button"));
    });

    await waitFor(() => {
      expect(onSuccess).not.toHaveBeenCalled();
      expect(document.querySelector(".bg-green-50")).not.toBeNull();
    });
  });
});

describe("[V-02] 緑ボックス内「ログイン画面に戻る」リンクの存在確認", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue(makeAuthContext({}));
  });

  it("signup 成功後に「ログイン画面に戻る」リンクが表示される", async () => {
    mockSignUp.mockResolvedValueOnce({ error: null });

    render(<AuthForm mode="signup" />);

    await act(async () => {
      fireEvent.change(screen.getByTestId("signup-name-input"), {
        target: { value: "テストユーザー" },
      });
      fireEvent.change(screen.getByTestId("email-input"), {
        target: { value: "test@example.com" },
      });
      fireEvent.change(screen.getByTestId("password-input"), {
        target: { value: "Test1234!" },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("signup-button"));
    });

    await waitFor(() => {
      const backLink = screen.queryByText("ログイン画面に戻る");
      expect(backLink).not.toBeNull();
    });
  });

  it("「ログイン画面に戻る」リンクの href が /login を含む", async () => {
    mockSignUp.mockResolvedValueOnce({ error: null });

    render(<AuthForm mode="signup" />);

    await act(async () => {
      fireEvent.change(screen.getByTestId("signup-name-input"), {
        target: { value: "テストユーザー" },
      });
      fireEvent.change(screen.getByTestId("email-input"), {
        target: { value: "test@example.com" },
      });
      fireEvent.change(screen.getByTestId("password-input"), {
        target: { value: "Test1234!" },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("signup-button"));
    });

    await waitFor(() => {
      const backLink = screen.queryByText("ログイン画面に戻る");
      expect(backLink).not.toBeNull();
      expect((backLink as HTMLAnchorElement)?.href ?? "").toContain("login");
    });
  });
});

describe("[V-03] signin フローに影響がない（onSuccess が signin 成功時に呼ばれる）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue(makeAuthContext({}));
  });

  it("signin 成功時に onSuccess が呼ばれる", async () => {
    mockSignIn.mockResolvedValueOnce({ error: null });

    const onSuccess = vi.fn();

    render(<AuthForm mode="signin" onSuccess={onSuccess} />);

    await act(async () => {
      fireEvent.change(screen.getByTestId("email-input"), {
        target: { value: "test@example.com" },
      });
      fireEvent.change(screen.getByTestId("password-input"), {
        target: { value: "Test1234!" },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("login-button"));
    });

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledTimes(1);
    });
  });

  it("signin 成功時に緑ボックスは表示されない", async () => {
    mockSignIn.mockResolvedValueOnce({ error: null });

    render(<AuthForm mode="signin" />);

    await act(async () => {
      fireEvent.change(screen.getByTestId("email-input"), {
        target: { value: "test@example.com" },
      });
      fireEvent.change(screen.getByTestId("password-input"), {
        target: { value: "Test1234!" },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("login-button"));
    });

    await waitFor(() => {
      expect(document.querySelector(".bg-green-50")).toBeNull();
    });
  });

  it("signin 失敗時はエラーが表示され緑ボックスは出ない", async () => {
    mockSignIn.mockResolvedValueOnce({
      error: { status: 400, message: "Invalid login credentials" },
    });

    render(<AuthForm mode="signin" />);

    await act(async () => {
      fireEvent.change(screen.getByTestId("email-input"), {
        target: { value: "wrong@example.com" },
      });
      fireEvent.change(screen.getByTestId("password-input"), {
        target: { value: "wrongpassword" },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("login-button"));
    });

    await waitFor(() => {
      expect(document.querySelector(".bg-red-50")).not.toBeNull();
      expect(document.querySelector(".bg-green-50")).toBeNull();
    });
  });
});

describe("[V-04] signup エラー時はメール確認ボックスが表示されない", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue(makeAuthContext({}));
  });

  it("signup がエラーを返した場合、緑ボックスは表示されない", async () => {
    mockSignUp.mockResolvedValueOnce({
      error: { status: 422, message: "User already registered" },
    });

    render(<AuthForm mode="signup" />);

    await act(async () => {
      fireEvent.change(screen.getByTestId("signup-name-input"), {
        target: { value: "テストユーザー" },
      });
      fireEvent.change(screen.getByTestId("email-input"), {
        target: { value: "existing@example.com" },
      });
      fireEvent.change(screen.getByTestId("password-input"), {
        target: { value: "Test1234!" },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("signup-button"));
    });

    await waitFor(() => {
      expect(document.querySelector(".bg-green-50")).toBeNull();
      expect(document.querySelector(".bg-red-50")).not.toBeNull();
    });
  });

  it("signup で名前が空の場合はバリデーションエラーが出て緑ボックスは表示されない", async () => {
    render(<AuthForm mode="signup" />);

    await act(async () => {
      fireEvent.change(screen.getByTestId("email-input"), {
        target: { value: "test@example.com" },
      });
      fireEvent.change(screen.getByTestId("password-input"), {
        target: { value: "Test1234!" },
      });
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("signup-button"));
    });

    await waitFor(() => {
      expect(document.querySelector(".bg-green-50")).toBeNull();
      expect(document.querySelector(".bg-red-50")).not.toBeNull();
      expect(mockSignUp).not.toHaveBeenCalled();
    });
  });
});

// ===========================================================================
// [V-05/V-06] v3 ガード直接検証: SignupPage のリダイレクトロジック
//
// v3 修正の核心: email_confirmed_at の有無のみでリダイレクト可否を判断する
// ロジックを signup/page.tsx に実装した。
//   isEmailVerified = !!user?.email_confirmed_at  (confirmed_at フォールバックなし)
//   リダイレクト条件: isAuthenticated && isEmailVerified && !hasRedirectedRef.current
//
// このテストは SignupPage コンポーネントを直接レンダリングして、
// useAuth が返す user オブジェクトの状態に応じてリダイレクトが
// 発生する/しないことを検証する。
// ===========================================================================

describe("[V-05] email_confirmed_at=null のとき isAuthenticated=true でも /onboarding にリダイレクトされない", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("email_confirmed_at=null かつ session あり の仮セッション状態では router.push が呼ばれない", async () => {
    // Supabase がメール確認必須設定で仮セッション付き SIGNED_IN を発行した状態を再現
    // user は存在するが email_confirmed_at は null
    mockUseAuth.mockReturnValue(makeAuthContext({
      user: {
        id: "test-user-id",
        email: "test@example.com",
        email_confirmed_at: null,      // メール未確認 (仮セッション)
        confirmed_at: undefined,
      },
      session: { access_token: "fake-token" },  // session は存在する
      isAuthenticated: true,
    }));

    render(<SignupPage />);

    // リダイレクトが発生しないことを確認: router.push は呼ばれてはいけない
    await waitFor(() => {
      expect(mockRouterPush).not.toHaveBeenCalled();
    });

    // サインアップフォームが引き続き表示されている (early return null も発動しない)
    expect(screen.queryByTestId("email-signup-button")).not.toBeNull();
  });

  it("email_confirmed_at=null かつ confirmed_at=undefined でも /onboarding へリダイレクトされない", async () => {
    mockUseAuth.mockReturnValue(makeAuthContext({
      user: {
        id: "test-user-id",
        email: "test@example.com",
        email_confirmed_at: null,
        confirmed_at: undefined,
      },
      session: { access_token: "fake-token" },
      isAuthenticated: true,
    }));

    render(<SignupPage />);

    await waitFor(() => {
      expect(mockRouterPush).not.toHaveBeenCalled();
    });

    // フォームが表示されている (return null が発動しない)
    expect(screen.queryByTestId("email-signup-button")).not.toBeNull();
  });

  it("user=null かつ session=null（未認証）の場合もリダイレクトされず通常のサインアップフォームが表示される", async () => {
    mockUseAuth.mockReturnValue(makeAuthContext({}));

    render(<SignupPage />);

    await waitFor(() => {
      expect(mockRouterPush).not.toHaveBeenCalled();
    });

    expect(screen.queryByTestId("email-signup-button")).not.toBeNull();
  });
});

describe("[V-06] email_confirmed_at がセット済みのとき /onboarding に遷移する", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("email_confirmed_at が ISO 日時文字列のとき router.push('/onboarding') が呼ばれる", async () => {
    // メール確認済みの正規ユーザー（通常ログイン後の状態）
    mockUseAuth.mockReturnValue(makeAuthContext({
      user: {
        id: "test-user-id",
        email: "test@example.com",
        email_confirmed_at: "2026-06-29T00:00:00.000Z",  // メール確認済み
        confirmed_at: "2026-06-29T00:00:00.000Z",
      },
      session: { access_token: "fake-token" },
      isAuthenticated: true,
    }));

    render(<SignupPage />);

    // useEffect が発火して /onboarding にリダイレクト
    await waitFor(() => {
      expect(mockRouterPush).toHaveBeenCalledWith("/onboarding");
    });
  });

  it("confirmed_at のみセット済み・email_confirmed_at=null の場合は /onboarding に遷移しない", async () => {
    // v3: isEmailVerified = !!user?.email_confirmed_at のみで判断
    // confirmed_at フォールバックは削除されたため、
    // email_confirmed_at=null であればメール未確認とみなし遷移しない
    mockUseAuth.mockReturnValue(makeAuthContext({
      user: {
        id: "test-user-id",
        email: "test@example.com",
        email_confirmed_at: null,          // メール未確認
        confirmed_at: "2026-06-29T00:00:00.000Z",  // confirmed_at はあるが使わない
      },
      session: { access_token: "fake-token" },
      isAuthenticated: true,
    }));

    render(<SignupPage />);

    // email_confirmed_at=null → isEmailVerified=false → リダイレクトされない
    await waitFor(() => {
      expect(mockRouterPush).not.toHaveBeenCalled();
    });

    // フォームが引き続き表示されている
    expect(screen.queryByTestId("email-signup-button")).not.toBeNull();
  });

  it("early return null: email 確認済みユーザーでは SignupPage は null を返す", async () => {
    // isAuthenticated && isEmailVerified の両方が true → return null
    mockUseAuth.mockReturnValue(makeAuthContext({
      user: {
        id: "test-user-id",
        email: "test@example.com",
        email_confirmed_at: "2026-06-29T00:00:00.000Z",
        confirmed_at: "2026-06-29T00:00:00.000Z",
      },
      session: { access_token: "fake-token" },
      isAuthenticated: true,
    }));

    render(<SignupPage />);

    // return null により signup ページの内容は表示されない
    await waitFor(() => {
      expect(screen.queryByTestId("email-signup-button")).toBeNull();
    });
  });
});
