/**
 * チーム画面 (TeamPageClient) — 利用者 / 管理者 切替・タブの決め方・重ねる画面・承認待ち
 *
 * 利用者 / 管理者 切替
 *   - スイッチを押すと本文の表示 (isAdminView) だけが変わり、ヘッダーは作り直されない
 *   - ページ遷移はせず、URL の ?view= を history.replaceState で書き換える (タブは載せない)
 *   - タブは両ビューで同じなので、開いているタブのまま切り替える
 *   - 管理者ビュー限定の画面 (メンバーの目標・一括登録) は利用者ビューに戻すと閉じる
 *   - ?view=admin でも、管理者でなければ利用者ビューで開く
 *   - 開いたビューを記録する
 *
 * タブ (swimhub-tasks #100)
 *   - ?tab= も保存されたタブも無ければメンバー
 *   - ?tab= があればそれを優先し、旧タブの ID (practices / rankings / settings 等) は読み替える
 *   - 無ければそのチームで最後に開いていたタブ (チームごと)
 *   - 開いているタブをチームごとに覚える
 *
 * 承認待ち (swimhub-tasks #101)
 *   - 承認待ちのチームでは「承認待ち」の案内と再読み込みボタンを出す
 *
 * 招待コード (swimhub-tasks #102)
 *   - ヘッダーには渡さず、チーム設定の中だけに出す
 */
import React, { useEffect } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import messages from "@apps/shared/messages/ja.json";
import TeamPageClient from "@/app/[locale]/(authenticated)/teams/[teamId]/_client/TeamPageClient";
import { useTeamViewStore } from "@/stores/team/teamViewStore";
import type { TeamTabType } from "@/components/team/teamTabDefs";
import type { TeamMembership, TeamWithMembers } from "@apps/shared/types";

const mocks = vi.hoisted(() => ({
  headerMounts: 0,
  headerProps: null as null | Record<string, unknown>,
  bodyProps: [] as Array<{
    isAdminView: boolean;
    activeTab: string;
    onTabChange: (tab: string) => void;
    onOpenSubScreen: (screen: string) => void;
  }>,
  refresh: vi.fn(),
  search: "",
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(mocks.search),
}));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: mocks.refresh }),
}));
vi.mock("@/components/team/TeamViewHeader", () => ({
  default: function MockTeamViewHeader(props: {
    teamName: string;
    isAdminView: boolean;
    onToggleView: () => void;
    onOpenAnnouncements?: () => void;
    onOpenSettings?: () => void;
  }) {
    mocks.headerProps = props as unknown as Record<string, unknown>;
    useEffect(() => {
      mocks.headerMounts += 1;
    }, []);
    return (
      <div>
        <span data-testid="team-name">{props.teamName}</span>
        <span data-testid="view">{props.isAdminView ? "admin" : "member"}</span>
        <button type="button" onClick={props.onToggleView}>
          toggle
        </button>
        {props.onOpenSettings && (
          <button type="button" onClick={props.onOpenSettings}>
            open-settings
          </button>
        )}
      </div>
    );
  },
}));
// 未対応件数のバッジ (所属チーム一覧・未回答・承認待ちの取得) はこのテストの対象外
vi.mock("@/hooks/useTeamBadgeCounts", () => ({
  useTeamBadgeCounts: () => ({
    total: 0,
    byTeam: {},
    countOf: () => ({ unanswered: 0, pendingMembers: 0 }),
  }),
}));
vi.mock("@/components/team/TeamSubScreenView", () => ({
  default: (props: { screen: string; onBack: () => void }) => (
    <div>
      <span data-testid="sub-screen">{props.screen}</span>
      <button type="button" onClick={props.onBack}>
        back
      </button>
    </div>
  ),
}));
vi.mock("@/app/[locale]/(authenticated)/teams/[teamId]/_client/TeamDetailClient", () => ({
  default: (props: (typeof mocks.bodyProps)[number]) => {
    mocks.bodyProps.push(props);
    return (
      <div data-testid="body">
        <span data-testid="active-tab">{props.activeTab}</span>
        <span data-testid="body-view">{props.isAdminView ? "admin" : "member"}</span>
      </div>
    );
  },
}));

const team = {
  id: "team-heron",
  name: "サギ水泳部",
  description: null,
  invite_code: "HERON123",
  team_memberships: [],
} as unknown as TeamWithMembers;

function membershipWithRole(role: string) {
  return {
    team_id: "team-heron",
    user_id: "u1",
    role,
    status: "approved",
    is_active: true,
  } as unknown as TeamMembership;
}

function renderPage(
  role: string | null,
  initialAdminView: boolean,
  options: { initialTab?: string; pendingTeamName?: string | null } = {},
) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="ja" messages={messages as unknown as AbstractIntlMessages}>
        <TeamPageClient
          teamId="team-heron"
          initialTeam={options.pendingTeamName !== undefined ? null : team}
          initialMembership={role ? membershipWithRole(role) : null}
          pendingTeamName={options.pendingTeamName}
          initialTab={options.initialTab}
          initialAdminView={initialAdminView}
        />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

const lastBody = () => mocks.bodyProps.at(-1)!;
const changeTab = (tab: TeamTabType) => act(() => lastBody().onTabChange(tab));

beforeEach(() => {
  mocks.headerMounts = 0;
  mocks.headerProps = null;
  mocks.bodyProps = [];
  mocks.refresh.mockReset();
  mocks.search = "";
  useTeamViewStore.setState({ lastTeamId: null, byTeam: {} });
  window.history.replaceState(null, "", "/ja/teams/team-heron");
});

describe("TeamPageClient — 利用者 / 管理者 切替", () => {
  it("スイッチで本文の表示だけが切り替わり、ヘッダーはマウントし直さない", () => {
    renderPage("admin", false);
    expect(screen.getByTestId("body-view").textContent).toBe("member");
    expect(screen.getByTestId("view").textContent).toBe("member");

    act(() => screen.getByText("toggle").click());
    expect(screen.getByTestId("body-view").textContent).toBe("admin");
    expect(screen.getByTestId("view").textContent).toBe("admin");

    act(() => screen.getByText("toggle").click());
    expect(screen.getByTestId("body-view").textContent).toBe("member");
    expect(mocks.headerMounts).toBe(1);
  });

  it("ページ遷移せず URL の ?view= を書き換え、開いているタブのまま切り替える", () => {
    renderPage("admin", false);
    changeTab("schedule");

    act(() => screen.getByText("toggle").click());
    expect(window.location.pathname).toBe("/ja/teams/team-heron");
    expect(window.location.search).toBe("?view=admin");
    expect(screen.getByTestId("active-tab").textContent).toBe("schedule");
  });

  it("管理者ビュー限定の画面 (メンバーの目標) は、利用者ビューに戻すと閉じる", () => {
    renderPage("admin", true);
    act(() => lastBody().onOpenSubScreen("goals"));
    expect(screen.getByTestId("sub-screen").textContent).toBe("goals");

    act(() => screen.getByText("toggle").click());
    expect(screen.queryByTestId("sub-screen")).toBeNull();
    expect(screen.getByTestId("body")).toBeTruthy();
  });

  it("?view=admin でも管理者でなければ利用者ビューで開く", () => {
    renderPage("user", true);
    expect(screen.getByTestId("body-view").textContent).toBe("member");
  });

  it("開いたビューを記録する", () => {
    renderPage("admin", true);
    expect(useTeamViewStore.getState().byTeam["team-heron"]?.adminView).toBe(true);
    act(() => screen.getByText("toggle").click());
    expect(useTeamViewStore.getState().byTeam["team-heron"]?.adminView).toBe(false);
    expect(useTeamViewStore.getState().lastTeamId).toBe("team-heron");
  });
});

describe("TeamPageClient — タブ", () => {
  it("?tab= も保存されたタブも無ければメンバーで開く", () => {
    renderPage("user", false);
    expect(screen.getByTestId("active-tab").textContent).toBe("members");
  });

  it("そのチームで最後に開いていたタブで開く (チームごと)", () => {
    useTeamViewStore.setState({
      byTeam: { "team-heron": { tab: "attendance" }, "team-other": { tab: "others" } },
    });
    renderPage("user", false);
    expect(screen.getByTestId("active-tab").textContent).toBe("attendance");
  });

  it("?tab= があれば保存されたタブより優先する", () => {
    useTeamViewStore.setState({ byTeam: { "team-heron": { tab: "attendance" } } });
    renderPage("user", false, { initialTab: "schedule" });
    expect(screen.getByTestId("active-tab").textContent).toBe("schedule");
  });

  it("旧タブの ?tab= は新しいタブへ読み替える", () => {
    const { unmount } = renderPage("user", false, { initialTab: "practices" });
    expect(screen.getByTestId("active-tab").textContent).toBe("schedule");
    unmount();

    renderPage("user", false, { initialTab: "competitions" });
    expect(screen.getByTestId("active-tab").textContent).toBe("schedule");
  });

  it("旧タブの ?tab=rankings / ?tab=settings は、その画面を重ねて開く", () => {
    const { unmount } = renderPage("user", false, { initialTab: "rankings" });
    expect(screen.getByTestId("sub-screen").textContent).toBe("rankings");
    act(() => screen.getByText("back").click());
    expect(screen.getByTestId("active-tab").textContent).toBe("others");
    unmount();

    renderPage("user", false, { initialTab: "settings" });
    expect(screen.getByTestId("sub-screen").textContent).toBe("settings");
  });

  it("開いているタブをチームごとに覚える", () => {
    renderPage("user", false);
    changeTab("schedule");
    expect(useTeamViewStore.getState().byTeam["team-heron"]?.tab).toBe("schedule");
    changeTab("others");
    expect(useTeamViewStore.getState().byTeam["team-heron"]?.tab).toBe("others");
  });

  it("ヘッダーのチーム設定で設定画面を重ね、「戻る」で閉じる", () => {
    renderPage("user", false);
    act(() => screen.getByText("open-settings").click());
    expect(screen.getByTestId("sub-screen").textContent).toBe("settings");
    act(() => screen.getByText("back").click());
    expect(screen.queryByTestId("sub-screen")).toBeNull();
  });

  it("招待コードはヘッダーに渡さない", () => {
    renderPage("user", false);
    expect(mocks.headerProps).not.toHaveProperty("inviteCode");
  });
});

describe("TeamPageClient — 承認待ちのチーム", () => {
  it("「承認待ち」の案内と再読み込みボタンを出し、タブ・お知らせ・設定は出さない", () => {
    renderPage(null, false, { pendingTeamName: "申請中チーム" });
    expect(screen.getByTestId("team-pending-approval")).toBeTruthy();
    expect(screen.getByText("承認待ち")).toBeTruthy();
    expect(screen.getByTestId("team-name").textContent).toBe("申請中チーム");
    expect(screen.queryByTestId("body")).toBeNull();
    expect(screen.queryByText("open-settings")).toBeNull();

    act(() => screen.getByTestId("team-pending-retry").click());
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("承認待ちのチームも最後に開いたチームとして記録する", () => {
    renderPage(null, false, { pendingTeamName: "申請中チーム" });
    expect(useTeamViewStore.getState().lastTeamId).toBe("team-heron");
  });
});
