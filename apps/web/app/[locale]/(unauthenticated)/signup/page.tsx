"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";

import { AuthForm } from "@/components/auth";
import { FullScreenLoading } from "@/components/ui/LoadingSpinner";
import { useAuth } from "@/contexts";
import { useRouter } from "@/i18n/navigation";

export default function SignupPage() {
  const { isAuthenticated, loading } = useAuth();
  const router = useRouter();
  const tSignin = useTranslations("auth.signin");

  useEffect(() => {
    if (!loading && isAuthenticated) {
      router.push("/onboarding");
    }
  }, [isAuthenticated, loading, router]);

  if (loading) {
    return <FullScreenLoading message={tSignin("loadingMessage")} />;
  }

  if (isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-blue-50">
      <AuthForm
        mode="signup"
        onSuccess={() => {
          // メール認証の案内メッセージは表示しない
        }}
      />
    </div>
  );
}
