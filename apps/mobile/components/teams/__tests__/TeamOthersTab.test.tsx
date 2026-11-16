// =============================================================================
// TeamOthersTab.test.tsx - チームタブ「その他」
// =============================================================================
//   [OT-1] ランキングのカードは全員に出る。メンバーの目標は管理者ビューのときだけ
//   [OT-2] カードを押すと、その画面を teamId つきで開く

import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigate = vi.hoisted(() => vi.fn());
vi.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate, goBack: vi.fn() }),
}));

import { TeamOthersTab } from "../TeamOthersTab";

describe("TeamOthersTab", () => {
  beforeEach(() => {
    navigate.mockClear();
  });

  it("[OT-1] 利用者ビュー: ランキングだけ", () => {
    render(<TeamOthersTab teamId="team-1" isAdminView={false} />);

    expect(screen.getByText("ランキング")).toBeTruthy();
    expect(screen.queryByText("メンバーの目標")).toBeNull();
  });

  it("[OT-1] 管理者ビュー: ランキングとメンバーの目標", () => {
    render(<TeamOthersTab teamId="team-1" isAdminView />);

    expect(screen.getByText("ランキング")).toBeTruthy();
    expect(screen.getByText("メンバーの目標")).toBeTruthy();
  });

  it("[OT-2] カードを押すとその画面を teamId つきで開く", () => {
    render(<TeamOthersTab teamId="team-9" isAdminView />);

    fireEvent.click(screen.getByText("ランキング"));
    expect(navigate).toHaveBeenLastCalledWith("TeamRankings", { teamId: "team-9" });

    fireEvent.click(screen.getByText("メンバーの目標"));
    expect(navigate).toHaveBeenLastCalledWith("TeamMemberGoals", { teamId: "team-9" });
  });
});
