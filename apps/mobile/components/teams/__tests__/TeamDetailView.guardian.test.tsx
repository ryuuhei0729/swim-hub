// =============================================================================
// TeamDetailView.guardian.test.tsx
// =============================================================================
//
// 保護者アカウント (閲覧専用) でログインしたときのチーム画面 (保護者版)。
//
//   [GD-1] チーム名の右に「保護者版」バッジが出る。チーム切替 (⌄) は出さない
//   [GD-2] タブは メンバー / 予定 / その他 の 3 つ。出欠タブは出さない
//   [GD-3] 端末に「出欠タブ」を覚えていても、保護者版ではメンバータブを出す
//   [GD-4] ヘッダーはお知らせ 🔔 を残し、チーム設定 ⚙ と管理者ビュー切替の代わりにログアウトを出す
//   [GD-5] ログアウトは確認ダイアログを経て signOut を呼ぶ
//   [GD-6] 保護者でないアカウントには保護者版の要素を出さない
// =============================================================================

import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { Alert, type AlertButton } from "react-native";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { harness } from "./teamDetailViewHarness";
import { TeamDetailView } from "../TeamDetailView";
import { useTeamViewStore } from "@/stores/teamViewStore";
import { useAuth } from "@/contexts/AuthProvider";
import { buildAuthContext } from "@/__tests__/helpers/authContext";

const guardianAuth = buildAuthContext({ isGuardian: true });

function renderView(teamId = "team-1") {
  return render(
    <TeamDetailView teamId={teamId} teamName="一覧上のチーム名" onOpenSwitcher={() => {}} />,
  );
}

function queryByTestId(container: HTMLElement, testId: string) {
  return container.querySelector(`[testid="${testId}"]`);
}

describe("TeamDetailView — 保護者版", () => {
  beforeEach(() => {
    harness.nonAdminTeamIds.clear();
    // 保護者は管理者ではない (members にも出ないが、念のため非管理者として返す)
    harness.nonAdminTeamIds.add("team-1");
    harness.membersLoading = false;
    harness.pendingApprovalTeamIds.clear();
    harness.navigate.mockClear();
    useTeamViewStore.setState({ lastTeamId: null, byTeam: {} });
    vi.mocked(useAuth).mockReturnValue(guardianAuth);
  });

  afterEach(() => {
    vi.mocked(useAuth).mockReturnValue(buildAuthContext());
    vi.restoreAllMocks();
  });

  it("[GD-1] チーム名の右に「保護者版」バッジが出て、チーム切替は出ない", () => {
    const { container } = renderView();

    expect(screen.getByText("テストチーム")).toBeDefined();
    expect(screen.getByText("保護者版")).toBeDefined();
    expect(queryByTestId(container, "team-switcher-open")).toBeNull();
  });

  it("[GD-2] タブは メンバー / 予定 / その他 の 3 つで、出欠タブは出ない", () => {
    const { container } = renderView();

    expect(queryByTestId(container, "team-tab-members")).not.toBeNull();
    expect(queryByTestId(container, "team-tab-schedule")).not.toBeNull();
    expect(queryByTestId(container, "team-tab-others")).not.toBeNull();
    expect(queryByTestId(container, "team-tab-attendance")).toBeNull();
    expect(screen.queryByText("出欠")).toBeNull();
  });

  it("[GD-3] 覚えているタブが出欠でも、メンバータブを出す", () => {
    useTeamViewStore.setState({
      lastTeamId: "team-1",
      byTeam: { "team-1": { tab: "attendance", adminView: false } },
    });

    renderView();

    expect(screen.getByText("MEMBERS_MARKER")).toBeDefined();
    expect(screen.queryByText("MY_ATTENDANCE_MARKER")).toBeNull();
    expect(screen.queryByText("ADMIN_ATTENDANCE_MARKER")).toBeNull();
  });

  it("[GD-4] お知らせは残し、チーム設定・管理者ビュー切替の代わりにログアウトを出す", () => {
    const { container } = renderView();

    expect(queryByTestId(container, "team-header-announcements")).not.toBeNull();
    expect(queryByTestId(container, "team-header-settings")).toBeNull();
    expect(screen.queryByRole("switch")).toBeNull();
    expect(queryByTestId(container, "guardian-logout-button")).not.toBeNull();
    expect(screen.getByText("ログアウト")).toBeDefined();
  });

  it("[GD-5] ログアウトを押すと確認ダイアログを出し、ログアウトを選ぶと signOut を呼ぶ", () => {
    const alertSpy = vi.spyOn(Alert, "alert").mockImplementation(() => {});
    const { container } = renderView();

    fireEvent.click(queryByTestId(container, "guardian-logout-button")!);

    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(guardianAuth.signOut).not.toHaveBeenCalled();
    const buttons = alertSpy.mock.calls[0]![2] as AlertButton[];
    const logout = buttons.find((b) => b.style === "destructive");
    logout!.onPress!();
    expect(guardianAuth.signOut).toHaveBeenCalledTimes(1);
  });

  it("[GD-6] 保護者でないアカウントには保護者版の要素を出さない", () => {
    vi.mocked(useAuth).mockReturnValue(buildAuthContext({ isGuardian: false }));
    const { container } = renderView();

    expect(screen.queryByText("保護者版")).toBeNull();
    expect(queryByTestId(container, "guardian-logout-button")).toBeNull();
    expect(queryByTestId(container, "team-tab-attendance")).not.toBeNull();
    expect(queryByTestId(container, "team-header-settings")).not.toBeNull();
  });
});
