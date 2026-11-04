// TeamDetailView の goals タブ — Sprint Contract v1
//   管理者ビュー OFF: タブも内容も出ない (保存タブが goals でも描画されない)
//   管理者ビュー ON : タブが出て、選ぶと TeamMemberGoalsTab が teamId つきでマウントされる
import { act, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { harness } from "./teamDetailViewHarness";
import { TeamDetailView } from "../TeamDetailView";
import { useTeamViewStore } from "@/stores/teamViewStore";

const noop = () => {};
function renderView() {
  return render(
    <TeamDetailView teamId="team-1" teamName="テストチーム" onOpenSwitcher={noop} onLeftTeam={noop} />,
  );
}
// persist の set は保存の Promise を返すので、act には値を返さないブロックで渡す
const setAdminView = (value: boolean) =>
  act(() => {
    useTeamViewStore.getState().setAdminView("team-1", value);
  });

describe("TeamDetailView — goals タブ", () => {
  beforeEach(() => {
    harness.nonAdminTeamIds.clear();
    harness.membersLoading = false;
    harness.pendingApprovalTeamIds.clear();
    useTeamViewStore.setState({ lastTeamId: null, byTeam: {} });
  });

  it("管理者ビュー OFF: 「目標」タブが無く、保存タブが goals でも中身を描画しない", () => {
    useTeamViewStore.setState({ byTeam: { "team-1": { tab: "goals" } } });
    renderView();
    expect(screen.queryByText("目標")).toBeNull();
    expect(screen.queryByText("GOALS_TAB_MARKER")).toBeNull();
    expect(harness.goalsSpy).not.toHaveBeenCalled();
  });

  it("非管理者が保存値を ON にしても出ない", () => {
    harness.nonAdminTeamIds.add("team-1");
    useTeamViewStore.setState({ byTeam: { "team-1": { tab: "goals" } } });
    renderView();
    setAdminView(true);
    expect(screen.queryByText("目標")).toBeNull();
    expect(screen.queryByText("GOALS_TAB_MARKER")).toBeNull();
  });

  it("管理者ビュー ON: タブをタップすると TeamMemberGoalsTab が teamId つきで描画される", () => {
    renderView();
    setAdminView(true);
    expect(screen.queryByText("GOALS_TAB_MARKER")).toBeNull();
    fireEvent.click(screen.getByText("目標"));
    expect(screen.getByText("GOALS_TAB_MARKER")).toBeTruthy();
    expect(harness.goalsSpy).toHaveBeenCalledWith(expect.objectContaining({ teamId: "team-1" }));
  });

  it("goals タブ表示中に管理者ビューを OFF にすると内容もタブも消える", () => {
    renderView();
    setAdminView(true);
    fireEvent.click(screen.getByText("目標"));
    expect(screen.getByText("GOALS_TAB_MARKER")).toBeTruthy();
    setAdminView(false);
    expect(screen.queryByText("GOALS_TAB_MARKER")).toBeNull();
    expect(screen.queryByText("目標")).toBeNull();
  });
});
