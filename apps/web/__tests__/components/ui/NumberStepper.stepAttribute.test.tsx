/**
 * NumberStepper の form 送信回帰テスト (step 属性)
 *
 * 欠陥: input の step 属性に「ボタンの増減幅」(例 10) をそのまま渡すと、10 の倍数でない値 (サークル秒 45 等) が
 * ネイティブ検証 (step mismatch) で form 送信をブロックする。修正: 整数 step なら input の step は 1。
 * 増減幅としての step はボタンのみに使う。min / max の範囲検証は維持される。
 * jsdom は step mismatch を実際に検証する (実測) ため userEvent.click で送信可否を観測できる。
 * 壊したら赤: input の step={step} への退行 / min・max 属性の脱落 / ボタンの増減幅の変更。
 */
import React, { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import NumberStepper from "@/components/ui/NumberStepper";

function Harness({ initial, onSubmit, step = 10 }: { initial: number | ""; onSubmit: () => void; step?: number }) {
  const [v, setV] = useState<number | "">(initial);
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
      <NumberStepper value={v} onChange={(s) => setV(s === "" ? "" : Number(s))} min={0} max={59} step={step} ariaLabel="sec" fieldLabel="sec" decreaseLabel="-" increaseLabel="+" />
      <button type="submit">go</button>
    </form>
  );
}
const input = () => screen.getByLabelText("sec") as HTMLInputElement;

describe("NumberStepper step 属性", () => {
  it("step=10 でも 10 の倍数でない値 (45) の form は実際の submit ボタン click で送信される", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<Harness initial={45} onSubmit={onSubmit} />);
    expect(input().validity.stepMismatch).toBe(false);
    await user.click(screen.getByRole("button", { name: "go" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("直接入力した 37 も送信できる", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<Harness initial={30} onSubmit={onSubmit} />);
    await user.clear(input());
    await user.type(input(), "37");
    await user.click(screen.getByRole("button", { name: "go" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("min / max は維持: 範囲外 (60 > max 59) は rangeOverflow で送信がブロックされる", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<Harness initial={60} onSubmit={onSubmit} />);
    expect(input().validity.rangeOverflow).toBe(true);
    expect(input().min).toBe("0");
    expect(input().max).toBe("59");
    await user.click(screen.getByRole("button", { name: "go" }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("範囲下限 (-1 < min 0) は rangeUnderflow", () => {
    render(<Harness initial={-1} onSubmit={() => {}} />);
    expect(input().validity.rangeUnderflow).toBe(true);
  });

  it("+ / - ボタンは step=10 刻みのまま (45 -> 55 -> 45 -> 35)", async () => {
    const user = userEvent.setup();
    render(<Harness initial={45} onSubmit={() => {}} />);
    await user.click(screen.getByRole("button", { name: "sec +" }));
    expect(input().value).toBe("55");
    await user.click(screen.getByRole("button", { name: "sec -" }));
    await user.click(screen.getByRole("button", { name: "sec -" }));
    expect(input().value).toBe("35");
  });

  it("input の step 属性: 整数 step は 1、小数 step は 'any'", () => {
    const { unmount } = render(<Harness initial={10} onSubmit={() => {}} step={10} />);
    expect(input().getAttribute("step")).toBe("1");
    unmount();
    render(<Harness initial={1} onSubmit={() => {}} step={0.5} />);
    expect(input().getAttribute("step")).toBe("any");
  });
});
