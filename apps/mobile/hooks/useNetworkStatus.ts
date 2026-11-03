// =============================================================================
// useNetworkStatus - ネットワーク状態を監視するフック
// =============================================================================

import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";
import { useEffect, useState } from "react";

export interface NetworkStatus {
  isConnected: boolean;
  isInternetReachable: boolean | null;
  type: string | null;
}

/**
 * NetInfo の状態から「通信できる」とみなすかを判定する。
 *
 * isConnected だけを見ると、施設 Wi-Fi のログイン画面 (キャプティブポータル) のように
 * 「つながってはいるがインターネットに出られない」状態をオンラインと誤認する。
 * isInternetReachable が明示的に false のときもオフラインとして扱う
 * (null = まだ判定中のときは、誤ってオフライン表示しないようオンライン扱い)。
 */
export function isNetInfoOnline(state: {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
}): boolean {
  return state.isConnected !== false && state.isInternetReachable !== false;
}

/**
 * ネットワーク状態を監視するフック
 *
 * @returns {NetworkStatus} ネットワーク状態情報
 */
export function useNetworkStatus(): NetworkStatus {
  const [networkState, setNetworkState] = useState<NetworkStatus>({
    isConnected: true, // 初期値は接続済みと仮定
    isInternetReachable: true,
    type: null,
  });

  useEffect(() => {
    // 初回の状態取得
    NetInfo.fetch().then((state: NetInfoState) => {
      setNetworkState({
        isConnected: state.isConnected ?? false,
        isInternetReachable: state.isInternetReachable ?? null,
        type: state.type,
      });
    });

    // ネットワーク状態の変更を監視
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      setNetworkState({
        isConnected: state.isConnected ?? false,
        isInternetReachable: state.isInternetReachable ?? null,
        type: state.type,
      });
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return networkState;
}
