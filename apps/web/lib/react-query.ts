// =============================================================================
// React Query設定 - Swim Hub Webアプリケーション
// =============================================================================

import { QueryClient } from '@tanstack/react-query'

/**
 * QueryClientのデフォルト設定
 * 
 * 設定内容:
 * - staleTime: 5分 - データが新鮮とみなされる時間
 * - gcTime: 10分 - キャッシュが保持される時間（旧cacheTime）
 * - refetchOnWindowFocus: false - ウィンドウフォーカス時の自動再取得を無効化
 * - retry: 1 - エラー時のリトライ回数
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5分
      gcTime: 10 * 60 * 1000, // 10分（旧cacheTime）
      refetchOnWindowFocus: false,
      retry: 1,
    },
    mutations: {
      retry: 1,
    },
  },
})

