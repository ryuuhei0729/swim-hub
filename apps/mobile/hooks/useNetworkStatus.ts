// =============================================================================
// useNetworkStatus - ネットワーク状態を監視するフック
// =============================================================================

import NetInfo, { type NetInfoState } from '@react-native-community/netinfo'
import { useEffect, useState } from 'react'

export interface NetworkStatus {
  isConnected: boolean
  isInternetReachable: boolean | null
  type: string | null
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
  })

  useEffect(() => {
    // 初回の状態取得
    NetInfo.fetch().then((state: NetInfoState) => {
      setNetworkState({
        isConnected: state.isConnected ?? false,
        isInternetReachable: state.isInternetReachable ?? null,
        type: state.type,
      })
    })

    // ネットワーク状態の変更を監視
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      setNetworkState({
        isConnected: state.isConnected ?? false,
        isInternetReachable: state.isInternetReachable ?? null,
        type: state.type,
      })
    })

    return () => {
      unsubscribe()
    }
  }, [])

  return networkState
}
