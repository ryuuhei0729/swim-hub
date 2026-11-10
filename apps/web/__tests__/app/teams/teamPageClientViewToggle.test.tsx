/**
 * チーム画面 (TeamPageClient) の 利用者 / 管理者 切替
 *   - スイッチを押すと本文 (TeamDetailClient ⇄ TeamAdminClient) だけが入れ替わり、
 *     ヘッダーは作り直されない (マウントし直さない)
 *   - ページ遷移はせず、URL の ?view= / ?tab= を history.replaceState で書き換える
 *   - 切替先にあるタブは引き継ぎ、無いタブ (管理者専用) は既定タブに倒す
 *   - ?view=admin でも、管理者でなければ利用者ビューで開く
 *   - 開いたビューを記録する (サイドバー・チーム切替で次もそのビューで開く)
 */
import React, { useEffect } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import messages from "@apps/shared/messages/ja.json";
import TeamPageClient from "@/app/[locale]/(authenticated)/teams/[teamId]/_client/TeamPageClient";
import { useTeamViewStore } from "@/stores/team/teamViewStore";
import { useTeamDetailStore } from "@/stores/form/teamDetailStore";
import { useTeamAdminStore } from "@/stores/form/teamAdminStore";
import type { TeamMembership, TeamWithMembers } from "@apps/shared/types";

const mocks = vi.hoisted(() => ({
  headerMounts: 0,
  memberBodyProps: [] as Array<{ initialTab?: string }>,
  adminBodyProps: [] as Array<{ initialTab?: string }>,
}));

vi.mock("@/components/team/TeamViewHeader", () => ({
  default: function MockTeamViewHeader(props: {
    isAdminView: boolean;
    onToggleView: () => void;
    inviteCode?: string;
  }) {
    useEffect(() => {
      mocks.headerMounts += 1;
    }, []);
    return (
      <div>
        <span data-testid="view">{props.isAdminView ? "admin" : "member"}</span>
        <span data-testid="invite">{props.inviteCode}</span>
        <button type="button" onClick={props.onToggleView}>
          toggle
        </button>
      </div>
    );
  },
}));
vi.mock("@/app/[locale]/(authenticated)/teams/[teamId]/_client/TeamDetailClient", () => ({
  default: (props: { initialTab?: string }) => {
    mocks.memberBodyProps.push(props);
    return <div data-testid="member-body" />;
  },
}));
vi.mock("@/app/[locale]/(authenticated)/teams/[teamId]/_client/TeamAdminClient", () => ({
  default: (props: { initialTab?: string }) => {
    mocks.adminBodyProps.push(props);
    return <div data-testid="admin-body" />;
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
  return { team_id: "team-heron", user_id: "u1", role, status: "approved", is_active: true } as unknown as TeamMembership;
}

function renderPage(role: string, initialAdminView: boolean, initialTab?: string) {
  return render(
    <NextIntlClientProvider locale="ja" messages={messages as unknown as AbstractIntlMessages}>
      <TeamPageClient
        teamId="team-heron"
        initialTeam={team}
        initialMembership={membershipWithRole(role)}
        initialTab={initialTab}
        initialAdminView={initialAdminView}
      />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  mocks.headerMounts = 0;
  mocks.memberBodyProps = [];
  mocks.adminBodyProps = [];
  useTeamViewStore.setState({ lastTeamId: null, byTeam: {} });
  useTeamDetailStore.getState().reset();
  useTeamAdminStore.getState().reset();
  window.history.replaceState(null, "", "/ja/teams/team-heron");
});

describe("TeamPageClient — 利用者 / 管理者 切替", () => {
  it("スイッチで本文だけが入れ替わり、ヘッダーはマウントし直さない", () => {
    renderPage("admin", false);
    expect(screen.getByTestId("member-body")).toBeTruthy();
    expect(screen.getByTestId("view").textContent).toBe("member");

    act(() => screen.getByText("toggle").click());
    expect(screen.getByTestId("admin-body")).toBeTruthy();
    expect(screen.queryByTestId("member-body")).toBeNull();
    expect(screen.getByTestId("view").textContent).toBe("admin");

    act(() => screen.getByText("toggle").click());
    expect(screen.getByTestId("member-body")).toBeTruthy();
    expect(mocks.headerMounts).toBe(1);
  });

  it("ページ遷移せず URL の ?view= と ?tab= を書き換え、タブを引き継ぐ", () => {
    renderPage("admin", false);
    act(() => useTeamDetailStore.getState().setActiveTab("practices"));

    act(() => screen.getByText("toggle").click());
    expect(window.location.pathname).toBe("/ja/teams/team-heron");
    expect(window.location.search).toBe("?view=admin&tab=practices");
    expect(mocks.adminBodyProps.at(-1)?.initialTab).toBe("practices");
  });

  it("管理者専用タブから利用者ビューへ切り替えると既定タブに倒す", () => {
    renderPage("admin", true, "bulk-register");
    act(() => useTeamAdminStore.getState().setActiveTab("bulk-register"));

    act(() => screen.getByText("toggle").click());
    expect(window.location.search).toBe("");
    expect(mocks.memberBodyProps.at(-1)?.initialTab).toBeUndefined();
  });

  it("?view=admin でも管理者でなければ利用者ビューで開く", () => {
    renderPage("user", true);
    expect(screen.getByTestId("member-body")).toBeTruthy();
    expect(screen.queryByTestId("admin-body")).toBeNull();
  });

  it("どちらのビューでも招待コードをヘッダーに渡す", () => {
    renderPage("user", false);
    expect(screen.getByTestId("invite").textContent).toBe("HERON123");
  });

  it("開いたビューを記録する", () => {
    renderPage("admin", true);
    expect(useTeamViewStore.getState().byTeam["team-heron"]?.adminView).toBe(true);
    act(() => screen.getByText("toggle").click());
    expect(useTeamViewStore.getState().byTeam["team-heron"]?.adminView).toBe(false);
    expect(useTeamViewStore.getState().lastTeamId).toBe("team-heron");
  });
});
