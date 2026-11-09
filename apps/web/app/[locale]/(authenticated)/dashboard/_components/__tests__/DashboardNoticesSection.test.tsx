/**
 * DashboardNoticesSection (ダッシュボードの「お知らせ」= チームごとのやること + お知らせ)。
 * 旧 ActionItemsSection.test.tsx の観点 (遷移先・開閉の保存) を引き継ぐ。
 * 本文が1行に収まらないときの「押して全文」は jsdom が行の高さを計算しないので検証できない。
 */
import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import {
  actionItemKey,
  actionItemsCollapseStorageKey,
} from "@apps/shared/utils/dashboardActionItems";
import type { TeamAnnouncement, TeamMembership, Team } from "@apps/shared/types";
import { useAuth } from "@/contexts";
import { renderWithI18n } from "@/__tests__/utils/render";
import { buildAuthContext } from "@/__tests__/utils/authContext";
import DashboardNoticesSection from "../DashboardNoticesSection";

const mocks = vi.hoisted(() => ({
  unanswered: [] as Array<Record<string, string>>,
  unsubmitted: [] as Array<Record<string, string>>,
  unrecorded: [] as Array<Record<string, string>>,
  announcements: {} as Record<string, TeamAnnouncement[]>,
}));

vi.mock("@/contexts");
vi.mock("@/i18n/navigation");
vi.mock("@apps/shared/hooks/queries/notifications", () => ({
  useUnansweredAttendancesQuery: () => ({ data: mocks.unanswered }),
  useUnsubmittedEntriesQuery: () => ({ data: mocks.unsubmitted }),
}));
vi.mock("@apps/shared/hooks/queries/dashboard", () => ({
  useUnrecordedCompetitionsQuery: () => ({ data: mocks.unrecorded }),
}));
vi.mock("@apps/shared/hooks/queries/announcements", () => ({
  useTeamsAnnouncementsQuery: (_supabase: unknown, teamIds: readonly string[]) =>
    teamIds.map((teamId) => ({ teamId, announcements: mocks.announcements[teamId] ?? [] })),
}));

type Membership = TeamMembership & { team?: Team };

function membership(teamId: string, name: string, status = "approved"): Membership {
  return { team_id: teamId, status, is_active: true, team: { name } } as unknown as Membership;
}

const T1 = membership("t1", "SHスイミング");
const T2 = membership("t2", "別チーム");

function announcement(id: string, teamId = "t1"): TeamAnnouncement {
  return {
    id,
    team_id: teamId,
    title: `お知らせ ${id}`,
    content: `本文 ${id}`,
    created_by: "me",
    is_published: true,
    start_at: null,
    end_at: null,
    created_at: "2026-11-01T00:00:00Z",
    updated_at: "2026-11-01T00:00:00Z",
  };
}

const STORAGE_KEY = actionItemsCollapseStorageKey("me");

function renderSection(teams: Membership[] = [T1, T2]) {
  const props = { teams, openEntryLogForm: vi.fn(), onAddRecord: vi.fn() };
  const utils = renderWithI18n(<DashboardNoticesSection {...props} />);
  return { ...props, ...utils };
}

const attendance = (teamId: string, eventId: string) => ({
  teamId,
  teamName: teamId === "t1" ? "SHスイミング" : "別チーム",
  eventId,
  eventType: "practice",
  eventName: "練習",
  eventDate: "2026-11-09",
});

const ALL_KEYS = [
  actionItemKey.attendance("practice", "p1"),
  actionItemKey.attendance("practice", "p2"),
  actionItemKey.attendance("practice", "p3"),
  actionItemKey.entry("c-entry"),
  actionItemKey.record("c-record"),
];

/** a が b より前に描かれているか */
const precedes = (a: HTMLElement, b: HTMLElement) =>
  Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

beforeEach(() => {
  vi.mocked(useAuth).mockReturnValue(buildAuthContext({ user: { id: "me" } }));
  window.localStorage.clear();
  mocks.unanswered = [attendance("t1", "p1"), attendance("t1", "p2"), attendance("t2", "p3")];
  mocks.unsubmitted = [
    { teamId: "t1", teamName: "SHスイミング", competitionId: "c-entry", competitionName: "冬季短水路記録会", competitionDate: "2026-12-06" },
  ];
  mocks.unrecorded = [
    { competitionId: "c-record", competitionName: "秋季公認記録会", competitionDate: "2026-11-03" },
  ];
  mocks.announcements = {};
});

describe("DashboardNoticesSection — 表示と遷移先", () => {
  it("やることもお知らせも0件なら何も出さない", () => {
    mocks.unanswered = [];
    mocks.unsubmitted = [];
    mocks.unrecorded = [];
    renderSection();
    expect(screen.queryByTestId("dashboard-notices")).toBeNull();
  });

  it("チームのやることはそのチームの「{チーム名}のお知らせ」に、出欠の未回答はチームごとに1行で出す", () => {
    renderSection();
    expect(screen.getByText("やること 4")).toBeInTheDocument();

    const t1 = screen.getByText("SHスイミングのお知らせ");
    const t2 = screen.getByText("別チームのお知らせ");
    const t1Attendance = screen.getByText("出欠が未回答 2件");
    const entry = screen.getByText(/冬季短水路記録会/);
    const t2Attendance = screen.getByText("出欠が未回答 1件");
    expect(precedes(t1, t1Attendance) && precedes(t1Attendance, t2)).toBe(true);
    expect(precedes(t1, entry) && precedes(entry, t2)).toBe(true);
    expect(precedes(t2, t2Attendance)).toBe(true);

    expect(screen.getByRole("link", { name: "出欠が未回答 2件" })).toHaveAttribute(
      "href",
      "/teams/t1?tab=attendance",
    );
  });

  it("チームを持たないやること (記録が未入力) は、チームの欄より上に見出しなしで出す", () => {
    renderSection();
    expect(precedes(screen.getByText(/秋季公認記録会/), screen.getByText("SHスイミングのお知らせ"))).toBe(true);
    expect(screen.queryByText("やること")).toBeNull();
  });

  it("エントリー受付中はその大会のエントリーを、記録が未入力はその大会の記録入力を開く", () => {
    const { openEntryLogForm, onAddRecord } = renderSection();
    fireEvent.click(screen.getByRole("button", { name: /冬季短水路記録会/ }));
    expect(openEntryLogForm).toHaveBeenCalledWith("c-entry");
    fireEvent.click(screen.getByRole("button", { name: /秋季公認記録会/ }));
    expect(onAddRecord).toHaveBeenCalledWith("c-record");
  });

  it("お知らせだけのチームも欄を出し、やることの件数バッジは出さない", () => {
    mocks.unanswered = [];
    mocks.unsubmitted = [];
    mocks.unrecorded = [];
    mocks.announcements = { t2: [announcement("a1", "t2")] };
    renderSection();
    expect(screen.getByText("別チームのお知らせ")).toBeInTheDocument();
    expect(screen.getByText("お知らせ a1")).toBeInTheDocument();
    expect(screen.queryByText("SHスイミングのお知らせ")).toBeNull();
    expect(screen.queryByText(/^やること \d/)).toBeNull();
  });

  it("承認待ちのチームは対象にしない", () => {
    mocks.unanswered = [];
    mocks.unsubmitted = [];
    mocks.unrecorded = [];
    mocks.announcements = { t1: [announcement("a1")] };
    renderSection([membership("t1", "SHスイミング", "pending")]);
    expect(screen.queryByTestId("dashboard-notices")).toBeNull();
  });

  it("1チーム3件以上なら新しい2件だけを出し、「すべて表示」で残りも出す", () => {
    mocks.announcements = { t1: [announcement("a1"), announcement("a2"), announcement("a3")] };
    renderSection();
    const group = screen.getByText("SHスイミングのお知らせ").parentElement!.parentElement!;
    expect(within(group).getByText("お知らせ a2")).toBeInTheDocument();
    expect(within(group).queryByText("お知らせ a3")).toBeNull();

    fireEvent.click(within(group).getByRole("button", { name: "すべて表示（3）" }));
    expect(within(group).getByText("お知らせ a3")).toBeInTheDocument();
    fireEvent.click(within(group).getByRole("button", { name: "閉じる" }));
    expect(within(group).queryByText("お知らせ a3")).toBeNull();
  });
});

describe("DashboardNoticesSection — 開閉", () => {
  it("見出しを押すと閉じて件数だけ残り、閉じた時点の項目 (やること・お知らせ) と一緒に保存する", () => {
    mocks.announcements = { t1: [announcement("a1")] };
    renderSection();
    const header = screen.getByRole("button", { name: /お知らせ/, expanded: true });

    fireEvent.click(header);

    expect(header).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(/冬季短水路記録会/)).toBeNull();
    expect(screen.queryByText("お知らせ a1")).toBeNull();
    expect(screen.getByText("やること 4")).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)!)).toEqual({
      collapsed: true,
      keys: [...ALL_KEYS, actionItemKey.announcement("a1")],
    });
  });

  it("閉じて保存した後に開き直しても、項目が同じなら閉じたまま", () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ collapsed: true, keys: ALL_KEYS }));
    renderSection();
    expect(screen.getByTestId("dashboard-notices").querySelector("button")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("閉じた時点に無かった項目があれば、件数が同じでも開く", () => {
    // 閉じたときは別の記録未入力 (c-old) があり、今は c-record に入れ替わっている
    const keysAtClose = [...ALL_KEYS.slice(0, 4), actionItemKey.record("c-old")];
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ collapsed: true, keys: keysAtClose }));
    renderSection();
    expect(screen.getByTestId("dashboard-notices").querySelector("button")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("閉じた時点に無かったお知らせが届いたら開く", () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ collapsed: true, keys: ALL_KEYS }));
    mocks.announcements = { t1: [announcement("a-new")] };
    renderSection();
    expect(screen.getByText("お知らせ a-new")).toBeInTheDocument();
  });
});
