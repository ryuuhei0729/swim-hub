// =============================================================================
// TimeInputHelp.test.tsx
// =============================================================================
// 「タイム入力のコツ」ヘルプを、インライン展開パネルから中央ポップアップ (`CenterModal`)
// へ統一した変更を固定する。同等のヘルプを先に移行済みの `WaPointsInfoTooltip` と
// 挙動を揃える (再タップでは閉じない / 閉じるのは背面タップと × のみ)。
//
// 検証観点:
//   [V-TIH-01] 初期状態では本文が描画されない (= 常時展開ではない)
//   [V-TIH-02] トリガー行をタップすると本文がポップアップに表示される
//   [V-TIH-03] 閉じるボタン (×) で閉じる
//   [V-TIH-04] 背面タップで閉じる
//   [V-TIH-05] 開いた状態で再タップしても閉じない (旧トグル実装なら閉じる)
//   [V-TIH-06] showCarryOver=false は helpBodyBasic、true は helpBody を出す
//   [V-TIH-07] 閉じている間もトリガーのラベル「タイム入力のコツ」は常に見えている
//     (呼び出し元画面では入力欄ラベルに隣接しておらず、ラベルが導線そのもの)
// =============================================================================

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

const HELP_TITLE = "タイム入力のコツ";
const HELP_BODY_BASIC = "基本の入力方法の説明";
const HELP_BODY_CARRY = "基本の入力方法の説明 + 十の位の引き継ぎ";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const table: Record<string, string> = {
        "forms.timeInput.helpTitle": HELP_TITLE,
        "forms.timeInput.helpBodyBasic": HELP_BODY_BASIC,
        "forms.timeInput.helpBody": HELP_BODY_CARRY,
        "common.close": "閉じる",
      };
      return table[key] ?? key;
    },
  }),
}));

import { TimeInputHelp } from "../TimeInputHelp";

// `testID` は RN の Pressable に渡すと、このリポジトリの DOM モックでは Testing Library 標準の
// `data-testid` ではなく生の `testid` 属性として転記される (WaPointsInfoTooltip.test.tsx と同じ)。
function getTrigger(container: HTMLElement): HTMLElement {
  const el = container.querySelector('[testid="time-input-help"]');
  if (!el) throw new Error('testid="time-input-help" の要素が見つかりません');
  return el as HTMLElement;
}

describe("TimeInputHelp", () => {
  it("[V-TIH-01] 初期状態では本文が表示されない", () => {
    render(<TimeInputHelp testID="time-input-help" />);
    expect(screen.queryByText(HELP_BODY_BASIC)).toBeNull();
  });

  it("[V-TIH-02] トリガーをタップするとポップアップで本文が表示される", () => {
    const { container } = render(<TimeInputHelp testID="time-input-help" />);
    fireEvent.click(getTrigger(container));
    expect(screen.getByText(HELP_BODY_BASIC)).toBeTruthy();
  });

  it("[V-TIH-03] 閉じるボタン (×) で閉じる", async () => {
    const { container } = render(<TimeInputHelp testID="time-input-help" />);
    fireEvent.click(getTrigger(container));
    expect(screen.getByText(HELP_BODY_BASIC)).toBeTruthy();

    // CenterModal 内蔵の × ボタン。閉じアニメーション(160ms)の後に unmount されるため waitFor で待つ。
    fireEvent.click(screen.getByTestId("icon-x").closest("button")!);
    await waitFor(() => {
      expect(screen.queryByText(HELP_BODY_BASIC)).toBeNull();
    });
  });

  it("[V-TIH-04] 背面タップで閉じる", async () => {
    const { container } = render(<TimeInputHelp testID="time-input-help" />);
    fireEvent.click(getTrigger(container));
    expect(screen.getByText(HELP_BODY_BASIC)).toBeTruthy();

    // button の並び: [0]=トリガー行, [1]=CenterModal の背面タップ用 Pressable, [2]=× ボタン。
    const backdrop = screen.getAllByRole("button")[1]!;
    fireEvent.click(backdrop);
    await waitFor(() => {
      expect(screen.queryByText(HELP_BODY_BASIC)).toBeNull();
    });
  });

  it("[V-TIH-05] 開いた状態で再タップしても閉じない (トグル実装への差し戻しを検出する)", async () => {
    const { container } = render(<TimeInputHelp testID="time-input-help" />);
    const trigger = getTrigger(container);

    fireEvent.click(trigger);
    expect(screen.getByText(HELP_BODY_BASIC)).toBeTruthy();

    fireEvent.click(trigger);
    // 旧トグル実装ならここで閉じアニメーション(160ms)を経て消えるので、それより長く待つ。
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(screen.getByText(HELP_BODY_BASIC)).toBeTruthy();
  });

  it("[V-TIH-06] showCarryOver=true は引き継ぎ込みの本文 (helpBody) を出す", () => {
    const { container } = render(<TimeInputHelp showCarryOver testID="time-input-help" />);
    fireEvent.click(getTrigger(container));
    expect(screen.getByText(HELP_BODY_CARRY)).toBeTruthy();
    expect(screen.queryByText(HELP_BODY_BASIC)).toBeNull();
  });

  it("[V-TIH-06] showCarryOver 省略時は基本の本文 (helpBodyBasic) を出す", () => {
    const { container } = render(<TimeInputHelp testID="time-input-help" />);
    fireEvent.click(getTrigger(container));
    expect(screen.getByText(HELP_BODY_BASIC)).toBeTruthy();
    expect(screen.queryByText(HELP_BODY_CARRY)).toBeNull();
  });

  it("[V-TIH-07] 閉じている間もトリガーのラベルが表示されている", () => {
    render(<TimeInputHelp testID="time-input-help" />);
    // 閉じている状態ではラベルはトリガー行の1箇所だけ (ポップアップ側のタイトルは未描画)。
    expect(screen.getAllByText(HELP_TITLE)).toHaveLength(1);
  });
});
