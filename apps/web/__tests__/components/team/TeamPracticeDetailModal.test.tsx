/**
 * TeamPracticeDetailModal (web) — チーム練習のタイム一覧
 *
 * mobile の TeamPracticeTimesModal と同じ見せ方:
 *   - メニューごとに、メンバーを平均の速い順に並べる (順位の数字は出さない)
 *   - 行を押すと 1 本ずつのタイムが ①② などの番号無しで 4 列に開き、その人の最速だけ青い太字
 *   - 2 セット以上は「1セット」「2セット」に分けて、それぞれの平均を添える
 *   - タイムが無い人は最後に「タイム未記録」で、開けない
 *   - 自分の行は薄い青の背景
 *
 * まとめ方・並び順の計算そのものは packages/shared/__tests__/utils/teamPracticeTimes.test.ts で見ている。
 */
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { screen, within, fireEvent } from "@testing-library/react";
import { renderWithI18n } from "@/__tests__/helpers/teamQueryTestUtils";

const mocks = vi.hoisted(() => ({
  supabase: {} as Record<string, unknown>,
  orderCalls: [] as unknown[][],
}));

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: vi.fn(() => ({ supabase: mocks.supabase, user: { id: "me" } })),
}));

import TeamPracticeDetailModal from "@/components/team/TeamPracticeDetailModal";

function setData(data: unknown, error: { message: string } | null = null) {
  mocks.orderCalls = [];
  const builder = {
    select: () => builder,
    eq: () => builder,
    order: (...args: unknown[]) => {
      mocks.orderCalls.push(args);
      return builder;
    },
    single: () => Promise.resolve({ data, error }),
  };
  mocks.supabase = { from: () => builder };
}

function log(
  id: string,
  userId: string,
  name: string,
  entries: Array<[number, number, number]>,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    user_id: userId,
    style: "Fr",
    swim_category: "Swim",
    rep_count: 4,
    set_count: 1,
    distance: 100,
    circle: 90,
    note: null,
    practice_times: entries.map(([set, rep, time], i) => ({
      id: `${id}-${i}`,
      set_number: set,
      rep_number: rep,
      time,
      user_id: userId,
    })),
    practice_log_tags: [],
    users: { name, profile_image_path: null },
    ...overrides,
  };
}

function practice(logs: unknown[]) {
  return { id: "p-1", date: "2026-11-27", title: "朝練", place: "市民プール", note: null, practice_logs: logs };
}

function renderModal() {
  return renderWithI18n(
    <TeamPracticeDetailModal isOpen onClose={vi.fn()} practiceId="p-1" heading="11月27日(金) 朝練" />,
  );
}

describe("TeamPracticeDetailModal — タイム一覧", () => {
  it("見出しは「日付 練習名 のタイム」で、ログは入力順に並べて取得する", async () => {
    setData(practice([]));
    renderModal();

    expect(await screen.findByText("まだ記録がありません")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "11月27日(金) 朝練 のタイム" })).toBeInTheDocument();
    expect(mocks.orderCalls).toEqual([
      ["created_at", { referencedTable: "practice_logs", ascending: true }],
    ]);
  });

  it("平均の速い順に並び、順位の数字は出さない。タイムが無い人は最後で開けない", async () => {
    setData(
      practice([
        log("l-slow", "u-slow", "鈴木", [[1, 1, 70], [1, 2, 71], [1, 3, 72], [1, 4, 73]]),
        log("l-none", "u-none", "高橋", []),
        log("l-fast", "u-fast", "田中", [[1, 1, 64.8], [1, 2, 65.6]]),
      ]),
    );
    renderModal();

    await screen.findByText("田中");
    const rows = screen.getAllByTestId(/^practice-times-row-/).map((r) => r.dataset.testid);
    expect(rows).toEqual([
      "practice-times-row-l-fast",
      "practice-times-row-l-slow",
      "practice-times-row-l-none",
    ]);
    expect(screen.getByText("最速 1:04.80 · 2/4本")).toBeInTheDocument();
    expect(screen.getByText("タイム未記録")).toBeInTheDocument();
    expect(
      within(screen.getByTestId("practice-times-row-l-none")).queryByRole("button"),
    ).not.toBeInTheDocument();
  });

  it("行を押すと 1 本ずつのタイムが番号無しで開き、その人の最速だけ青い太字になる", async () => {
    setData(practice([log("l-1", "u-1", "田中", [[1, 1, 65.1], [1, 2, 64.8], [1, 3, 66], [1, 4, 65.5]])]));
    renderModal();

    await screen.findByText("田中");
    expect(screen.queryByText("1:05.10")).not.toBeInTheDocument();
    fireEvent.click(within(screen.getByTestId("practice-times-row-l-1")).getByRole("button"));

    const row = screen.getByTestId("practice-times-row-l-1");
    expect(within(row).getByText("1:04.80")).toHaveAttribute("data-fastest", "true");
    expect(within(row).getByText("1:04.80").className).toContain("font-bold");
    expect(within(row).getByText("1:04.80").className).toContain("text-blue-600");
    expect(within(row).getByText("1:05.10")).not.toHaveAttribute("data-fastest");
    expect(within(row).queryByText(/①|②/)).not.toBeInTheDocument();
    expect(within(row).queryByText("1セット")).not.toBeInTheDocument();
  });

  it("2 セット以上は「1セット」「2セット」に分け、それぞれの平均を添える", async () => {
    setData(
      practice([
        log("l-1", "u-1", "田中", [[1, 1, 30], [1, 2, 32], [2, 1, 31], [2, 2, 33]], {
          rep_count: 2,
          set_count: 2,
          distance: 50,
        }),
      ]),
    );
    renderModal();

    await screen.findByText("田中");
    fireEvent.click(within(screen.getByTestId("practice-times-row-l-1")).getByRole("button"));
    expect(screen.getByText("1セット")).toBeInTheDocument();
    expect(screen.getByText("2セット")).toBeInTheDocument();
    expect(screen.getByText("平均 31.00")).toBeInTheDocument();
    expect(screen.getByText("平均 32.00")).toBeInTheDocument();
    expect(screen.getByText(/50m × 2本 × 2セット/)).toBeInTheDocument();
  });

  it("自分の行は薄い青の背景にする", async () => {
    setData(practice([log("l-me", "me", "自分", [[1, 1, 60]]), log("l-other", "u-2", "他人", [[1, 1, 61]])]));
    renderModal();

    await screen.findByText("自分");
    expect(screen.getByTestId("practice-times-row-l-me").className).toContain("bg-blue-50");
    expect(screen.getByTestId("practice-times-row-l-other").className).not.toContain("bg-blue-50");
  });

  it("取得に失敗したらエラーを出す", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    setData(null, { message: "network" });
    renderModal();

    expect(await screen.findByText("練習タイムの取得に失敗しました")).toBeInTheDocument();
  });
});
