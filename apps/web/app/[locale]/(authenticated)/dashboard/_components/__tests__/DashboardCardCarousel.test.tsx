/**
 * ダッシュボードのカードのカルーセル (次の大会 / 前回の練習) と、前回の練習のカード。
 */

import React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import messages from "@apps/shared/messages/ja.json";
import type { LastPractice } from "@apps/shared/utils/dashboardLastPractice";
import DashboardCardCarousel from "../DashboardCardCarousel";
import LastPracticeCard from "../LastPracticeCard";

function withIntl(ui: React.ReactElement) {
  return (
    <NextIntlClientProvider locale="ja" messages={messages as unknown as AbstractIntlMessages}>
      {ui}
    </NextIntlClientProvider>
  );
}

const cards = [<section key="a">次の大会</section>, <section key="b">前回の練習</section>];

const currentDot = () =>
  screen
    .getAllByRole("button", { name: /枚目を表示/ })
    .findIndex((b) => b.getAttribute("aria-current") === "true");

describe("DashboardCardCarousel", () => {
  it("ready でない間は読み込み表示だけを出し、カードは出さない", () => {
    render(withIntl(<DashboardCardCarousel ready={false}>{cards}</DashboardCardCarousel>));
    expect(screen.getByTestId("dashboard-card-carousel-loading")).toBeTruthy();
    expect(screen.queryByText("次の大会")).toBeNull();
  });

  it("カードが1枚ならカルーセルにせず、そのまま出す", () => {
    render(withIntl(<DashboardCardCarousel>{[cards[0]]}</DashboardCardCarousel>));
    expect(screen.getByText("次の大会")).toBeTruthy();
    expect(screen.queryByTestId("dashboard-card-carousel")).toBeNull();
  });

  it("initialIndex のカードを見せた状態で開き、見えていないカードは操作できない", () => {
    render(withIntl(<DashboardCardCarousel initialIndex={1}>{cards}</DashboardCardCarousel>));
    expect(currentDot()).toBe(1);
    expect(screen.getByText("次の大会").parentElement?.hasAttribute("inert")).toBe(true);
    expect(screen.getByText("前回の練習").parentElement?.hasAttribute("inert")).toBe(false);
    expect((screen.getByRole("button", { name: "次のカード" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("開いたあとに initialIndex が変わっても、見ているカードは切り替えない", () => {
    const { rerender } = render(
      withIntl(<DashboardCardCarousel initialIndex={1}>{cards}</DashboardCardCarousel>),
    );
    rerender(withIntl(<DashboardCardCarousel initialIndex={0}>{cards}</DashboardCardCarousel>));
    expect(currentDot()).toBe(1);
  });
});

const practice: LastPractice = {
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
        { set_number: 1, rep_number: 1, time: 65.2 },
        { set_number: 1, rep_number: 2, time: 63.58 },
        { set_number: 1, rep_number: 3, time: 64.5 },
      ],
    },
  ],
};

describe("LastPracticeCard (web)", () => {
  it("「タイトル @場所」・平均・1本ごとのタイムを出し、最速を目立たせる", () => {
    render(withIntl(<LastPracticeCard practice={practice} onOpenDay={vi.fn()} />));
    expect(screen.getByText("前回の練習（2026/11/24）")).toBeTruthy();
    expect(screen.getByText("@市民プール", { exact: false })).toBeTruthy();
    expect(screen.getByText("平均 1:04.43")).toBeTruthy();
    expect(screen.getByTestId("last-practice-fastest").textContent).toBe("1:03.58");
  });

  it("クリック・Enter・Space でその練習日の詳細を開く", () => {
    const onOpenDay = vi.fn();
    render(withIntl(<LastPracticeCard practice={practice} onOpenDay={onOpenDay} />));
    const card = screen.getByTestId("last-practice-card");
    fireEvent.click(card);
    fireEvent.keyDown(card, { key: "Enter" });
    fireEvent.keyDown(card, { key: " " });
    expect(onOpenDay).toHaveBeenCalledTimes(3);
    expect(onOpenDay).toHaveBeenCalledWith("2026-11-24");
  });
});
