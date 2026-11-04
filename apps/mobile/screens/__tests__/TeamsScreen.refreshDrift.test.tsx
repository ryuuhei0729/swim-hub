// =============================================================================
// TeamsScreen.refreshDrift.test.tsx
// =============================================================================
//
// Sprint Contract 検証観点: [V-04] TeamsScreen のフォーカス復帰 (useRefreshOnFocus に
// 渡す再取得) が、画面が依存する全 active query を尽くしているかを観測ベースで検証する
// (queryKey はハードコードしない)。所属0件の状態 (中央 CTA) を対象にする。
// チームを表示している間の「表示中チームの情報も取り直す」ことは
// TeamsScreen.teamHome.test.tsx [TH-10] が見る。

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, waitFor } from "@testing-library/react";
import React from "react";
import type { Query } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// -----------------------------------------------------------------------------
// テスト基盤エラーの原因と修正 (前任QA未着手分):
// TeamsScreen は TeamDetailView を import し、TeamDetailView は
// `TeamGroupManagement` (./group-management バレル) を import する。所属0件では描画しないが
// ESM の静的 import なのでファイル全体が eager evaluate される。group-management バレルは BulkAssignModal.tsx を経由して
// react-native-gesture-handler / react-native-reanimated を import しており、
// 前者の未トランスパイル TS ソース (`src/handlers/gestures/eventReceiver.ts`) が
// このリポジトリの vitest 環境では `Unexpected token 'typeof'` でパースに失敗する
// (vitest.config.ts の alias / mainFields 調整では解決しない = 実測確認済み。
// node_modules 配下は vitest のデフォルト external 判定によりエイリアス解決前に
// externalize されるため)。
// 解決方針: `components/teams/group-management/__tests__/BulkAssignModal.test.tsx`
// が既に確立している「ネイティブ境界のみをファイルローカルでモックする」方式を踏襲し、
// このテストファイル内限定で react-native-gesture-handler を最小スタブに置き換える。
// react-native-reanimated は共通 UI 部品 (components/ui の PressableScale / Skeleton /
// ListItemEnter) が使うようになったため vitest.setup.ts で一括してスタブ化しており、
// ここでは上書きしない (上書きすると PressableScale 等が使う createAnimatedComponent /
// FadeInDown が欠けて落ちる)。TeamsScreen 自身も TeamGroupManagement もこのテストでは
// 実際にレンダーされる UI として検証対象外 (関心事はクエリ網羅性のみ) のため、
// スタブは「import が例外を投げずに完了する」最低限の形で十分。
vi.mock("react-native-gesture-handler", () => ({
  GestureHandlerRootView: ({ children }: { children?: React.ReactNode }) => children,
  GestureDetector: ({ children }: { children?: React.ReactNode }) => children,
  Gesture: {
    Pan: () => ({
      activateAfterLongPress: function (this: unknown) {
        return this;
      },
      onStart: function (this: unknown) {
        return this;
      },
      onUpdate: function (this: unknown) {
        return this;
      },
      onEnd: function (this: unknown) {
        return this;
      },
      onFinalize: function (this: unknown) {
        return this;
      },
    }),
  },
  ScrollView: ({ children }: { children?: React.ReactNode }) => children,
}));

vi.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: vi.fn(), goBack: vi.fn(), setOptions: vi.fn() }),
  useFocusEffect: (callback: () => void) => {
    React.useEffect(() => {
      callback();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
  },
}));

// @shopify/flash-list はソースが素の .ts (型キャスト構文込み) のまま配布されており、
// このリポジトリの vitest 環境では変換に失敗する
// (`SyntaxError: Unexpected token 'typeof'` @ isNewArch.ts)。既存テストにも
// FlashList を使う画面を render したものが一件も無いため、これは QA が新たに
// 発見したテスト基盤の既知の壁であり、テストファイル内でのみ最小限のスタブに
// 置き換える (グローバルモックは追加しない)。
vi.mock("@shopify/flash-list", () => ({
  FlashList: ({
    data,
    renderItem,
    keyExtractor,
    ListEmptyComponent,
    refreshControl,
    ...props
  }: {
    data?: unknown[];
    renderItem?: (info: { item: unknown; index: number }) => React.ReactNode;
    keyExtractor?: (item: unknown, index: number) => string | number;
    ListEmptyComponent?: React.ReactNode;
    refreshControl?: React.ReactNode;
  } & Record<string, unknown>) =>
    React.createElement(
      "div",
      props,
      refreshControl ?? null,
      data && data.length > 0
        ? data.map((item, index) =>
            React.createElement(
              "div",
              { key: keyExtractor ? keyExtractor(item, index) : index },
              renderItem ? renderItem({ item, index }) : null,
            ),
          )
        : (ListEmptyComponent ?? null),
    ),
}));

const captured = vi.hoisted(() => ({
  refreshAll: null as null | (() => Promise<unknown>),
}));

vi.mock("@/hooks/useRefreshOnFocus", () => ({
  useRefreshOnFocus: (refresh: () => Promise<unknown>) => {
    captured.refreshAll = refresh;
  },
}));

const apiMocks = vi.hoisted(() => ({
  getMyTeams: vi.fn(),
}));

vi.mock("@apps/shared/api/teams", () => ({
  TeamCoreAPI: class {
    getMyTeams = apiMocks.getMyTeams;
  },
  TeamMembersAPI: class {},
  TeamAnnouncementsAPI: class {},
}));

const USER_ID = "user-1";

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({ supabase: {}, user: { id: USER_ID } }),
}));

import { TeamsScreen } from "../TeamsScreen";

type ScreenProps = React.ComponentProps<typeof TeamsScreen>;
const screenProps = {
  route: { key: "Teams-1", name: "Teams", params: undefined },
  navigation: { setParams: vi.fn() },
} as unknown as ScreenProps;

function createWrapper(queryClient: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

async function waitForQuiescence(queryClient: QueryClient) {
  await waitFor(
    () => {
      const stillPending = queryClient
        .getQueryCache()
        .getAll()
        .some((q) => q.getObserversCount() > 0 && q.state.fetchStatus === "fetching");
      expect(stillPending).toBe(false);
    },
    { timeout: 5000 },
  );
}

function activeQueries(queryClient: QueryClient): Query[] {
  return queryClient
    .getQueryCache()
    .getAll()
    .filter((q) => q.getObserversCount() > 0 && q.state.dataUpdateCount > 0);
}

describe("TeamsScreen — フォーカス復帰の再取得のクエリ網羅性 (ドリフト検出)", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    captured.refreshAll = null;
    apiMocks.getMyTeams.mockResolvedValue([]);
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("[ドリフト検出] refreshAll (= refetch) 発火前から観測される全 active query が再取得される", async () => {
    render(<TeamsScreen {...screenProps} />, { wrapper: createWrapper(queryClient) });
    await waitForQuiescence(queryClient);

    const before = activeQueries(queryClient);
    expect(before.length).toBeGreaterThan(0);
    const beforeCounts = new Map(before.map((q) => [q.queryHash, q.state.dataUpdateCount]));

    expect(captured.refreshAll).not.toBeNull();
    await act(async () => {
      await captured.refreshAll!();
    });
    await waitForQuiescence(queryClient);

    for (const query of before) {
      const prevCount = beforeCounts.get(query.queryHash)!;
      expect(
        query.state.dataUpdateCount,
        `queryKey=${JSON.stringify(query.queryKey)} が再取得されていない ` +
          `(dataUpdateCount: ${prevCount} → ${query.state.dataUpdateCount})`,
      ).toBeGreaterThan(prevCount);
    }
  });
});
