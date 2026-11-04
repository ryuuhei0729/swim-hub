// =============================================================================
// TeamDetailView.adminToggle.test.tsx
// =============================================================================
//
// チームタブの中身 (TeamDetailView) の管理者ビュー切替と、チームごとの表示状態の復元。
//
//   [V-04] ヘッダーのスイッチを1回タップすると、スイッチの値・ラベル・管理者要素
//          (管理者専用タブ・PendingMembersSection) が同時に切り替わる
//   [V-08] 管理者ビューの保存値は「表示の好み」で、権限ではない。非管理者のチームで
//          保存値が true のままでも、管理者専用要素は render 結果として一切出ない
//   [RS-1] 管理者ビューの ON/OFF はチームごとに覚え、開き直すと復元する
//          (別チームの ON は引き継がない)
//   [RS-2] 最後に開いていたタブをチームごとに覚え、開き直すと復元する
//   [RS-3] 保存タブが管理者専用でも、メンバー情報の取得前 (管理者か未確定) は members を出し、
//          保存値は書き換えない (取得後にそのタブへ戻る)
//   [HD-1] ヘッダーのチーム名を押すと切替シートを開く。承認待ちでもヘッダーは出る
//
// 実装の内部 (ストアかローカル state か) ではなく、1回の操作で観測できる UI の結果を見る。

import { act, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { harness } from "./teamDetailViewHarness";
import { TeamDetailView } from "../TeamDetailView";
import { useTeamViewStore } from "@/stores/teamViewStore";

const noop = () => {};
function renderView(teamId = "team-1", onOpenSwitcher: () => void = noop) {
  return render(
    <TeamDetailView
      teamId={teamId}
      teamName="一覧上のチーム名"
      onOpenSwitcher={onOpenSwitcher}
      onLeftTeam={noop}
    />,
  );
}

function expectNoAdminElements() {
  expect(screen.queryByRole("switch")).toBeNull();
  expect(screen.queryByText("グループ")).toBeNull();
  expect(screen.queryByText("お知らせ")).toBeNull();
  expect(screen.queryByText("PENDING_MEMBERS_MARKER")).toBeNull();
}

describe("TeamDetailView — 管理者ビュー切替とチームごとの復元", () => {
  beforeEach(() => {
    harness.nonAdminTeamIds.clear();
    harness.membersLoading = false;
    harness.pendingApprovalTeamIds.clear();
    useTeamViewStore.setState({ lastTeamId: null, byTeam: {} });
  });

  it("[V-04] 初期状態は利用者ビュー (管理者専用タブ・PendingMembersSection が非表示)", () => {
    renderView();

    expect(screen.getByText("利用者")).toBeDefined();
    expect(screen.queryByText("グループ")).toBeNull();
    expect(screen.queryByText("お知らせ")).toBeNull();
    expect(screen.queryByText("PENDING_MEMBERS_MARKER")).toBeNull();
  });

  it("[V-04] スイッチを1回タップすると、値・ラベル・管理者要素が同時に切り替わり、もう1回で戻る", () => {
    renderView();

    fireEvent.click(screen.getByRole("switch"));
    expect(screen.getByText("管理者")).toBeDefined();
    expect(screen.queryByText("利用者")).toBeNull();
    expect(screen.getByText("グループ")).toBeDefined();
    expect(screen.getByText("お知らせ")).toBeDefined();
    expect(screen.getByText("PENDING_MEMBERS_MARKER")).toBeDefined();

    fireEvent.click(screen.getByRole("switch"));
    expect(screen.getByText("利用者")).toBeDefined();
    expect(screen.queryByText("グループ")).toBeNull();
    expect(screen.queryByText("PENDING_MEMBERS_MARKER")).toBeNull();
  });

  it("[V-04] 管理者専用タブ (グループ) を開いたまま利用者ビューにすると、メンバータブに戻る", () => {
    renderView();
    fireEvent.click(screen.getByRole("switch"));
    fireEvent.click(screen.getByText("グループ"));
    expect(screen.getByText("GROUPS_MARKER")).toBeDefined();

    fireEvent.click(screen.getByRole("switch"));
    expect(screen.queryByText("GROUPS_MARKER")).toBeNull();
    expect(screen.getByText("MEMBERS_MARKER")).toBeDefined();
  });

  it("[V-08] 非管理者のチームで保存値が true でも、スイッチも管理者要素も出ない", () => {
    harness.nonAdminTeamIds.add("team-2");
    useTeamViewStore.setState({ byTeam: { "team-2": { adminView: true, tab: "groups" } } });

    renderView("team-2");

    expectNoAdminElements();
    expect(screen.getByText("MEMBERS_MARKER")).toBeDefined();
  });

  it("[V-08] 表示中に外部要因で保存値だけが true になっても、非管理者には漏れない", () => {
    harness.nonAdminTeamIds.add("team-2");
    renderView("team-2");

    act(() => {
      useTeamViewStore.getState().setAdminView("team-2", true);
    });

    expectNoAdminElements();
  });

  it("[RS-1] 管理者ビューはチームごとに覚え、開き直すと復元する。別チームの ON は引き継がない", () => {
    const teamA = renderView("team-1");
    fireEvent.click(screen.getByRole("switch"));
    expect(screen.getByText("管理者")).toBeDefined();
    teamA.unmount();

    // 自分が管理者の別チームは、そのチームの保存値 (未設定 = OFF) から始まる
    const teamB = renderView("team-2");
    expect(screen.getByText("利用者")).toBeDefined();
    expect(screen.queryByText("グループ")).toBeNull();
    teamB.unmount();

    // 元のチームに戻ると ON が復元される
    renderView("team-1");
    expect(screen.getByText("管理者")).toBeDefined();
    expect(screen.getByText("グループ")).toBeDefined();
  });

  it("[RS-2] 最後に開いていたタブをチームごとに覚え、開き直すと復元する", () => {
    const teamA = renderView("team-1");
    fireEvent.click(screen.getByText("練習"));
    expect(screen.getByText("PRACTICES_MARKER")).toBeDefined();
    teamA.unmount();

    const teamB = renderView("team-2");
    expect(screen.getByText("MEMBERS_MARKER")).toBeDefined();
    teamB.unmount();

    renderView("team-1");
    expect(screen.getByText("PRACTICES_MARKER")).toBeDefined();
  });

  it("[RS-3] 保存タブが管理者専用でも、メンバー情報の取得前は members を出し、取得後にそのタブへ戻る", () => {
    useTeamViewStore.setState({ byTeam: { "team-1": { adminView: true, tab: "groups" } } });
    harness.membersLoading = true;

    const { rerender } = renderView("team-1");
    expect(screen.getByText("MEMBERS_MARKER")).toBeDefined();
    expect(useTeamViewStore.getState().byTeam["team-1"]?.tab).toBe("groups");

    harness.membersLoading = false;
    rerender(
      <TeamDetailView teamId="team-1" teamName="一覧上のチーム名" onOpenSwitcher={noop} onLeftTeam={noop} />,
    );
    expect(screen.getByText("GROUPS_MARKER")).toBeDefined();
  });

  it("[HD-1] ヘッダーにチーム名を出し、押すと切替シートを開く", () => {
    const onOpenSwitcher = vi.fn();
    const { container } = renderView("team-1", onOpenSwitcher);

    expect(screen.getByText("テストチーム")).toBeDefined();
    const button = container.querySelector('[testid="team-switcher-open"]');
    expect(button).not.toBeNull();
    fireEvent.click(button!);
    expect(onOpenSwitcher).toHaveBeenCalledTimes(1);
  });

  it("[HD-1] 承認待ちのチームでもヘッダー (一覧上のチーム名) を出し、別のチームへ切り替えられる", () => {
    harness.pendingApprovalTeamIds.add("team-3");
    const onOpenSwitcher = vi.fn();
    const { container } = renderView("team-3", onOpenSwitcher);

    expect(screen.getByText("一覧上のチーム名")).toBeDefined();
    expect(screen.getByText("承認待ち")).toBeDefined();
    fireEvent.click(container.querySelector('[testid="team-switcher-open"]')!);
    expect(onOpenSwitcher).toHaveBeenCalledTimes(1);
  });
});
