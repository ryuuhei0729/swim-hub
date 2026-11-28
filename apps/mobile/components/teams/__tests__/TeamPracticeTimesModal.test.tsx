/**
 * TeamPracticeTimesModal (チーム練習のタイム一覧シート) テスト
 *
 * メニューのまとめ方・並び順の細かい計算は utils/__tests__/teamPracticeTimes.test.ts で見ている。
 * ここでは「取得の絞り込み」「画面に出る並び・開閉・セット見出し・最速の強調・空/失敗表示」を見る。
 */

import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { createQueryWrapper } from "@/__tests__/helpers/testUtils";

interface QueryResponse {
  data: unknown;
  error: { message: string } | null;
}

function makeSupabaseMock(response: QueryResponse) {
  const eqCalls: Array<[string, unknown]> = [];
  const orderCalls: Array<[string, unknown]> = [];
  const fromCalls: string[] = [];
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn((column: string, value: unknown) => {
      eqCalls.push([column, value]);
      return builder;
    }),
    order: vi.fn((column: string, opts: unknown) => {
      orderCalls.push([column, opts]);
      return builder;
    }),
    single: vi.fn(() => Promise.resolve(response)),
  };
  const from = vi.fn((table: string) => {
    fromCalls.push(table);
    return builder;
  });
  return { supabase: { from }, eqCalls, orderCalls, fromCalls };
}

const mocks = vi.hoisted(() => ({
  supabase: {} as Record<string, unknown>,
  user: { id: "me" } as { id: string } | null,
}));

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: vi.fn(() => ({ supabase: mocks.supabase, user: mocks.user })),
}));

import { TeamPracticeTimesModal } from "../TeamPracticeTimesModal";

function timesOf(userId: string, entries: Array<[number, number, number]>) {
  return entries.map(([set, rep, time], i) => ({
    id: `${userId}-${i}`,
    set_number: set,
    rep_number: rep,
    time,
    user_id: userId,
  }));
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
    practice_times: timesOf(userId, entries),
    practice_log_tags: [],
    users: { name, profile_image_path: null },
    ...overrides,
  };
}

function practice(logs: unknown[]) {
  return { id: "p-1", date: "2026-11-27", title: "朝練", place: "市民プール", note: null, practice_logs: logs };
}

/** 行全体 (開いたタイムも含む)。RN モックは testID を DOM の `testid` 属性で出すので直接引く */
function rowWrap(logId: string): HTMLElement {
  const el = document.querySelector(`[testid="practice-times-row-${logId}"]`);
  if (!el?.parentElement) throw new Error(`row ${logId} が見つからない`);
  return el.parentElement;
}

function renderModal() {
  return render(
    <TeamPracticeTimesModal visible onClose={vi.fn()} practiceId="p-1" heading="11/27(金) 朝練" />,
    { wrapper: createQueryWrapper() },
  );
}

describe("TeamPracticeTimesModal", () => {
  it("practices を id で絞り、ログは入力順に並べて取得する", async () => {
    const mock = makeSupabaseMock({ data: practice([]), error: null });
    mocks.supabase = mock.supabase;
    renderModal();

    await screen.findByText("まだ記録がありません");
    expect(mock.fromCalls).toEqual(["practices"]);
    expect(mock.eqCalls).toEqual([["id", "p-1"]]);
    expect(mock.orderCalls).toEqual([
      ["created_at", { referencedTable: "practice_logs", ascending: true }],
    ]);
    // 見出しは「日付 練習名」+「のタイム」
    expect(screen.getByText(/11\/27\(金\) 朝練 のタイム/)).toBeDefined();
  });

  it("メンバーは平均の速い順に並び、順位の数字は出さない。タイムが無い人は最後で開けない", async () => {
    const mock = makeSupabaseMock({
      data: practice([
        log("l-slow", "u-slow", "鈴木", [[1, 1, 70], [1, 2, 71], [1, 3, 72], [1, 4, 73]]),
        log("l-none", "u-none", "高橋", []),
        log("l-fast", "u-fast", "田中", [[1, 1, 64.8], [1, 2, 65.6]]),
      ]),
      error: null,
    });
    mocks.supabase = mock.supabase;
    renderModal();

    await screen.findByText("田中");
    const names = ["田中", "鈴木", "高橋"].map((n) => screen.getByText(n));
    // DOM 上の出現順 = 表示順
    expect(names[0]!.compareDocumentPosition(names[1]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(names[1]!.compareDocumentPosition(names[2]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // 全本数そろっていない人は本数を添える
    expect(screen.getByText("最速 1:04.80 · 2/4本")).toBeDefined();
    expect(screen.getByText("タイム未記録")).toBeDefined();
    // タイムが無い行はボタンにしない
    expect(screen.queryByRole("button", { name: /高橋/ })).toBeNull();
    expect(screen.getByRole("button", { name: /田中/ })).toBeDefined();
  });

  it("行を押すと 1 本ずつのタイムが ① などの番号無しで開き、その人の最速だけ青い太字になる", async () => {
    const mock = makeSupabaseMock({
      data: practice([log("l-1", "u-1", "田中", [[1, 1, 65.1], [1, 2, 64.8], [1, 3, 66], [1, 4, 65.5]])]),
      error: null,
    });
    mocks.supabase = mock.supabase;
    renderModal();

    const button = await screen.findByRole("button", { name: /田中/ });
    expect(screen.queryByText("1:05.10")).toBeNull();
    fireEvent.click(button);

    const row = rowWrap("l-1");
    const cells = ["1:05.10", "1:04.80", "1:06.00", "1:05.50"].map((t) => within(row).getByText(t));
    expect(cells[1]!.style.fontWeight).toBe("700");
    expect(cells[1]!.style.color).toBe("rgb(37, 99, 235)");
    expect(cells[0]!.style.fontWeight).not.toBe("700");
    expect(within(row).queryByText(/①|②/)).toBeNull();
    // 1 セットだけのときはセット見出しを出さない
    expect(within(row).queryByText("1セット")).toBeNull();
  });

  it("2 セット以上のときは「1セット」「2セット」に分け、それぞれの平均を添える", async () => {
    const mock = makeSupabaseMock({
      data: practice([
        log(
          "l-1",
          "u-1",
          "田中",
          [[1, 1, 30], [1, 2, 32], [2, 1, 31], [2, 2, 33]],
          { rep_count: 2, set_count: 2, distance: 50 },
        ),
      ]),
      error: null,
    });
    mocks.supabase = mock.supabase;
    renderModal();

    fireEvent.click(await screen.findByRole("button", { name: /田中/ }));
    expect(screen.getByText("1セット")).toBeDefined();
    expect(screen.getByText("2セット")).toBeDefined();
    expect(screen.getByText("平均 31.00")).toBeDefined();
    expect(screen.getByText("平均 32.00")).toBeDefined();
    // メニュー見出しに本数 × セット数が出る
    expect(screen.getByText(/50m × 2本 × 2セット/)).toBeDefined();
  });

  it("自分の行は薄い青の背景にする", async () => {
    mocks.user = { id: "me" };
    const mock = makeSupabaseMock({
      data: practice([log("l-me", "me", "自分", [[1, 1, 60]]), log("l-other", "u-2", "他人", [[1, 1, 61]])]),
      error: null,
    });
    mocks.supabase = mock.supabase;
    renderModal();

    await screen.findByText("自分");
    const mine = rowWrap("l-me");
    const other = rowWrap("l-other");
    expect(mine.style.backgroundColor).toBe("rgb(239, 246, 255)");
    expect(other.style.backgroundColor).toBe("");
  });

  it("取得に失敗したらエラーを出す", async () => {
    const mock = makeSupabaseMock({ data: null, error: { message: "network" } });
    mocks.supabase = mock.supabase;
    vi.spyOn(console, "error").mockImplementation(() => {});
    renderModal();

    await screen.findByText("練習タイムの取得に失敗しました");
    expect(screen.queryByText("読み込み中...")).toBeNull();
  });
});
