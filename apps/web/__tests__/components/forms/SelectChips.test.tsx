/**
 * SelectChips 単体テスト
 *
 * Sprint Contract 検証観点:
 *   SelectChips が PracticeMenuItem.tsx から切り出され独立した export になったこと。
 *   props・aria-pressed・data-testid・role・className が元の実装と完全一致すること。
 *
 * NOTE: PracticeMenuItem 内でプライベートだった SelectChips と chipClass を
 *       SelectChips.tsx として export したため、ここで単体検証できる。
 */

import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SelectChips, chipClass } from "../../../components/forms/practice-log/components/SelectChips";

const OPTIONS = [
  { value: "Fr", label: "自由形" },
  { value: "Ba", label: "背泳ぎ" },
  { value: "Br", label: "平泳ぎ" },
];

describe("SelectChips", () => {
  describe("レンダリング", () => {
    it("options を全件チップボタンとして描画すること", () => {
      render(
        <SelectChips
          options={OPTIONS}
          value="Fr"
          onChange={vi.fn()}
          testIdPrefix="test-chip"
        />,
      );

      expect(screen.getByText("自由形")).toBeInTheDocument();
      expect(screen.getByText("背泳ぎ")).toBeInTheDocument();
      expect(screen.getByText("平泳ぎ")).toBeInTheDocument();
    });

    it("role='group' のコンテナで包まれること", () => {
      const { container } = render(
        <SelectChips
          options={OPTIONS}
          value="Fr"
          onChange={vi.fn()}
          testIdPrefix="test-chip"
        />,
      );

      expect(container.querySelector('[role="group"]')).toBeInTheDocument();
    });

    it("選択値に aria-pressed=true が付くこと", () => {
      render(
        <SelectChips
          options={OPTIONS}
          value="Ba"
          onChange={vi.fn()}
          testIdPrefix="test-chip"
        />,
      );

      const baButton = screen.getByText("背泳ぎ").closest("button");
      expect(baButton).toHaveAttribute("aria-pressed", "true");
    });

    it("非選択値に aria-pressed=false が付くこと", () => {
      render(
        <SelectChips
          options={OPTIONS}
          value="Ba"
          onChange={vi.fn()}
          testIdPrefix="test-chip"
        />,
      );

      const frButton = screen.getByText("自由形").closest("button");
      const brButton = screen.getByText("平泳ぎ").closest("button");
      expect(frButton).toHaveAttribute("aria-pressed", "false");
      expect(brButton).toHaveAttribute("aria-pressed", "false");
    });

    it("選択チップに border-blue-600 bg-blue-600 text-white クラスが付くこと", () => {
      render(
        <SelectChips
          options={OPTIONS}
          value="Fr"
          onChange={vi.fn()}
          testIdPrefix="test-chip"
        />,
      );

      const frButton = screen.getByText("自由形").closest("button");
      expect(frButton?.className).toMatch(/border-blue-600/);
      expect(frButton?.className).toMatch(/bg-blue-600/);
      expect(frButton?.className).toMatch(/text-white/);
    });

    it("非選択チップに border-gray-300 bg-white text-gray-700 クラスが付くこと", () => {
      render(
        <SelectChips
          options={OPTIONS}
          value="Fr"
          onChange={vi.fn()}
          testIdPrefix="test-chip"
        />,
      );

      const baButton = screen.getByText("背泳ぎ").closest("button");
      expect(baButton?.className).toMatch(/border-gray-300/);
      expect(baButton?.className).toMatch(/bg-white/);
      expect(baButton?.className).toMatch(/text-gray-700/);
    });

    it("data-testid が {testIdPrefix}-{value} の形式で付くこと", () => {
      render(
        <SelectChips
          options={OPTIONS}
          value="Fr"
          onChange={vi.fn()}
          testIdPrefix="practice-style"
        />,
      );

      expect(screen.getByTestId("practice-style-Fr")).toBeInTheDocument();
      expect(screen.getByTestId("practice-style-Ba")).toBeInTheDocument();
      expect(screen.getByTestId("practice-style-Br")).toBeInTheDocument();
    });

    it("各ボタンの type が 'button' であること（フォーム誤サブミット防止）", () => {
      render(
        <SelectChips
          options={OPTIONS}
          value="Fr"
          onChange={vi.fn()}
          testIdPrefix="test-chip"
        />,
      );

      const buttons = screen.getAllByRole("button");
      buttons.forEach((btn) => {
        expect(btn).toHaveAttribute("type", "button");
      });
    });
  });

  describe("操作", () => {
    it("チップをクリックすると onChange がその value を引数に呼ばれること", () => {
      const onChange = vi.fn();
      render(
        <SelectChips
          options={OPTIONS}
          value="Fr"
          onChange={onChange}
          testIdPrefix="test-chip"
        />,
      );

      fireEvent.click(screen.getByText("背泳ぎ"));
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith("Ba");
    });

    it("すでに選択中のチップをクリックしても onChange が呼ばれること", () => {
      const onChange = vi.fn();
      render(
        <SelectChips
          options={OPTIONS}
          value="Fr"
          onChange={onChange}
          testIdPrefix="test-chip"
        />,
      );

      fireEvent.click(screen.getByText("自由形"));
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith("Fr");
    });

    it("異なるチップを順番にクリックすると、それぞれの value で onChange が呼ばれること", () => {
      const onChange = vi.fn();
      render(
        <SelectChips
          options={OPTIONS}
          value="Fr"
          onChange={onChange}
          testIdPrefix="test-chip"
        />,
      );

      fireEvent.click(screen.getByText("背泳ぎ"));
      fireEvent.click(screen.getByText("平泳ぎ"));
      expect(onChange).toHaveBeenNthCalledWith(1, "Ba");
      expect(onChange).toHaveBeenNthCalledWith(2, "Br");
    });
  });

  describe("chipClass ヘルパー", () => {
    it("selected=true のとき blue クラス群を返すこと", () => {
      const cls = chipClass(true);
      expect(cls).toMatch(/border-blue-600/);
      expect(cls).toMatch(/bg-blue-600/);
      expect(cls).toMatch(/text-white/);
    });

    it("selected=false のとき gray クラス群を返すこと", () => {
      const cls = chipClass(false);
      expect(cls).toMatch(/border-gray-300/);
      expect(cls).toMatch(/bg-white/);
      expect(cls).toMatch(/text-gray-700/);
    });

    it("共通クラス（h-8 sm:h-10 px-3 rounded-md border）が常に含まれること", () => {
      const clsSelected = chipClass(true);
      const clsUnselected = chipClass(false);
      for (const cls of [clsSelected, clsUnselected]) {
        expect(cls).toMatch(/rounded-md/);
        expect(cls).toMatch(/border/);
        expect(cls).toMatch(/text-sm/);
        expect(cls).toMatch(/font-medium/);
      }
    });
  });
});
