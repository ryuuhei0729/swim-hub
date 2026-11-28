/**
 * LastPracticeCard (ホームの「前回の練習」) の表示と、押したときの遷移。
 */

import React from "react";
import { render, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import type { LastPractice } from "@apps/shared/utils/dashboardLastPractice";

vi.mock("@/hooks/useDateLocale", () => ({ useDateLocale: () => "ja" }));

import { LastPracticeCard } from "../LastPracticeCard";

// この DOM モックでは testID が data-testid ではなく生の testid 属性になる
function byTestId(container: HTMLElement, testId: string): HTMLElement {
  const el = container.querySelector(`[testid="${testId}"]`);
  if (!el) throw new Error(`testid="${testId}" の要素が見つかりません`);
  return el as HTMLElement;
}

const practice = (overrides: Partial<LastPractice> = {}): LastPractice => ({
  id: "p1",
  date: "2026-11-24",
  title: "朝練",
  place: "市民プール",
  practice_logs: [
    {
      id: "l1",
      style: "Fr",
      swim_category: "Swim",
      distance: 100,
      rep_count: 3,
      set_count: 1,
      circle: 90,
      created_at: "2026-11-24T07:00:00Z",
      practice_times: [
        { set_number: 1, rep_number: 2, time: 64.5 },
        { set_number: 1, rep_number: 1, time: 65.2 },
        { set_number: 1, rep_number: 3, time: 63.58 },
      ],
    },
    {
      id: "l2",
      style: "Fr",
      swim_category: "Kick",
      distance: 50,
      rep_count: 4,
      set_count: 2,
      circle: null,
      created_at: "2026-11-24T07:10:00Z",
      practice_times: [],
    },
  ],
  ...overrides,
});

describe("LastPracticeCard", () => {
  it("見出しに日付、2行目に「タイトル @場所」を出す", () => {
    const { getByText } = render(<LastPracticeCard practice={practice()} onOpenDay={vi.fn()} />);
    expect(getByText("前回の練習（2026/11/24）")).toBeTruthy();
    expect(getByText("朝練", { exact: false })).toBeTruthy();
    expect(getByText("@市民プール", { exact: false })).toBeTruthy();
  });

  it("タイトルが無ければ「練習」、場所が無ければ @ を出さない", () => {
    const { getByText, queryByText } = render(
      <LastPracticeCard practice={practice({ title: null, place: null })} onOpenDay={vi.fn()} />,
    );
    expect(getByText("練習")).toBeTruthy();
    expect(queryByText("@", { exact: false })).toBeNull();
  });

  it("メニューごとに種目・距離×本数・サークル・平均を出し、タイムを本の順に並べて最速を目立たせる", () => {
    const { container, getByText, getAllByText } = render(
      <LastPracticeCard practice={practice()} onOpenDay={vi.fn()} />,
    );
    expect(getByText("自由形 100×3", { exact: false })).toBeTruthy();
    expect(getByText("1'30\"", { exact: false })).toBeTruthy();
    expect(getByText("平均 1:04.43")).toBeTruthy();
    const times = getAllByText(/^1:0\d\.\d\d$/).map((el) => el.textContent);
    expect(times).toEqual(["1:05.20", "1:04.50", "1:03.58"]);
    expect(byTestId(container, "last-practice-fastest").textContent).toBe("1:03.58");
  });

  it("タイムが無いメニューは平均もタイムも出さず、2セット以上はセット数も付ける", () => {
    const { getByText, getAllByText } = render(
      <LastPracticeCard practice={practice()} onOpenDay={vi.fn()} />,
    );
    expect(getByText("自由形 50×4×2", { exact: false })).toBeTruthy();
    expect(getByText("Kick")).toBeTruthy();
    // 平均はタイムのある1つ目のメニューだけ
    expect(getAllByText(/^平均/)).toHaveLength(1);
    expect(getAllByText(/^1:0\d\.\d\d$/)).toHaveLength(3);
  });

  it("カードを押すとその練習日の詳細を開く", () => {
    const onOpenDay = vi.fn();
    const { container } = render(<LastPracticeCard practice={practice()} onOpenDay={onOpenDay} />);
    fireEvent.click(byTestId(container, "last-practice-card"));
    expect(onOpenDay).toHaveBeenCalledWith("2026-11-24");
  });
});
