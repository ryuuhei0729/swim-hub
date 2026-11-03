// =============================================================================
// ListItemEnter.test.tsx
// =============================================================================
// 一覧の登場アニメーション (`components/ui/ListItemEnter.tsx`) を検証する。
//
// ## jsdom で検証できる範囲とできない範囲
// FadeInDown の見た目は reanimated のスタブでは動かない。検証するのは
// 「最初の 1 回だけ」を実現する時間窓のロジックと、無効時に余計なラッパーを
// 挟まないこと。
//
// 検証観点:
//   [V-LE-01] ready になるまでは有効のまま。ready から ENTER_WINDOW_MS 後に無効になる
//   [V-LE-02] 一度閉じた窓は ready を切り替え直しても開かない
//   [V-LE-03] enabled=false は子をそのまま描画する (ラッパー無し)
//   [V-LE-04] enabled=true はアニメーション用のラッパーで包む
// =============================================================================

import React from "react";
import { render, renderHook, screen, act } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { View, Text } from "react-native";
import { ListItemEnter, useListEnterOnce, ENTER_WINDOW_MS } from "../ListItemEnter";

afterEach(() => {
  vi.useRealTimers();
});

describe("useListEnterOnce", () => {
  it("[V-LE-01] ready になるまでは有効のまま。ready から ENTER_WINDOW_MS 後に無効になる", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ ready }) => useListEnterOnce(ready), {
      initialProps: { ready: false },
    });

    // データ取得に時間がかかっても、一覧が出る前に窓が閉じることはない
    act(() => {
      vi.advanceTimersByTime(ENTER_WINDOW_MS * 10);
    });
    expect(result.current).toBe(true);

    rerender({ ready: true });
    expect(result.current).toBe(true);

    act(() => {
      vi.advanceTimersByTime(ENTER_WINDOW_MS - 1);
    });
    expect(result.current).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe(false);
  });

  it("[V-LE-02] 一度閉じた窓は ready を切り替え直しても開かない", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ ready }) => useListEnterOnce(ready), {
      initialProps: { ready: true },
    });
    act(() => {
      vi.advanceTimersByTime(ENTER_WINDOW_MS);
    });
    expect(result.current).toBe(false);

    // 再取得でいったん空になってから戻っても、演出は再開しない
    rerender({ ready: false });
    rerender({ ready: true });
    act(() => {
      vi.advanceTimersByTime(ENTER_WINDOW_MS);
    });
    expect(result.current).toBe(false);
  });
});

describe("ListItemEnter", () => {
  it("[V-LE-03] enabled=false は子をそのまま描画する (ラッパー無し)", () => {
    const { container } = render(
      <View>
        <ListItemEnter index={0} enabled={false}>
          <Text>row</Text>
        </ListItemEnter>
      </View>,
    );
    expect(screen.getByText("row").parentElement).toBe(container.firstChild);
  });

  it("[V-LE-04] enabled=true はアニメーション用のラッパーで包む", () => {
    const { container } = render(
      <View>
        <ListItemEnter index={0} enabled>
          <Text>row</Text>
        </ListItemEnter>
      </View>,
    );
    const wrapper = screen.getByText("row").parentElement;
    expect(wrapper).not.toBe(container.firstChild);
    expect(wrapper?.parentElement).toBe(container.firstChild);
  });
});
