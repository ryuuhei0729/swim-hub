/**
 * チーム画面「予定」タブ (TeamSchedule) — swimhub-tasks #72 (mobile の TeamScheduleList と同じ)
 *   [S-1] 練習と大会を 1 本の一覧にし、今日以降を日付の近い順に出す (過去は出さない)
 *   [S-2] 「全て / 練習 / 大会」で絞り込み、該当が無ければ空の案内を出す
 *   [S-3] 「過去」をオンにすると昨日以前を新しい順に出す。オンにするまで過去は取得しない
 *   [S-4] 過去は 20 件ずつ「もっと見る」で読み足す
 *   [S-5] 管理者ビューは 練習追加 / 大会追加 / 一括登録、利用者ビューは 自分のログを追加
 */
import React from "react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderWithI18n as render, screen } from "@/__tests__/helpers/teamQueryTestUtils";

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/components/forms/PracticeBasicForm", () => ({
  default: (props: { isOpen: boolean }) =>
    props.isOpen ? <div data-testid="practice-basic-form" /> : null,
}));
vi.mock("@/components/forms/CompetitionBasicForm", () => ({
  default: (props: { isOpen: boolean }) =>
    props.isOpen ? <div data-testid="competition-basic-form" /> : null,
}));
vi.mock("../../../components/team/TeamPracticeDetailModal", () => ({ default: () => null }));

vi.mock("@/contexts/AuthProvider");
import { useAuth } from "@/contexts/AuthProvider";
import { buildAuthContext } from "@/__tests__/utils/authContext";

import TeamSchedule from "@/components/team/TeamSchedule";
import {
  buildScheduleSupabaseMock,
  competitionRow,
  practiceRow,
} from "@/__tests__/utils/teamScheduleSupabaseMock";

let mock: ReturnType<typeof buildScheduleSupabaseMock>;

function setup(rows: Parameters<typeof buildScheduleSupabaseMock>[0]) {
  mock = buildScheduleSupabaseMock(rows);
  vi.mocked(useAuth).mockReturnValue(
    buildAuthContext({ user: { id: "member-1" }, supabase: mock.supabase }),
  );
}

/** カードのタイトルを画面上の並び順で返す */
function visibleTitles(titles: string[]) {
  const text = document.body.textContent ?? "";
  return titles
    .filter((title) => text.includes(title))
    .sort((a, b) => text.indexOf(a) - text.indexOf(b));
}

const ALL_TITLES = ["練習A", "練習B", "大会A", "過去の練習", "過去の大会"];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("TeamSchedule", () => {
  beforeEach(() => {
    setup({
      practices: [
        practiceRow("p-a", "練習A", "2099-03-01"),
        practiceRow("p-b", "練習B", "2099-01-10"),
        practiceRow("p-old", "過去の練習", "2000-05-01"),
      ],
      competitions: [
        competitionRow("c-a", "大会A", "2099-02-01"),
        competitionRow("c-old", "過去の大会", "2000-06-01"),
      ],
    });
  });

  it("[S-1] 練習と大会を混ぜて今日以降を近い順に出し、過去は出さない", async () => {
    render(<TeamSchedule teamId="team-1" />);
    expect(await screen.findByText("練習A")).toBeInTheDocument();
    expect(visibleTitles(ALL_TITLES)).toEqual(["練習B", "大会A", "練習A"]);
    // 「過去」をオンにするまで過去は取得しない
    expect(mock.state.calls.some((call) => call.when === "past")).toBe(false);
  });

  it("[S-2] 種類で絞り込み、該当が無ければ空の案内を出す", async () => {
    const user = userEvent.setup();
    render(<TeamSchedule teamId="team-1" />);
    await screen.findByText("練習A");

    await user.click(screen.getByTestId("team-schedule-kind-competitions"));
    expect(visibleTitles(ALL_TITLES)).toEqual(["大会A"]);

    await user.click(screen.getByTestId("team-schedule-kind-practices"));
    expect(visibleTitles(ALL_TITLES)).toEqual(["練習B", "練習A"]);

  });

  it("[S-3] 「過去」をオンにすると昨日以前を新しい順に出す", async () => {
    const user = userEvent.setup();
    render(<TeamSchedule teamId="team-1" />);
    await screen.findByText("練習A");

    const pastSwitch = screen.getByRole("switch", { name: "過去" });
    expect(pastSwitch.getAttribute("aria-checked")).toBe("false");
    await user.click(pastSwitch);
    expect(pastSwitch.getAttribute("aria-checked")).toBe("true");
    expect(await screen.findByText("過去の大会")).toBeInTheDocument();
    expect(visibleTitles(ALL_TITLES)).toEqual(["過去の大会", "過去の練習"]);

    await user.click(screen.getByTestId("team-schedule-kind-practices"));
    expect(visibleTitles(ALL_TITLES)).toEqual(["過去の練習"]);
  });

  it("[S-2] 該当が無ければ、絞り込みに合わせた空の案内を出す", async () => {
    setup({ practices: [practiceRow("p-old", "過去の練習", "2000-05-01")] });
    const user = userEvent.setup();
    render(<TeamSchedule teamId="team-1" />);
    expect(await screen.findByText("今後の予定はありません")).toBeInTheDocument();

    await user.click(screen.getByTestId("team-schedule-kind-competitions"));
    await user.click(screen.getByRole("switch", { name: "過去" }));
    expect(await screen.findByText("過去の大会はありません")).toBeInTheDocument();
  });
});

describe("TeamSchedule — 過去の段階読み込み", () => {
  it("[S-4] 過去は 20 件ずつ「もっと見る」で読み足す", async () => {
    const practices = Array.from({ length: 21 }, (_, i) =>
      practiceRow(`p-${i + 1}`, `過去練習${i + 1}`, `2000-01-${String(31 - i).padStart(2, "0")}`),
    );
    setup({ practices });
    const user = userEvent.setup();
    render(<TeamSchedule teamId="team-1" />);
    await screen.findByText("今後の予定はありません");

    await user.click(screen.getByRole("switch", { name: "過去" }));
    expect(await screen.findByText("過去練習20")).toBeInTheDocument();
    expect(screen.queryByText("過去練習21")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("team-schedule-load-more"));
    expect(await screen.findByText("過去練習21")).toBeInTheDocument();
    expect(screen.queryByTestId("team-schedule-load-more")).not.toBeInTheDocument();
    const pastPracticeCalls = mock.state.calls.filter(
      (call) => call.table === "practices" && call.when === "past",
    );
    expect(pastPracticeCalls.map((call) => [call.from, call.to])).toEqual([
      [0, 19],
      [20, 39],
    ]);
  });
});

describe("TeamSchedule — ビューごとの操作", () => {
  beforeEach(() => {
    setup({ practices: [practiceRow("p-a", "練習A", "2099-03-01")] });
  });

  it("[S-5] 管理者ビューは練習追加・大会追加・一括登録を出す", async () => {
    const onOpenBulkRegister = vi.fn();
    const user = userEvent.setup();
    render(
      <TeamSchedule teamId="team-1" isAdmin={true} onOpenBulkRegister={onOpenBulkRegister} />,
    );
    await screen.findByText("練習A");
    expect(screen.queryByRole("button", { name: "自分のログを追加" })).not.toBeInTheDocument();

    await user.click(screen.getByTestId("team-schedule-bulk-register"));
    expect(onOpenBulkRegister).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "練習記録追加" }));
    expect(await screen.findByTestId("practice-basic-form")).toBeInTheDocument();
  });

  it("[S-5] 利用者ビューは自分のログを追加だけを出す", async () => {
    render(<TeamSchedule teamId="team-1" />);
    await screen.findByText("練習A");
    expect(screen.getByRole("button", { name: "自分のログを追加" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "練習記録追加" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "大会追加" })).not.toBeInTheDocument();
    expect(screen.queryByTestId("team-schedule-bulk-register")).not.toBeInTheDocument();
  });
});
