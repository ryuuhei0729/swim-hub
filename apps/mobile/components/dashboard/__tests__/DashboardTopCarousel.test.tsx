/**
 * DashboardTopCarousel (ホーム上部の 次の大会 ⇄ フォーカスポイント)
 * - カード幅 = 画面幅 - 左右の余白 16×2 - 隣のカードの見せ幅 20
 * - スクロール位置から今のカードを決め、点の表示に反映する (最後のカードは端で止まっても数える)
 * - 点を押すとそのカードの位置へスクロールする
 */
import React from "react";
import { render, fireEvent, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  scrollTo: vi.fn(),
  /** 描画された ScrollView の onScroll (テストからスクロールを起こすのに使う) */
  scrollView: { onScroll: null as null | ((e: unknown) => void) },
}));

/** 描画中の onScroll を覚えておく (描画中に外の変数を書き換えないよう、effect で記録する) */
function useRecordOnScroll(onScroll: ((e: unknown) => void) | undefined) {
  React.useEffect(() => {
    h.scrollView.onScroll = onScroll ?? null;
  }, [onScroll]);
}

// 共有モックの ScrollView は ref も onScroll も扱わないので、この部品の関心 (ref.scrollTo と
// onScroll の位置) を観察できる版に差し替える (共有モック自体は変えない)
vi.mock("react-native", async () => {
  const actual = await vi.importActual<typeof import("../../../__mocks__/react-native")>(
    "../../../__mocks__/react-native",
  );
  const ScrollView = React.forwardRef(
    (
      { children, onScroll }: { children?: React.ReactNode; onScroll?: (e: unknown) => void },
      ref: React.Ref<{ scrollTo: typeof h.scrollTo }>,
    ) => {
      React.useImperativeHandle(ref, () => ({ scrollTo: h.scrollTo }));
      useRecordOnScroll(onScroll);
      return React.createElement("div", null, children);
    },
  );
  return {
    ...actual,
    ScrollView,
    Dimensions: { get: () => ({ width: 390, height: 844 }) },
  };
});

import { DashboardTopCarousel } from "../DashboardTopCarousel";

/** 390 - 16*2 - 20 = 338、カード間 8 → 1枚分のスクロール量は 346 */
const INTERVAL = 346;

const pages = [
  { key: "next", label: "次の大会", node: <span>次の大会カード</span> },
  { key: "focus", label: "フォーカスポイント", node: <span>フォーカスポイントカード</span> },
];

const scrollToX = (x: number) =>
  act(() => {
    h.scrollView.onScroll?.({ nativeEvent: { contentOffset: { x } } });
  });

/** 点 (Pressable = button) の選択状態。今のカードの点だけ幅 18 になる */
const activeDotLabel = (container: HTMLElement) => {
  const dots = Array.from(container.querySelectorAll("button"));
  const active = dots.find((b) => (b.firstElementChild as HTMLElement | null)?.style.width === "18px");
  return active?.getAttribute("accessibilityLabel") ?? null;
};

beforeEach(() => {
  h.scrollTo.mockReset();
  h.scrollView.onScroll = null;
});

describe("DashboardTopCarousel", () => {
  it("カードをすべて並べ、最初は1枚目の点が選ばれている", () => {
    const { getByText, container } = render(<DashboardTopCarousel pages={pages} />);
    expect(getByText("次の大会カード")).toBeTruthy();
    expect(getByText("フォーカスポイントカード")).toBeTruthy();
    expect(activeDotLabel(container)).toBe("次の大会");
  });

  it("スクロール位置から今のカードを決める。最後のカードは端 (1枚分より手前) で止まっても2枚目と数える", () => {
    const { container } = render(<DashboardTopCarousel pages={pages} />);
    // 最大スクロール位置 = 中身の幅 (16 + 338*2 + 8 + 16) - 390 = 326 (< 346)
    scrollToX(326);
    expect(activeDotLabel(container)).toBe("フォーカスポイント");
    scrollToX(0);
    expect(activeDotLabel(container)).toBe("次の大会");
  });

  it("点を押すとそのカードの位置へスクロールする", () => {
    const { container } = render(<DashboardTopCarousel pages={pages} />);
    const dots = container.querySelectorAll("button");
    fireEvent.click(dots[1]!);
    expect(h.scrollTo).toHaveBeenCalledWith({ x: INTERVAL, animated: true });
    expect(activeDotLabel(container)).toBe("フォーカスポイント");
  });

  it("カードが1枚なら点を出さない", () => {
    const { container } = render(<DashboardTopCarousel pages={[pages[0]!]} />);
    expect(container.querySelectorAll("button")).toHaveLength(0);
  });
});
