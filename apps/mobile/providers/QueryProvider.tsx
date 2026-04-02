// =============================================================================
// QueryProvider - React Queryのプロバイダーコンポーネント
// =============================================================================

import React from "react";
import { AppState, Platform } from "react-native";
import { QueryClientProvider, QueryClient, focusManager } from "@tanstack/react-query";

// React Query公式推奨: AppStateでfocusManagerを連動させる
// https://tanstack.com/query/latest/docs/framework/react/react-native
focusManager.setEventListener((handleFocus) => {
  const subscription = AppState.addEventListener("change", (state) => {
    if (Platform.OS !== "web") {
      handleFocus(state === "active");
    }
  });
  return () => subscription.remove();
});

let queryClient: QueryClient | undefined = undefined;

/**
 * モバイル用のQueryClientを作成
 * オフライン対応のための最適化設定を追加
 */
function createMobileQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 10, // 10分（オフライン対応のため長めに設定）
        gcTime: 1000 * 60 * 60 * 24 * 7, // 7日間（オフライン時のデータ保持）
        refetchOnWindowFocus: true, // AppState連動でバックグラウンド復帰時に再取得
        refetchOnMount: true,
        refetchOnReconnect: true, // オンライン復帰時に自動再取得
        retry: (failureCount, error: unknown) => {
          const message = error instanceof Error ? error.message : "";
          const code =
            typeof error === "object" && error !== null && "code" in error
              ? (error as { code?: string }).code
              : undefined;

          // ネットワークエラーの場合はリトライしない（オフライン時）
          if (message.includes("network") || code === "NETWORK_ERROR") {
            return false;
          }
          // その他のエラーは最大3回リトライ
          return failureCount < 3;
        },
        networkMode: "online", // オフライン時はクエリを実行しない
      },
      mutations: {
        retry: 0, // ミューテーションはリトライしない
        networkMode: "online", // オフライン時はミューテーションを実行しない
      },
    },
  });
}

/**
 * QueryClientを取得する関数
 * React Nativeではシングルトンインスタンスを返す
 */
export function getQueryClient() {
  if (!queryClient) {
    queryClient = createMobileQueryClient();
  }
  return queryClient;
}

interface QueryProviderProps {
  children: React.ReactNode;
}

/**
 * React Queryのプロバイダーコンポーネント
 * AuthProviderの内側に配置して、認証済みユーザーのみReact Queryを使用可能にする
 */
export default function QueryProvider({ children }: QueryProviderProps) {
  const queryClient = getQueryClient();

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
