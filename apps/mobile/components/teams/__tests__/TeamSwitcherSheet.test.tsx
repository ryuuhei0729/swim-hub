// =============================================================================
// TeamSwitcherSheet.test.tsx - チームタブのチーム切替シート
// =============================================================================
//   [SW-1] 承認済み・承認待ちのチームを並べ、選択中のチームにチェックマークを付ける
//   [SW-2] 承認待ちには「承認待ち」バッジ、管理者のチームには「管理者」バッジを出す
//   [SW-3] チームを押すと onSelect(team_id)、作成・参加ボタンはそれぞれのコールバックを呼ぶ

import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import type { TeamMembershipWithUser } from "@swim-hub/shared/types";
import { TeamSwitcherSheet } from "../TeamSwitcherSheet";

function membership(
  teamId: string,
  overrides: Partial<TeamMembershipWithUser> = {},
): TeamMembershipWithUser {
  return {
    id: `m-${teamId}`,
    team_id: teamId,
    user_id: "user-1",
    role: "member",
    status: "approved",
    is_active: true,
    teams: { id: teamId, name: `チーム-${teamId}`, description: null, invite_code: null },
    ...overrides,
  } as unknown as TeamMembershipWithUser;
}

function renderSheet(overrides: Partial<React.ComponentProps<typeof TeamSwitcherSheet>> = {}) {
  const props: React.ComponentProps<typeof TeamSwitcherSheet> = {
    visible: true,
    onClose: vi.fn(),
    approvedTeams: [membership("alpha", { role: "admin" }), membership("beta")],
    pendingTeams: [membership("gamma", { status: "pending", is_active: null })],
    selectedTeamId: "beta",
    onSelect: vi.fn(),
    onCreate: vi.fn(),
    onJoin: vi.fn(),
    ...overrides,
  };
  const utils = render(<TeamSwitcherSheet {...props} />);
  const option = (teamId: string) =>
    utils.container.querySelector(`[testid="team-switcher-option-${teamId}"]`) as HTMLElement | null;
  return { ...utils, props, option };
}

describe("TeamSwitcherSheet", () => {
  it("[SW-1] 承認済み・承認待ちのチームを並べ、選択中のチームだけチェックマークを付ける", () => {
    const { option } = renderSheet();

    expect(screen.getByText("チーム-alpha")).toBeDefined();
    expect(screen.getByText("チーム-beta")).toBeDefined();
    expect(screen.getByText("チーム-gamma")).toBeDefined();
    // 選択中の行にだけチェックマークを出す
    expect(option("beta")?.querySelector('[data-testid="icon-check"]')).not.toBeNull();
    expect(option("alpha")?.querySelector('[data-testid="icon-check"]')).toBeNull();
    expect(option("gamma")?.querySelector('[data-testid="icon-check"]')).toBeNull();
  });

  it("[SW-2] 承認待ちには「承認待ち」、管理者のチームには「管理者」のバッジを出す", () => {
    const { option } = renderSheet();

    expect(option("gamma")?.textContent).toContain("承認待ち");
    expect(option("alpha")?.textContent).toContain("管理者");
    expect(option("beta")?.textContent).not.toContain("管理者");
  });

  it("[SW-3] チームを押すと onSelect、作成・参加はそれぞれのコールバックを呼ぶ", () => {
    const { option, props, container } = renderSheet();

    fireEvent.click(option("alpha") as HTMLElement);
    expect(props.onSelect).toHaveBeenCalledWith("alpha");

    fireEvent.click(container.querySelector('[testid="team-switcher-create"]') as HTMLElement);
    expect(props.onCreate).toHaveBeenCalledTimes(1);
    expect(props.onJoin).not.toHaveBeenCalled();

    fireEvent.click(container.querySelector('[testid="team-switcher-join"]') as HTMLElement);
    expect(props.onJoin).toHaveBeenCalledTimes(1);
  });
});
