// =============================================================================
// SettingsScreen.bottomInset.test.tsx
// =============================================================================
//
// ユーザー実機報告 (Android 3ボタンナビ): マイページ→設定 の最下部にある
// ログアウトボタンがシステムナビゲーションバーと重なる。
//
// 原因: SettingsScreen はフッター固定ではなく ScrollView の最下段にログアウト
// ボタンを置いているため、過去の Edge-to-Edge 一斉修正 (フッター固定パターンのみ)
// の対象外だった。contentContainerStyle の paddingBottom が固定 32 で、
// 3ボタンナビの inset (48dp) より小さい。
//
// このテストは「下部 inset が ScrollView のスクロール余白に実際に反映されるか」を
// 配線レベルで検証する。inset は vitest.setup.ts の共通モックでは 0 のため、
// このファイルだけ bottom=48 を返すようにモックを差し替える。
//
// ミューテーション確認方法: SettingsScreen の contentContainerStyle を
// `styles.scrollContent` 単体に戻すと paddingBottom は 32 のままになり赤になる。

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTableDispatchSupabase } from "./utils/tableSupabaseMock";

/** 実機の Android 3ボタンナビゲーションバー相当 (48dp)。 */
const NAV_BAR_INSET = 48;

vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: NAV_BAR_INSET, left: 0, right: 0 }),
  initialWindowMetrics: null,
  SafeAreaProvider: ({ children }: { children?: React.ReactNode }) => children,
  SafeAreaView: ({
    children,
    ...props
  }: { children?: React.ReactNode } & Record<string, unknown>) => {
    const ReactLib = require("react");
    return ReactLib.createElement("div", props, children);
  },
}));

// ScrollView に渡された contentContainerStyle を捕捉する。
// (__mocks__/react-native.ts の ScrollView は style 系 prop を DOM に落として
//  しまい検査できないため、prop そのものを記録する薄いラッパーで包む)
const captured = vi.hoisted(() => ({ contentContainerStyles: [] as unknown[] }));

vi.mock("react-native", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("react-native");
  const ReactLib = await vi.importActual<typeof import("react")>("react");
  const ActualScrollView = actual.ScrollView as React.ComponentType<
    Record<string, unknown>
  >;
  return {
    ...actual,
    ScrollView: ({
      contentContainerStyle,
      ...props
    }: { contentContainerStyle?: unknown } & Record<string, unknown>) => {
      captured.contentContainerStyles.push(contentContainerStyle);
      return ReactLib.createElement(ActualScrollView, props);
    },
  };
});

vi.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: vi.fn(), goBack: vi.fn(), setOptions: vi.fn() }),
}));

// 本テストの関心事 (スクロール余白) と無関係なネイティブ依存セクションはスタブする
// (SettingsScreen.refreshDrift.test.tsx と同一パターン)。
vi.mock("@/components/settings/GoogleCalendarSyncSettings", () => ({
  GoogleCalendarSyncSettings: () => null,
}));
vi.mock("@/components/settings/IOSCalendarSyncSettings", () => ({
  IOSCalendarSyncSettings: () => null,
}));
vi.mock("@/components/settings/EmailChangeSettings", () => ({
  EmailChangeSettings: () => null,
}));
vi.mock("@/components/settings/IdentityLinkSettings", () => ({
  IdentityLinkSettings: () => null,
}));
vi.mock("@/components/settings/AccountDeleteSettings", () => ({
  AccountDeleteSettings: () => null,
}));
vi.mock("@/components/settings/CalendarColorSettings", () => ({
  CalendarColorSettings: () => null,
}));
vi.mock("@/lib/revenucat", () => ({ restorePurchases: vi.fn() }));
vi.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: vi.fn(),
  requestMediaLibraryPermissionsAsync: vi.fn(),
}));
vi.mock("expo-image-manipulator", () => ({
  ImageManipulator: { manipulate: vi.fn() },
  SaveFormat: { JPEG: "jpeg", PNG: "png", WEBP: "webp" },
}));

const USER_ID = "user-1";
let supabaseMock: ReturnType<typeof createTableDispatchSupabase>;

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({
    supabase: supabaseMock.client,
    user: { id: USER_ID },
    subscription: null,
    signOut: vi.fn(),
    refreshSubscription: vi.fn(),
  }),
}));

import { StyleSheet } from "react-native";
import { SettingsScreen } from "../SettingsScreen";

describe("SettingsScreen — Android Edge-to-Edge の下部インセット", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captured.contentContainerStyles = [];
    supabaseMock = createTableDispatchSupabase({
      userId: USER_ID,
      tables: {
        users: {
          data: {
            id: USER_ID,
            name: "テストユーザー",
            personal_practice_color: null,
            personal_competition_color: null,
          },
        },
        user_team_calendar_colors: { data: [] },
      },
    });
  });

  it("ログアウトボタンを含むスクロール余白に下部インセットが反映される", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <SettingsScreen />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(captured.contentContainerStyles.length).toBeGreaterThan(0);
    });

    // 最初に描画される ScrollView が SettingsScreen 自身のもの (親→子の描画順)。
    const flattened = StyleSheet.flatten(captured.contentContainerStyles[0]) as {
      paddingBottom?: number;
    };
    expect(flattened.paddingBottom).toBe(NAV_BAR_INSET);
  });
});
