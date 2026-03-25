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

  // 初回レンダリング時（ブラウザ）はミドルウェアが認証済みなのでそのまま表示
  // クライアントサイドの認証チェック完了を待たずにコンテンツを見せる
  // ただしSSG（静的ビルド）時はchildrenを評価するとSupabase初期化が失敗するため除外
  if (!isHydrated) {
    if (typeof window === "undefined") {
      return <FullScreenLoading message="認証情報を確認中..." />;
    }
    return <>{children}</>;
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
