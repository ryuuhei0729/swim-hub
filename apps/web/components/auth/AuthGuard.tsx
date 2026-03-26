"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/contexts";
import { FullScreenLoading } from "@/components/ui/LoadingSpinner";

interface AuthGuardProps {
  children: React.ReactNode;
}

export const AuthGuard: React.FC<AuthGuardProps> = ({ children }) => {
  const { loading, isAuthenticated } = useAuth();
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  // SSRとクライアント初回レンダーで同じ出力を返す（Hydration Mismatch回避）
  // useEffect後にisHydrated=trueとなり、認証状態に基づいて再レンダーされる
  if (!isHydrated) {
    return <FullScreenLoading message="認証情報を確認中..." />;
  }

  // ハイドレーション後、クライアント認証がまだ完了していない場合
  if (loading) {
    return <FullScreenLoading message="認証情報を確認中..." />;
  }

  // 万が一の状態変化に備えて、未認証の場合は何も表示しない
  if (!isAuthenticated) {
    return null;
  }

  return <>{children}</>;
};
