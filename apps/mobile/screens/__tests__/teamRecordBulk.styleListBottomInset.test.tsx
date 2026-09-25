// =============================================================================
// teamRecordBulk.styleListBottomInset.test.tsx
// =============================================================================
//
// ユーザー実機報告 (Android 3ボタンナビ): チーム大会記録の代理入力 →
// 種目選択画面 (29カードのグリッド) の最下段カードがシステムナビゲーションバーに
// 食われる。
//
// 原因: `TeamRecordStyleListScreen` は MainStack に直接載る画面であり、
// タブ5画面を包む `TabNavigator` の `SafeAreaView edges={["bottom"]}` の
// 保護外にある。にもかかわらず contentContainerStyle の paddingBottom が
// 固定 32 で、3ボタンナビの inset (48dp) より小さかった。
// (この画面は 2026-09-19 に追加されており、2026-09-08 の Edge-to-Edge
//  一斉棚卸しより後発だったため規約が適用されていなかった。)
//
// このテストは「下部 inset がスクロール余白に実際に反映されるか」を配線レベルで
// 検証する。inset は vitest.setup.ts の共通モックでは 0 のため、このファイルだけ
// bottom=48 を返すようにモックを差し替える
// (`SettingsScreen.bottomInset.test.tsx` と同一パターン)。
//
// ミューテーション確認方法: contentContainerStyle を `styles.scrollContent`
// 単体に戻すと paddingBottom は 32 のままになり赤になる。

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

const mocks = vi.hoisted(() => {
  const responses: Record<string, { data: unknown; error: unknown }> = {};

  function makeSupabase() {
    return {
      from: (table: string) => {
        let op: string | null = null;
        const builder: Record<string, unknown> = {};
        builder.select = vi.fn((..._a: unknown[]) => {
          if (!op) op = "select";
          return builder;
        });
        builder.eq = vi.fn(() => builder);
        builder.order = vi.fn(() => builder);
        builder.in = vi.fn(() => builder);
        builder.single = vi.fn(() =>
          Promise.resolve(responses[`${op}:${table}`] ?? { data: null, error: null }),
        );
        builder.then = (resolve: (v: { data: unknown; error: unknown }) => void) =>
          resolve(responses[`${op}:${table}`] ?? { data: null, error: null });
        return builder;
      },
    };
  }

  return {
    responses,
    supabase: makeSupabase(),
    getStyles: vi.fn(),
    membersBox: { current: [] as unknown[] },
  };
});

// useFocusEffect はマウント時に1回だけ発火させる (teamRecordBulk.styleListGrid
// .test.tsx と同一の理由: vitest.setup.ts のグローバルモックはレンダーのたびに
// callback を再実行するため、load の setState と組み合わさって無限ループになる)。
vi.mock("@react-navigation/native", () => ({
  useRoute: () => ({ params: { competitionId: "comp-1", teamId: "team-1" } }),
  useNavigation: () => ({ navigate: vi.fn(), goBack: vi.fn() }),
  useFocusEffect: (callback: () => void) => {
    React.useEffect(() => {
      callback();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
  },
}));

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({ supabase: mocks.supabase, user: { id: "admin-1" } }),
}));

vi.mock("@apps/shared/hooks/queries/teams", () => ({
  useTeamsQuery: () => ({ members: mocks.membersBox.current, isLoading: false }),
}));

vi.mock("@apps/shared/api/styles", () => ({
  StyleAPI: class {
    getStyles = mocks.getStyles;
  },
}));

import { StyleSheet } from "react-native";
import { TeamRecordStyleListScreen } from "../TeamRecordStyleListScreen";

/** id・name_jp のみのダミー22種目 (可視判定に効くのは id だけ)。 */
const DUMMY_22_STYLES = Array.from({ length: 22 }, (_, i) => ({
  id: i + 1,
  name_jp: `ダミー種目${i + 1}`,
  name: `Style${i + 1}`,
  style: "" as never,
  distance: 0,
}));

describe("TeamRecordStyleListScreen — Android Edge-to-Edge の下部インセット", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    captured.contentContainerStyles = [];
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    mocks.getStyles.mockResolvedValue(DUMMY_22_STYLES);
    mocks.responses["select:competitions"] = {
      data: { id: "comp-1", title: "テスト大会", pool_type: 0 },
      error: null,
    };
    mocks.responses["select:records"] = { data: [], error: null };
    mocks.responses["select:entries"] = { data: [], error: null };
    mocks.membersBox.current = [
      { user_id: "admin-1", role: "admin", users: { id: "admin-1", name: "管理者" } },
    ];
  });

  it("最下段の種目カードを含むスクロール余白に下部インセットが反映される", async () => {
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <TeamRecordStyleListScreen />
      </QueryClientProvider>,
    );

    // グリッドが実際に描画されてから測る (ローディング/権限ゲートの早期 return 中は
    // ScrollView 自体が存在せず、空配列のまま緑になってしまうため)。
    await waitFor(() => {
      expect(container.querySelectorAll("button")).toHaveLength(29);
    });

    expect(captured.contentContainerStyles.length).toBeGreaterThan(0);
    const flattened = StyleSheet.flatten(captured.contentContainerStyles[0]) as {
      paddingBottom?: number;
    };
    expect(flattened.paddingBottom).toBe(NAV_BAR_INSET);
  });
});
