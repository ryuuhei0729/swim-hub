/**
 * ItemTabs — × の削除確認
 *
 * 背景: × は確認なしで即削除していたため、記録・メニューの誤タップで入力済みのタイム等が
 * 消えていた (編集中なら保存時に DB からも削除)。shouldConfirmRemove が true を返す項目だけ
 * 確認 Alert を出し、「削除」を押したときに初めて onRemove を呼ぶ。
 */

import React from "react";
import { render, fireEvent, configure, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Alert, Text } from "react-native";
import { ItemTabs } from "../ItemTabs";

configure({ testIdAttribute: "testID" });

type AlertButton = { text?: string; style?: string; onPress?: () => void };

function renderTabs(props: {
  onRemove: (i: number) => void;
  shouldConfirmRemove?: (i: number) => boolean;
}) {
  return render(
    <ItemTabs
      count={2}
      activeIndex={0}
      onSelect={() => {}}
      onRemove={props.onRemove}
      shouldConfirmRemove={props.shouldConfirmRemove}
      label={(i) => `記録 ${i + 1}`}
    >
      <Text>content</Text>
    </ItemTabs>,
  );
}

describe("ItemTabs × の削除確認", () => {
  beforeEach(() => {
    vi.mocked(Alert.alert).mockClear();
  });

  it("shouldConfirmRemove が true の項目は、確認 Alert を出して onRemove はまだ呼ばない", () => {
    const onRemove = vi.fn();
    const utils = renderTabs({ onRemove, shouldConfirmRemove: (i) => i === 1 });

    fireEvent.click(utils.getByTestId("item-tab-remove-2"));

    expect(onRemove).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    const [title, message] = vi.mocked(Alert.alert).mock.calls[0]!;
    expect(title).toBe("記録 2を削除しますか？");
    expect(message).toBe("記録 2の入力済みデータが削除されます。");
  });

  it("確認で「削除」を押すと、その項目の index で onRemove が呼ばれる", () => {
    const onRemove = vi.fn();
    const utils = renderTabs({ onRemove, shouldConfirmRemove: () => true });

    fireEvent.click(utils.getByTestId("item-tab-remove-2"));
    const buttons = vi.mocked(Alert.alert).mock.calls[0]![2] as AlertButton[];
    const destructive = buttons.find((b) => b.style === "destructive");
    expect(destructive?.text).toBe("削除");
    act(() => destructive?.onPress?.());

    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledWith(1);
  });

  it("確認でキャンセルを選ぶと onRemove は呼ばれない", () => {
    const onRemove = vi.fn();
    const utils = renderTabs({ onRemove, shouldConfirmRemove: () => true });

    fireEvent.click(utils.getByTestId("item-tab-remove-1"));
    const buttons = vi.mocked(Alert.alert).mock.calls[0]![2] as AlertButton[];
    const cancel = buttons.find((b) => b.style === "cancel");
    expect(cancel).toBeDefined();
    act(() => cancel?.onPress?.());

    expect(onRemove).not.toHaveBeenCalled();
  });

  it("shouldConfirmRemove が false の項目 (空の項目) は確認なしで即 onRemove", () => {
    const onRemove = vi.fn();
    const utils = renderTabs({ onRemove, shouldConfirmRemove: (i) => i === 1 });

    fireEvent.click(utils.getByTestId("item-tab-remove-1"));

    expect(Alert.alert).not.toHaveBeenCalled();
    expect(onRemove).toHaveBeenCalledWith(0);
  });

  it("shouldConfirmRemove を渡さなければ従来どおり即 onRemove", () => {
    const onRemove = vi.fn();
    const utils = renderTabs({ onRemove });

    fireEvent.click(utils.getByTestId("item-tab-remove-2"));

    expect(Alert.alert).not.toHaveBeenCalled();
    expect(onRemove).toHaveBeenCalledWith(1);
  });
});
