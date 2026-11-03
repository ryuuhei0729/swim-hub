// =============================================================================
// PressableScale.test.tsx
// =============================================================================
// 押すとわずかに縮む Pressable (`components/ui/PressableScale.tsx`) の構造的な性質を検証する。
//
// ## jsdom で検証できる範囲とできない範囲
// reanimated は vitest.setup.ts でスタブ化されており、`useAnimatedStyle` は worklet を
// その場で評価した値を返すだけ。scale が 0.97 まで縮む見た目そのものは検証できない。
// 検証できるのは「Pressable として普通に使える」こと (タップ・style・disabled の素通し)。
//
// 検証観点:
//   [V-PS-01] 子要素を描画し、タップで onPress が呼ばれる
//   [V-PS-02] 静的 style (配列を含む) は要素に反映される
//   [V-PS-03] disabled のときは onPress が呼ばれない
// =============================================================================

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { Text } from "react-native";
import { PressableScale } from "../PressableScale";

describe("PressableScale", () => {
  it("[V-PS-01] 子要素を描画し、タップで onPress が呼ばれる", () => {
    const onPress = vi.fn();
    render(
      <PressableScale onPress={onPress} accessibilityRole="button">
        <Text>保存</Text>
      </PressableScale>,
    );
    fireEvent.click(screen.getByText("保存"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("[V-PS-02] 静的 style (配列を含む) は要素に反映される", () => {
    render(
      <PressableScale style={[{ backgroundColor: "rgb(37, 99, 235)" }, { borderRadius: 8 }]}>
        <Text>x</Text>
      </PressableScale>,
    );
    const button = screen.getByText("x").closest("button");
    expect(button?.style.backgroundColor).toBe("rgb(37, 99, 235)");
    expect(button?.style.borderRadius).toBe("8px");
  });

  it("[V-PS-03] disabled のときは onPress が呼ばれない", () => {
    const onPress = vi.fn();
    render(
      <PressableScale onPress={onPress} disabled>
        <Text>無効</Text>
      </PressableScale>,
    );
    fireEvent.click(screen.getByText("無効"));
    expect(onPress).not.toHaveBeenCalled();
  });
});
