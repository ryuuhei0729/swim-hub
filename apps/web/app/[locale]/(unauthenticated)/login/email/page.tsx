"use client";

import { useEffect, useRef, Suspense } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";

import { EmailSignInForm } from "@/components/auth";
import { useAuth } from "@/contexts";
import { useFullPageRouter } from "@/i18n/fullPageNavigation";
import { FullScreenLoading } from "@/components/ui/LoadingSpinner";
import { resolveSafeLocalRedirect } from "@/utils/localeRedirect";

function EmailLoginFallback() {
  const tSignin = useTranslations("auth.signin");
  return <FullScreenLoading message={tSignin("loadingMessage")} />;
}

export default function LoginEmailPage() {
  return (
    <Suspense fallback={<EmailLoginFallback />}>
      <LoginEmailContent />
    </Suspense>
  );
}

function LoginEmailContent() {
  const { user, session, loading } = useAuth();
  const isAuthenticated = !!user && !!session;
  // ログイン後はページを読み直す (前のユーザーの画面のキャッシュを使い回さない)
  const router = useFullPageRouter();
  const searchParams = useSearchParams();
  const hasRedirectedRef = useRef(false);
  const tSignin = useTranslations("auth.signin");

  useEffect(() => {
    if (!loading && isAuthenticated && !hasRedirectedRef.current) {
      hasRedirectedRef.current = true;
      const redirectTo = resolveSafeLocalRedirect(searchParams.get("redirect_to"));
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
      <EmailSignInForm />
    </div>
  );
}
