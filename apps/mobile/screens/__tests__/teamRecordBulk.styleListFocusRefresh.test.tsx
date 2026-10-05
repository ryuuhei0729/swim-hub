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
// react-navigation の useFocusEffect は teamRecordBulkScreenHarness が
// 「マウント時に1回発火 + 以降は harness.focusListeners 経由の明示トリガーのみで
// 発火する」形で上書きしている。このファイルは「フォーカスされた」ことを
// その明示的な操作 (triggerFocus) で制御する。
//
// ミューテーション確認 (このテストが本当にバグを検出できることの証明) は
// QA 報告に記載する。手順:
//   1. apps/mobile/screens/TeamRecordStyleListScreen.tsx から
//      `useRefreshOnFocus(load);` の行を一時的に削除する
//   2. `pnpm --filter @swim-hub/mobile exec vitest run
//      screens/__tests__/teamRecordBulk.styleListFocusRefresh.test.tsx` を実行し、
//      [回帰-01] が FAIL することを確認する (フォーカス復帰しても再取得されない)
//   3. 元の行に戻し、green に復帰することを確認する

import type { QueryClient } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import NetInfo, { NetInfoStateType } from "@react-native-community/netinfo";
import {
  createResponseMapSupabase,
  createWrapper,
  harness,
  makeQueryClient,
} from "./teamRecordBulkScreenHarness";
import { TeamRecordStyleListScreen } from "../TeamRecordStyleListScreen";

const mocks = createResponseMapSupabase();

harness.supabase = mocks.supabase;
harness.currentUserId = "admin-1";
harness.routeParams = { competitionId: "comp-1", teamId: "team-1" };

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
    harness.focusListeners.forEach((cb) => cb());
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
    harness.focusListeners.clear();
    for (const key of Object.keys(mocks.selectCallCounts)) delete mocks.selectCallCounts[key];
    setOnline();

    queryClient = makeQueryClient();
    harness.getStyles.mockResolvedValue([STYLE_FREE_50]);
    mocks.responses["select:competitions"] = {
      data: { id: "comp-1", title: "テスト大会", pool_type: 0 },
      error: null,
    };
    mocks.responses["select:records"] = { data: [], error: null };
    mocks.responses["select:entries"] = { data: [], error: null };
    harness.members = [
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
      expect(harness.getStyles).toHaveBeenCalled();
    });
    // 非同期解決 (NetInfo.fetch 含む) が落ち着くのを待ってから数える
    await flush();

    expect(harness.getStyles).toHaveBeenCalledTimes(1);
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

    const stylesCallsBeforeOffline = harness.getStyles.mock.calls.length;

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

    expect(harness.getStyles.mock.calls.length).toBe(stylesCallsBeforeOffline);
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
