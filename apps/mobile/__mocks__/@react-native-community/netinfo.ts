// =============================================================================
// @react-native-community/netinfo 静的モック - Vitest用
// =============================================================================

import { vi } from 'vitest'

type NetInfoMockState = {
  isConnected: boolean
  isInternetReachable: boolean | null
  type: string
}

let currentState: NetInfoMockState = {
  isConnected: true,
  isInternetReachable: true,
  type: 'wifi',
}

const listeners: Array<(state: NetInfoMockState) => void> = []

const NetInfo = {
  fetch: vi.fn(() => Promise.resolve(currentState)),
  addEventListener: vi.fn((listener: (state: NetInfoMockState) => void) => {
    listeners.push(listener)
    return () => {
      const index = listeners.indexOf(listener)
      if (index > -1) {
        listeners.splice(index, 1)
      }
    }
  }),
  // テスト用: ネットワーク状態を変更するヘルパー
  _setState: (state: NetInfoMockState) => {
    currentState = state
    listeners.forEach((listener) => listener(state))
  },
}

export default NetInfo

// NetInfoState型を定義（元のモジュールからインポートできないため）
export type NetInfoState = {
  isConnected: boolean | null
  isInternetReachable: boolean | null
  type: string
  details: unknown
}
