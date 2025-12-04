// =============================================================================
// React Query設定 - Swim Hub共通パッケージ
// Web/Mobile共通で使用するReact Query設定
// =============================================================================

import { QueryClient } from '@tanstack/react-query'

/**
 * QueryClientのデフォルト設定
 * 
 * 設定内容:
 * - staleTime: 5分 - データが新鮮とみなされる時間
 * - gcTime: 24時間 - キャッシュが保持される時間（旧cacheTime）
 * - refetchOnWindowFocus: true - ウィンドウフォーカス時の自動再取得を有効化
 * - refetchOnMount: true - マウント時の自動再取得を有効化
 * - refetchOnReconnect: true - 再接続時の自動再取得を有効化
 * - retry: 3 - エラー時のリトライ回数
 */
export const createQueryClient = () => new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5分
      gcTime: 1000 * 60 * 60 * 24, // 24時間
      refetchOnWindowFocus: true,
      refetchOnMount: true,
      refetchOnReconnect: true,
      retry: 3,
    },
    mutations: {
      retry: 0,
    },
  },
})

