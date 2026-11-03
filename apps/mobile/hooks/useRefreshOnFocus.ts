import { useCallback, useRef } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { isNetInfoOnline, useNetworkStatus } from "./useNetworkStatus";

/**
 * タブ遷移時にデータを再取得するフック
 * 初回マウント時はスキップし、2回目以降のフォーカスで refetch を実行
 * オフライン時はスキップ
 */
export function useRefreshOnFocus(refetch: () => void) {
  const isOnline = isNetInfoOnline(useNetworkStatus());
  const isFirstMount = useRef(true);

  useFocusEffect(
    useCallback(() => {
      if (isFirstMount.current) {
        isFirstMount.current = false;
        return;
      }
      if (isOnline) {
        refetch();
      }
    }, [refetch, isOnline]),
  );
}
