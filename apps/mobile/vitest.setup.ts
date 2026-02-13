// =============================================================================
// Vitestセットアップ - モバイルアプリ
// =============================================================================

import { cleanup } from '@testing-library/react'
import React from 'react'
import { afterEach, vi } from 'vitest'

// Reactの複数インスタンスを防ぐため、グローバルに設定
if (typeof globalThis !== 'undefined') {
  ;(globalThis as unknown as { React: typeof React }).React = React
}

// 各テスト後にクリーンアップ
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

// 注意: React Nativeのモックは vitest.config.ts の resolve.alias で
// __mocks__/react-native.ts にエイリアスされているため、ここでは不要

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

// expo-image のモック
vi.mock('expo-image', () => ({
  Image: ({ source, contentFit: _contentFit, ...props }: { source?: { uri?: string } | string; contentFit?: string } & Record<string, unknown>) => {
    const src = typeof source === 'string' ? source : source?.uri
    return React.createElement('img', { ...props, src })
  },
}))

// 注意: @react-native-community/netinfoのモックは vitest.config.ts の resolve.alias で
// __mocks__/@react-native-community/netinfo.ts にエイリアスされているため、ここでは不要

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
