/**
 * ItemTabs (web) — × の削除確認
 *
 * 背景: × は確認なしで即削除していたため、記録・メニュー・エントリーの誤クリックで入力済みの
 * タイム等が消えていた (編集中なら保存時に DB からも削除)。shouldConfirmRemove が true を返す
 * 項目だけ ConfirmDialog を出し、「削除」を押したときに初めて onRemove を呼ぶ。
 * mobile の ItemTabs.removeConfirm.test.tsx と同じ観点。
 */

import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderWithI18n as render, screen, fireEvent } from "../../utils/render";
import ItemTabs from "../../../components/forms/ItemTabs";

function renderTabs(props: {
  onRemove: (i: number) => void;
  shouldConfirmRemove?: (i: number) => boolean;
}) {
  return render(
    <ItemTabs
      count={2}
      activeIndex={0}
      onSelect={vi.fn()}
      onAdd={vi.fn()}
      onRemove={props.onRemove}
      shouldConfirmRemove={props.shouldConfirmRemove}
      label={(i) => `記録 ${i + 1}`}
      testIdPrefix="record"
    >
      <div>パネル</div>
    </ItemTabs>,
  );
}

describe("ItemTabs (web) × の削除確認", () => {
  it("shouldConfirmRemove が true の項目は確認ダイアログを出し、onRemove はまだ呼ばない", () => {
    const onRemove = vi.fn();
    renderTabs({ onRemove, shouldConfirmRemove: (i) => i === 1 });

    fireEvent.click(screen.getByTestId("record-remove-2"));

    expect(onRemove).not.toHaveBeenCalled();
    expect(screen.getByText("記録 2を削除しますか？")).toBeInTheDocument();
    expect(screen.getByText("記録 2の入力済みデータが削除されます。")).toBeInTheDocument();
  });

  it("確認で「削除」を押すと、その項目の index で onRemove が呼ばれ、ダイアログが閉じる", () => {
    const onRemove = vi.fn();
    renderTabs({ onRemove, shouldConfirmRemove: () => true });

    fireEvent.click(screen.getByTestId("record-remove-2"));
    fireEvent.click(screen.getByRole("button", { name: "削除" }));

    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledWith(1);
    expect(screen.queryByText("記録 2を削除しますか？")).not.toBeInTheDocument();
  });

  it("確認でキャンセルを押すと onRemove は呼ばれず、ダイアログが閉じる", () => {
    const onRemove = vi.fn();
    renderTabs({ onRemove, shouldConfirmRemove: () => true });

    fireEvent.click(screen.getByTestId("record-remove-1"));
    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));

    expect(onRemove).not.toHaveBeenCalled();
    expect(screen.queryByText("記録 1を削除しますか？")).not.toBeInTheDocument();
  });

  it("shouldConfirmRemove が false の項目 (空の項目) は確認なしで即 onRemove", () => {
    const onRemove = vi.fn();
    renderTabs({ onRemove, shouldConfirmRemove: (i) => i === 1 });

    fireEvent.click(screen.getByTestId("record-remove-1"));

    expect(onRemove).toHaveBeenCalledWith(0);
    expect(screen.queryByText("記録 1を削除しますか？")).not.toBeInTheDocument();
  });

  it("shouldConfirmRemove を渡さなければ従来どおり即 onRemove", () => {
    const onRemove = vi.fn();
    renderTabs({ onRemove });

    fireEvent.click(screen.getByTestId("record-remove-2"));

    expect(onRemove).toHaveBeenCalledWith(1);
  });
});
