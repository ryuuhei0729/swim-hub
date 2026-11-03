// =============================================================================
// ToastProvider.test.tsx
// =============================================================================
// 画面下のトースト (`providers/ToastProvider.tsx` + `components/ui/Toast.tsx`) を検証する。
//
// ## jsdom で検証できる範囲とできない範囲
// 下から出入りする動き (FadeInDown/FadeOutDown) は reanimated のスタブでは動かない。
// 検証するのは表示・自動で消える・タップで消える・置き換わる、という振る舞い。
//
// 検証観点:
//   [V-TO-01] success はメッセージを表示し、2.5 秒後に消える
//   [V-TO-02] error は 4 秒出る (読む時間を取る)
//   [V-TO-03] タップすると即時に消える
//   [V-TO-04] 続けて出すと後の知らせに置き換わり、前のタイマーでは消えない
//   [V-TO-05] Provider の外では何もしない (例外を投げない)
// =============================================================================

import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { Pressable, Text } from "react-native";
import { ToastProvider, useToast } from "../ToastProvider";

const Trigger: React.FC<{ label: string; onPress: (toast: ReturnType<typeof useToast>) => void }> = ({
  label,
  onPress,
}) => {
  const toast = useToast();
  return (
    <Pressable onPress={() => onPress(toast)}>
      <Text>{label}</Text>
    </Pressable>
  );
};

const renderWithProvider = (ui: React.ReactNode) => render(<ToastProvider>{ui}</ToastProvider>);

afterEach(() => {
  vi.useRealTimers();
});

describe("ToastProvider", () => {
  it("[V-TO-01] success はメッセージを表示し、2.5 秒後に消える", () => {
    vi.useFakeTimers();
    renderWithProvider(<Trigger label="save" onPress={(t) => t.success("保存しました")} />);

    fireEvent.click(screen.getByText("save"));
    expect(screen.getByText("保存しました")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(2499);
    });
    expect(screen.queryByText("保存しました")).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByText("保存しました")).toBeNull();
  });

  it("[V-TO-02] error は 4 秒出る", () => {
    vi.useFakeTimers();
    renderWithProvider(<Trigger label="fail" onPress={(t) => t.error("失敗しました")} />);

    fireEvent.click(screen.getByText("fail"));
    act(() => {
      vi.advanceTimersByTime(3999);
    });
    expect(screen.queryByText("失敗しました")).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.queryByText("失敗しました")).toBeNull();
  });

  it("[V-TO-03] タップすると即時に消える", () => {
    vi.useFakeTimers();
    renderWithProvider(<Trigger label="save" onPress={(t) => t.success("保存しました")} />);

    fireEvent.click(screen.getByText("save"));
    fireEvent.click(screen.getByText("保存しました"));
    expect(screen.queryByText("保存しました")).toBeNull();
  });

  it("[V-TO-04] 続けて出すと後の知らせに置き換わり、前のタイマーでは消えない", () => {
    vi.useFakeTimers();
    renderWithProvider(
      <>
        <Trigger label="first" onPress={(t) => t.success("1件目")} />
        <Trigger label="second" onPress={(t) => t.success("2件目")} />
      </>,
    );

    fireEvent.click(screen.getByText("first"));
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    fireEvent.click(screen.getByText("second"));
    expect(screen.queryByText("1件目")).toBeNull();
    expect(screen.getByText("2件目")).toBeTruthy();

    // 1件目のタイマー (残り 500ms) が切れても 2件目は残る
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(screen.getByText("2件目")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(1900);
    });
    expect(screen.queryByText("2件目")).toBeNull();
  });

  it("[V-TO-05] Provider の外では何もしない (例外を投げない)", () => {
    render(<Trigger label="save" onPress={(t) => t.success("保存しました")} />);
    expect(() => fireEvent.click(screen.getByText("save"))).not.toThrow();
    expect(screen.queryByText("保存しました")).toBeNull();
  });
});
