/**
 * FilterBottomSheet ドラフト適用モード テスト (Sprint Contract Phase B)
 *
 * 対象: `onApply?: () => void` の新規追加(既存 FilterBottomSheet.test.tsx とは別ファイル)。
 *
 * 仕様 (Sprint Contract):
 * - `onApply` 未指定時: 現行どおり1ボタン(「すべてクリア」のみ)・チップ操作は即時 onChange。
 * - `onApply` 指定時: フッターに「すべてクリア」+「適用」の2ボタンを表示する。
 *   - 「適用」ボタン押下で onApply が呼ばれる(シートを閉じるかどうかは呼び出し側の責務。
 *     FilterBottomSheet 自体は isOpen を制御しない)。
 *   - 「すべてクリア」は activeCount===0 のとき無効化される(既存仕様を維持)。
 *
 * トートロジー防止メモ: 実装(FilterBottomSheet.tsx)の handleOptionClick 等をなぞらず、
 * 「onApply の有無でフッターの見た目・ボタン押下時のコールバック呼び出しがどう変わるべきか」
 * という Sprint Contract の期待値からアサーションを導く。
 */

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import messages from "@apps/shared/messages/ja.json";
import FilterBottomSheet, { type FilterGroup } from "@/components/history/FilterBottomSheet";

const renderWithIntl = (ui: React.ReactElement) =>
  render(
    <NextIntlClientProvider locale="ja" messages={messages as unknown as AbstractIntlMessages}>
      {ui}
    </NextIntlClientProvider>,
  );

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

describe("FilterBottomSheet - onApply 指定時のドラフト適用モード", () => {
  describe("フッターボタン構成", () => {
    it("onApply 未指定の場合、フッターは「すべてクリア」の1ボタンのみ(既存仕様維持)", () => {
      renderWithIntl(
        <FilterBottomSheet
          isOpen={true}
          onClose={vi.fn()}
          title="絞り込み"
          groups={[makeGroup()]}
          activeCount={0}
          onClearAll={vi.fn()}
        />,
      );

      expect(screen.getByRole("button", { name: "すべてクリア" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "適用" })).not.toBeInTheDocument();
    });

    it("onApply 指定時、フッターに「すべてクリア」と「適用」の2ボタンが表示される", () => {
      renderWithIntl(
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

      expect(screen.getByRole("button", { name: "すべてクリア" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "適用" })).toBeInTheDocument();
    });

    it("activeCount===0 のとき「すべてクリア」は disabled になる(onApply 指定時も同様)", () => {
      renderWithIntl(
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

      expect(screen.getByRole("button", { name: "すべてクリア" })).toBeDisabled();
    });

    it("activeCount>0 のとき「すべてクリア」は有効になる(onApply 指定時)", () => {
      renderWithIntl(
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

      expect(screen.getByRole("button", { name: "すべてクリア" })).toBeEnabled();
    });
  });

  describe("適用ボタン", () => {
    it("「適用」ボタンをクリックすると onApply が1回呼ばれる", async () => {
      const onApply = vi.fn();
      const user = userEvent.setup();
      renderWithIntl(
        <FilterBottomSheet
          isOpen={true}
          onClose={vi.fn()}
          title="絞り込み"
          groups={[makeGroup()]}
          activeCount={0}
          onClearAll={vi.fn()}
          onApply={onApply}
        />,
      );

      await user.click(screen.getByRole("button", { name: "適用" }));

      expect(onApply).toHaveBeenCalledTimes(1);
    });

    it("「適用」ボタンをクリックしても onClearAll は呼ばれない", async () => {
      const onApply = vi.fn();
      const onClearAll = vi.fn();
      const user = userEvent.setup();
      renderWithIntl(
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

      await user.click(screen.getByRole("button", { name: "適用" }));

      expect(onClearAll).not.toHaveBeenCalled();
    });
  });

  describe("すべてクリアボタン(ドラフトモード)", () => {
    it("「すべてクリア」をクリックすると onClearAll が呼ばれ、onApply は呼ばれない(自動適用しない)", async () => {
      const onApply = vi.fn();
      const onClearAll = vi.fn();
      const user = userEvent.setup();
      renderWithIntl(
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

      await user.click(screen.getByRole("button", { name: "すべてクリア" }));

      expect(onClearAll).toHaveBeenCalledTimes(1);
      expect(onApply).not.toHaveBeenCalled();
    });
  });

  describe("チップ操作はドラフトモードでも従来通り onChange 経由", () => {
    it("single グループのチップクリックは onApply 指定の有無に関わらず onChange([value]) が呼ばれる", async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      renderWithIntl(
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

      await user.click(screen.getByRole("button", { name: "短水路" }));

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith(["short"]);
    });

    it("multi グループのチップクリックは onApply 指定の有無に関わらず onChange で配列に追加される", async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
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
      renderWithIntl(
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

      await user.click(screen.getByRole("button", { name: "100m" }));

      expect(onChange).toHaveBeenCalledWith(["50", "100"]);
    });
  });
});
