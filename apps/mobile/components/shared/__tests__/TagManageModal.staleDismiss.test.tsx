/**
 * TagManageModal.staleDismiss.test.tsx
 *
 * CodeRabbit 指摘 (PR #253): iOS の `onDismiss` は「reopen 前のクローズサイクル」の
 * 信号として遅れて届くことがある (ネイティブの dismiss は JS から途中キャンセル
 * できないため必ず届く)。これを無条件に `onClosed` へ流すと、呼び出し元が
 * 「TagManageModal は閉じた」と誤認して TagSelectModal を開き直し、提示中の
 * TagManageModal と二重マウントになる (SlideUpModal が awaitingDismissRef で
 * 防いでいるのと同じ競合)。
 *
 * 本ファイルは TagManageModal を実体のまま render し、共有モックの Modal 計装
 * (__modalMountRegistry) からマウント時の `onDismiss` を取り出して「古いサイクルの
 * 信号が遅れて届く」状況を直接再現する。ハーネス側で遷移ロジックを再実装しない
 * (実装が持つ判定そのものを検証する)。
 */

import * as React from "react";
import { render, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  platform: { OS: "ios" as "ios" | "android" },
}));

vi.mock("react-native", async (importOriginal) => {
  const original = await importOriginal<typeof import("react-native")>();
  return {
    ...original,
    SafeAreaView: ({
      children,
      ...props
    }: { children?: React.ReactNode } & Record<string, unknown>) =>
      React.createElement("div", props, children),
    Platform: {
      get OS() {
        return mocks.platform.OS;
      },
      select: (obj: Record<string, unknown>) =>
        mocks.platform.OS === "ios" ? (obj.ios ?? obj.default) : (obj.android ?? obj.default),
    },
  };
});

vi.mock("@expo/vector-icons", () => ({
  Feather: ({ name, ...props }: { name?: string } & Record<string, unknown>) =>
    React.createElement("span", { "data-icon": name, ...props }),
}));

// 型が付くよう、モックの実体から直接 import する (vitest.config の alias により
// "react-native" は同じモジュールに解決される。既存の *.tagModalRace.test.tsx と同じ方式)。
import {
  __modalMountRegistry,
  __resetModalMountRegistry,
} from "../../../__mocks__/react-native";
import { TagManageModal } from "../TagManageModal";

/** マウント時に <Modal> へ渡された onDismiss (= そのレンダーのハンドラ) を取り出す。 */
function captureMountTimeOnDismiss(): () => void {
  const mountEvent = __modalMountRegistry.events.find((e) => e.type === "mount");
  if (!mountEvent) throw new Error("[test setup] Modal の mount イベントが見つからない");
  const onDismiss = mountEvent.props.onDismiss as (() => void) | undefined;
  if (typeof onDismiss !== "function") {
    throw new Error("[test setup] TagManageModal の <Modal> に onDismiss が渡されていない");
  }
  return onDismiss;
}

function renderModal(onClosed: () => void) {
  const props = {
    tag: null,
    onClose: vi.fn(),
    onSave: vi.fn(async () => {}),
    onClosed,
  };
  const utils = render(<TagManageModal visible {...props} />);
  return {
    ...utils,
    setVisible: (visible: boolean) =>
      act(() => {
        utils.rerender(<TagManageModal visible={visible} {...props} />);
      }),
  };
}

describe("TagManageModal — iOS onDismiss の stale 信号ガード", () => {
  beforeEach(() => {
    __resetModalMountRegistry();
    mocks.platform.OS = "ios";
  });

  it("[V-STALE-01] 通常のクローズ (visible=false のまま onDismiss) では onClosed が1回発火する", () => {
    const onClosed = vi.fn();
    const { setVisible } = renderModal(onClosed);
    const onDismiss = captureMountTimeOnDismiss();

    setVisible(false);
    expect(onClosed).not.toHaveBeenCalled(); // iOS は visible=false だけでは発火しない

    act(() => {
      onDismiss();
    });
    expect(onClosed).toHaveBeenCalledTimes(1);
  });

  it("[V-STALE-02] 閉じアニメーション中に再オープンされた後に届いた古い onDismiss では onClosed が発火しない", () => {
    const onClosed = vi.fn();
    const { setVisible } = renderModal(onClosed);
    const onDismiss = captureMountTimeOnDismiss();

    // close → (ネイティブ dismiss 進行中) → reopen
    setVisible(false);
    setVisible(true);

    // reopen 後に「reopen 前のクローズサイクルの」onDismiss が遅れて届く
    act(() => {
      onDismiss();
    });

    // ここで発火すると呼び出し元が TagSelectModal を開き直し、提示中の
    // TagManageModal と二重マウントになる。
    expect(onClosed).not.toHaveBeenCalled();
  });

  it("[V-STALE-03] reopen 後に改めて閉じたときは onClosed が発火する (ガードが恒久的に塞がない)", () => {
    const onClosed = vi.fn();
    const { setVisible } = renderModal(onClosed);
    const onDismiss = captureMountTimeOnDismiss();

    setVisible(false);
    setVisible(true);
    act(() => {
      onDismiss(); // 古いサイクルの信号 → 無視される
    });
    expect(onClosed).not.toHaveBeenCalled();

    // 改めて閉じる → 今度のサイクルの onDismiss は通る
    setVisible(false);
    act(() => {
      onDismiss();
    });
    expect(onClosed).toHaveBeenCalledTimes(1);
  });

  it("[V-STALE-04] Android では onDismiss 経路を使わず visible=false 側で1回だけ発火する (非退行)", () => {
    mocks.platform.OS = "android";
    const onClosed = vi.fn();
    const { setVisible } = renderModal(onClosed);
    const onDismiss = captureMountTimeOnDismiss();

    setVisible(false);
    expect(onClosed).toHaveBeenCalledTimes(1);

    // Android では onDismiss は本来発火しないが、万一届いても二重発火しない
    act(() => {
      onDismiss();
    });
    expect(onClosed).toHaveBeenCalledTimes(1);
  });
});
