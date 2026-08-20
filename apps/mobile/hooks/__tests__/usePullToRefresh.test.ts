// =============================================================================
// usePullToRefresh.test.ts
// =============================================================================
//
// Sprint Contract 検証観点:
//   - [V-06] 一部クエリのみ失敗しても spinner が閉じる (呼び出し元の Promise.allSettled
//     を前提としつつ、想定外の同期 throw が来ても finally で確実に閉じること)
//   - [V-07] オフライン時に pull-to-refresh しても spinner が無限に回らない
//            (refresh を呼ばずに即 return する)
//
// トートロジー防止メモ: 「refresh が呼ばれたら refreshing が true になる」という
// 実装の言い換えではなく、「オフライン時は呼ばれないこと」「エラー時も spinner が
// 閉じること」というユーザー観点の期待値を検証する。

import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import NetInfo, { NetInfoStateType } from "@react-native-community/netinfo";
import { usePullToRefresh } from "../usePullToRefresh";

// テスト用ヘルパー: NetInfo モックの状態をオンラインにリセットする
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

describe("usePullToRefresh", () => {
  beforeEach(() => {
    setOnline();
  });

  it("[基本] オンライン時は refresh を1回呼び出し、完了後 refreshing を false に戻す", async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => usePullToRefresh(refresh));

    expect(result.current.refreshing).toBe(false);

    await act(async () => {
      await result.current.handleRefresh();
    });

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(result.current.refreshing).toBe(false);
  });

  it("[基本] refresh が解決するまでの間、refreshing が true になる", async () => {
    let resolveRefresh!: () => void;
    const refresh = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRefresh = resolve;
        }),
    );
    const { result } = renderHook(() => usePullToRefresh(refresh));

    let handlePromise!: Promise<void>;
    act(() => {
      handlePromise = result.current.handleRefresh();
    });

    await waitFor(() => expect(result.current.refreshing).toBe(true));

    await act(async () => {
      resolveRefresh();
      await handlePromise;
    });

    expect(result.current.refreshing).toBe(false);
  });

  it("[V-07 境界] オフライン時は refresh を呼ばず、refreshing も true にならない", async () => {
    setOffline();
    const refresh = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => usePullToRefresh(refresh));

    // useNetworkStatus の初期 fetch() 反映を待つ
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.handleRefresh();
    });

    expect(refresh).not.toHaveBeenCalled();
    expect(result.current.refreshing).toBe(false);
  });

  it("[V-06 異常系] refresh が同期的に throw しても、例外は外に漏れず spinner は閉じる", async () => {
    const refresh = vi.fn().mockRejectedValue(new Error("unexpected sync-like failure"));
    const { result } = renderHook(() => usePullToRefresh(refresh));

    await expect(
      act(async () => {
        await result.current.handleRefresh();
      }),
    ).resolves.not.toThrow();

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(result.current.refreshing).toBe(false);
  });

  it("[回帰防止] 連続して2回 pull すると、その都度 refresh が呼ばれる", async () => {
    const refresh = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => usePullToRefresh(refresh));

    await act(async () => {
      await result.current.handleRefresh();
    });
    await act(async () => {
      await result.current.handleRefresh();
    });

    expect(refresh).toHaveBeenCalledTimes(2);
    expect(result.current.refreshing).toBe(false);
  });
});
