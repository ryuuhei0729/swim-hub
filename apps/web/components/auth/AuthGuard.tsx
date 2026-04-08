"use client";

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

  if (loading) {
    return <FullScreenLoading message="認証情報を確認中..." />;
  }

  if (!isAuthenticated) {
    return null;
  }

  return <>{children}</>;
};
