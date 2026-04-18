// =============================================================================
// Vitestセットアップ - モバイルアプリ
// =============================================================================

import { cleanup } from "@testing-library/react";
import React from "react";
import { afterEach, vi } from "vitest";

// React Native / Expo の __DEV__ グローバル (expo-modules-core 等が参照)
(globalThis as unknown as { __DEV__: boolean }).__DEV__ = true;

// Reactの複数インスタンスを防ぐため、グローバルに設定
if (typeof globalThis !== "undefined") {
  (globalThis as unknown as { React: typeof React }).React = React;
}

// 各テスト後にクリーンアップ
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// 注意: React Nativeのモックは vitest.config.ts の resolve.alias で
// __mocks__/react-native.ts にエイリアスされているため、ここでは不要

// Expo Constants モジュールのモック
vi.mock("expo-constants", () => ({
  default: {
    expoConfig: {
      extra: {
        supabaseUrl: "https://test.supabase.co",
        supabaseAnonKey: "test-anon-key",
      },
    },
  },
}));

vi.mock("expo-status-bar", () => ({
  StatusBar: () => null,
}));

// expo-modules-core: テスト環境では globalThis.expo が未定義で EventEmitter 参照が落ちるので最小スタブを提供
vi.mock("expo-modules-core", () => {
  class FakeEventEmitter {
    addListener() {
      return { remove: () => {} };
    }
    removeAllListeners() {}
    emit() {}
  }
  return {
    EventEmitter: FakeEventEmitter,
    NativeModulesProxy: new Proxy({}, { get: () => () => null }),
    requireNativeModule: () => ({}),
    requireOptionalNativeModule: () => null,
    Platform: { OS: "ios" },
    uuidv4: () => "00000000-0000-0000-0000-000000000000",
  };
});

// expo-crypto: useAppleAuth 等で digestStringAsync / getRandomValues を使用
vi.mock("expo-crypto", () => ({
  digestStringAsync: vi.fn(async () => "mock-digest"),
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  randomUUID: () => "00000000-0000-0000-0000-000000000000",
  getRandomValues: <T extends ArrayBufferView | null>(array: T): T => {
    if (array && "length" in (array as unknown as { length: number })) {
      const view = array as unknown as { length: number; [i: number]: number };
      for (let i = 0; i < view.length; i++) view[i] = (i * 17) & 0xff;
    }
    return array;
  },
}));

// expo-video: VideoPlayer 経由で PracticeLogItem 等が間接 import
vi.mock("expo-video", () => ({
  useVideoPlayer: () => ({
    play: vi.fn(),
    pause: vi.fn(),
    release: vi.fn(),
  }),
  VideoView: () => null,
}));

// react-native-purchases: dist/purchases.js に Flow 構文が残っていて esbuild が落ちるので stub
vi.mock("react-native-purchases", () => ({
  default: {
    configure: vi.fn(),
    setLogLevel: vi.fn(),
    logIn: vi.fn(async () => ({ customerInfo: {} })),
    logOut: vi.fn(async () => ({})),
    getCustomerInfo: vi.fn(async () => ({})),
    addCustomerInfoUpdateListener: vi.fn(() => () => {}),
  },
  LOG_LEVEL: { DEBUG: "DEBUG", INFO: "INFO" },
}));

// expo-image のモック
vi.mock("expo-image", () => ({
  Image: ({
    source,
    contentFit: _contentFit,
    ...props
  }: { source?: { uri?: string } | string; contentFit?: string } & Record<string, unknown>) => {
    const src = typeof source === "string" ? source : source?.uri;
    return React.createElement("img", { ...props, src });
  },
}));

// 注意: @react-native-community/netinfoのモックは vitest.config.ts の resolve.alias で
// __mocks__/@react-native-community/netinfo.ts にエイリアスされているため、ここでは不要

// AsyncStorage のモック
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(() => Promise.resolve(null)),
    setItem: vi.fn(() => Promise.resolve()),
    removeItem: vi.fn(() => Promise.resolve()),
    clear: vi.fn(() => Promise.resolve()),
  },
}));

// React Navigation のモック
vi.mock("@react-navigation/native", () => ({
  useNavigation: () => ({
    navigate: vi.fn(),
    goBack: vi.fn(),
    setOptions: vi.fn(),
  }),
  NavigationContainer: ({ children }: { children: React.ReactNode }) => children,
  useFocusEffect: vi.fn((callback) => callback()),
}));

vi.mock("@react-navigation/native-stack", () => ({
  createNativeStackNavigator: () => ({
    Navigator: ({ children }: { children: React.ReactNode }) => children,
    Screen: () => null,
  }),
}));

vi.mock("@react-navigation/bottom-tabs", () => ({
  createBottomTabNavigator: () => ({
    Navigator: ({ children }: { children: React.ReactNode }) => children,
    Screen: () => null,
  }),
}));

// @expo/vector-icons のモック
vi.mock("@expo/vector-icons", () => {
  const React = require("react");

  return {
    Feather: ({
      name,
      ...props
    }: {
      name: string;
      size?: number;
      color?: string;
    } & Record<string, unknown>) => {
      // map-pinアイコンを絵文字としてレンダリング
      const iconMap: Record<string, string> = {
        "map-pin": "📍",
      };
      return React.createElement(
        "span",
        { ...props, "data-testid": `icon-${name}` },
        iconMap[name] || "",
      );
    },
  };
});

// react-native-safe-area-context のモック
vi.mock("react-native-safe-area-context", () => {
  return {
    useSafeAreaInsets: () => ({
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
    }),
    SafeAreaProvider: ({ children }: { children?: React.ReactNode }) => children,
    SafeAreaView: ({
      children,
      ...props
    }: { children?: React.ReactNode } & Record<string, unknown>) => {
      const React = require("react");
      return React.createElement("div", props, children);
    },
  };
});

// グローバルなモック設定
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// matchMedia のモック
Object.defineProperty(window, "matchMedia", {
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
});

// scrollTo のモック
Object.defineProperty(window, "scrollTo", {
  writable: true,
  value: vi.fn(),
});
