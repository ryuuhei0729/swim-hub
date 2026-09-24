// =============================================================================
// teamRecordBulk.styleListFocusRefresh.test.tsx
// =============================================================================
//
// Sprint Contract 検証観点 (Reviewer 指摘の回帰防止テスト):
//   種目一覧画面 (TeamRecordStyleListScreen) は詳細画面で記録/エントリーを保存して
//   goBack() で戻ってきても、react-query を使わず (invalidateQueries が届かず)
//   native-stack が遷移元をアンマウントしないため、フォーカス時の明示的な再取得
//   (useRefreshOnFocus) が無いとカードバッジ ("{n}人" / "({n}人エントリー)") が
//   古いまま表示され続けていた。この欠陥はテストが1件も無かったために見逃された。
//
//   [回帰-01] 初回マウント後、フォーカス復帰 (= 詳細画面から goBack した相当) が
//             起きると、画面は最新データを再取得しバッジが更新される
//   [回帰-02] 初回マウント時に二重フェッチが起きない (useEffect と
//             useRefreshOnFocus の両方が初回発火しない)
//   [回帰-03] フォーカス再取得中は全画面スピナーが再表示されず、古い一覧が
//             表示され続けたまま静かに差し替わる (hasLoadedOnceRef の抑止確認)
//   [回帰-04] オフライン中のフォーカス復帰では再取得がスキップされる
//             (useRefreshOnFocus が useNetworkStatus を見ている)
//
// react-navigation の useFocusEffect はこのファイル専用に「フォーカス」を
// 明示的にシミュレートできるレジストリ形式で上書きする。グローバルモック
// (vitest.setup.ts の `vi.fn((callback) => callback())`) は callback が呼ばれる
// たびに同期実行されるため、setState を伴う実 fetch (load) と組み合わせると
// 「setState → 再レンダー → callback 再実行 → setState → …」の無限ループになる
// (teamRecordBulk.styleListGrid.test.tsx 等の修復時に実測済み)。
// このファイルは逆に「フォーカスされた」ことを明示的な操作 (triggerFocus) で
// 制御したいため、マウント時に1回発火 + 以降は明示トリガーのみで発火する
// レジストリ実装にする。
//
// ミューテーション確認 (このテストが本当にバグを検出できることの証明) は
// QA 報告に記載する。手順:
//   1. apps/mobile/screens/TeamRecordStyleListScreen.tsx から
//      `useRefreshOnFocus(load);` の行を一時的に削除する
//   2. `pnpm --filter @swim-hub/mobile exec vitest run
//      screens/__tests__/teamRecordBulk.styleListFocusRefresh.test.tsx` を実行し、
//      [回帰-01] が FAIL することを確認する (フォーカス復帰しても再取得されない)
//   3. 元の行に戻し、green に復帰することを確認する

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import NetInfo, { NetInfoStateType } from "@react-native-community/netinfo";

vi.mock("react-native", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("react-native");
  return { ...actual, KeyboardAvoidingView: actual.View };
});

const mocks = vi.hoisted(() => {
  const responses: Record<string, { data: unknown; error: unknown }> = {};
  const selectCallCounts: Record<string, number> = {};

  function makeSupabase() {
    return {
      from: (table: string) => {
        let op: string | null = null;
        const builder: Record<string, unknown> = {};
        builder.select = (..._a: unknown[]) => {
          if (!op) {
            op = "select";
            selectCallCounts[table] = (selectCallCounts[table] ?? 0) + 1;
          }
          return builder;
        };
        builder.eq = () => builder;
        builder.order = () => builder;
        builder.in = () => builder;
        builder.single = () =>
          Promise.resolve(responses[`${op}:${table}`] ?? { data: null, error: null });
        builder.then = (resolve: (v: { data: unknown; error: unknown }) => void) =>
          resolve(responses[`${op}:${table}`] ?? { data: null, error: null });
        return builder;
      },
    };
  }

  return {
    responses,
    selectCallCounts,
    supabase: makeSupabase(),
    routeParams: { competitionId: "comp-1", teamId: "team-1" },
    navigate: vi.fn(),
    goBack: vi.fn(),
    getStyles: vi.fn(),
    membersBox: { current: [] as unknown[] },
  };
});

// フォーカスイベントを明示的にシミュレートできるレジストリ。
// マウント時に1回 (isFirstMount ガードで無視される) + triggerFocus() での
// 明示呼び出しのみで発火し、通常の再レンダーでは自動発火しない。
const focusRegistry = vi.hoisted(() => ({
  listeners: new Set<() => void>(),
}));

vi.mock("@react-navigation/native", () => ({
  useRoute: () => ({ params: mocks.routeParams }),
  useNavigation: () => ({ navigate: mocks.navigate, goBack: mocks.goBack }),
  useFocusEffect: (callback: () => void) => {
    // callback (= useRefreshOnFocus 内の useCallback([refetch, isConnected])) は
    // isConnected が変化するたびに新しい関数になる。ref で常に最新の callback を
    // 指すようにしないと、triggerFocus() が「マウント時点の isConnected」を
    // 閉じ込めた古い closure を呼んでしまい、オフライン化の検証ができない
    // (実際の react-navigation も内部で同様に ref 経由の最新 callback 呼び出しを行う)。
    const callbackRef = React.useRef(callback);
    callbackRef.current = callback;
    React.useEffect(() => {
      const listener = () => callbackRef.current();
      focusRegistry.listeners.add(listener);
      listener();
      return () => {
        focusRegistry.listeners.delete(listener);
      };
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

import { TeamRecordStyleListScreen } from "../TeamRecordStyleListScreen";

const createWrapper = (queryClient: QueryClient) => {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

const STYLE_FREE_50 = {
  id: 2,
  name_jp: "50m自由形",
  name: "Freestyle 50m",
  style: "Fr",
  distance: 50,
};

function entryRow(id: string, userId: string, styleId: number, entryTime: number | null) {
  return {
    id,
    user_id: userId,
    style_id: styleId,
    entry_time: entryTime,
    note: null,
    users: { id: userId, name: `選手-${userId}` },
  };
}

/** 「詳細画面から goBack して戻ってきた」相当のフォーカス復帰をシミュレートする */
function triggerFocus() {
  act(() => {
    focusRegistry.listeners.forEach((cb) => cb());
  });
}

function setOnline() {
  (NetInfo as unknown as { _setState: (s: unknown) => void })._setState({
    isConnected: true,
    isInternetReachable: true,
    type: NetInfoStateType.wifi,
  });
}

function setOffline() {
  (NetInfo as unknown as { _setState: (s: unknown) => void })._setState({
    isConnected: false,
    isInternetReachable: false,
    type: NetInfoStateType.none,
  });
}

/** useNetworkStatus 内部の NetInfo.fetch().then(...) を act 内で flush する */
async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

function renderScreen(queryClient: QueryClient) {
  return render(<TeamRecordStyleListScreen />, { wrapper: createWrapper(queryClient) });
}

describe("TeamRecordStyleListScreen — フォーカス復帰時の再取得 (Reviewer指摘の回帰防止)", () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    focusRegistry.listeners.clear();
    for (const key of Object.keys(mocks.selectCallCounts)) delete mocks.selectCallCounts[key];
    setOnline();

    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    mocks.getStyles.mockResolvedValue([STYLE_FREE_50]);
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

  it("[回帰-01] フォーカス復帰すると再取得され、エントリー人数バッジが最新化される", async () => {
    renderScreen(queryClient);

    // 初回表示: エントリーが無いのでバッジが出ない
    await screen.findByText("50m自由形");
    expect(screen.queryByText(/エントリー\)$/)).toBeNull();

    // 詳細画面での保存を模して、フォーカス前にサーバー側データが変化したことにする
    mocks.responses["select:entries"] = {
      data: [entryRow("entry-1", "user-1", 2, 30.0), entryRow("entry-2", "user-2", 2, null)],
      error: null,
    };

    triggerFocus();

    await waitFor(() => {
      expect(screen.getByText("(2人エントリー)")).toBeTruthy();
    });
  });

  it("[回帰-02] 初回マウント時に useEffect と useRefreshOnFocus の両方が発火して二重フェッチすることはない", async () => {
    renderScreen(queryClient);

    await waitFor(() => {
      expect(mocks.getStyles).toHaveBeenCalled();
    });
    // 非同期解決 (NetInfo.fetch 含む) が落ち着くのを待ってから数える
    await flush();

    expect(mocks.getStyles).toHaveBeenCalledTimes(1);
    expect(mocks.selectCallCounts.competitions).toBe(1);
    expect(mocks.selectCallCounts.records).toBe(1);
    expect(mocks.selectCallCounts.entries).toBe(1);
  });

  it("[回帰-03] フォーカス再取得中は全画面スピナーを再表示せず、古い一覧を表示したまま静かに差し替える", async () => {
    renderScreen(queryClient);
    await screen.findByText("50m自由形");
    await flush();

    mocks.responses["select:entries"] = {
      data: [entryRow("entry-1", "user-1", 2, 30.0)],
      error: null,
    };

    triggerFocus();

    // act(triggerFocus) の直後、再取得の Promise がまだ解決していない瞬間でも
    // スピナーの読み込み中メッセージは表示されず、既存カードは残ったまま
    expect(screen.queryByText("種目を読み込み中...")).toBeNull();
    expect(screen.getByText("50m自由形")).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByText("(1人エントリー)")).toBeTruthy();
    });
    // 再取得完了後もスピナーは一度も出ていない
    expect(screen.queryByText("種目を読み込み中...")).toBeNull();
  });

  it("[回帰-04] オフライン中のフォーカス復帰では再取得がスキップされ、バッジは更新されない", async () => {
    renderScreen(queryClient);
    await screen.findByText("50m自由形");
    await flush();

    const stylesCallsBeforeOffline = mocks.getStyles.mock.calls.length;

    act(() => {
      setOffline();
    });
    await flush();

    // オフライン化しても既存カードは残ったまま (再取得が起きていない)
    mocks.responses["select:entries"] = {
      data: [entryRow("entry-1", "user-1", 2, 30.0)],
      error: null,
    };

    triggerFocus();
    await flush();

    expect(mocks.getStyles.mock.calls.length).toBe(stylesCallsBeforeOffline);
    expect(screen.queryByText(/エントリー\)$/)).toBeNull();

    // オンライン復帰後は改めて再取得され、バッジが反映される
    act(() => {
      setOnline();
    });
    await flush();
    triggerFocus();

    await waitFor(() => {
      expect(screen.getByText("(1人エントリー)")).toBeTruthy();
    });
  });
});
