// =============================================================================
// NetworkProvider - ネットワーク状態を管理するプロバイダー
// =============================================================================

import React, { createContext, useContext } from "react";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";

interface NetworkContextType {
  isConnected: boolean;
  isInternetReachable: boolean | null;
}

const NetworkContext = createContext<NetworkContextType>({
  isConnected: true,
  isInternetReachable: true,
});

interface NetworkProviderProps {
  children: React.ReactNode;
}

/**
 * ネットワーク状態を画面へ配るプロバイダー
 *
 * オンライン復帰時の再取得は React Query の onlineManager (QueryProvider で NetInfo と連動)
 * の refetchOnReconnect に任せる。ここで refetchQueries を呼ぶと二重に取得してしまう。
 */
export function NetworkProvider({ children }: NetworkProviderProps) {
  const { isConnected, isInternetReachable } = useNetworkStatus();

  return (
    <NetworkContext.Provider value={{ isConnected, isInternetReachable }}>
      {children}
    </NetworkContext.Provider>
  );
}

/**
 * ネットワーク状態を取得するフック
 */
export function useNetwork() {
  return useContext(NetworkContext);
}
