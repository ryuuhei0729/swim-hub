/**
 * BestTimesTable の並び (2026-11-09 ユーザー指定):
 *   上の段: 見出し (title) → ALL / 短水路 / 長水路 のボタン → □引き継ぎ
 *   下の段: 泳力を点数化 → 呼び出し側の操作 (footerAction) → L / R の凡例
 * 記録が無いときも見出しと footerAction (ダッシュボードでは一括入力) は出す。
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { describe, expect, it } from "vitest";

import BestTimesTable, { type BestTime } from "../../../components/profile/BestTimesTable";
import jaMessages from "@apps/shared/messages/ja.json";

const bestTime: BestTime = {
  id: "record-1",
  time: 60.0,
  created_at: "2020-01-01T00:00:00.000Z",
  pool_type: 0,
  is_relaying: false,
  style: { name_jp: "100m自由形", distance: 100 },
};

function renderTable(bestTimes: BestTime[]) {
  return render(
    <NextIntlClientProvider locale="ja" messages={jaMessages as unknown as AbstractIntlMessages}>
      <BestTimesTable
        bestTimes={bestTimes}
        gender={0}
        title={<h2>見出し</h2>}
        footerAction={<a href="/bulk-besttime">一括入力</a>}
      />
    </NextIntlClientProvider>,
  );
}

/** a が b より前に描かれているか */
const precedes = (a: HTMLElement, b: HTMLElement) =>
  Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe("BestTimesTable の並び", () => {
  it("上の段は 見出し → 水路のボタン → 引き継ぎ、表の下は 点数化 → footerAction → 凡例", () => {
    renderTable([bestTime]);
    const title = screen.getByRole("heading", { name: "見出し" });
    const all = screen.getByRole("button", { name: "ALL" });
    const relay = screen.getByRole("checkbox", { name: "引き継ぎタイムも含めて表示" });
    const table = screen.getByRole("table");
    const toggle = screen.getByTestId("best-times-wa-points-toggle");
    const action = screen.getByRole("link", { name: "一括入力" });
    const legend = screen.getByTestId("best-times-legend");

    expect(precedes(title, all) && precedes(all, relay) && precedes(relay, table)).toBe(true);
    expect(precedes(table, toggle) && precedes(toggle, action) && precedes(action, legend)).toBe(
      true,
    );
    // チェックボックスの見た目の文字は短く、読み上げ名は元の長い文言のまま
    expect(screen.getByText("引き継ぎ")).toBeInTheDocument();
  });

  it("水路のボタンは押したものだけ aria-pressed=true になる", async () => {
    const user = userEvent.setup();
    renderTable([bestTime]);
    expect(screen.getByRole("button", { name: "ALL" })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "長水路" }));

    expect(screen.getByRole("button", { name: "長水路" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "ALL" })).toHaveAttribute("aria-pressed", "false");
  });

  it("記録が無くても見出しと footerAction は出す", () => {
    renderTable([]);
    expect(screen.getByRole("heading", { name: "見出し" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "一括入力" })).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });
});

describe("比較指標の並び (2026-11-11 ユーザー指定)", () => {
  it("点数化を押すと、比較指標の選択欄は点数化ボタンの行ではなく、その下の行に出る", async () => {
    renderTable([bestTime]);
    const toggle = screen.getByTestId("best-times-wa-points-toggle");
    expect(screen.queryByTestId("best-times-compare-metric-row")).toBeNull();

    await userEvent.click(toggle);
    const row = screen.getByTestId("best-times-compare-metric-row");
    const select = screen.getByTestId("best-times-compare-metric-select");
    expect(row).toContainElement(select);
    expect(row).not.toContainElement(toggle);
    // 点数化ボタン・凡例の行より後ろ (下) にある
    expect(precedes(screen.getByTestId("best-times-legend"), row)).toBe(true);
  });
});
