// =============================================================================
// Vitestセットアップ - モバイルアプリ
// =============================================================================

import { cleanup } from '@testing-library/react'
import React from 'react'
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
    View: ({ children, ...props }: { children?: React.ReactNode } & Record<string, unknown>) =>
      React.createElement('div', props, children),
    Text: ({ children, ...props }: { children?: React.ReactNode } & Record<string, unknown>) =>
      React.createElement('span', props, children),
    Pressable: ({
      children,
      onPress,
      ...props
    }: { children?: React.ReactNode; onPress?: () => void } & Record<string, unknown>) =>
      React.createElement('button', { ...props, onClick: onPress }, children),
    ScrollView: ({ children, ...props }: { children?: React.ReactNode } & Record<string, unknown>) =>
      React.createElement('div', { ...props, style: { overflow: 'auto' } }, children),
    FlatList: ({
      data,
      renderItem,
      keyExtractor,
      ...props
    }: {
      data?: unknown[]
      renderItem?: ({ item, index }: { item: unknown; index: number }) => React.ReactNode
      keyExtractor?: (item: unknown, index: number) => string | number
      children?: React.ReactNode
    } & Record<string, unknown>) => {
      const items = data?.map((item, index) => {
        const key = keyExtractor ? keyExtractor(item, index) : index
        return renderItem ? React.createElement('div', { key }, renderItem({ item, index })) : null
      })
      return React.createElement('div', props, items)
    },
    StyleSheet: {
      create: <T extends object>(styles: T) => styles,
      flatten: <T>(style: T) => style,
    },
    Platform: {
      OS: 'web',
      select: <T,>(obj: { web?: T; default?: T }) => obj.web ?? obj.default,
    },
    Alert: {
      alert: vi.fn(),
      prompt: vi.fn(),
    },
    ActivityIndicator: ({ ...props }: Record<string, unknown>) =>
      React.createElement('div', props, 'Loading...'),
    RefreshControl: ({ ...props }: Record<string, unknown>) => React.createElement('div', props),
    Image: ({ source, ...props }: { source?: { uri?: string } | string } & Record<string, unknown>) => {
      const src = typeof source === 'string' ? source : source?.uri
      return React.createElement('img', { ...props, src })
    },
    TextInput: ({ ...props }: Record<string, unknown>) =>
      React.createElement('input', { type: 'text', ...props }),
  }
})

// Expo Constants モジュールのモック
vi.mock('expo-constants', () => ({
  default: {
    expoConfig: {
      extra: {
        supabaseUrl: 'https://test.supabase.co',
        supabaseAnonKey: 'test-anon-key',
      },
    },
  },
}))

vi.mock('expo-status-bar', () => ({
  StatusBar: () => null,
}))

// @react-native-community/netinfo のモック
vi.mock('@react-native-community/netinfo', () => {
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

  return {
    default: {
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
  NavigationContainer: ({ children }: { children: React.ReactNode }) => children,
  useFocusEffect: vi.fn((callback) => callback()),
}))

vi.mock('@react-navigation/native-stack', () => ({
  createNativeStackNavigator: () => ({
    Navigator: ({ children }: { children: React.ReactNode }) => children,
    Screen: () => null,
  }),
}))

vi.mock('@react-navigation/bottom-tabs', () => ({
  createBottomTabNavigator: () => ({
    Navigator: ({ children }: { children: React.ReactNode }) => children,
    Screen: () => null,
  }),
}))

// @expo/vector-icons のモック
vi.mock('@expo/vector-icons', () => {
  const React = require('react')

  return {
    Feather: ({
      name,
      ...props
    }: {
      name: string
      size?: number
      color?: string
    } & Record<string, unknown>) => {
      // map-pinアイコンを絵文字としてレンダリング
      const iconMap: Record<string, string> = {
        'map-pin': '📍',
      }
      return React.createElement('span', { ...props, 'data-testid': `icon-${name}` }, iconMap[name] || '')
    },
  }
})

// react-native-safe-area-context のモック
vi.mock('react-native-safe-area-context', () => {
  return {
    useSafeAreaInsets: () => ({
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
    }),
    SafeAreaProvider: ({ children }: { children?: React.ReactNode }) => children,
    SafeAreaView: ({ children, ...props }: { children?: React.ReactNode } & Record<string, unknown>) => {
      const React = require('react')
      return React.createElement('div', props, children)
    },
  }
})

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
