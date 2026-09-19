// =============================================================================
// FormKeyboardAvoidingView.test.tsx
// =============================================================================
// フォーム画面・モーダルで使う KeyboardAvoidingView の唯一の定義元
// (`components/forms/FormKeyboardAvoidingView.tsx`) が、
// `useKeyboardAvoidingBehavior` で決定した behavior/keyboardVerticalOffset を
// 実際の `KeyboardAvoidingView` (react-native) に渡していることを検証する。
//
// `__mocks__/react-native.ts` の `KeyboardAvoidingView` は behavior/keyboardVerticalOffset を
// data-behavior / data-keyboard-vertical-offset として DOM に素通しする実装になっているため、
// この属性を読むことで prop 伝播を検証できる。
//
// Sprint Contract 検証観点:
//   [V-KAV-05] behavior の判定ロジック (Platform.OS === "ios" ? "padding" : undefined 相当) を
//     このコンポーネント自身が再実装せず、フックの戻り値をそのまま渡していること
//   [V-KAV-07/08] hasNativeHeader=false を渡すと offset が 0 になること (Modal 配下での利用)
// =============================================================================

import React from "react";
import { render } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";

const platformState = vi.hoisted(() => ({ OS: "ios" as "ios" | "android" }));
const insetsState = vi.hoisted(() => ({ top: 0, bottom: 0, left: 0, right: 0 }));

vi.mock("react-native", async (importOriginal) => {
  const original = await importOriginal<typeof import("react-native")>();
  return {
    ...original,
    Platform: {
      get OS() {
        return platformState.OS;
      },
      isPad: false,
    },
  };
});

vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => insetsState,
  initialWindowMetrics: null,
}));

import { FormKeyboardAvoidingView } from "../FormKeyboardAvoidingView";

const IOS_IPHONE_HEADER_HEIGHT = 44;

describe("FormKeyboardAvoidingView", () => {
  afterEach(() => {
    platformState.OS = "ios";
    insetsState.top = 0;
  });

  it("[V-KAV-05] iOS: behavior='padding' が実際の KeyboardAvoidingView に渡る", () => {
    platformState.OS = "ios";
    insetsState.top = 30;

    const { container } = render(
      <FormKeyboardAvoidingView>
        <>content</>
      </FormKeyboardAvoidingView>,
    );

    const kav = container.firstElementChild as HTMLElement;
    expect(kav.getAttribute("data-behavior")).toBe("padding");
    expect(kav.getAttribute("data-keyboard-vertical-offset")).toBe(
      String(IOS_IPHONE_HEADER_HEIGHT + 30),
    );
  });

  it("[V-KAV-05] Android: behavior=undefined が渡り、offset は0になる", () => {
    platformState.OS = "android";
    insetsState.top = 30;

    const { container } = render(
      <FormKeyboardAvoidingView>
        <>content</>
      </FormKeyboardAvoidingView>,
    );

    const kav = container.firstElementChild as HTMLElement;
    expect(kav.getAttribute("data-behavior")).toBeNull();
    expect(kav.getAttribute("data-keyboard-vertical-offset")).toBe("0");
  });

  it("[V-KAV-07/08] hasNativeHeader=false (Modal 配下想定): iOS でも offset は0固定", () => {
    platformState.OS = "ios";
    insetsState.top = 47;

    const { container } = render(
      <FormKeyboardAvoidingView hasNativeHeader={false}>
        <>content</>
      </FormKeyboardAvoidingView>,
    );

    const kav = container.firstElementChild as HTMLElement;
    expect(kav.getAttribute("data-behavior")).toBe("padding");
    expect(kav.getAttribute("data-keyboard-vertical-offset")).toBe("0");
  });

  it("children を描画する", () => {
    const { getByText } = render(
      <FormKeyboardAvoidingView>
        <>form-keyboard-avoiding-view-marker</>
      </FormKeyboardAvoidingView>,
    );

    expect(getByText("form-keyboard-avoiding-view-marker")).toBeTruthy();
  });
});
