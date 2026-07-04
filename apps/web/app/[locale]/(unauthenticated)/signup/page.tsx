"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { OAuthButtons } from "@/components/auth";
import { FullScreenLoading } from "@/components/ui/LoadingSpinner";
import { useAuth } from "@/contexts";
import { useRouter, Link } from "@/i18n/navigation";

export default function SignupPage() {
  const { user, session, loading, signInWithOAuth } = useAuth();
  const router = useRouter();
  const tSignin = useTranslations("auth.signin");
  const tSignup = useTranslations("auth.signup");
  const tErrors = useTranslations("auth.errors");
  const tAuth = useTranslations("auth");
  const hasRedirectedRef = useRef(false);

  const [oauthLoading, setOauthLoading] = useState(false);
  const [oauthError, setOauthError] = useState<string | null>(null);

  const isEmailVerified = !!user?.email_confirmed_at;
  const isAuthenticated = !!user && !!session;

  useEffect(() => {
    if (!loading && isAuthenticated && isEmailVerified && !hasRedirectedRef.current) {
      hasRedirectedRef.current = true;
      router.push("/onboarding");
    }
  }, [isAuthenticated, isEmailVerified, loading, router]);

  if (loading) {
    return <FullScreenLoading message={tSignin("loadingMessage")} />;
  }

  if (isAuthenticated && isEmailVerified) {
    return null;
  }

  const handleGoogleClick = async () => {
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
      <div className="max-w-md w-full space-y-4 sm:space-y-6 bg-white p-4 sm:p-8 rounded-2xl shadow-xl">
        <div className="text-center">
          <h2 className="text-xl sm:text-2xl font-extrabold text-gray-900 mb-2">
            {tSignup("title")}
          </h2>
          <p className="text-xs sm:text-sm text-gray-600">{tSignup("subtitle")}</p>
        </div>

        {oauthError && (
          <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">
            <p className="text-sm">{oauthError}</p>
          </div>
        )}

        {/* Google / Apple — 主役ボタン */}
        <OAuthButtons
          onGoogleClick={handleGoogleClick}
          onAppleClick={handleAppleClick}
          loading={oauthLoading}
          context="signup"
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

        {/* メールアドレスで新規登録 — 控えめなゴーストボタン */}
        <Link
          href="/signup/email"
          data-testid="email-signup-button"
          aria-disabled={oauthLoading}
          className={`w-full flex items-center justify-center py-2.5 px-4 border border-gray-300 rounded-xl text-sm font-medium text-gray-500 bg-transparent hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-300 transition duration-150 ease-in-out${oauthLoading ? " pointer-events-none opacity-50" : ""}`}
        >
          {tSignup("continueWithEmail")}
        </Link>

        {/* ログインリンク */}
        <div className="text-center pt-2">
          <Link
            href="/login"
            className="block text-xs text-blue-600 hover:text-blue-800 transition duration-150 ease-in-out"
            data-testid="login-link"
          >
            {tAuth("switchToSignin")}
          </Link>
        </div>
      </div>
    </div>
  );
}
