// =============================================================================
// 「FB n件」表示 (RecordFeedbackCountBadge) とチーム記録一覧の開閉ボタン
// (RecordFeedbackToggleButton) の表示条件
// =============================================================================

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RecordFeedbackCountBadge } from "../RecordFeedbackCountBadge";
import { RecordFeedbackToggleButton } from "../RecordFeedbackToggleButton";

describe("RecordFeedbackCountBadge", () => {
  it("0件のときは何も出さない", () => {
    const { container } = render(<RecordFeedbackCountBadge count={0} />);
    expect(container.textContent).toBe("");
  });

  it("1件以上なら「FB n件」を出す", () => {
    render(<RecordFeedbackCountBadge count={2} />);
    expect(screen.getByText("FB 2件")).toBeTruthy();
  });
});

describe("RecordFeedbackToggleButton", () => {
  const base = { open: false, onPress: () => undefined };

  it("FB が無く書けもしないなら何も出さない (一般メンバー・自分の記録など)", () => {
    const { container } = render(
      <RecordFeedbackToggleButton {...base} count={0} hasMine={false} canWriteNew={false} />,
    );
    expect(container.textContent).toBe("");
  });

  it("FB が無く管理者が書けるなら「FBを書く」", () => {
    render(<RecordFeedbackToggleButton {...base} count={0} hasMine={false} canWriteNew />);
    expect(screen.getByText("FBを書く")).toBeTruthy();
  });

  it("FB があれば件数、自分が書いていれば「記入済み」を添える", () => {
    render(<RecordFeedbackToggleButton {...base} count={3} hasMine canWriteNew={false} />);
    expect(screen.getByText("FB 3件 · 記入済み")).toBeTruthy();
  });

  it("自分宛ての未読があれば「NEW」の印を付ける", () => {
    render(
      <RecordFeedbackToggleButton {...base} count={2} hasMine={false} canWriteNew={false} hasUnread />,
    );
    expect(screen.getByText("NEW")).toBeTruthy();
  });

  it("未読が無ければ「NEW」の印は出さない", () => {
    render(<RecordFeedbackToggleButton {...base} count={2} hasMine={false} canWriteNew={false} />);
    expect(screen.queryByText("NEW")).toBeNull();
  });

  it("押すと onPress が呼ばれる", () => {
    const onPress = vi.fn();
    render(
      <RecordFeedbackToggleButton
        open={false}
        onPress={onPress}
        count={1}
        hasMine={false}
        canWriteNew={false}
      />,
    );
    fireEvent.click(screen.getByText("FB 1件"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
