/**
 * FilterBottomSheet テスト
 *
 * 2026-07-22 Sprint 追加修正: single グループのチップ再クリックによるトグル解除。
 * `handleOptionClick` の仕様:
 *   - single: 選択中の値を再クリック → onChange([]) (未選択=すべてに戻る)。
 *             別の値をクリック → onChange([value]) (選択を置き換える)。
 *   - multi: 選択中の値を再クリック → その値だけ配列から外れる(他の選択は残る、既存挙動)。
 *             未選択の値をクリック → 配列に追加される。
 *
 * トートロジー防止メモ: 本体実装(handleOptionClick)をそのまま踏襲せず、
 * 「同じチップの再クリックで単一/複数それぞれどう振る舞うべきか」という仕様から
 * 導いた期待値(onChange への呼び出し引数)を検証する。
 */

import { useState } from "react";
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

describe("FilterBottomSheet", () => {
  describe("single グループ: 選択中チップの再クリックでトグル解除", () => {
    it("未選択の値をクリックすると onChange([value]) が呼ばれる", async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      const group: FilterGroup = {
        id: "pool",
        label: "プール",
        mode: "single",
        options: [
          { value: "short", label: "短水路" },
          { value: "long", label: "長水路" },
        ],
        selectedValues: [],
        onChange,
        onClearGroup: vi.fn(),
      };

      renderWithIntl(
        <FilterBottomSheet
          isOpen={true}
          onClose={vi.fn()}
          title="絞り込み"
          groups={[group]}
          activeCount={0}
          onClearAll={vi.fn()}
        />,
      );

      await user.click(screen.getByRole("button", { name: "短水路" }));

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith(["short"]);
    });

    it("選択中の値を再クリックすると onChange([]) が呼ばれる(トグル解除=すべてに戻る)", async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      const group: FilterGroup = {
        id: "pool",
        label: "プール",
        mode: "single",
        options: [
          { value: "short", label: "短水路" },
          { value: "long", label: "長水路" },
        ],
        selectedValues: ["short"],
        onChange,
        onClearGroup: vi.fn(),
      };

      renderWithIntl(
        <FilterBottomSheet
          isOpen={true}
          onClose={vi.fn()}
          title="絞り込み"
          groups={[group]}
          activeCount={1}
          onClearAll={vi.fn()}
        />,
      );

      // 選択中(=selectedValues=["short"])の "短水路" を再クリックする
      await user.click(screen.getByRole("button", { name: "短水路" }));

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith([]);
    });

    it("選択中とは別の値をクリックすると onChange([別の値]) で選択が置き換わる", async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      const group: FilterGroup = {
        id: "pool",
        label: "プール",
        mode: "single",
        options: [
          { value: "short", label: "短水路" },
          { value: "long", label: "長水路" },
        ],
        selectedValues: ["short"],
        onChange,
        onClearGroup: vi.fn(),
      };

      renderWithIntl(
        <FilterBottomSheet
          isOpen={true}
          onClose={vi.fn()}
          title="絞り込み"
          groups={[group]}
          activeCount={1}
          onClearAll={vi.fn()}
        />,
      );

      await user.click(screen.getByRole("button", { name: "長水路" }));

      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith(["long"]);
    });

    it(
      "[状態遷移込み] 実際に selectedValues を state で反映すると、同じチップの" +
        "再クリック→再度クリックで 選択→解除→再選択 の往復が成立する",
      async () => {
        function Harness() {
          const [selected, setSelected] = useState<string[]>([]);
          const group: FilterGroup = {
            id: "pool",
            label: "プール",
            mode: "single",
            options: [
              { value: "short", label: "短水路" },
              { value: "long", label: "長水路" },
            ],
            selectedValues: selected,
            onChange: setSelected,
            onClearGroup: () => setSelected([]),
          };
          return (
            <FilterBottomSheet
              isOpen={true}
              onClose={() => {}}
              title="絞り込み"
              groups={[group]}
              activeCount={selected.length}
              onClearAll={() => setSelected([])}
            />
          );
        }
        const user = userEvent.setup();
        renderWithIntl(<Harness />);

        const shortChip = screen.getByRole("button", { name: "短水路" });
        // 選択前は非選択スタイル(bg-blue-600 を含まない)
        expect(shortChip.className).not.toContain("bg-blue-600");

        await user.click(shortChip);
        expect(shortChip.className).toContain("bg-blue-600");

        // 選択中のチップを再クリック → 解除(未選択スタイルに戻る)
        await user.click(shortChip);
        expect(shortChip.className).not.toContain("bg-blue-600");

        // もう一度クリックすれば再選択できる
        await user.click(shortChip);
        expect(shortChip.className).toContain("bg-blue-600");
      },
    );
  });

  describe("multi グループ: 選択中チップの再クリックで、その値だけ外れる(既存挙動の明示化)", () => {
    it("未選択の値をクリックすると配列に追加される", async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      const group: FilterGroup = {
        id: "tags",
        label: "タグ",
        mode: "multi",
        options: [
          { value: "tag-a", label: "タグA" },
          { value: "tag-b", label: "タグB" },
        ],
        selectedValues: ["tag-a"],
        onChange,
        onClearGroup: vi.fn(),
      };

      renderWithIntl(
        <FilterBottomSheet
          isOpen={true}
          onClose={vi.fn()}
          title="絞り込み"
          groups={[group]}
          activeCount={1}
          onClearAll={vi.fn()}
        />,
      );

      await user.click(screen.getByRole("button", { name: "タグB" }));

      expect(onChange).toHaveBeenCalledWith(["tag-a", "tag-b"]);
    });

    it("選択済みの値を再クリックすると、その値だけ配列から外れ、他の選択は残る", async () => {
      const onChange = vi.fn();
      const user = userEvent.setup();
      const group: FilterGroup = {
        id: "tags",
        label: "タグ",
        mode: "multi",
        options: [
          { value: "tag-a", label: "タグA" },
          { value: "tag-b", label: "タグB" },
        ],
        selectedValues: ["tag-a", "tag-b"],
        onChange,
        onClearGroup: vi.fn(),
      };

      renderWithIntl(
        <FilterBottomSheet
          isOpen={true}
          onClose={vi.fn()}
          title="絞り込み"
          groups={[group]}
          activeCount={1}
          onClearAll={vi.fn()}
        />,
      );

      await user.click(screen.getByRole("button", { name: "タグA" }));

      // タグAだけが外れ、タグBは残る(順序も維持される)
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith(["tag-b"]);
    });

    it(
      "[状態遷移込み] 実際に selectedValues を state で反映すると、複数選択したうちの" +
        "1つだけ再クリックで解除しても、残りの選択は維持される",
      async () => {
        function Harness() {
          const [selected, setSelected] = useState<string[]>([]);
          const group: FilterGroup = {
            id: "place",
            label: "場所",
            mode: "multi",
            options: [
              { value: "pool-x", label: "プールX" },
              { value: "pool-y", label: "プールY" },
            ],
            selectedValues: selected,
            onChange: setSelected,
            onClearGroup: () => setSelected([]),
          };
          return (
            <FilterBottomSheet
              isOpen={true}
              onClose={() => {}}
              title="絞り込み"
              groups={[group]}
              activeCount={selected.length}
              onClearAll={() => setSelected([])}
            />
          );
        }
        const user = userEvent.setup();
        renderWithIntl(<Harness />);

        await user.click(screen.getByRole("button", { name: "プールX" }));
        await user.click(screen.getByRole("button", { name: "プールY" }));

        const poolXChip = screen.getByRole("button", { name: "プールX" });
        const poolYChip = screen.getByRole("button", { name: "プールY" });
        expect(poolXChip.className).toContain("bg-blue-600");
        expect(poolYChip.className).toContain("bg-blue-600");

        // プールXだけ再クリックして解除する
        await user.click(poolXChip);

        expect(poolXChip.className).not.toContain("bg-blue-600");
        // プールYの選択は維持される(multi は個別トグルのみで全体は外れない)
        expect(poolYChip.className).toContain("bg-blue-600");
      },
    );
  });
});
