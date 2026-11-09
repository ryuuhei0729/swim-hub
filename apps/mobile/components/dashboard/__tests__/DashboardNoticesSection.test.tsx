/**
 * DashboardNoticesSection (ホームの「お知らせ」= やること + チームごとのお知らせ)
 *
 * 旧 ActionItemsSection.test.tsx の観点 ([SC-6] [AT-1]・開閉の保存) と、
 * 旧 TeamAnnouncementsSection.expandToggle.test.tsx の構造契約をこのファイルで引き継ぐ。
 *
 *   [SC-6] エントリー未提出のタップ → CompetitionTabForm に teamId キーを渡さない
 *          (ダッシュボード起点なので、保存後にチームタブへ popTo してはいけない)
 *   [AT-1] 出欠未回答のタップ → そのチームの出欠タブを利用者ビュー (asMember) で開く
 *
 * 本文が1行に収まらないときの「タップで全文」は onTextLayout に依存し、
 * RN モックでは発火しないので検証できない (切り詰め判定の純関数は
 * utils/__tests__/announcementTruncation.test.ts)。シミュレータで確認する。
 * RN モックの Text は testID を `testid` 属性で出すので、testID は querySelector で引く。
 */

import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, it, expect, vi } from "vitest";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { TeamAnnouncement, TeamMembershipWithUser } from "@swim-hub/shared/types";
import {
  actionItemKey,
  actionItemsCollapseStorageKey,
} from "@apps/shared/utils/dashboardActionItems";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  unanswered: [] as Array<Record<string, string>>,
  unsubmitted: [] as Array<Record<string, string>>,
  unrecorded: [] as Array<Record<string, string>>,
  announcements: {} as Record<string, TeamAnnouncement[]>,
}));

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
vi.mock("@/contexts/AuthProvider");
vi.mock("@/hooks/useDateLocale", () => ({ useDateLocale: () => "ja" }));
vi.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: mocks.navigate }),
}));

import { useAuth } from "@/contexts/AuthProvider";
import { buildAuthContext } from "@/__tests__/helpers/authContext";
import { DashboardNoticesSection } from "../DashboardNoticesSection";

function team(teamId: string, name: string): TeamMembershipWithUser {
  return {
    team_id: teamId,
    status: "approved",
    is_active: true,
    role: "member",
    teams: { name },
  } as unknown as TeamMembershipWithUser;
}

const TEAM_1 = team("team-1", "テストチーム");
const TEAM_2 = team("team-2", "Guma");

function announcement(id: string, overrides: Partial<TeamAnnouncement> = {}): TeamAnnouncement {
  return {
    id,
    team_id: "team-1",
    title: `お知らせ ${id}`,
    content: `本文 ${id}`,
    created_by: "user-1",
    is_published: true,
    start_at: null,
    end_at: null,
    created_at: "2026-11-01T00:00:00Z",
    updated_at: "2026-11-01T00:00:00Z",
    ...overrides,
  };
}

const STORAGE_KEY = actionItemsCollapseStorageKey("user-1");

const queryByRnTestId = (container: HTMLElement, testId: string) =>
  container.querySelector(`[testid="${testId}"]`);

beforeEach(() => {
  vi.mocked(useAuth).mockReturnValue(buildAuthContext({ user: { id: "user-1" } }));
  vi.mocked(AsyncStorage.getItem).mockResolvedValue(null);
  mocks.unanswered = [];
  mocks.unsubmitted = [];
  mocks.unrecorded = [];
  mocks.announcements = {};
});

describe("DashboardNoticesSection — やることの遷移先", () => {
  it("[SC-6] エントリー未提出のタップで、CompetitionTabForm へ teamId を渡さない", () => {
    mocks.unsubmitted = [
      { teamId: "team-1", teamName: "テストチーム", competitionId: "comp-1", competitionName: "テスト大会", competitionDate: "2026-10-01" },
    ];
    const { getByRole } = render(<DashboardNoticesSection teams={[TEAM_1]} />);

    fireEvent.click(getByRole("button", { name: /テスト大会/ }));

    expect(mocks.navigate).toHaveBeenCalledWith("CompetitionTabForm", {
      competitionId: "comp-1",
      date: "2026-10-01",
      initialTab: "entry",
    });
    const [, params] = mocks.navigate.mock.calls[0] as [string, Record<string, unknown>];
    expect(Object.prototype.hasOwnProperty.call(params, "teamId")).toBe(false);
  });

  it("[AT-1] 出欠未回答のタップで、そのチームの出欠タブを利用者ビューで開く", () => {
    mocks.unanswered = [
      { teamId: "team-1", teamName: "テストチーム", eventId: "p1", eventType: "practice", eventName: "練習", eventDate: "2026-11-09" },
    ];
    const { getByText } = render(<DashboardNoticesSection teams={[TEAM_1]} />);

    fireEvent.click(getByText("出欠が未回答 1件"));

    expect(mocks.navigate).toHaveBeenCalledWith("MainTabs", {
      screen: "Teams",
      params: { teamId: "team-1", initialTab: "attendance", asMember: true },
    });
  });

  it("記録が未入力のタップで、その大会の記録タブを開く", () => {
    mocks.unrecorded = [
      { competitionId: "comp-2", competitionName: "秋季公認記録会", competitionDate: "2026-11-03" },
    ];
    const { getByRole } = render(<DashboardNoticesSection teams={[]} />);

    fireEvent.click(getByRole("button", { name: /秋季公認記録会/ }));

    expect(mocks.navigate).toHaveBeenCalledWith("CompetitionTabForm", {
      competitionId: "comp-2",
      date: "2026-11-03",
      initialTab: "record",
    });
  });
});

describe("DashboardNoticesSection — 表示", () => {
  it("やることもお知らせも0件なら何も出さない", () => {
    const { container } = render(<DashboardNoticesSection teams={[TEAM_1]} />);
    expect(queryByRnTestId(container, "dashboard-notices")).toBeNull();
  });

  it("やることがあれば見出しに件数を出し、出欠の未回答はチームごとに1行にまとめる", () => {
    mocks.unanswered = [
      { teamId: "team-1", teamName: "テストチーム", eventId: "p1", eventType: "practice", eventName: "練習", eventDate: "2026-11-09" },
      { teamId: "team-1", teamName: "テストチーム", eventId: "p2", eventType: "practice", eventName: "練習", eventDate: "2026-11-12" },
    ];
    const { getByText } = render(<DashboardNoticesSection teams={[TEAM_1]} />);
    expect(getByText("お知らせ")).toBeTruthy();
    expect(getByText("やること 1")).toBeTruthy();
    expect(getByText("出欠が未回答 2件")).toBeTruthy();
  });

  it("チームのやること (出欠・エントリー) はそのチームの「{チーム名}のお知らせ」の中に、お知らせより先に出す", () => {
    mocks.unanswered = [
      { teamId: "team-2", teamName: "Guma", eventId: "p1", eventType: "practice", eventName: "練習", eventDate: "2026-11-09" },
    ];
    mocks.unsubmitted = [
      { teamId: "team-1", teamName: "テストチーム", competitionId: "comp-1", competitionName: "テスト大会", competitionDate: "2026-12-01" },
    ];
    mocks.announcements = { "team-1": [announcement("a1")] };
    const { getByText } = render(<DashboardNoticesSection teams={[TEAM_1, TEAM_2]} />);

    const text = (label: string | RegExp) => getByText(label);
    const follows = (a: HTMLElement, b: HTMLElement) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    const team1 = text("テストチームのお知らせ");
    const entry = text(/テスト大会/);
    const ann = text("お知らせ a1");
    const team2 = text("Gumaのお知らせ");
    const attendance = text("出欠が未回答 1件");
    // テストチーム: 見出し → エントリー (黄色) → お知らせ。Guma はお知らせが無くても、やることがあれば欄を出す
    expect(follows(team1, entry) && follows(entry, ann) && follows(ann, team2)).toBe(true);
    expect(follows(team2, attendance)).toBe(true);
    expect(getByText("やること 2")).toBeTruthy();
  });

  it("チームを持たないやること (記録が未入力) は、チームの欄より上に見出しなしで出す", () => {
    mocks.unrecorded = [
      { competitionId: "comp-2", competitionName: "秋季公認記録会", competitionDate: "2026-11-03" },
    ];
    mocks.announcements = { "team-1": [announcement("a1")] };
    const { getByText, queryByText } = render(<DashboardNoticesSection teams={[TEAM_1]} />);
    const record = getByText(/秋季公認記録会/);
    const team1 = getByText("テストチームのお知らせ");
    expect(Boolean(record.compareDocumentPosition(team1) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    expect(queryByText("やること")).toBeNull();
  });

  it("お知らせだけなら、やることの件数と欄を出さずに「{チーム名}のお知らせ」を出す", () => {
    mocks.announcements = { "team-1": [announcement("a1")] };
    const { getByText, queryByText } = render(<DashboardNoticesSection teams={[TEAM_1]} />);
    expect(getByText("テストチームのお知らせ")).toBeTruthy();
    expect(getByText("お知らせ a1")).toBeTruthy();
    expect(queryByText("やること")).toBeNull();
    expect(queryByText(/^やること \d/)).toBeNull();
  });

  it("2チームに所属していれば、チームごとに見出しを分ける。お知らせが無いチームの見出しは出さない", () => {
    mocks.announcements = {
      "team-1": [announcement("a1")],
      "team-2": [announcement("b1", { team_id: "team-2" })],
    };
    const team3 = team("team-3", "静かなチーム");
    const { getByText, queryByText } = render(
      <DashboardNoticesSection teams={[TEAM_1, TEAM_2, team3]} />,
    );
    expect(getByText("テストチームのお知らせ")).toBeTruthy();
    expect(getByText("Gumaのお知らせ")).toBeTruthy();
    expect(queryByText("静かなチームのお知らせ")).toBeNull();
  });

  it("承認待ち・無効のチームのお知らせは出さない", () => {
    const pending = { ...team("team-1", "テストチーム"), status: "pending" } as TeamMembershipWithUser;
    mocks.announcements = { "team-1": [announcement("a1")] };
    const { container } = render(<DashboardNoticesSection teams={[pending]} />);
    expect(queryByRnTestId(container, "dashboard-notices")).toBeNull();
  });

  it("1チーム3件以上なら新しい2件だけを出し、「すべて表示」で残りも出す", () => {
    mocks.announcements = {
      "team-1": [announcement("a1"), announcement("a2"), announcement("a3")],
    };
    const { getByText, queryByText } = render(<DashboardNoticesSection teams={[TEAM_1]} />);
    expect(getByText("お知らせ a2")).toBeTruthy();
    expect(queryByText("お知らせ a3")).toBeNull();

    fireEvent.click(getByText("すべて表示（3）"));
    expect(getByText("お知らせ a3")).toBeTruthy();

    fireEvent.click(getByText("閉じる"));
    expect(queryByText("お知らせ a3")).toBeNull();
  });

  it("2件以下なら「すべて表示」を出さない", () => {
    mocks.announcements = { "team-1": [announcement("a1"), announcement("a2")] };
    const { queryByText } = render(<DashboardNoticesSection teams={[TEAM_1]} />);
    expect(queryByText(/すべて表示/)).toBeNull();
  });

  it("読み上げ文はタイトル・日付・本文を1回ずつ (計測用 Text の本文を重ねて読まない)。押せない行は無効扱いにしない", () => {
    mocks.announcements = { "team-1": [announcement("a1", { content: "短い本文" })] };
    const { container } = render(<DashboardNoticesSection teams={[TEAM_1]} />);
    const row = queryByRnTestId(container, "announcement-a1");
    // RN モックの Pressable は props をそのまま DOM 属性にするので、属性名は小文字になる
    expect(row?.getAttribute("accessibilitylabel")).toMatch(/^お知らせ a1、.+、短い本文$/);
    expect(row?.hasAttribute("disabled")).toBe(false);
  });

  it("[構造契約] 本文は可視の Text と非表示の計測用 Text の2つで描く", () => {
    mocks.announcements = { "team-1": [announcement("a1", { content: "短い本文" })] };
    const { container } = render(<DashboardNoticesSection teams={[TEAM_1]} />);
    expect(queryByRnTestId(container, "announcement-content-a1")?.textContent).toBe("短い本文");
    expect(queryByRnTestId(container, "announcement-content-measure-a1")).toBeTruthy();
  });
});

describe("DashboardNoticesSection — 開閉", () => {
  it("見出しをタップすると閉じて、閉じた時点の項目 (やること・お知らせ) と一緒に保存する", () => {
    mocks.unrecorded = [
      { competitionId: "comp-2", competitionName: "秋季公認記録会", competitionDate: "2026-11-03" },
    ];
    mocks.announcements = { "team-1": [announcement("a1")] };
    const { getByText, queryByText } = render(<DashboardNoticesSection teams={[TEAM_1]} />);

    // RN モックでは Pressable の testID を引けないので、見出しの文字を押す
    fireEvent.click(getByText("お知らせ"));

    expect(queryByText(/秋季公認記録会/)).toBeNull();
    expect(queryByText("お知らせ a1")).toBeNull();
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      STORAGE_KEY,
      JSON.stringify({
        collapsed: true,
        keys: [actionItemKey.record("comp-2"), actionItemKey.announcement("a1")],
      }),
    );
  });

  it("保存した閉じた状態を読み、項目が同じなら閉じたまま出す", async () => {
    vi.mocked(AsyncStorage.getItem).mockResolvedValue(
      JSON.stringify({ collapsed: true, keys: [actionItemKey.record("comp-2")] }),
    );
    mocks.unrecorded = [
      { competitionId: "comp-2", competitionName: "秋季公認記録会", competitionDate: "2026-11-03" },
    ];
    const { queryByText, getByText } = render(<DashboardNoticesSection teams={[]} />);

    await waitFor(() => expect(queryByText(/秋季公認記録会/)).toBeNull());
    expect(getByText("やること 1")).toBeTruthy();
    expect(AsyncStorage.getItem).toHaveBeenCalledWith(STORAGE_KEY);
  });

  it("閉じた時点に無かったやることがあれば開いて出す", async () => {
    vi.mocked(AsyncStorage.getItem).mockResolvedValue(
      JSON.stringify({ collapsed: true, keys: [actionItemKey.record("comp-2")] }),
    );
    mocks.unrecorded = [
      { competitionId: "comp-2", competitionName: "秋季公認記録会", competitionDate: "2026-11-03" },
      { competitionId: "comp-3", competitionName: "市民大会", competitionDate: "2026-11-01" },
    ];
    const { findByText } = render(<DashboardNoticesSection teams={[]} />);
    expect(await findByText(/市民大会/)).toBeTruthy();
  });

  it("閉じた時点に無かったお知らせがあれば開いて出す", async () => {
    vi.mocked(AsyncStorage.getItem).mockResolvedValue(
      JSON.stringify({ collapsed: true, keys: [actionItemKey.announcement("a1")] }),
    );
    mocks.announcements = { "team-1": [announcement("a2"), announcement("a1")] };
    const { findByText } = render(<DashboardNoticesSection teams={[TEAM_1]} />);
    expect(await findByText("お知らせ a2")).toBeTruthy();
  });
});
