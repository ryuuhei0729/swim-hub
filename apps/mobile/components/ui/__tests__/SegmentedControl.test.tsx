// =============================================================================
// SegmentedControl.test.tsx
// =============================================================================
// 2〜3 択の切り替え (`components/ui/SegmentedControl.tsx`) を検証する。
//
// ## jsdom で検証できる範囲とできない範囲
// 白いつまみの位置は onLayout で測った幅から出すが、jsdom では onLayout が
// 発火しないためつまみは描画されない。検証するのは選択状態の伝達と onChange。
//
// 検証観点:
//   [V-SC-01] 選択中の項目だけ文字が濃い色 (textPrimary) になる
//   [V-SC-02] 別の項目を押すと onChange にその値が渡る
//   [V-SC-03] 選択中の項目を押しても onChange は呼ばれる (呼び出し側で同値を無視できる)
// =============================================================================

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SegmentedControl } from "../SegmentedControl";

const OPTIONS = [
  { value: "practices", label: "練習" },
  { value: "competitions", label: "大会" },
] as const;

// constants/theme.ts の colors.textPrimary (#111827) / colors.textSecondary (#6B7280) を
// jsdom が返す rgb 表記で持つ。テスト側に期待値を固定し、実装からコピーしない
const SELECTED_COLOR = "rgb(17, 24, 39)";
const UNSELECTED_COLOR = "rgb(107, 114, 128)";

describe("SegmentedControl", () => {
  it("[V-SC-01] 選択中の項目だけ文字が濃い色になる", () => {
    render(<SegmentedControl options={OPTIONS} value="competitions" onChange={() => {}} />);
    expect(screen.getByText("大会").style.color).toBe(SELECTED_COLOR);
    expect(screen.getByText("練習").style.color).toBe(UNSELECTED_COLOR);
  });

  it("[V-SC-02] 別の項目を押すと onChange にその値が渡る", () => {
    const onChange = vi.fn();
    render(<SegmentedControl options={OPTIONS} value="practices" onChange={onChange} />);
    fireEvent.click(screen.getByText("大会"));
    expect(onChange).toHaveBeenCalledWith("competitions");
  });

  it("[V-SC-03] 選択中の項目を押しても onChange は呼ばれる", () => {
    const onChange = vi.fn();
    render(<SegmentedControl options={OPTIONS} value="practices" onChange={onChange} />);
    fireEvent.click(screen.getByText("練習"));
    expect(onChange).toHaveBeenCalledWith("practices");
  });
});
