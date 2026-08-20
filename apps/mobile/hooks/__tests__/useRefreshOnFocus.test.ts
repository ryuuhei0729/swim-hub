// =============================================================================
// useRefreshOnFocus.test.ts
// =============================================================================
//
// Sprint Contract 検証観点:
//   - [V-02] タブを離れて戻る (フォーカス復帰) だけでも最新データが反映される
//   - オフライン時はフォーカス復帰時の refetch をスキップする
//   - 初回レンダー直後 (まだ一度もフォーカスを離れていない) は refetch しない
//     (画面表示直後に無駄な二重フェッチを起こさないための既存仕様)
//
// 実装メモ (重要・QA が発見したテスト基盤上の癖):
//   グローバル `@react-navigation/native` モック (vitest.setup.ts) の
//   `useFocusEffect: vi.fn((callback) => callback())` は「呼ばれるたびに即座に
//   callback を実行する」単純な実装であり、実機の「画面がフォーカスされた時だけ
//   発火する」挙動とは異なる。さらに `useNetworkStatus` はマウント直後に
//   `NetInfo.fetch().then(setState)` で非同期に状態を更新するため、その解決だけで
//   1回の再レンダーが発生し、このグローバルモックにより「初回マウント直後の
//   isFirstMount ガード」を通過した“もう1回のフォーカス相当”の呼び出しが
//   非同期解決後に1回だけ自動的に発生する (= 実機の挙動ではなくテスト基盤の癖)。
//   このため「マウント直後は呼ばれない」の検証は非同期解決を待つ前 (同期実行の
//   直後) にのみ厳密に成立する。以降のテストはこの1回の自動呼び出しを
//   ベースラインとして明示的に吸収した上で、そこからの増分で検証する。

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import NetInfo, { NetInfoStateType } from "@react-native-community/netinfo";
import { useRefreshOnFocus } from "../useRefreshOnFocus";

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

describe("useRefreshOnFocus", () => {
  beforeEach(() => {
    setOnline();
  });

  it("[初回マウント] マウント直後 (非同期のネットワーク状態解決より前) は refetch を呼ばない", () => {
    const refetch = vi.fn();
    renderHook(() => useRefreshOnFocus(refetch));

    // useNetworkStatus の NetInfo.fetch() 解決 (マイクロタスク) より前の同期時点
    expect(refetch).not.toHaveBeenCalled();
  });

  it("[V-02] 明示的なフォーカス復帰 (再レンダー) のたびに refetch 呼び出しが増える", async () => {
    const refetch = vi.fn();
    const { rerender } = renderHook(({ fn }) => useRefreshOnFocus(fn), {
      initialProps: { fn: refetch },
    });
    await flush(); // ネットワーク状態解決による自動フォーカス相当の1回を安定させる
    const baseline = refetch.mock.calls.length;

    act(() => {
      rerender({ fn: refetch });
    });

    expect(refetch.mock.calls.length).toBeGreaterThan(baseline);
  });

  it("[異常系] オフライン中の再フォーカスでは refetch 呼び出し回数が増えない", async () => {
    const refetch = vi.fn();
    const { rerender } = renderHook(({ fn }) => useRefreshOnFocus(fn), {
      initialProps: { fn: refetch },
    });
    await flush();

    act(() => {
      setOffline();
    });
    await flush();
    const baseline = refetch.mock.calls.length;

    act(() => {
      rerender({ fn: refetch });
    });

    expect(refetch.mock.calls.length).toBe(baseline);
  });

  it("[回帰防止] オフライン中は増えず、オンライン復帰後の再フォーカスでは増える", async () => {
    const refetch = vi.fn();
    const { rerender } = renderHook(({ fn }) => useRefreshOnFocus(fn), {
      initialProps: { fn: refetch },
    });
    await flush();

    act(() => {
      setOffline();
    });
    await flush();
    const offlineBaseline = refetch.mock.calls.length;

    act(() => {
      rerender({ fn: refetch });
    });
    expect(refetch.mock.calls.length).toBe(offlineBaseline);

    act(() => {
      setOnline();
    });
    await flush();
    const onlineBaseline = refetch.mock.calls.length;

    act(() => {
      rerender({ fn: refetch });
    });
    expect(refetch.mock.calls.length).toBeGreaterThan(onlineBaseline);
  });
});
