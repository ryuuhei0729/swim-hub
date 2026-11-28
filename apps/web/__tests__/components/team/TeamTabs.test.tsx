/**
 * チーム画面のタブ構成 (swimhub-tasks #100。mobile の teamTabDefs / TeamTabs / TeamOthersTab と同じ)
 *   - タブは メンバー / 予定 / 出欠 / その他 の 4 つで、管理者ビューでも変えない
 *   - 承認待ちの件数はメンバータブにバッジで出す
 *   - その他タブ: ランキングは全員、メンバーの目標は管理者ビューだけ
 *   - 旧タブの ID は新しいタブ (と重ねる画面) へ読み替える
 */
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import messages from "@apps/shared/messages/ja.json";
import TeamTabs from "@/components/team/TeamTabs";
import TeamOthersTab from "@/components/team/TeamOthersTab";
import {
  DEFAULT_TEAM_TAB,
  TEAM_TAB_IDS,
  isTeamTabType,
  resolveTeamTabParam,
} from "@/components/team/teamTabDefs";

function withI18n(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="ja" messages={messages as unknown as AbstractIntlMessages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("teamTabDefs", () => {
  it("タブは メンバー / 予定 / 出欠 / その他 の 4 つで、最初はメンバー", () => {
    expect(TEAM_TAB_IDS).toEqual(["members", "schedule", "attendance", "others"]);
    expect(DEFAULT_TEAM_TAB).toBe("members");
  });

  it("isTeamTabType は現在のタブだけを通す", () => {
    expect(isTeamTabType("schedule")).toBe(true);
    expect(isTeamTabType("practices")).toBe(false);
    expect(isTeamTabType("constructor")).toBe(false);
    expect(isTeamTabType(undefined)).toBe(false);
  });

  it("旧タブの ID を新しいタブと重ねる画面へ読み替える", () => {
    expect(resolveTeamTabParam("members")).toEqual({ tab: "members" });
    expect(resolveTeamTabParam("practices")).toEqual({ tab: "schedule" });
    expect(resolveTeamTabParam("competitions")).toEqual({ tab: "schedule" });
    expect(resolveTeamTabParam("groups")).toEqual({ tab: "members" });
    expect(resolveTeamTabParam("bulk-register")).toEqual({
      tab: "schedule",
      subScreen: "bulkRegister",
    });
    expect(resolveTeamTabParam("rankings")).toEqual({ tab: "others", subScreen: "rankings" });
    expect(resolveTeamTabParam("goals")).toEqual({ tab: "others", subScreen: "goals" });
    expect(resolveTeamTabParam("settings")).toEqual({ tab: "members", subScreen: "settings" });
    expect(resolveTeamTabParam("announcements")).toEqual({
      tab: "members",
      subScreen: "announcements",
    });
    // 近い綴り・プロトタイプ上のキーは通さない
    expect(resolveTeamTabParam("ranking")).toBeUndefined();
    expect(resolveTeamTabParam("constructor")).toBeUndefined();
    expect(resolveTeamTabParam(null)).toBeUndefined();
  });
});

describe("TeamTabs", () => {
  it("4 つのタブを順に並べ、押すと onTabChange を呼ぶ", async () => {
    const onTabChange = vi.fn();
    withI18n(<TeamTabs activeTab="members" onTabChange={onTabChange} />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual(["メンバー", "予定", "出欠", "その他"]);
    expect(screen.getByTestId("team-tab-members").getAttribute("aria-selected")).toBe("true");

    await userEvent.click(screen.getByTestId("team-tab-schedule"));
    expect(onTabChange).toHaveBeenCalledWith("schedule");
  });

  it("承認待ちの件数はメンバータブにだけバッジで出す", () => {
    withI18n(<TeamTabs activeTab="members" onTabChange={vi.fn()} pendingCount={3} />);
    expect(screen.getByTestId("team-tab-members").textContent).toContain("3");
    expect(screen.getByTestId("team-tab-members").getAttribute("aria-label")).toContain("3");
    expect(screen.getByTestId("team-tab-schedule").textContent).toBe("予定");
  });

  it("出欠の未回答の件数は出欠タブにバッジで出す (swimhub-tasks #73)", () => {
    withI18n(<TeamTabs activeTab="members" onTabChange={vi.fn()} attendanceCount={120} />);
    expect(screen.getByTestId("team-tab-attendance").textContent).toContain("99+");
    expect(screen.getByTestId("team-tab-attendance").getAttribute("aria-label")).toContain("120");
    expect(screen.getByTestId("team-tab-members").textContent).toBe("メンバー");
  });
});

describe("TeamOthersTab", () => {
  it("利用者ビューではランキングだけを出す", async () => {
    const onOpen = vi.fn();
    withI18n(<TeamOthersTab isAdminView={false} onOpen={onOpen} />);
    expect(screen.getByTestId("team-others-card-rankings")).toBeTruthy();
    expect(screen.queryByTestId("team-others-card-goals")).toBeNull();
    await userEvent.click(screen.getByTestId("team-others-card-rankings"));
    expect(onOpen).toHaveBeenCalledWith("rankings");
  });

  it("管理者ビューではメンバーの目標も出す", async () => {
    const onOpen = vi.fn();
    withI18n(<TeamOthersTab isAdminView={true} onOpen={onOpen} />);
    await userEvent.click(screen.getByTestId("team-others-card-goals"));
    expect(onOpen).toHaveBeenCalledWith("goals");
  });
});
