"use client";

import { useEffect, useMemo, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { AuthForm, AuthUI } from "@/components/auth";
import { useAuth } from "@/contexts";
import { useRouter } from "@/i18n/navigation";
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
  // weak_password / password_too_short / password_too_long は signup 側のエラーコードであり
  // ログインフォームの OAuth エラーとして到達するケースは想定外。defaultError にフォールバック。
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
  const { user, session, loading } = useAuth();
  const isAuthenticated = !!user && !!session;
  const router = useRouter();
  const searchParams = useSearchParams();
  const hasRedirectedRef = useRef(false);
  const rawError = searchParams.get("error");
  // Auth UIを使用するかどうか（URLパラメータで切り替え可能）
  const useAuthUI = searchParams.get("ui") === "auth-ui";
  const tSignin = useTranslations("auth.signin");
  const tErrorMap = useTranslations("auth.errorMap");

  // エラーコードを翻訳済みメッセージに変換
  const error = useMemo(() => {
    if (!rawError) return null;
    const key: ErrorMapKey = ERROR_CODE_TO_KEY[rawError] ?? "defaultError";
    return tErrorMap(key);
  }, [rawError, tErrorMap]);

  useEffect(() => {
    if (!loading && isAuthenticated && !hasRedirectedRef.current) {
      hasRedirectedRef.current = true;
      // URLパラメータからリダイレクト先を取得（安全に検証）
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

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-blue-50">
      {error && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 w-full max-w-md px-4">
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg">
            <p className="text-sm font-medium">{tSignin("errorTitle")}</p>
            <p className="text-xs mt-1">{error}</p>
          </div>
        </div>
      )}
      {useAuthUI ? (
        <AuthUI />
      ) : (
        <AuthForm
          mode="signin"
          onSuccess={() => {
            // URLパラメータからリダイレクト先を取得（安全に検証）
            const redirectTo = getSafeRedirectUrl(searchParams.get("redirect_to"));
            router.push(redirectTo);
          }}
        />
      )}
    </div>
  );
}
