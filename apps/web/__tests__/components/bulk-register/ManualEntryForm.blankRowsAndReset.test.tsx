/**
 * ManualEntryForm — 空行の扱いと、登録成功後のリセット範囲 (web)
 *
 * 背景 (UI レビュー照合で見つかった実害。mobile TeamBulkRegisterForm と同じ):
 *   1. 「練習を追加」で足した行には今日の日付が入っており、送信対象の絞り込みは日付だけだったため、
 *      何も入力していない行まで「今日の無題の練習」として登録されていた。
 *   2. 登録に成功すると練習・大会の両方のタブがリセットされ、送信していない側の入力が消えていた。
 *
 * 観測点: TeamBulkRegisterAPI.bulkRegister に渡った入力 (件数は厳密一致) と、画面に残る入力値。
 */

import React from "react";
import { renderWithI18n as render, screen, fireEvent, waitFor } from "../../utils/render";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { format } from "date-fns";

const mockBulkRegister = vi.fn();

vi.mock("@apps/shared/api/teams/bulkRegister", () => ({
  TeamBulkRegisterAPI: vi.fn().mockImplementation(function () {
    return { bulkRegister: mockBulkRegister };
  }),
}));

vi.mock("@/contexts", () => ({
  useAuth: () => ({ supabase: {} }),
}));

import ManualEntryForm from "@/components/bulk-register/ManualEntryForm";

const TODAY = format(new Date(), "yyyy-MM-dd");

function practiceDateInputs(): HTMLInputElement[] {
  return screen.getAllByLabelText("日付 *") as HTMLInputElement[];
}

function submit() {
  fireEvent.click(screen.getByRole("button", { name: "登録する" }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockBulkRegister.mockResolvedValue({
    success: true,
    practicesCreated: 1,
    competitionsCreated: 0,
    errors: [],
  });
});

describe("ManualEntryForm 空行 (web)", () => {
  it("[W-BR-1] 「練習を追加」で足した行は日付が空で始まり、何も入力しなければ登録されない", async () => {
    render(<ManualEntryForm teamId="team-5501" />);

    fireEvent.click(screen.getByRole("button", { name: "練習を追加" }));
    const dates = practiceDateInputs();
    expect(dates).toHaveLength(2);
    expect(dates[0]!.value).toBe(TODAY);
    expect(dates[1]!.value).toBe("");

    submit();

    await waitFor(() => expect(mockBulkRegister).toHaveBeenCalledTimes(1));
    const input = mockBulkRegister.mock.calls[0]![1];
    expect(input.practices).toHaveLength(1);
    expect(input.practices[0]).toMatchObject({ date: TODAY });
    expect(input.competitions).toEqual([]);
  });

  it("[W-BR-2] 日付が空でも他の欄に入力がある行はエラーにして送信しない", async () => {
    render(<ManualEntryForm teamId="team-5501" />);

    fireEvent.click(screen.getByRole("button", { name: "練習を追加" }));
    const titles = screen.getAllByPlaceholderText("朝練 など");
    fireEvent.change(titles[1]!, { target: { value: "午後練5502" } });

    submit();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("2行目: 日付は必須です");
    expect(mockBulkRegister).not.toHaveBeenCalled();
    // エラーは押した「登録する」ボタンの直上に出る (フォーム上部だと行が多いとき画面外になる)
    expect(alert.nextElementSibling).toBe(screen.getByRole("button", { name: "登録する" }));
  });
});

describe("ManualEntryForm 行追加ボタンの表示 (web)", () => {
  it("[W-BR-4] + はアイコンだけで、文言に + を重ねない (「+ + 練習を追加」にならない)", () => {
    render(<ManualEntryForm teamId="team-5501" />);
    expect(screen.getByRole("button", { name: "練習を追加" }).textContent).toBe("練習を追加");

    fireEvent.click(screen.getByRole("tab", { name: "大会" }));
    expect(screen.getByRole("button", { name: "大会を追加" }).textContent).toBe("大会を追加");
  });

  it.each(["ja", "en", "ko", "zh", "de"])(
    "[W-BR-4] %s の行追加ボタン文言も + で始めない (アイコンと重なる)",
    async (locale) => {
      const messages = (await import(`@apps/shared/messages/${locale}.json`)).default as {
        teamsAdmin: { bulkRegister: { manual: Record<string, string> } };
      };
      const manual = messages.teamsAdmin.bulkRegister.manual;
      expect(manual.addPracticeRowButton?.trimStart().startsWith("+")).toBe(false);
      expect(manual.addCompetitionRowButton?.trimStart().startsWith("+")).toBe(false);
    },
  );
});

describe("ManualEntryForm 登録成功後のリセット (web)", () => {
  it("[W-BR-3] 練習タブで登録に成功しても、大会タブの入力は残る", async () => {
    render(<ManualEntryForm teamId="team-5501" />);

    fireEvent.click(screen.getByRole("tab", { name: "大会" }));
    fireEvent.change(screen.getByPlaceholderText("◯◯大会"), { target: { value: "秋季記録会5503" } });

    fireEvent.click(screen.getByRole("tab", { name: "練習" }));
    fireEvent.change(screen.getByPlaceholderText("朝練 など"), { target: { value: "朝練5504" } });
    submit();
    await waitFor(() => expect(mockBulkRegister).toHaveBeenCalledTimes(1));
    expect(mockBulkRegister.mock.calls[0]![1].competitions).toEqual([]);

    // 送信した練習タブはリセットされる
    await waitFor(() =>
      expect((screen.getByPlaceholderText("朝練 など") as HTMLInputElement).value).toBe(""),
    );
    // 送信していない大会タブの入力は残っている
    fireEvent.click(screen.getByRole("tab", { name: "大会" }));
    expect((screen.getByPlaceholderText("◯◯大会") as HTMLInputElement).value).toBe("秋季記録会5503");
  });
});
