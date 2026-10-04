/**
 * 「目標」タブの配線 (web 管理者) — Sprint Contract v1
 *   - TEAM_ADMIN_TAB_DEFS に goals があり rankings の直後。総数は 10 (厳密一致)
 *   - クリックで onTabChange("goals")
 *   - 一般タブ (TeamTabs) には出ない (管理者限定)
 *   - TeamAdminClient: ?tab=goals で TeamMemberGoals が teamId つきでマウントされる /
 *     未知の ?tab= では出ない / タブクリックで切り替わる
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import messages from "@apps/shared/messages/ja.json";
import TeamTabs from "@/components/team/TeamTabs";
import TeamAdminTabs, { isTeamAdminTabType } from "@/components/team/TeamAdminTabs";

const mocks = vi.hoisted(() => ({
  searchParams: new URLSearchParams(),
  goalsSpy: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => mocks.searchParams,
  usePathname: () => "/ja/teams/team-kingfisher",
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/contexts", () => ({
  useAuth: () => ({
    user: { id: "usr-kingfisher-7" },
    supabase: {
      // TeamAdminClient は承認待ち件数の取得で requireTeamAdmin → auth.getUser() を通る。
      // このテストの関心はタブ配線なので、認証だけ通して件数は 0 にする
      auth: {
        getUser: vi
          .fn()
          .mockResolvedValue({ data: { user: { id: "usr-kingfisher-7" } }, error: null }),
      },
      from: vi.fn(() => {
        const builder: Record<string, unknown> = {};
        for (const method of ["select", "eq", "order", "in"]) {
          builder[method] = vi.fn(() => builder);
        }
        builder.single = vi.fn(async () => ({
          data: { role: "admin", status: "approved", is_active: true },
          error: null,
        }));
        builder.then = (onfulfilled?: (v: unknown) => unknown) =>
          Promise.resolve({ data: [], error: null, count: 0 }).then(onfulfilled);
        return builder;
      }),
      rpc: vi.fn().mockResolvedValue({ data: [], error: null }),
    },
  }),
}));

// タブの中身はこのテストの関心外。「どのタブがマウントされたか」だけを spy で捕捉する
vi.mock("@/components/team/rankings/TeamRankings", () => ({
  default: () => <div data-testid="rankings-tab-stub" />,
}));
vi.mock("@/components/team/member-goals/TeamMemberGoals", () => ({
  default: (props: { teamId: string }) => {
    mocks.goalsSpy(props);
    return <div data-testid="goals-tab-stub" />;
  },
}));
vi.mock("@/components/team/TeamMemberManagement", () => ({
  default: () => <div data-testid="members-tab-stub" />,
}));
vi.mock("@/components/team/TeamPractices", () => ({
  default: () => <div data-testid="practices-tab-stub" />,
}));
vi.mock("@/components/team/TeamCompetitions", () => ({
  default: () => <div data-testid="competitions-tab-stub" />,
}));
vi.mock("@/components/team/MyMonthlyAttendance", () => ({
  default: () => <div data-testid="attendance-tab-stub" />,
}));
vi.mock("@/components/team/AdminMonthlyAttendance", () => ({
  default: () => <div data-testid="admin-attendance-tab-stub" />,
}));
vi.mock("@/components/team/TeamAnnouncements", () => ({
  TeamAnnouncements: () => <div data-testid="announcements-tab-stub" />,
}));
vi.mock("@/components/team/TeamSettings", () => ({
  default: () => <div data-testid="settings-tab-stub" />,
}));
vi.mock("@/components/team/TeamBulkRegister", () => ({
  default: () => <div data-testid="bulk-register-tab-stub" />,
}));
vi.mock("@/components/team/group-management/TeamGroupManagement", () => ({
  default: () => <div data-testid="groups-tab-stub" />,
}));
vi.mock("@/components/team/MemberDetailModal", () => ({ default: () => null }));

function wrap(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="ja" messages={messages as unknown as AbstractIntlMessages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const TEAM_ID = "team-kingfisher";

const TEAM: never = {
  id: TEAM_ID,
  name: "QA カワセミ",
  invite_code: "QA-KINGFISHER",
  members: [],
} as unknown as never;

const MEMBERSHIP_ADMIN: never = {
  id: "mem-admin",
  team_id: TEAM_ID,
  user_id: "usr-kingfisher-7",
  role: "admin",
  status: "approved",
  is_active: true,
} as unknown as never;


describe("管理者タブの goals 配線", () => {
  beforeEach(() => vi.clearAllMocks());

  it("タブはちょうど10個で、目標はランキングの直後・一括登録の前", () => {
    wrap(<TeamAdminTabs activeTab="members" onTabChange={vi.fn()} />);
    const labels = screen.getAllByRole("button").map((b) => b.textContent?.trim());
    expect(labels).toHaveLength(10);
    const i = labels.indexOf(messages.teamsAdmin.tabs.goals);
    expect(i).toBeGreaterThan(-1);
    expect(labels[i - 1]).toBe(messages.teamsAdmin.tabs.rankings);
    expect(labels[i + 1]).toBe(messages.teamsAdmin.tabs.bulkRegister);
  });

  it("目標タブのクリックで onTabChange('goals')", async () => {
    const onTabChange = vi.fn();
    wrap(<TeamAdminTabs activeTab="members" onTabChange={onTabChange} />);
    await userEvent.click(screen.getByRole("button", { name: messages.teamsAdmin.tabs.goals }));
    expect(onTabChange).toHaveBeenCalledTimes(1);
    expect(onTabChange).toHaveBeenCalledWith("goals");
  });

  it("isTeamAdminTabType('goals') は true、未知の値は false", () => {
    expect(isTeamAdminTabType("goals")).toBe(true);
    expect(isTeamAdminTabType("goalz")).toBe(false);
  });

  it("一般メンバー用タブ (TeamTabs) に「目標」は出ない", () => {
    wrap(<TeamTabs activeTab="members" onTabChange={vi.fn()} />);
    const labels = screen.getAllByRole("button").map((b) => b.textContent?.trim());
    expect(labels).not.toContain(messages.teamsAdmin.tabs.goals);
  });
});

describe("TeamAdminClient の goals case", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.searchParams = new URLSearchParams();
  });

  async function renderAdminAt(tab?: string) {
    if (tab !== undefined) mocks.searchParams = new URLSearchParams(`tab=${tab}`);
    const { default: TeamAdminClient } = await import(
      "../../../app/[locale]/(authenticated)/teams-admin/[teamId]/_client/TeamAdminClient"
    );
    const { useTeamAdminStore } = await import("@/stores/form/teamAdminStore");
    useTeamAdminStore.getState().setActiveTab("members");
    return wrap(
      <TeamAdminClient teamId={TEAM_ID} initialTeam={TEAM} initialMembership={MEMBERSHIP_ADMIN} />,
    );
  }

  it("?tab=goals で TeamMemberGoals が teamId つきでマウントされる", async () => {
    await renderAdminAt("goals");
    await waitFor(() => expect(screen.getByTestId("goals-tab-stub")).toBeInTheDocument());
    expect(mocks.goalsSpy).toHaveBeenCalledWith({ teamId: TEAM_ID });
  });

  it("未知の ?tab= (goalz) では目標タブは出ない", async () => {
    await renderAdminAt("goalz");
    await waitFor(() => expect(screen.getByTestId("members-tab-stub")).toBeInTheDocument());
    expect(screen.queryByTestId("goals-tab-stub")).toBeNull();
    expect(mocks.goalsSpy).not.toHaveBeenCalled();
  });

  it("?tab 無しでは目標タブは出ない", async () => {
    await renderAdminAt();
    await waitFor(() => expect(screen.getByTestId("members-tab-stub")).toBeInTheDocument());
    expect(screen.queryByTestId("goals-tab-stub")).toBeNull();
  });

  it("「目標」タブをクリックすると目標画面に切り替わり、ほかのタブへ戻れる", async () => {
    await renderAdminAt("members");
    await waitFor(() => expect(screen.getByTestId("members-tab-stub")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: messages.teamsAdmin.tabs.goals }));
    await waitFor(() => expect(screen.getByTestId("goals-tab-stub")).toBeInTheDocument());
    expect(screen.queryByTestId("members-tab-stub")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: messages.teamsAdmin.tabs.members }));
    await waitFor(() => expect(screen.getByTestId("members-tab-stub")).toBeInTheDocument());
    expect(screen.queryByTestId("goals-tab-stub")).toBeNull();
  });
});
