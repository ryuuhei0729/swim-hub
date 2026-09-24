/**
 * PracticeLogTemplateCreateModal — チップ行カルーセル化の構造テスト (jsdom / QA Phase B)
 *
 * Sprint Contract 追加分 (Reviewer 指摘 M-4):
 *   練習ログテンプレート作成モーダルの 種目 / カテゴリ / 距離 の 3 行も
 *   PracticeMenuItem と同一挙動 (ChipScrollRow) にする。
 *   この画面は QA の Phase A 検証網に入っていなかった。
 *
 * ■ jsdom で見るもの: 行 testid / 構造 / クラストークン / 「その他」への切替
 * ■ 幅・折り返しは Playwright (mobile-chip-carousel.spec.ts) で判定する
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderWithI18n as render, screen, fireEvent, within } from "@/__tests__/utils/render";
import { DISTANCE_PRESETS } from "@/components/forms/practice-log/types";
import { PracticeLogTemplateCreateModal } from "../PracticeLogTemplateCreateModal";

// Supabase ブラウザクライアントは createBrowserClient が env を要求するためモックする
vi.mock("@supabase/ssr", () => ({
  createBrowserClient: () => ({
    from: () => ({
      insert: () => Promise.resolve({ data: null, error: null }),
      update: () => Promise.resolve({ data: null, error: null }),
      select: () => Promise.resolve({ data: [], error: null }),
    }),
  }),
}));

// ★ 参照を毎回作り直すと無限ループする。
//   モーダルは `useEffect(() => { if (tagsData) setAvailableTags(tagsData) }, [tagsData])`
//   を持つため、フックが毎レンダー新しい配列を返すと
//   setState → 再レンダー → 新しい配列 → setState … で jsdom が固まる。
//   実物の react-query は参照を安定させるのでプロダクションの問題ではないが、
//   モックは必ず同一参照を返すこと。
const EMPTY_TAGS: never[] = [];
const TAGS_QUERY_RESULT = { data: EMPTY_TAGS, isLoading: false };
vi.mock("@swim-hub/shared/hooks/queries/practices", () => ({
  usePracticeTagsQuery: () => TAGS_QUERY_RESULT,
}));

vi.mock("@/components/forms/TagInput", () => ({
  default: () => <div data-testid="tag-input-mock" />,
}));

const STYLE_ROW = "chiprow-template-style";
const CATEGORY_ROW = "chiprow-template-swim-category";
const DISTANCE_ROW = "chiprow-template-distance-preset";

const classTokens = (el: HTMLElement) => el.className.split(/\s+/).filter(Boolean);

/** チップの直接の親 = flex / スクロール容器 */
function scrollerOf(row: HTMLElement): HTMLElement {
  const chips = within(row).queryAllByRole("button");
  expect(chips.length, "行にチップが1つも無い").toBeGreaterThan(0);
  const parent = chips[0]!.parentElement!;
  for (const c of chips) {
    expect(c.parentElement, "チップごとにラッパーが挟まっている").toBe(parent);
  }
  expect(row.contains(parent)).toBe(true);
  return parent;
}

// 現在は row 自身がスクロール容器なので同じトークンが 2 回並ぶ (恒等写像)。
// 内側ラッパーが増えても壊れないようにするための冗長化。
const rowTokens = (row: HTMLElement) => [...classTokens(row), ...classTokens(scrollerOf(row))];

const renderModal = () => {
  // モーダルはテンプレート作成 mutation (react-query) を持つため Provider が要る
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PracticeLogTemplateCreateModal isOpen onClose={vi.fn()} />
    </QueryClientProvider>,
  );
};

describe("PracticeLogTemplateCreateModal — チップ行のカルーセル化 (M-4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("[TM-01] 種目行 / カテゴリ行 / 距離行それぞれに chiprow- の行 testid がある", () => {
    renderModal();
    expect(screen.getByTestId(STYLE_ROW)).toBeInTheDocument();
    expect(screen.getByTestId(CATEGORY_ROW)).toBeInTheDocument();
    expect(screen.getByTestId(DISTANCE_ROW)).toBeInTheDocument();
  });

  it("[TM-02] 3 行すべてが display:flex + 横スクロール + sm 折り返し復帰", () => {
    renderModal();
    for (const id of [STYLE_ROW, CATEGORY_ROW, DISTANCE_ROW]) {
      const tokens = rowTokens(screen.getByTestId(id));
      // "flex" は "sm:flex-wrap" の部分文字列なのでトークン完全一致で見る
      expect(tokens, `${id}: display:flex が無い (チップが縦積みになる)`).toContain("flex");
      expect(tokens, id).toContain("overflow-x-auto");
      expect(tokens, id).toContain("[&>*]:shrink-0");
      expect(tokens, id).toContain("sm:flex-wrap");
      expect(tokens, id).toContain("scrollbar-hide");
    }
  });

  it("[TM-03] 距離行のチップ数が プリセット数 + 「その他」 の厳密一致", () => {
    renderModal();
    const row = screen.getByTestId(DISTANCE_ROW);
    expect(within(row).getAllByRole("button")).toHaveLength(DISTANCE_PRESETS.length + 1);
    const scroller = scrollerOf(row);
    for (const preset of DISTANCE_PRESETS) {
      expect(screen.getByTestId(`template-distance-preset-${preset}`).parentElement).toBe(scroller);
    }
    expect(screen.getByTestId("template-distance-other").parentElement).toBe(scroller);
  });

  it("[TM-04] 種目行が role='group' を保ち 5 チップが単一容器にぶら下がる", () => {
    renderModal();
    const row = screen.getByTestId(STYLE_ROW);
    expect(row).toHaveAttribute("role", "group");
    const scroller = scrollerOf(row);
    for (const ck of ["Fr", "Ba", "Br", "Fly", "IM"]) {
      expect(screen.getByTestId(`template-style-${ck}`).parentElement).toBe(scroller);
    }
    expect(within(row).getAllByRole("button")).toHaveLength(5);
  });

  it("[TM-05] 「その他」で数値入力に切り替えても距離行の中に留まる", () => {
    renderModal();
    const scroller = scrollerOf(screen.getByTestId(DISTANCE_ROW));
    fireEvent.click(screen.getByTestId("template-distance-other"));
    const input = screen.getByTestId("template-distance-custom");
    expect(input.parentElement, "数値入力が距離行の外に出ている").toBe(scroller);
    expect(screen.queryByTestId("template-distance-other")).toBeNull();
  });

  it("[TM-06] ChipScrollRow のルートが margin を持たず flex である (C-1 の再発防止)", () => {
    renderModal();
    for (const id of [STYLE_ROW, CATEGORY_ROW, DISTANCE_ROW]) {
      const root = screen.getByTestId(id).parentElement!;
      const tokens = classTokens(root);
      expect(tokens, `${id}: ルートに -my-1 がある`).not.toContain("-my-1");
      expect(tokens, `${id}: ルートが flex でない`).toContain("flex");
    }
  });
});
