// =============================================================================
// useSafeInsets.test.ts - フォールバック付き safe area insets フックのユニットテスト
// =============================================================================

import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// vi.hoisted() を使用してモック状態を先に定義
const mocks = vi.hoisted(() => ({
  liveInsets: { top: 0, bottom: 0, left: 0, right: 0 },
  initialWindowMetrics: null as {
    insets: { top: number; bottom: number; left: number; right: number };
  } | null,
}));

vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => mocks.liveInsets,
  get initialWindowMetrics() {
    return mocks.initialWindowMetrics;
  },
}));

import { useSafeInsets } from "../useSafeInsets";

describe("useSafeInsets", () => {
  it("initialWindowMetrics が null の場合はライブ insets をそのまま返す", () => {
    mocks.liveInsets = { top: 47, bottom: 34, left: 0, right: 0 };
    mocks.initialWindowMetrics = null;

    const { result } = renderHook(() => useSafeInsets());

    expect(result.current).toEqual({ top: 47, bottom: 34, left: 0, right: 0 });
  });

  it("ライブ insets が 0 の場合は initialWindowMetrics にフォールバックする (Android 3ボタンナビ対策)", () => {
    mocks.liveInsets = { top: 0, bottom: 0, left: 0, right: 0 };
    mocks.initialWindowMetrics = { insets: { top: 32, bottom: 48, left: 0, right: 0 } };

    const { result } = renderHook(() => useSafeInsets());

    expect(result.current).toEqual({ top: 32, bottom: 48, left: 0, right: 0 });
  });

  it("ライブ insets と initialWindowMetrics の各辺の大きい方を採用する", () => {
    mocks.liveInsets = { top: 47, bottom: 0, left: 8, right: 0 };
    mocks.initialWindowMetrics = { insets: { top: 32, bottom: 48, left: 0, right: 8 } };

    const { result } = renderHook(() => useSafeInsets());

    expect(result.current).toEqual({ top: 47, bottom: 48, left: 8, right: 8 });
  });
});
