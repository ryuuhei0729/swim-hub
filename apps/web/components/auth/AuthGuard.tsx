"use client";

import { useTranslations } from "next-intl";
import { useAuth } from "@/contexts";
import { FullScreenLoading } from "@/components/ui/LoadingSpinner";

interface AuthGuardProps {
  children: React.ReactNode;
}

/**
 * クライアント認証ガード
 * (authenticated) グループでは Server Component がガードを担当するため不要。
 * update-password 等の特殊ページでのみ使用。
 */
export const AuthGuard: React.FC<AuthGuardProps> = ({ children }) => {
  const { loading, isAuthenticated } = useAuth();
  const t = useTranslations("auth.signin");

  if (loading) {
    return <FullScreenLoading message={t("loadingMessage")} />;
  }

  if (!isAuthenticated) {
    return null;
  }

  return <>{children}</>;
};
