/**
 * PracticeMenuItem / SelectChips — チップ行カルーセル化の構造テスト (jsdom / QA Phase B 改訂版)
 *
 * Sprint Contract「スマホ幅 Web UI 改善」の Deliverable:
 *   - SelectChips.tsx:26 — コンテナを ChipScrollRow に。role="group" を必ず維持
 *   - PracticeMenuItem.tsx:146 — 距離チップ行を ChipScrollRow に
 *
 * ■ Phase B 改訂点
 *   - 容器 testid を `chiprow-` 名前空間に統一 (PM 裁定)
 *   - クラス判定をトークン完全一致に変更 ("flex" が "sm:flex-wrap" に当たる問題)
 *   - 距離行のチップ数を `DISTANCE_PRESETS.length + 1` の**厳密一致**に変更。
 *     `toBeGreaterThanOrEqual(2)` ではプリセットが1個に減っても気づけなかった。
 *   - 内側ラッパー追加に耐えるよう、チップの親は実測で辿る
 *
 * ■ 既存の PracticeMenuItemRegression.test.tsx は「チップが動くか」を見ている。
 *   本ファイルは「行コンテナの構造と a11y が維持されているか」だけを追加で見る。
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithI18n as render, screen, fireEvent, within } from "../../utils/render";
import PracticeMenuItem from "../../../components/forms/practice-log/components/PracticeMenuItem";
import { SelectChips, chipClass } from "../../../components/forms/practice-log/components/SelectChips";
import { DISTANCE_PRESETS } from "../../../components/forms/practice-log/types";
import type { PracticeMenu, Tag } from "../../../components/forms/practice-log/types";

vi.mock("../../../components/forms/TagInput", () => ({
  default: () => <div data-testid="tag-input-mock" />,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const DEFAULT_MENU: PracticeMenu = {
  id: "test-menu-1",
  style: "Fr",
  swimCategory: "Swim",
  distance: 100,
  reps: 4,
  sets: 1,
  circleMin: 1,
  circleSec: 30,
  note: "",
  tags: [],
  times: [],
};

const DEFAULT_PROPS = {
  menu: DEFAULT_MENU,
  menuIndex: 0,
  canRemove: false,
  availableTags: [] as Tag[],
  isLoading: false,
  onRemove: vi.fn(),
  onUpdate: vi.fn(),
  onTagsChange: vi.fn(),
  onAvailableTagsUpdate: vi.fn(),
  onOpenTimeModal: vi.fn(),
};

const STYLE_ROW = "chiprow-practice-style";
const CATEGORY_ROW = "chiprow-practice-swim-category";
const DISTANCE_ROW = "chiprow-practice-distance-preset";

const classTokens = (el: HTMLElement) => el.className.split(/\s+/).filter(Boolean);

/** チップの直接の親 = flex / スクロール容器 (内側ラッパーの有無に依存しない) */
function scrollerOf(row: HTMLElement): HTMLElement {
  const chips = within(row).queryAllByRole("button");
  expect(chips.length, "行にチップが1つも無い").toBeGreaterThan(0);
  const parent = chips[0]!.parentElement!;
  for (const c of chips) {
    expect(c.parentElement, "チップごとにラッパーが挟まっている").toBe(parent);
  }
  expect(row.contains(parent), "スクロール容器が行コンテナの外にある").toBe(true);
  return parent;
}

// 現在は row 自身がスクロール容器なので同じトークンが 2 回並ぶ (恒等写像)。
// 内側ラッパーが増えても壊れないようにするための冗長化。
const rowTokens = (row: HTMLElement) => [...classTokens(row), ...classTokens(scrollerOf(row))];

describe("SelectChips — ChipScrollRow 置換後の契約", () => {
  const OPTIONS = [
    { value: "Fr", label: "自由形" },
    { value: "Ba", label: "背泳ぎ" },
  ];

  it("[M-01] role='group' がコンテナに残る (既存 a11y 契約)", () => {
    const { container } = render(
      <SelectChips options={OPTIONS} value="Fr" onChange={vi.fn()} testIdPrefix="m-chip" />,
    );
    const group = container.querySelector<HTMLElement>('[role="group"]');
    expect(group).not.toBeNull();
    // 行 testid と role="group" が同じ要素に乗っていること
    expect(group).toBe(screen.getByTestId("chiprow-m-chip"));
    // チップは単一のスクロール容器にぶら下がる
    expect(screen.getByTestId("m-chip-Fr").parentElement).toBe(scrollerOf(group!));
  });

  it("[M-02] 行コンテナが display:flex + 横スクロールのクラスを持つ", () => {
    render(<SelectChips options={OPTIONS} value="Fr" onChange={vi.fn()} testIdPrefix="m-chip" />);
    const tokens = rowTokens(screen.getByTestId("chiprow-m-chip"));
    expect(tokens, "display:flex が無い (チップが縦積みになる)").toContain("flex");
    expect(tokens).toContain("overflow-x-auto");
    expect(tokens).toContain("[&>*]:shrink-0");
    expect(tokens).toContain("sm:flex-wrap");
  });

  it("[M-03] chipClass の文字列が変更されていない (既存テストの assert を壊さないため)", () => {
    // Contract:「chipClass は一切変更しない ([&>*]:shrink-0 で吸収)」の golden pin
    expect(chipClass(false)).toBe(
      "h-8 sm:h-10 px-3 rounded-md border text-sm font-medium transition-colors border-gray-300 bg-white text-gray-700 hover:bg-gray-50",
    );
    expect(chipClass(true)).toBe(
      "h-8 sm:h-10 px-3 rounded-md border text-sm font-medium transition-colors border-blue-600 bg-blue-600 text-white",
    );
  });

  it("[M-04] onChange がこれまで通り発火する", () => {
    const onChange = vi.fn();
    render(<SelectChips options={OPTIONS} value="Fr" onChange={onChange} testIdPrefix="m-chip" />);
    fireEvent.click(screen.getByTestId("m-chip-Ba"));
    expect(onChange).toHaveBeenCalledWith("Ba");
  });
});

describe("PracticeMenuItem — チップ行のカルーセル化", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("[M-05] role='group' が 種目行 + カテゴリ行 の 2 個ちょうど残る", () => {
    // SelectChips は種目行とカテゴリ行の 2 箇所だけで使われる (距離行は素の ChipScrollRow)。
    // 「2 個以上」だと片方が消えて別の場所に増えても気づけないので厳密一致 + 内訳を見る。
    const { container } = render(<PracticeMenuItem {...DEFAULT_PROPS} />);
    const groups = Array.from(container.querySelectorAll<HTMLElement>('[role="group"]'));
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.getAttribute("data-testid")).sort()).toEqual(
      [CATEGORY_ROW, STYLE_ROW].sort(),
    );
  });

  it("[M-06] 種目行 / カテゴリ行 / 距離行それぞれに行 testid がある", () => {
    render(<PracticeMenuItem {...DEFAULT_PROPS} />);
    expect(screen.getByTestId(STYLE_ROW)).toBeInTheDocument();
    expect(screen.getByTestId(CATEGORY_ROW)).toBeInTheDocument();
    expect(screen.getByTestId(DISTANCE_ROW)).toBeInTheDocument();
  });

  it("[M-07] 5 種目チップが単一のスクロール容器にぶら下がる", () => {
    render(<PracticeMenuItem {...DEFAULT_PROPS} />);
    const row = screen.getByTestId(STYLE_ROW);
    const scroller = scrollerOf(row);
    for (const ck of ["Fr", "Ba", "Br", "Fly", "IM"]) {
      expect(screen.getByTestId(`practice-style-${ck}`).parentElement).toBe(scroller);
    }
    expect(within(row).getAllByRole("button")).toHaveLength(5);
  });

  it("[M-08] 距離行のチップ数が プリセット数 + 「その他」 の厳密一致", () => {
    // 緩い >= 2 だとプリセットが 1 個に減っても気づけないため厳密一致にする。
    render(<PracticeMenuItem {...DEFAULT_PROPS} />);
    const row = screen.getByTestId(DISTANCE_ROW);
    expect(DISTANCE_PRESETS.length, "fixture 前提: プリセットが複数ある").toBeGreaterThan(1);
    expect(within(row).getAllByRole("button")).toHaveLength(DISTANCE_PRESETS.length + 1);

    const scroller = scrollerOf(row);
    for (const preset of DISTANCE_PRESETS) {
      expect(screen.getByTestId(`practice-distance-preset-${preset}`).parentElement).toBe(scroller);
    }
    expect(screen.getByTestId("practice-distance-other").parentElement).toBe(scroller);
  });

  it("[M-09] 3 行すべてが display:flex + 横スクロール + sm 折り返し復帰", () => {
    render(<PracticeMenuItem {...DEFAULT_PROPS} />);
    for (const id of [STYLE_ROW, CATEGORY_ROW, DISTANCE_ROW]) {
      const tokens = rowTokens(screen.getByTestId(id));
      expect(tokens, `${id}: display:flex が無い (チップが縦積みになる)`).toContain("flex");
      expect(tokens, id).toContain("overflow-x-auto");
      expect(tokens, id).toContain("[&>*]:shrink-0");
      expect(tokens, id).toContain("sm:flex-wrap");
      expect(tokens, id).toContain("scrollbar-hide");
    }
  });

  it("[M-10] 「その他」で数値入力に切り替えても行構造が保たれる (autoFocus 経路)", () => {
    // Contract Boundary Case: 「その他」→数値入力への遷移がカルーセル内で崩れないこと。
    // jsdom では見た目は測れないので「入力欄が距離行のスクロール容器の直接の子として
    // 現れる」ことだけを見る。
    render(<PracticeMenuItem {...DEFAULT_PROPS} />);
    const row = screen.getByTestId(DISTANCE_ROW);
    const scroller = scrollerOf(row);
    const otherButton = screen.getByTestId("practice-distance-other");
    expect(otherButton.parentElement, "「その他」ボタンが距離行の中に無い").toBe(scroller);

    fireEvent.click(otherButton);

    const input = screen.getByTestId("practice-distance");
    expect(input.parentElement, "数値入力が距離行の中に現れない").toBe(scroller);
    // 「その他」ボタンは入力欄に置き換わる (両方は出ない)
    expect(screen.queryByTestId("practice-distance-other")).toBeNull();
  });
});
