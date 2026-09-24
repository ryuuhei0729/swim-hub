/**
 * ItemTabs — scrollbar-none → scrollbar-hide の修正テスト (jsdom / QA Phase A)
 *
 * Sprint Contract (PM 裁定 3):
 *   ItemTabs.tsx:60 の `scrollbar-none` は未定義クラス (タイポ)。
 *   globals.css:350 で定義されているのは `scrollbar-hide` の方。
 *   タブ行は overflow-x-auto なので、未定義のままだと項目が増えたときに
 *   スクロールバーが出て高さが変わる。
 *
 * jsdom はスタイルシートを解決しないので「スクロールバーが消えているか」は
 * Playwright 側 (mobile-chip-carousel.spec.ts の ItemTabs 判定) で見る。
 * ここではクラス文字列のタイポが戻っていないことだけを見る。
 */

import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderWithI18n as render, screen } from "../../utils/render";
import ItemTabs from "../../../components/forms/ItemTabs";

function renderTabs(count = 3) {
  return render(
    <ItemTabs
      count={count}
      activeIndex={0}
      onSelect={vi.fn()}
      onAdd={vi.fn()}
      onRemove={vi.fn()}
      label={(i) => `項目${i + 1}`}
      testIdPrefix="item"
      addLabel="追加"
    >
      <div data-testid="panel">パネル</div>
    </ItemTabs>,
  );
}

describe("ItemTabs — タブ行のスクロールバー非表示", () => {
  it("[T-01] tablist に scrollbar-hide が付き、未定義の scrollbar-none が残っていない", () => {
    // globals.css:350 に定義があるのは scrollbar-hide の方。scrollbar-none は
    // どこにも定義が無いタイポで、そのままだとスクロールバーが出て高さが変わる。
    // (T-01/T-02 は同じ主張だったので 1 本に統合した)
    renderTabs();
    const tokens = screen.getByRole("tablist").className.split(/\s+/).filter(Boolean);
    expect(tokens, "scrollbar-hide が無い").toContain("scrollbar-hide");
    expect(tokens, "未定義クラス scrollbar-none が残っている").not.toContain("scrollbar-none");
  });

  it("[T-03] 横スクロール自体は維持されている (overflow-x-auto)", () => {
    // scrollbar-hide はスクロールバーを隠すだけで、スクロール機能は残す前提。
    renderTabs();
    const tokens = screen.getByRole("tablist").className.split(/\s+/).filter(Boolean);
    expect(tokens).toContain("overflow-x-auto");
  });

  it("[T-04] タブ・パネルの既存構造が変わっていない", () => {
    renderTabs(3);
    expect(screen.getAllByRole("tab")).toHaveLength(3);
    expect(screen.getByTestId("item-tab-1")).toBeInTheDocument();
    expect(screen.getByTestId("panel")).toBeInTheDocument();
  });
});
