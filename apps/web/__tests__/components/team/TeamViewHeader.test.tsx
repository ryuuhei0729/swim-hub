/**
 * チーム画面ヘッダー (TeamViewHeader)
 *   - チーム名を押すと所属チームの一覧が開き、選ぶとそのチームへ移る
 *     (最後にそのチームを管理者ビューで見ていて、かつ管理者なら ?view=admin で)
 *   - 承認待ちのチームも選べる (開くと「承認待ち」の案内。swimhub-tasks #101)
 *   - 管理者にだけ「利用者 / 管理者」スイッチを出す。押してもページ遷移はせず onToggleView を呼ぶ
 *     (本文の入れ替えは TeamPageClient の責務。teamPageClientViewToggle.test.tsx で検証)
 *   - お知らせ・チーム設定のアイコンを出す。招待コードはヘッダーに出さない
 *     (チーム設定の中だけ。swimhub-tasks #102)
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import messages from "@apps/shared/messages/ja.json";
import TeamViewHeader from "@/components/team/TeamViewHeader";
import { useTeamViewStore } from "@/stores/team/teamViewStore";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  onToggleView: vi.fn(),
  teams: [] as unknown[],
}));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: mocks.push, replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/contexts", () => ({ useAuth: () => ({ supabase: {} }) }));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@apps/shared/hooks/queries/teams", () => ({
  useTeamsQuery: () => ({ teams: mocks.teams }),
}));
vi.mock("next/dynamic", () => ({ default: () => () => null }));

function membership(teamId: string, name: string, role: string, status = "approved") {
  return { team_id: teamId, role, status, is_active: true, teams: { name } };
}

function renderHeader(props: Partial<React.ComponentProps<typeof TeamViewHeader>> = {}) {
  return render(
    <NextIntlClientProvider locale="ja" messages={messages as unknown as AbstractIntlMessages}>
      <TeamViewHeader
        teamId="team-a"
        teamName="チームA"
        isCurrentUserAdmin={true}
        isAdminView={false}
        onToggleView={mocks.onToggleView}
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  mocks.push.mockReset();
  mocks.onToggleView.mockReset();
  mocks.teams = [
    membership("team-a", "チームA", "admin"),
    membership("team-b", "チームB", "admin"),
    membership("team-c", "チームC", "user"),
    membership("team-p", "申請中チーム", "user", "pending"),
  ];
  useTeamViewStore.setState({ lastTeamId: null, byTeam: {} });
});

describe("TeamViewHeader — チーム切替", () => {
  it("チーム名を押すと所属チームの一覧が開く", async () => {
    renderHeader();
    expect(screen.queryByRole("menu")).toBeNull();
    await userEvent.click(screen.getByTestId("team-switcher-open"));
    expect(screen.getByRole("menu")).toBeTruthy();
    expect(screen.getByTestId("team-switcher-option-team-b")).toBeTruthy();
    expect(screen.getByTestId("team-switcher-create")).toBeTruthy();
    expect(screen.getByTestId("team-switcher-join")).toBeTruthy();
  });

  it("別のチームを選ぶと、既定では利用者ビューで開く", async () => {
    renderHeader();
    await userEvent.click(screen.getByTestId("team-switcher-open"));
    await userEvent.click(screen.getByTestId("team-switcher-option-team-b"));
    expect(mocks.push).toHaveBeenCalledWith("/teams/team-b");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("最後に管理者ビューで見ていた管理者チームは管理者ビューで開く", async () => {
    useTeamViewStore.setState({ byTeam: { "team-b": { adminView: true } } });
    renderHeader();
    await userEvent.click(screen.getByTestId("team-switcher-open"));
    await userEvent.click(screen.getByTestId("team-switcher-option-team-b"));
    expect(mocks.push).toHaveBeenCalledWith("/teams/team-b?view=admin");
  });

  it("管理者でないチームは、保存値が管理者ビューでも利用者ビューで開く", async () => {
    useTeamViewStore.setState({ byTeam: { "team-c": { adminView: true } } });
    renderHeader();
    await userEvent.click(screen.getByTestId("team-switcher-open"));
    await userEvent.click(screen.getByTestId("team-switcher-option-team-c"));
    expect(mocks.push).toHaveBeenCalledWith("/teams/team-c");
  });

  it("表示中のチームを選んでも移動しない", async () => {
    renderHeader();
    await userEvent.click(screen.getByTestId("team-switcher-open"));
    await userEvent.click(screen.getByTestId("team-switcher-option-team-a"));
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("承認待ちのチームも選べ、利用者ビューで開く", async () => {
    // 管理者ビューの保存値があっても、承認待ちのチームは管理者ビューにしない
    useTeamViewStore.setState({ byTeam: { "team-p": { adminView: true } } });
    renderHeader();
    await userEvent.click(screen.getByTestId("team-switcher-open"));
    const option = screen.getByTestId("team-switcher-option-team-p");
    expect(option.textContent).toContain("承認待ち");
    await userEvent.click(option);
    expect(mocks.push).toHaveBeenCalledWith("/teams/team-p");
  });

  it("Escape で一覧が閉じる", async () => {
    renderHeader();
    await userEvent.click(screen.getByTestId("team-switcher-open"));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
  });
});

describe("TeamViewHeader — 利用者 / 管理者 の表示切替", () => {
  it("管理者でなければスイッチを出さない", () => {
    renderHeader({ isCurrentUserAdmin: false });
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("利用者ビューではオフ、管理者ビューではオンで表示する", () => {
    const { unmount } = renderHeader({ isAdminView: false });
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("false");
    expect(screen.getByText("利用者")).toBeTruthy();
    unmount();
    renderHeader({ isAdminView: true });
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText("管理者")).toBeTruthy();
  });

  it("スイッチを押してもページ遷移せず onToggleView を呼ぶ", async () => {
    renderHeader();
    await userEvent.click(screen.getByRole("switch"));
    expect(mocks.onToggleView).toHaveBeenCalledTimes(1);
    expect(mocks.push).not.toHaveBeenCalled();
  });
});

describe("TeamViewHeader — お知らせ・チーム設定・招待コード", () => {
  it("お知らせ・チーム設定のアイコンを押すと、それぞれのハンドラを呼ぶ", async () => {
    const onOpenAnnouncements = vi.fn();
    const onOpenSettings = vi.fn();
    renderHeader({ onOpenAnnouncements, onOpenSettings });
    await userEvent.click(screen.getByRole("button", { name: "お知らせ" }));
    await userEvent.click(screen.getByRole("button", { name: "チーム設定" }));
    expect(onOpenAnnouncements).toHaveBeenCalledTimes(1);
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it("ハンドラが無ければ (承認待ちのチームなど) アイコンを出さない", () => {
    renderHeader();
    expect(screen.queryByTestId("team-header-announcements")).toBeNull();
    expect(screen.queryByTestId("team-header-settings")).toBeNull();
  });

  it("招待コードはヘッダーに出さない", () => {
    renderHeader({ onOpenSettings: vi.fn() });
    expect(screen.queryByTestId("team-invite-code")).toBeNull();
    expect(screen.queryByText("招待コード")).toBeNull();
  });
});
