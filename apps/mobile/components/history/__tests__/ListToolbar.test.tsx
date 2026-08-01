/**
 * ListToolbar テスト (Sprint Contract Phase B, mobile)
 *
 * 対象: `components/history/ListToolbar.tsx`
 *
 * Sprint Contract 検証観点:
 *   - 絞り込み後の件数が表示される
 *   - activeFilterCount>0 のときのみバッジが表示される
 *   - 並べ替え/絞り込みボタンのクリックでそれぞれのコールバックが呼ばれる
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ListToolbar } from "../ListToolbar";

describe("ListToolbar (mobile)", () => {
  it("itemCount が表示される", () => {
    render(
      <ListToolbar itemCount={12} onSortClick={vi.fn()} onFilterClick={vi.fn()} activeFilterCount={0} />,
    );
    expect(screen.getByText("12件")).toBeTruthy();
  });

  it("activeFilterCount===0 のときバッジは表示されない", () => {
    render(
      <ListToolbar itemCount={12} onSortClick={vi.fn()} onFilterClick={vi.fn()} activeFilterCount={0} />,
    );
    expect(screen.queryByText("0")).toBeNull();
  });

  it("activeFilterCount>0 のときバッジに件数が表示される", () => {
    render(
      <ListToolbar itemCount={12} onSortClick={vi.fn()} onFilterClick={vi.fn()} activeFilterCount={3} />,
    );
    expect(screen.getByText("3")).toBeTruthy();
  });

  it("並べ替えボタンをタップすると onSortClick が呼ばれる", () => {
    const onSortClick = vi.fn();
    render(
      <ListToolbar itemCount={12} onSortClick={onSortClick} onFilterClick={vi.fn()} activeFilterCount={0} />,
    );
    screen.getByRole("button", { name: /並べ替え/ }).click();
    expect(onSortClick).toHaveBeenCalledTimes(1);
  });

  it("絞り込みボタンをタップすると onFilterClick が呼ばれる", () => {
    const onFilterClick = vi.fn();
    render(
      <ListToolbar itemCount={12} onSortClick={vi.fn()} onFilterClick={onFilterClick} activeFilterCount={0} />,
    );
    screen.getByRole("button", { name: /絞り込み/ }).click();
    expect(onFilterClick).toHaveBeenCalledTimes(1);
  });
});
