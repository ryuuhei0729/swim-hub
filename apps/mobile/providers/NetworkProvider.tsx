// =============================================================================
// NetworkProvider - ネットワーク状態を管理するプロバイダー
// =============================================================================

import React, { useEffect, createContext, useContext } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNetworkStatus } from '@/hooks/useNetworkStatus'

interface NetworkContextType {
  isConnected: boolean
  isInternetReachable: boolean | null
}

const NetworkContext = createContext<NetworkContextType>({
  isConnected: true,
  isInternetReachable: true,
})

interface NetworkProviderProps {
  children: React.ReactNode
}

/**
 * ネットワーク状態を管理し、オンライン復帰時にデータを同期するプロバイダー
 */
export function NetworkProvider({ children }: NetworkProviderProps) {
  const { isConnected, isInternetReachable } = useNetworkStatus()
  const queryClient = useQueryClient()

  // オンライン復帰時にデータを再取得
  useEffect(() => {
    if (isConnected && isInternetReachable) {
      // オンライン復帰時、staleなクエリを再取得
      queryClient.refetchQueries({
        type: 'active', // アクティブなクエリのみ
        stale: true, // staleなクエリのみ
      })
    }
  }, [isConnected, isInternetReachable, queryClient])

  return (
    <NetworkContext.Provider value={{ isConnected, isInternetReachable }}>
      {children}
    </NetworkContext.Provider>
  )
}

/**
 * ネットワーク状態を取得するフック
 */
export function useNetwork() {
  return useContext(NetworkContext)
}
