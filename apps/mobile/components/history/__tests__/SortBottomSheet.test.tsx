/**
 * SortBottomSheet テスト (Sprint Contract Phase B, mobile)
 *
 * 対象: `components/history/SortBottomSheet.tsx`
 *
 * Sprint Contract 検証観点:
 *   - プリセットタップで即座に onSelect が呼ばれる(適用ボタン不要)
 *   - isDefault プリセットは activeColumn===null のときも選択中扱いになる
 *   - 選択中のプリセットにチェックマーク(Feather "check")が表示される
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SortBottomSheet, type SortPreset } from "../SortBottomSheet";

type Column = "date" | "place";

const presets: SortPreset<Column>[] = [
  { id: "dateDesc", label: "日付(新しい順)", column: "date", order: "desc", isDefault: true },
  { id: "dateAsc", label: "日付(古い順)", column: "date", order: "asc" },
  { id: "placeAsc", label: "場所(昇順)", column: "place", order: "asc" },
  { id: "placeDesc", label: "場所(降順)", column: "place", order: "desc" },
];

describe("SortBottomSheet (mobile)", () => {
  it("全プリセットのラベルが表示される", () => {
    render(
      <SortBottomSheet
        isOpen={true}
        onClose={vi.fn()}
        title="並べ替え"
        presets={presets}
        activeColumn={null}
        activeOrder="desc"
        onSelect={vi.fn()}
      />,
    );
    for (const preset of presets) {
      expect(screen.getByRole("button", { name: preset.label })).toBeTruthy();
    }
  });

  it("activeColumn=null のとき、isDefault のプリセット(日付新しい順)にチェックマークが表示される", () => {
    render(
      <SortBottomSheet
        isOpen={true}
        onClose={vi.fn()}
        title="並べ替え"
        presets={presets}
        activeColumn={null}
        activeOrder="desc"
        onSelect={vi.fn()}
      />,
    );
    const defaultRow = screen.getByRole("button", { name: "日付(新しい順)" });
    expect(defaultRow.querySelector('[data-testid="icon-check"]')).toBeTruthy();

    const otherRow = screen.getByRole("button", { name: "場所(昇順)" });
    expect(otherRow.querySelector('[data-testid="icon-check"]')).toBeNull();
  });

  it("activeColumn/activeOrder が isDefault 以外のプリセットと一致する場合、そのプリセットにチェックマークが移る", () => {
    render(
      <SortBottomSheet
        isOpen={true}
        onClose={vi.fn()}
        title="並べ替え"
        presets={presets}
        activeColumn="place"
        activeOrder="asc"
        onSelect={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "場所(昇順)" }).querySelector('[data-testid="icon-check"]'),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "日付(新しい順)" }).querySelector('[data-testid="icon-check"]'),
    ).toBeNull();
  });

  it("プリセットをタップすると onSelect にそのプリセットが渡される(適用ボタン不要で即時)", () => {
    const onSelect = vi.fn();
    render(
      <SortBottomSheet
        isOpen={true}
        onClose={vi.fn()}
        title="並べ替え"
        presets={presets}
        activeColumn={null}
        activeOrder="desc"
        onSelect={onSelect}
      />,
    );

    screen.getByRole("button", { name: "場所(降順)" }).click();

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ column: "place", order: "desc" }),
    );
  });

  it("isOpen=false のときプリセットは描画されない", () => {
    render(
      <SortBottomSheet
        isOpen={false}
        onClose={vi.fn()}
        title="並べ替え"
        presets={presets}
        activeColumn={null}
        activeOrder="desc"
        onSelect={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: "日付(新しい順)" })).toBeNull();
  });
});
