// =============================================================================
// TeamDetailView.adminToggle.test.tsx
// =============================================================================
//
// チームタブの中身 (TeamDetailView) のヘッダー・管理者ビュー切替と、チームごとの表示状態の復元。
//
//   [V-04] ヘッダーのスイッチを1回タップすると、スイッチの値・ラベル・管理者要素
//          (メンバータブの「メンバー / グループ」切替・PendingMembersSection) が同時に切り替わり、
//          「〜ビューに切り替えました」のトーストが出る。タブ (4 つ) の数・並びは変わらない
//   [V-08] 管理者ビューの保存値は「表示の好み」で、権限ではない。非管理者のチームで
//          保存値が true のままでも、管理者専用要素は render 結果として一切出ない
//   [RS-1] 管理者ビューの ON/OFF はチームごとに覚え、開き直すと復元する
//          (別チームの ON は引き継がない)
//   [RS-2] 最後に開いていたタブをチームごとに覚え、開き直すと復元する
//   [TB-1] 予定・出欠・その他タブの中身は管理者ビューかどうかで切り替わる
//   [HD-1] ヘッダーのチーム名を押すと切替シートを開く。承認待ちでもヘッダーは出る
//   [HD-2] ヘッダーの 🔔 / ⚙ はお知らせ・チーム設定の画面を開く (管理者以外にも出す)
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
    <TeamDetailView teamId={teamId} teamName="一覧上のチーム名" onOpenSwitcher={onOpenSwitcher} />,
  );
}

const TAB_LABELS = ["メンバー", "予定", "出欠", "その他"];

function expectFourTabs() {
  for (const label of TAB_LABELS) {
    // 「メンバー」は管理者ビューの表示切替にも出るので 1 つ以上で見る
    expect(screen.getAllByText(label).length).toBeGreaterThan(0);
  }
}

function expectNoAdminElements() {
  expect(screen.queryByRole("switch")).toBeNull();
  expect(screen.queryByText("グループ")).toBeNull();
  expect(screen.queryByText("PENDING_MEMBERS_MARKER")).toBeNull();
}

function byTestId(container: HTMLElement, testId: string) {
  const el = container.querySelector(`[testid="${testId}"]`);
  expect(el).not.toBeNull();
  return el!;
}

describe("TeamDetailView — 管理者ビュー切替とチームごとの復元", () => {
  beforeEach(() => {
    harness.nonAdminTeamIds.clear();
    harness.membersLoading = false;
    harness.pendingApprovalTeamIds.clear();
    harness.navigate.mockClear();
    harness.toastSuccess.mockClear();
    useTeamViewStore.setState({ lastTeamId: null, byTeam: {} });
  });

  it("[V-04] 初期状態は利用者ビュー (グループ切替・PendingMembersSection が非表示)", () => {
    renderView();

    expect(screen.getByText("利用者")).toBeDefined();
    expectFourTabs();
    expect(screen.queryByText("グループ")).toBeNull();
    expect(screen.queryByText("PENDING_MEMBERS_MARKER")).toBeNull();
  });

  it("[V-04] スイッチを1回タップすると、値・ラベル・管理者要素・トーストが同時に切り替わり、もう1回で戻る", () => {
    renderView();

    fireEvent.click(screen.getByRole("switch"));
    expect(screen.getByText("管理者")).toBeDefined();
    expect(screen.queryByText("利用者")).toBeNull();
    expect(screen.getByText("グループ")).toBeDefined();
    expect(screen.getByText("PENDING_MEMBERS_MARKER")).toBeDefined();
    expect(harness.toastSuccess).toHaveBeenLastCalledWith("管理者ビューに切り替えました");
    // タブは管理者ビューでも 4 つのまま
    expectFourTabs();

    fireEvent.click(screen.getByRole("switch"));
    expect(screen.getByText("利用者")).toBeDefined();
    expect(screen.queryByText("グループ")).toBeNull();
    expect(screen.queryByText("PENDING_MEMBERS_MARKER")).toBeNull();
    expect(harness.toastSuccess).toHaveBeenLastCalledWith("利用者ビューに切り替えました");
    expect(harness.toastSuccess).toHaveBeenCalledTimes(2);
  });

  it("[V-04] グループ管理を開いたまま利用者ビューにすると、メンバー表に戻る", () => {
    renderView();
    fireEvent.click(screen.getByRole("switch"));
    fireEvent.click(screen.getByText("グループ"));
    expect(screen.getByText("GROUPS_MARKER")).toBeDefined();
    expect(screen.queryByText("MEMBERS_MARKER")).toBeNull();

    fireEvent.click(screen.getByRole("switch"));
    expect(screen.queryByText("GROUPS_MARKER")).toBeNull();
    expect(screen.getByText("MEMBERS_MARKER")).toBeDefined();
  });

  it("[V-08] 非管理者のチームで保存値が true でも、スイッチも管理者要素も出ない", () => {
    harness.nonAdminTeamIds.add("team-2");
    useTeamViewStore.setState({ byTeam: { "team-2": { adminView: true, tab: "members" } } });

    renderView("team-2");

    expectNoAdminElements();
    expectFourTabs();
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
    fireEvent.click(screen.getByText("予定"));
    expect(screen.getByText("SCHEDULE_MARKER:user")).toBeDefined();
    teamA.unmount();

    const teamB = renderView("team-2");
    expect(screen.getByText("MEMBERS_MARKER")).toBeDefined();
    teamB.unmount();

    renderView("team-1");
    expect(screen.getByText("SCHEDULE_MARKER:user")).toBeDefined();
  });

  it("[TB-1] 予定・出欠・その他の中身は管理者ビューかどうかで切り替わる", () => {
    renderView();

    fireEvent.click(screen.getByText("予定"));
    expect(screen.getByText("SCHEDULE_MARKER:user")).toBeDefined();
    fireEvent.click(screen.getByText("出欠"));
    expect(screen.getByText("MY_ATTENDANCE_MARKER")).toBeDefined();
    fireEvent.click(screen.getByText("その他"));
    expect(screen.getByText("OTHERS_MARKER:user")).toBeDefined();

    fireEvent.click(screen.getByRole("switch"));
    expect(screen.getByText("OTHERS_MARKER:admin")).toBeDefined();
    fireEvent.click(screen.getByText("出欠"));
    expect(screen.getByText("ADMIN_ATTENDANCE_MARKER")).toBeDefined();
    fireEvent.click(screen.getByText("予定"));
    expect(screen.getByText("SCHEDULE_MARKER:admin")).toBeDefined();
  });

  it("[HD-1] ヘッダーにチーム名を出し、押すと切替シートを開く", () => {
    const onOpenSwitcher = vi.fn();
    const { container } = renderView("team-1", onOpenSwitcher);

    expect(screen.getByText("テストチーム")).toBeDefined();
    fireEvent.click(byTestId(container, "team-switcher-open"));
    expect(onOpenSwitcher).toHaveBeenCalledTimes(1);
  });

  it("[HD-1] 承認待ちのチームでもヘッダー (一覧上のチーム名) を出し、別のチームへ切り替えられる", () => {
    harness.pendingApprovalTeamIds.add("team-3");
    const onOpenSwitcher = vi.fn();
    const { container } = renderView("team-3", onOpenSwitcher);

    expect(screen.getByText("一覧上のチーム名")).toBeDefined();
    expect(screen.getByText("承認待ち")).toBeDefined();
    fireEvent.click(byTestId(container, "team-switcher-open"));
    expect(onOpenSwitcher).toHaveBeenCalledTimes(1);
  });

  it("[HD-2] 管理者でなくても 🔔 / ⚙ が出て、お知らせ・チーム設定の画面を teamId つきで開く", () => {
    harness.nonAdminTeamIds.add("team-2");
    const { container } = renderView("team-2");

    fireEvent.click(byTestId(container, "team-header-announcements"));
    expect(harness.navigate).toHaveBeenLastCalledWith("TeamAnnouncements", { teamId: "team-2" });

    fireEvent.click(byTestId(container, "team-header-settings"));
    expect(harness.navigate).toHaveBeenLastCalledWith("TeamSettings", { teamId: "team-2" });
  });
});
