// =============================================================================
// BestTimeDetailSheet.test.tsx
// =============================================================================
// mobile UI フィードバック #1: ベストタイム詳細を「ボトムシート→中央ポップアップ」に
// 変更 (`BestTimeDetailSheet` が `CenterModal` を使うようになった)。
// `CenterModal` 自身の構造的性質は `components/ui/__tests__/CenterModal.test.tsx` で
// 検証済みのため、ここでは BestTimeDetailSheet 固有の配線 (detail の3分岐・
// props が変わっていないこと) を検証する。
//
// Sprint Contract 検証観点:
//   [V-DETAIL-01] detail!==null のとき中央ポップアップとして開き、内容が表示される
//   [V-DETAIL-02] detail===null のとき何も表示されない
//   [V-DETAIL-03] 閉じるボタン (×) で onClose が呼ばれる
//   [V-DETAIL-04] 背面タップで onClose が呼ばれる
//   [V-DETAIL-05] props (detail/onClose/noteFallbackLabel) は変更前と同一であること
//     (呼び出し元3箇所が無変更で動く前提。tsc がこれを型レベルで保証しているが、
//     実行時にも同じ props で実際にレンダリングできることを確認する)
// =============================================================================

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

import { BestTimeDetailSheet, type BestTimeDetail } from "../BestTimeDetailSheet";

const detail: BestTimeDetail = {
  date: "2024-05-05",
  competitionTitle: "第10回記録会",
  note: null,
};

describe("BestTimeDetailSheet", () => {
  it("[V-DETAIL-01] detail が渡されると中央ポップアップとして開き、大会名が表示される", () => {
    render(
      <BestTimeDetailSheet detail={detail} onClose={vi.fn()} noteFallbackLabel="一括登録" />,
    );

    expect(screen.getByText("第10回記録会")).toBeTruthy();
  });

  it("[V-DETAIL-02] detail が null のとき何も表示されない", () => {
    const { container } = render(
      <BestTimeDetailSheet detail={null} onClose={vi.fn()} noteFallbackLabel="一括登録" />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("[V-DETAIL-03] 閉じるボタン (×) で onClose が呼ばれる", () => {
    const onClose = vi.fn();
    render(
      <BestTimeDetailSheet detail={detail} onClose={onClose} noteFallbackLabel="一括登録" />,
    );

    fireEvent.click(screen.getByTestId("icon-x").closest("button")!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("[V-DETAIL-04] 背面タップで onClose が呼ばれる", () => {
    const onClose = vi.fn();
    render(
      <BestTimeDetailSheet detail={detail} onClose={onClose} noteFallbackLabel="一括登録" />,
    );

    // 背面タップ用 Pressable は最初の button (CenterModal の構造上、閉じるボタンより先に描画される)
    fireEvent.click(screen.getAllByRole("button")[0]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("[V-DETAIL-05] note フォールバック分岐: competition/note 無しのとき noteFallbackLabel が表示される", () => {
    render(
      <BestTimeDetailSheet
        detail={{ date: "2024-01-01", competitionTitle: null, note: null }}
        onClose={vi.fn()}
        noteFallbackLabel="一括登録"
      />,
    );
    expect(screen.getByText("一括登録")).toBeTruthy();
  });

  it("[V-DETAIL-06] note フォールバック分岐: competition 無し + note ありのとき note が表示される (フォールバックより優先)", () => {
    render(
      <BestTimeDetailSheet
        detail={{ date: "2024-01-01", competitionTitle: null, note: "自主練での計測" }}
        onClose={vi.fn()}
        noteFallbackLabel="一括登録"
      />,
    );
    expect(screen.getByText("自主練での計測")).toBeTruthy();
    expect(screen.queryByText("一括登録")).toBeNull();
  });
});
