// =============================================================================
// useKeyboardAvoidingBehavior.test.ts
// =============================================================================
// Sprint Contract (KAV 統一): KeyboardAvoidingView の behavior/keyboardVerticalOffset を
// 決定する唯一の定義元 (`hooks/useKeyboardAvoidingBehavior.ts`) を単体で検証する。
//
// 期待値の根拠 (トートロジー防止のため実装ファイルをコピーせず、外部の一次情報を根拠にする):
// - iOS のネイティブヘッダー高さ 44pt (iPhone, 非モーダル, ポートレート) / 50pt (iPad, 非モーダル) は
//   `@react-navigation/elements` の `getDefaultHeaderHeight` (node_modules/@react-navigation/elements/
//   src/Header/getDefaultHeaderHeight.tsx) の定数値。本テストではこの一次情報から得た定数を
//   テスト側で独立にハードコードする。
// - Dynamic Island 搭載機の補正 (`topInset > 50` のとき `topInset - (5 + 1/PixelRatio.get())`) も
//   同じ `getDefaultHeaderHeight.tsx` の一次情報。境界値 (50/51) と非該当ケース (0/47) を分けて
//   独立に算出し、実装関数を呼び出さずに期待値を組み立てる。
// - `keyboardVerticalOffset` は「ヘッダー高さ + 画面上端の safe area inset (insets.top, 補正込み)」
//   という Sprint Contract の要求 (固定値の丸写しでなく根拠を持つ算出であること) を、insets.top を
//   変化させた場合に offset も追随するかで検証する。
//
// Sprint Contract 検証観点:
//   [V-KAV-03] iOS では behavior="padding"、Android/Web (iOS 以外) では behavior=undefined
//   [V-KAV-04] keyboardVerticalOffset がヘッダー高さの固定値の丸写しでなく、insets.top に
//     連動して変化する (= 算出されている) こと。Dynamic Island 搭載機 (topInset > 50) では
//     react-navigation と同じ補正が入ること
//   [V-KAV-09] Android では hasNativeHeader の値に関わらず behavior=undefined のまま
// =============================================================================

import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";

const platformState = vi.hoisted(() => ({
  OS: "ios" as "ios" | "android" | "web",
  isPad: false,
}));

const insetsState = vi.hoisted(() => ({
  top: 0,
  bottom: 0,
  left: 0,
  right: 0,
}));

vi.mock("react-native", async (importOriginal) => {
  const original = await importOriginal<typeof import("react-native")>();
  return {
    ...original,
    Platform: {
      get OS() {
        return platformState.OS;
      },
      get isPad() {
        return platformState.isPad;
      },
    },
  };
});

vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => insetsState,
  initialWindowMetrics: null,
}));

import { useKeyboardAvoidingBehavior } from "../useKeyboardAvoidingBehavior";

// react-navigation/elements の getDefaultHeaderHeight が返す、非モーダル・ポートレート時の
// ヘッダー高さ (status bar 分を除く)。本アプリは orientation:"portrait" 固定 (app.json)。
const IOS_IPHONE_HEADER_HEIGHT = 44;
const IOS_IPAD_HEADER_HEIGHT = 50;

// `__mocks__/react-native.ts` の PixelRatio.get() が返す固定値 (テストインフラの既知定数。
// 実装ファイルの値ではない)。
const MOCK_PIXEL_RATIO = 3;

// getDefaultHeaderHeight.tsx の Dynamic Island 補正式を、実装関数を呼ばずに独立に算出する。
// hasDynamicIsland は `topInset > 50` のときのみ真 (境界値 50 自体は非該当)。
function expectedStatusBarHeight(topInset: number): number {
  const hasDynamicIsland = topInset > 50;
  return hasDynamicIsland ? topInset - (5 + 1 / MOCK_PIXEL_RATIO) : topInset;
}

describe("useKeyboardAvoidingBehavior", () => {
  afterEach(() => {
    platformState.OS = "ios";
    platformState.isPad = false;
    insetsState.top = 0;
    insetsState.bottom = 0;
    insetsState.left = 0;
    insetsState.right = 0;
  });

  it("[V-KAV-03] Android では hasNativeHeader=true (既定) でも behavior=undefined / offset=0", () => {
    platformState.OS = "android";
    insetsState.top = 47;

    const { result } = renderHook(() => useKeyboardAvoidingBehavior());

    expect(result.current.behavior).toBeUndefined();
    expect(result.current.keyboardVerticalOffset).toBe(0);
  });

  it("[V-KAV-09] Android では hasNativeHeader=false を渡しても behavior=undefined / offset=0 のまま変わらない", () => {
    platformState.OS = "android";
    insetsState.top = 47;

    const { result } = renderHook(() => useKeyboardAvoidingBehavior(false));

    expect(result.current.behavior).toBeUndefined();
    expect(result.current.keyboardVerticalOffset).toBe(0);
  });

  it("[V-KAV-03] Web (iOS 以外) でも behavior=undefined / offset=0", () => {
    platformState.OS = "web";
    insetsState.top = 20;

    const { result } = renderHook(() => useKeyboardAvoidingBehavior());

    expect(result.current.behavior).toBeUndefined();
    expect(result.current.keyboardVerticalOffset).toBe(0);
  });

  it("[V-KAV-03] iOS + hasNativeHeader=true (既定) では behavior='padding'", () => {
    platformState.OS = "ios";
    insetsState.top = 47;

    const { result } = renderHook(() => useKeyboardAvoidingBehavior());

    expect(result.current.behavior).toBe("padding");
  });

  it("[V-KAV-04] iOS + hasNativeHeader=true: offset はヘッダー高さ(44) + insets.top", () => {
    platformState.OS = "ios";
    platformState.isPad = false;
    insetsState.top = 47;

    const { result } = renderHook(() => useKeyboardAvoidingBehavior());

    expect(result.current.keyboardVerticalOffset).toBe(IOS_IPHONE_HEADER_HEIGHT + 47);
  });

  it("[V-KAV-04] iOS + hasNativeHeader=true: insets.top が変わると offset も追随する (固定値の丸写しでない)", () => {
    platformState.OS = "ios";
    platformState.isPad = false;

    insetsState.top = 0;
    const { result: withoutInset } = renderHook(() => useKeyboardAvoidingBehavior());
    expect(withoutInset.current.keyboardVerticalOffset).toBe(IOS_IPHONE_HEADER_HEIGHT);

    // topInset=47 はノッチ機相当 (Dynamic Island 閾値 50 以下) なので補正なしでそのまま加算される。
    insetsState.top = 47;
    const { result: withNotchInset } = renderHook(() => useKeyboardAvoidingBehavior());
    expect(withNotchInset.current.keyboardVerticalOffset).toBe(
      IOS_IPHONE_HEADER_HEIGHT + expectedStatusBarHeight(47),
    );
    expect(withNotchInset.current.keyboardVerticalOffset).toBe(IOS_IPHONE_HEADER_HEIGHT + 47);
  });

  it("[V-KAV-04] iOS + Dynamic Island 境界値 (topInset=50): 境界そのものは補正対象外 (topInset > 50 のみ補正)", () => {
    platformState.OS = "ios";
    platformState.isPad = false;
    insetsState.top = 50;

    const { result } = renderHook(() => useKeyboardAvoidingBehavior());

    expect(result.current.keyboardVerticalOffset).toBe(IOS_IPHONE_HEADER_HEIGHT + 50);
    expect(result.current.keyboardVerticalOffset).toBe(
      IOS_IPHONE_HEADER_HEIGHT + expectedStatusBarHeight(50),
    );
  });

  it("[V-KAV-04] iOS + Dynamic Island 搭載機相当 (topInset=59): react-navigation と同じ補正 (topInset - (5 + 1/PixelRatio)) が入る", () => {
    platformState.OS = "ios";
    platformState.isPad = false;
    insetsState.top = 59;

    const { result } = renderHook(() => useKeyboardAvoidingBehavior());

    // 59 - (5 + 1/3) = 53.666... なので、素の insets.top をそのまま足した 44+59=103 にはならない。
    expect(result.current.keyboardVerticalOffset).not.toBe(IOS_IPHONE_HEADER_HEIGHT + 59);
    expect(result.current.keyboardVerticalOffset).toBe(
      IOS_IPHONE_HEADER_HEIGHT + expectedStatusBarHeight(59),
    );
    expect(result.current.keyboardVerticalOffset).toBeCloseTo(97.666666666666, 9);
  });

  it("[V-KAV-04] iOS + iPad: ヘッダー高さは50 (iPhoneの44とは別値)", () => {
    platformState.OS = "ios";
    platformState.isPad = true;
    insetsState.top = 24;

    const { result } = renderHook(() => useKeyboardAvoidingBehavior());

    expect(result.current.keyboardVerticalOffset).toBe(IOS_IPAD_HEADER_HEIGHT + 24);
  });

  it("[V-KAV-07/08] iOS + hasNativeHeader=false (Modal 配下想定): behavior='padding' だが offset は0固定", () => {
    platformState.OS = "ios";
    insetsState.top = 47;

    const { result } = renderHook(() => useKeyboardAvoidingBehavior(false));

    expect(result.current.behavior).toBe("padding");
    expect(result.current.keyboardVerticalOffset).toBe(0);
  });
});
