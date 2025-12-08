// =============================================================================
// Vitestセットアップ - モバイルアプリ
// =============================================================================

import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// 各テスト後にクリーンアップ
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

// React Native モジュールのモック
vi.mock('react-native', () => {
  const React = require('react')
  return {
    default: React,
    View: ({ children, ...props }: any) => React.createElement('div', props, children),
    Text: ({ children, ...props }: any) => React.createElement('span', props, children),
    Pressable: ({ children, onPress, ...props }: any) =>
      React.createElement('button', { ...props, onClick: onPress }, children),
    ScrollView: ({ children, ...props }: any) =>
      React.createElement('div', { ...props, style: { overflow: 'auto' } }, children),
    FlatList: ({ data, renderItem, keyExtractor, ...props }: any) => {
      const items = data?.map((item: any, index: number) => {
        const key = keyExtractor ? keyExtractor(item, index) : index
        return React.createElement('div', { key }, renderItem({ item, index }))
      })
      return React.createElement('div', props, items)
    },
    StyleSheet: {
      create: (styles: any) => styles,
      flatten: (style: any) => style,
    },
    Platform: {
      OS: 'web',
      select: (obj: any) => obj.web || obj.default,
    },
    Alert: {
      alert: vi.fn(),
      prompt: vi.fn(),
    },
    ActivityIndicator: ({ ...props }: any) => React.createElement('div', props, 'Loading...'),
    RefreshControl: ({ ...props }: any) => React.createElement('div', props),
    Image: ({ source, ...props }: any) =>
      React.createElement('img', { ...props, src: source?.uri || source }),
    TextInput: ({ ...props }: any) => React.createElement('input', { type: 'text', ...props }),
  }
})

// Expo モジュールのモック
vi.mock('expo', () => ({
  Constants: {
    expoConfig: {
      extra: {
        EXPO_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
        EXPO_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
      },
    },
  },
}))

vi.mock('expo-status-bar', () => ({
  StatusBar: () => null,
}))

// @react-native-community/netinfo のモック
vi.mock('@react-native-community/netinfo', () => {
  let currentState = {
    isConnected: true,
    isInternetReachable: true,
    type: 'wifi',
  }

  const listeners: Array<(state: any) => void> = []

  return {
    default: {
      fetch: vi.fn(() => Promise.resolve(currentState)),
      addEventListener: vi.fn((listener: (state: any) => void) => {
        listeners.push(listener)
        return () => {
          const index = listeners.indexOf(listener)
          if (index > -1) {
            listeners.splice(index, 1)
          }
        }
      }),
      // テスト用: ネットワーク状態を変更するヘルパー
      _setState: (state: any) => {
        currentState = state
        listeners.forEach((listener) => listener(state))
      },
    },
  }
})

// AsyncStorage のモック
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(() => Promise.resolve(null)),
    setItem: vi.fn(() => Promise.resolve()),
    removeItem: vi.fn(() => Promise.resolve()),
    clear: vi.fn(() => Promise.resolve()),
  },
}))

// React Navigation のモック
vi.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: vi.fn(),
    goBack: vi.fn(),
    setOptions: vi.fn(),
  }),
  NavigationContainer: ({ children }: any) => children,
  useFocusEffect: vi.fn((callback) => callback()),
}))

vi.mock('@react-navigation/native-stack', () => ({
  createNativeStackNavigator: () => ({
    Navigator: ({ children }: any) => children,
    Screen: () => null,
  }),
}))

vi.mock('@react-navigation/bottom-tabs', () => ({
  createBottomTabNavigator: () => ({
    Navigator: ({ children }: any) => children,
    Screen: () => null,
  }),
}))

// グローバルなモック設定
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))

global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))

// matchMedia のモック
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// scrollTo のモック
Object.defineProperty(window, 'scrollTo', {
  writable: true,
  value: vi.fn(),
})
