/**
 * DayDetailModal (dashboard) — 「チームの記録を見る」 (swimhub-tasks #141)
 *
 *   [TR-1] チーム練習 (team_practice / 自分のログがある team_id 付き練習) と
 *          チーム大会 (team_competition / エントリー / 記録) にボタンを出す。個人の予定には出さない
 *   [TR-2] 押すと日付詳細を閉じ、チーム画面の予定タブでその練習・大会の詳細を開く URL へ移動する
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";
import messages from "@apps/shared/messages/ja.json";
import type { CalendarItem } from "@apps/shared/types/ui";

const pushMock = vi.hoisted(() => vi.fn());

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("@/contexts", () => ({
  useAuth: () => ({ user: { id: "user-1" }, supabase: {} }),
}));

vi.mock("@apps/shared/hooks", () => ({
  useCalendarColorSettingsQuery: () => ({ settings: undefined }),
}));

// 各カードは「ボタンを出す条件 (onShowTeamRecords が渡るか)」だけを見るスタブにする。
// ボタン自体の表示はカード側の実装 (TeamRecordsButton) をそのまま使う
vi.mock("../components", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../components")>();
  const Stub = (props: { testId: string; onShowTeamRecords?: () => void }) => (
    <div data-testid={props.testId}>
      {props.onShowTeamRecords && <actual.TeamRecordsButton onClick={props.onShowTeamRecords} />}
    </div>
  );
  return {
    ...actual,
    PracticeDetails: (props: { practiceId: string; onShowTeamRecords?: () => void }) => (
      <Stub testId={`practice-${props.practiceId}`} onShowTeamRecords={props.onShowTeamRecords} />
    ),
    CompetitionDetails: (props: { competitionId: string; onShowTeamRecords?: () => void }) => (
      <Stub
        testId={`competition-${props.competitionId}`}
        onShowTeamRecords={props.onShowTeamRecords}
      />
    ),
    CompetitionWithEntry: (props: { competitionId: string; onShowTeamRecords?: () => void }) => (
      <Stub testId={`entry-${props.competitionId}`} onShowTeamRecords={props.onShowTeamRecords} />
    ),
    AttendanceModal: () => null,
  };
});

import DayDetailModal from "../DayDetailModal";

function renderWithIntl(ui: ReactElement) {
  return render(
    <NextIntlClientProvider locale="ja" messages={messages as unknown as AbstractIntlMessages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const DATE = new Date("2026-07-10T00:00:00");

function renderModal(entries: CalendarItem[], onClose = vi.fn()) {
  renderWithIntl(<DayDetailModal isOpen onClose={onClose} date={DATE} entries={entries} />);
  return { onClose };
}

const BUTTON_TEXT = "チームの記録を見る";

describe("DayDetailModal — チームの記録を見る", () => {
  beforeEach(() => {
    pushMock.mockReset();
  });

  it("[TR-1/2] チーム練習 (自分のログなし) はチーム画面の予定タブで練習の詳細を開く", async () => {
    const user = userEvent.setup();
    const { onClose } = renderModal([
      { id: "p-team", type: "team_practice", date: "2026-07-10", title: "練習", metadata: { team_id: "team-1" } },
    ]);

    await user.click(screen.getByRole("button", { name: BUTTON_TEXT }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(pushMock).toHaveBeenCalledWith("/teams/team-1?tab=schedule&practice=p-team");
  });

  it("[TR-1/2] 自分のログがある team_id 付き練習も、その練習の詳細を開く", async () => {
    const user = userEvent.setup();
    renderModal([
      {
        id: "log-1",
        type: "practice_log",
        date: "2026-07-10",
        title: "練習",
        metadata: { practice_id: "p-1", team_id: "team-1" },
      },
    ]);

    await user.click(screen.getByRole("button", { name: BUTTON_TEXT }));

    expect(pushMock).toHaveBeenCalledWith("/teams/team-1?tab=schedule&practice=p-1");
  });

  it("[TR-1/2] チーム大会・エントリー・記録は大会の詳細を開く", async () => {
    const user = userEvent.setup();
    renderModal([
      { id: "c-team", type: "team_competition", date: "2026-07-10", title: "大会", metadata: { team_id: "team-1" } },
      {
        id: "entry-1",
        type: "entry",
        date: "2026-07-10",
        title: "大会",
        metadata: { team_id: "team-2", competition: { id: "c-entry" } },
      },
      {
        id: "record-1",
        type: "record",
        date: "2026-07-10",
        title: "大会",
        metadata: { competition: { id: "c-record", team_id: "team-3" } },
      },
    ] as CalendarItem[]);

    await user.click(
      screen.getByTestId("competition-c-team").querySelector("button") as HTMLButtonElement,
    );
    expect(pushMock).toHaveBeenLastCalledWith("/teams/team-1?tab=schedule&competition=c-team");

    await user.click(
      screen.getByTestId("entry-c-entry").querySelector("button") as HTMLButtonElement,
    );
    expect(pushMock).toHaveBeenLastCalledWith("/teams/team-2?tab=schedule&competition=c-entry");

    await user.click(
      screen.getByTestId("competition-c-record").querySelector("button") as HTMLButtonElement,
    );
    expect(pushMock).toHaveBeenLastCalledWith("/teams/team-3?tab=schedule&competition=c-record");
  });

  it("[TR-1] 個人の練習・大会・記録には出さない", () => {
    renderModal([
      { id: "p-own", type: "practice", date: "2026-07-10", title: "練習", metadata: {} },
      {
        id: "log-own",
        type: "practice_log",
        date: "2026-07-10",
        title: "練習",
        metadata: { practice_id: "p-own-2" },
      },
      { id: "c-own", type: "competition", date: "2026-07-10", title: "大会", metadata: {} },
      {
        id: "record-own",
        type: "record",
        date: "2026-07-10",
        title: "大会",
        metadata: { competition: { id: "c-own-2", team_id: null } },
      },
    ] as CalendarItem[]);

    expect(screen.getByTestId("practice-p-own")).toBeInTheDocument();
    expect(screen.getByTestId("competition-c-own-2")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: BUTTON_TEXT })).not.toBeInTheDocument();
  });
});
