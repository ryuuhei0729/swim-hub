/**
 * CalendarBulkRegisterForm — web のカレンダー型一括登録 (swimhub-tasks#113)
 *
 * mobile components/teams/TeamBulkRegisterForm.tsx と同じく:
 *   - 登録済みの練習・大会をカレンダーに印で出す
 *   - 練習日をクリックで複数選び、曜日見出しでその月の同じ曜日をまとめて選べる
 *   - 大会と同じ日を選ぶと注意を出し、大会の期間が既存の大会と重なると注意を出す
 *   - 確認を経て TeamBulkRegisterAPI.bulkRegister に練習・大会をまとめて渡す
 */

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderWithI18n as render, screen, fireEvent, waitFor } from "@/__tests__/helpers/teamQueryTestUtils";

const mockBulkRegister = vi.fn();

vi.mock("@apps/shared/api/teams/bulkRegister", () => ({
  TeamBulkRegisterAPI: vi.fn().mockImplementation(function () {
    return { bulkRegister: mockBulkRegister };
  }),
}));

vi.mock("@/contexts", () => ({
  useAuth: () => ({ supabase: {} }),
}));

vi.mock("@apps/shared/hooks/queries/teams", () => ({
  useTeamPracticesQuery: () => ({ data: [{ date: "2026-11-05" }] }),
  useTeamCompetitionsQuery: () => ({ data: [{ date: "2026-11-14", end_date: "2026-11-15" }] }),
}));

import CalendarBulkRegisterForm from "@/components/bulk-register/calendar/CalendarBulkRegisterForm";

const day = (date: string) => screen.getByTestId(`bulk-calendar-day-${date}`);

beforeEach(() => {
  vi.clearAllMocks();
  // カレンダーは今月から始まるので、2026年11月に固定する
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 10, 12, 0, 0));
  mockBulkRegister.mockResolvedValue({
    success: true,
    practicesCreated: 2,
    competitionsCreated: 0,
    errors: [],
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("CalendarBulkRegisterForm (web)", () => {
  it("登録済みの練習・大会 (大会は期間の全日) に印が付く", () => {
    render(<CalendarBulkRegisterForm teamId="team-1" />);

    expect(screen.getByTestId("bulk-calendar-existing-practice-2026-11-05")).toBeInTheDocument();
    expect(screen.getByTestId("bulk-calendar-existing-competition-2026-11-14")).toBeInTheDocument();
    expect(screen.getByTestId("bulk-calendar-existing-competition-2026-11-15")).toBeInTheDocument();
    expect(screen.queryByTestId("bulk-calendar-existing-competition-2026-11-16")).toBeNull();
  });

  it("曜日見出しでその月の同じ曜日をまとめて選び、もう一度押すと外す", () => {
    render(<CalendarBulkRegisterForm teamId="team-1" />);

    // 2026年11月の月曜は 2, 9, 16, 23, 30 の5日
    fireEvent.click(screen.getByRole("button", { name: "月曜日をまとめて選択" }));
    expect(screen.getByText("選択中 5日")).toBeInTheDocument();
    expect(day("2026-11-09")).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "月曜日をまとめて選択" }));
    expect(screen.getByText("選択中 0日")).toBeInTheDocument();
  });

  it("大会と同じ日を選ぶと注意が出て、確認のあと選んだ日の練習を共通の内容で登録する", async () => {
    render(<CalendarBulkRegisterForm teamId="team-1" />);

    fireEvent.click(day("2026-11-14"));
    fireEvent.click(day("2026-11-03"));
    expect(screen.getByTestId("bulk-calendar-clash-count")).toHaveTextContent("大会と同じ日 1日");

    fireEvent.change(screen.getByLabelText("タイトル"), { target: { value: "朝練" } });
    fireEvent.change(screen.getByLabelText("場所"), { target: { value: "市民プール" } });

    fireEvent.click(screen.getByRole("button", { name: "練習2 を登録" }));
    fireEvent.click(await screen.findByRole("button", { name: "2件を登録する" }));

    await waitFor(() => expect(mockBulkRegister).toHaveBeenCalledTimes(1));
    expect(mockBulkRegister).toHaveBeenCalledWith("team-1", {
      practices: [
        { date: "2026-11-03", title: "朝練", place: "市民プール", note: null },
        { date: "2026-11-14", title: "朝練", place: "市民プール", note: null },
      ],
      competitions: [],
    });
    expect(await screen.findByText("2件を登録しました")).toBeInTheDocument();
    // 全件登録できたので選択はリセットされる
    expect(screen.getByText("選択中 0日")).toBeInTheDocument();
  });

  it("大会タブで既存の大会と重なる日を初日にすると注意が出て、追加した大会を練習と一緒に登録できる", async () => {
    mockBulkRegister.mockResolvedValue({
      success: true,
      practicesCreated: 1,
      competitionsCreated: 1,
      errors: [],
    });
    render(<CalendarBulkRegisterForm teamId="team-1" />);

    fireEvent.click(day("2026-11-20"));

    fireEvent.click(screen.getByRole("tab", { name: "大会" }));
    fireEvent.click(day("2026-11-15"));
    expect(screen.getByRole("alert")).toHaveTextContent("この期間には既に大会が登録されています");
    fireEvent.change(screen.getByLabelText("大会名"), { target: { value: "秋季大会" } });
    fireEvent.click(screen.getByRole("button", { name: "追加" }));

    expect(screen.getByRole("button", { name: "秋季大会" })).toBeInTheDocument();
    expect(day("2026-11-15")).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "練習1・大会1 を登録" }));
    fireEvent.click(await screen.findByRole("button", { name: "2件を登録する" }));

    await waitFor(() => expect(mockBulkRegister).toHaveBeenCalledTimes(1));
    expect(mockBulkRegister).toHaveBeenCalledWith("team-1", {
      practices: [{ date: "2026-11-20", title: null, place: null, note: null }],
      competitions: [
        {
          date: "2026-11-15",
          end_date: null,
          title: "秋季大会",
          place: null,
          pool_type: 0,
          note: null,
        },
      ],
    });
  });

  it("一部が失敗したら確認を開いたままエラーを出し、失敗した側の入力は残す", async () => {
    mockBulkRegister.mockResolvedValue({
      success: false,
      practicesCreated: 0,
      competitionsCreated: 0,
      errors: ["練習の登録に失敗しました"],
    });
    render(<CalendarBulkRegisterForm teamId="team-1" />);

    fireEvent.click(day("2026-11-03"));
    fireEvent.click(screen.getByRole("button", { name: "練習1 を登録" }));
    fireEvent.click(await screen.findByRole("button", { name: "1件を登録する" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("練習の登録に失敗しました");
    expect(screen.getByRole("button", { name: "1件を登録する" })).toBeInTheDocument();
    expect(screen.getByText("選択中 1日")).toBeInTheDocument();
  });
});
