"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";

import { AuthForm } from "@/components/auth";
import { FullScreenLoading } from "@/components/ui/LoadingSpinner";
import { useAuth } from "@/contexts";
import { useRouter, Link } from "@/i18n/navigation";

export default function SignupEmailPage() {
  const { user, session, loading } = useAuth();
  const router = useRouter();
  const tSignin = useTranslations("auth.signin");
  const tSignup = useTranslations("auth.signup");
  const hasRedirectedRef = useRef(false);

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

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-blue-50">
      <div className="max-w-md w-full space-y-4">
        <AuthForm mode="signup" showOAuth={false} />
        <div className="text-center">
          <Link
            href="/signup"
            className="block text-sm font-medium text-blue-600 hover:text-blue-800 transition duration-150 ease-in-out"
            data-testid="back-to-signup-options-link"
          >
            {tSignup("otherMethods")}
          </Link>
        </div>
      </div>
    </div>
  );
}
