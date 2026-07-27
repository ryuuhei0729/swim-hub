/**
 * FilterBottomSheet テスト (Sprint Contract Phase B, mobile)
 *
 * 対象: `components/history/FilterBottomSheet.tsx`
 *
 * Sprint Contract 検証観点:
 *   [V-MC-09/V-MP-07] draft/apply 専用(onApply は必須 prop): フッターは常に
 *     「すべてクリア」+「適用」の2ボタン構成
 *   チップ操作: single はトグルで選択解除、multi は配列への追加/除去
 *
 * トートロジー防止メモ: handleOptionPress の実装分岐をそのままなぞらず、
 * 「同じチップを2回押すと single は解除される」という Sprint Contract の
 * Success Criteria から逆算したアサーションにする。
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FilterBottomSheet, type FilterGroup } from "../FilterBottomSheet";

const makeGroup = (overrides: Partial<FilterGroup> = {}): FilterGroup => ({
  id: "pool",
  label: "プール",
  mode: "single",
  options: [
    { value: "short", label: "短水路" },
    { value: "long", label: "長水路" },
  ],
  selectedValues: [],
  onChange: vi.fn(),
  onClearGroup: vi.fn(),
  ...overrides,
});

describe("FilterBottomSheet (mobile)", () => {
  it("フッターに「すべてクリア」と「適用」の2ボタンが常に表示される(draft/applyのみ)", () => {
    render(
      <FilterBottomSheet
        isOpen={true}
        onClose={vi.fn()}
        title="絞り込み"
        groups={[makeGroup()]}
        activeCount={0}
        onClearAll={vi.fn()}
        onApply={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "すべてクリア" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "適用" })).toBeTruthy();
  });

  it("activeCount===0 のとき「すべてクリア」が disabled になる", () => {
    render(
      <FilterBottomSheet
        isOpen={true}
        onClose={vi.fn()}
        title="絞り込み"
        groups={[makeGroup()]}
        activeCount={0}
        onClearAll={vi.fn()}
        onApply={vi.fn()}
      />,
    );
    expect((screen.getByRole("button", { name: "すべてクリア" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("activeCount>0 のとき「すべてクリア」が有効になる", () => {
    render(
      <FilterBottomSheet
        isOpen={true}
        onClose={vi.fn()}
        title="絞り込み"
        groups={[makeGroup({ selectedValues: ["short"] })]}
        activeCount={1}
        onClearAll={vi.fn()}
        onApply={vi.fn()}
      />,
    );
    expect((screen.getByRole("button", { name: "すべてクリア" }) as HTMLButtonElement).disabled).toBeFalsy();
  });

  it("「適用」を押すと onApply が1回呼ばれ、onClearAll は呼ばれない", () => {
    const onApply = vi.fn();
    const onClearAll = vi.fn();
    render(
      <FilterBottomSheet
        isOpen={true}
        onClose={vi.fn()}
        title="絞り込み"
        groups={[makeGroup()]}
        activeCount={0}
        onClearAll={onClearAll}
        onApply={onApply}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "適用" }));

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onClearAll).not.toHaveBeenCalled();
  });

  it("「すべてクリア」を押すと onClearAll が呼ばれ、onApply は呼ばれない(自動適用しない)", () => {
    const onApply = vi.fn();
    const onClearAll = vi.fn();
    render(
      <FilterBottomSheet
        isOpen={true}
        onClose={vi.fn()}
        title="絞り込み"
        groups={[makeGroup({ selectedValues: ["short"] })]}
        activeCount={1}
        onClearAll={onClearAll}
        onApply={onApply}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "すべてクリア" }));

    expect(onClearAll).toHaveBeenCalledTimes(1);
    expect(onApply).not.toHaveBeenCalled();
  });

  describe("チップ操作", () => {
    it("single グループの未選択チップをタップすると onChange([value]) が呼ばれる", () => {
      const onChange = vi.fn();
      render(
        <FilterBottomSheet
          isOpen={true}
          onClose={vi.fn()}
          title="絞り込み"
          groups={[makeGroup({ onChange })]}
          activeCount={0}
          onClearAll={vi.fn()}
          onApply={vi.fn()}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "短水路" }));
      expect(onChange).toHaveBeenCalledWith(["short"]);
    });

    it("single グループの選択済みチップを再タップするとトグルで解除され、onChange([]) が呼ばれる", () => {
      const onChange = vi.fn();
      render(
        <FilterBottomSheet
          isOpen={true}
          onClose={vi.fn()}
          title="絞り込み"
          groups={[makeGroup({ selectedValues: ["short"], onChange })]}
          activeCount={1}
          onClearAll={vi.fn()}
          onApply={vi.fn()}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "短水路" }));
      expect(onChange).toHaveBeenCalledWith([]);
    });

    it("multi グループのチップタップで配列に追加される", () => {
      const onChange = vi.fn();
      const group = makeGroup({
        id: "distance",
        label: "距離",
        mode: "multi",
        options: [
          { value: "50", label: "50m" },
          { value: "100", label: "100m" },
        ],
        selectedValues: ["50"],
        onChange,
      });
      render(
        <FilterBottomSheet
          isOpen={true}
          onClose={vi.fn()}
          title="絞り込み"
          groups={[group]}
          activeCount={1}
          onClearAll={vi.fn()}
          onApply={vi.fn()}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "100m" }));
      expect(onChange).toHaveBeenCalledWith(["50", "100"]);
    });

    it("multi グループの選択済みチップをタップすると配列から除去される", () => {
      const onChange = vi.fn();
      const group = makeGroup({
        id: "distance",
        label: "距離",
        mode: "multi",
        options: [
          { value: "50", label: "50m" },
          { value: "100", label: "100m" },
        ],
        selectedValues: ["50", "100"],
        onChange,
      });
      render(
        <FilterBottomSheet
          isOpen={true}
          onClose={vi.fn()}
          title="絞り込み"
          groups={[group]}
          activeCount={1}
          onClearAll={vi.fn()}
          onApply={vi.fn()}
        />,
      );

      fireEvent.click(screen.getByRole("button", { name: "100m" }));
      expect(onChange).toHaveBeenCalledWith(["50"]);
    });

    it("グループに選択中の値がある場合、「クリア」ボタンが表示され onClearGroup を呼ぶ", () => {
      const onClearGroup = vi.fn();
      render(
        <FilterBottomSheet
          isOpen={true}
          onClose={vi.fn()}
          title="絞り込み"
          groups={[makeGroup({ selectedValues: ["short"], onClearGroup })]}
          activeCount={1}
          onClearAll={vi.fn()}
          onApply={vi.fn()}
        />,
      );

      fireEvent.click(screen.getByText("クリア"));
      expect(onClearGroup).toHaveBeenCalledTimes(1);
    });

    it("選択中の値が無いグループには「クリア」ボタンが表示されない", () => {
      render(
        <FilterBottomSheet
          isOpen={true}
          onClose={vi.fn()}
          title="絞り込み"
          groups={[makeGroup({ selectedValues: [] })]}
          activeCount={0}
          onClearAll={vi.fn()}
          onApply={vi.fn()}
        />,
      );
      expect(screen.queryByText("クリア")).toBeNull();
    });
  });

  it("options が空配列のグループは「-」を表示し、クラッシュしない", () => {
    expect(() =>
      render(
        <FilterBottomSheet
          isOpen={true}
          onClose={vi.fn()}
          title="絞り込み"
          groups={[makeGroup({ options: [] })]}
          activeCount={0}
          onClearAll={vi.fn()}
          onApply={vi.fn()}
        />,
      ),
    ).not.toThrow();
    expect(screen.getByText("-")).toBeTruthy();
  });

  it("note が指定された場合、グループ見出し直下に表示される", () => {
    render(
      <FilterBottomSheet
        isOpen={true}
        onClose={vi.fn()}
        title="絞り込み"
        groups={[makeGroup({ note: "選択した全てのタグを含む練習ログがある日のみ表示" })]}
        activeCount={0}
        onClearAll={vi.fn()}
        onApply={vi.fn()}
      />,
    );
    expect(screen.getByText("選択した全てのタグを含む練習ログがある日のみ表示")).toBeTruthy();
  });
});
