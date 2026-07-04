"use client";

import { useEffect, useMemo, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { OAuthButtons } from "@/components/auth";
import { useAuth } from "@/contexts";
import { useRouter, Link } from "@/i18n/navigation";
import { FullScreenLoading } from "@/components/ui/LoadingSpinner";
import { getSafeRedirectUrl } from "@/utils/redirect";

// OAuth エラーコード → 翻訳キー (auth.errorMap.*) のマッピング。
// 値文字列は messages/{locale}.json で管理する。
type ErrorMapKey =
  | "accessDenied"
  | "invalidRequest"
  | "serverError"
  | "temporarilyUnavailable"
  | "sessionNotFound"
  | "emailNotConfirmed"
  | "userNotFound"
  | "emailAlreadyExists"
  | "invalidEmail"
  | "invalidOtp"
  | "expiredOtp"
  | "defaultError"
  | "loginFailed"
  | "genericError";

const ERROR_CODE_TO_KEY: Record<string, ErrorMapKey> = {
  access_denied: "accessDenied",
  invalid_request: "invalidRequest",
  server_error: "serverError",
  temporarily_unavailable: "temporarilyUnavailable",
  invalid_grant: "invalidRequest",
  invalid_client: "invalidRequest",
  unauthorized_client: "invalidRequest",
  unsupported_response_type: "invalidRequest",
  invalid_scope: "invalidRequest",
  session_not_found: "sessionNotFound",
  email_not_confirmed: "emailNotConfirmed",
  invalid_credentials: "loginFailed",
  user_not_found: "userNotFound",
  email_already_exists: "emailAlreadyExists",
  weak_password: "defaultError",
  password_too_short: "defaultError",
  password_too_long: "defaultError",
  invalid_email: "invalidEmail",
  invalid_phone: "invalidRequest",
  phone_not_found: "userNotFound",
  invalid_otp: "invalidOtp",
  expired_otp: "expiredOtp",
  too_many_requests: "serverError",
  rate_limit_exceeded: "serverError",
};

function LoginPageFallback() {
  const tSignin = useTranslations("auth.signin");
  return <FullScreenLoading message={tSignin("loadingMessage")} />;
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginPageFallback />}>
      <LoginPageContent />
    </Suspense>
  );
}

function LoginPageContent() {
  const { user, session, loading, signInWithOAuth } = useAuth();
  const isAuthenticated = !!user && !!session;
  const router = useRouter();
  const searchParams = useSearchParams();
  const hasRedirectedRef = useRef(false);
  const rawError = searchParams.get("error");
  const tSignin = useTranslations("auth.signin");
  const tErrorMap = useTranslations("auth.errorMap");
  const tErrors = useTranslations("auth.errors");
  const tAuth = useTranslations("auth");

  const [oauthLoading, setOauthLoading] = useState(false);
  const [oauthError, setOauthError] = useState<string | null>(null);
  // OAuth ボタン押下後は URL 由来のエラーを隠す（urlError が oauthError を永続的に隠す問題を防ぐ）
  const [urlErrorDismissed, setUrlErrorDismissed] = useState(false);

  // エラーコードを翻訳済みメッセージに変換
  const urlError = useMemo(() => {
    if (!rawError) return null;
    const key: ErrorMapKey = ERROR_CODE_TO_KEY[rawError] ?? "defaultError";
    return tErrorMap(key);
  }, [rawError, tErrorMap]);

  useEffect(() => {
    if (!loading && isAuthenticated && !hasRedirectedRef.current) {
      hasRedirectedRef.current = true;
      const redirectTo = getSafeRedirectUrl(searchParams.get("redirect_to"));
      router.push(redirectTo);
    }
  }, [isAuthenticated, loading, router, searchParams]);

  if (loading) {
    return <FullScreenLoading message={tSignin("loadingMessage")} />;
  }

  if (isAuthenticated) {
    return null;
  }

  const rawRedirectTo = searchParams.get("redirect_to");
  const emailHref = rawRedirectTo
    ? `/login/email?redirect_to=${encodeURIComponent(rawRedirectTo)}`
    : "/login/email";

  const displayError = urlErrorDismissed ? oauthError : (urlError ?? oauthError);

  const handleGoogleClick = async () => {
    setUrlErrorDismissed(true);
    setOauthLoading(true);
    setOauthError(null);
    try {
      const { error } = await signInWithOAuth("google", {
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
      });
      if (error) {
        setOauthError(tErrors("googleFailed"));
      }
    } finally {
      setOauthLoading(false);
    }
  };

  const handleAppleClick = async () => {
    setUrlErrorDismissed(true);
    setOauthLoading(true);
    setOauthError(null);
    try {
      const { error } = await signInWithOAuth("apple");
      if (error) {
        setOauthError(tErrors("appleFailed"));
      }
    } finally {
      setOauthLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-blue-50">
      {displayError && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 w-full max-w-md px-4">
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
            <p className="text-sm font-medium">{tSignin("errorTitle")}</p>
            <p className="text-xs mt-1">{displayError}</p>
          </div>
        </div>
      )}

      <div className="max-w-md w-full space-y-4 sm:space-y-6 bg-white p-4 sm:p-8 rounded-2xl shadow-xl">
        <div className="text-center">
          <h2 className="text-xl sm:text-2xl font-extrabold text-gray-900 mb-2">
            {tSignin("title")}
          </h2>
          <p className="text-xs sm:text-sm text-gray-600">{tSignin("entrySubtitle")}</p>
        </div>

        {/* Google / Apple — 主役ボタン */}
        <OAuthButtons
          onGoogleClick={handleGoogleClick}
          onAppleClick={handleAppleClick}
          loading={oauthLoading}
        />

        {/* 区切り線 */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-200"></div>
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="px-2 bg-white text-gray-400">{tAuth("orSeparator")}</span>
          </div>
        </div>

        {/* メールログイン — 控えめなゴーストボタン */}
        <Link
          href={emailHref}
          data-testid="email-signin-button"
          aria-disabled={oauthLoading}
          className={`w-full flex items-center justify-center py-2.5 px-4 border border-gray-300 rounded-xl text-sm font-medium text-gray-500 bg-transparent hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-300 transition duration-150 ease-in-out${oauthLoading ? " pointer-events-none opacity-50" : ""}`}
        >
          {tSignin("emailMethodButton")}
        </Link>

        {/* 新規登録リンク */}
        <div className="text-center pt-2">
          <Link
            href="/signup"
            className="block text-xs text-blue-600 hover:text-blue-800 transition duration-150 ease-in-out"
            data-testid="signup-link"
          >
            {tAuth("switchToSignup")}
          </Link>
        </div>
      </div>
    </div>
  );
}
