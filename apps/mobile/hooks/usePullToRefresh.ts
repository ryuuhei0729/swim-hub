// =============================================================================
// usePullToRefresh - Pull to refresh の spinner state を一元管理するフック
// =============================================================================
// queryKey の知識は持たず、呼び出し元が組み立てた refresh 関数を実行するだけの
// 薄いラッパー。オフライン時は refresh を呼ばずに即座に return する
// (オフライン表示自体は components/layout/OfflineBanner.tsx が全画面で担保する)。

import { useCallback, useState } from "react";
import { useNetworkStatus } from "./useNetworkStatus";

/**
 * Pull to refresh の spinner state を一元管理するフック
 *
 * @param refresh 呼び出し元の画面が組み立てた「全対象クエリを再取得する」関数
 */
export function usePullToRefresh(refresh: () => Promise<unknown>): {
  refreshing: boolean;
  handleRefresh: () => Promise<void>;
} {
  const { isConnected } = useNetworkStatus();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    if (!isConnected) return;

    setRefreshing(true);
    try {
      await refresh();
    } catch (error) {
      // 呼び出し元は Promise.allSettled で個々のクエリ失敗を吸収する想定のため、
      // refresh() 自体が reject することは通常ない (refetch/invalidateQueries は
      // デフォルト throwOnError: false)。ここに到達するのは呼び出し元の実装ミス等、
      // 想定外の同期 throw のみだが、RefreshControl の onRefresh は例外を捕まえない
      // ため unhandled rejection にしないよう保険として捕捉し、spinner を確実に閉じる
      console.error("pull-to-refresh failed:", error);
    } finally {
      setRefreshing(false);
    }
  }, [isConnected, refresh]);

  return { refreshing, handleRefresh };
}
