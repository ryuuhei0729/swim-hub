// =============================================================================
// TeamTabs.test.tsx - mobile チーム詳細タブ
// =============================================================================
//
// タブは「メンバー / 予定 / 出欠 / その他」の 4 つで固定し、管理者ビューでも数・並びを変えない。
// (以前は管理者ビューで 7→9 タブに増え、横スクロールしないと右端が見えなかった)
//
// タブ数は getAllByRole("button") の件数で厳密一致させ、ラベルの並びまで固定する
// (増減・並べ替えの両方を検出する)。
// 旧タブ ID (端末に保存済みの「最後に開いていたタブ」) の読み替えもここで見る。
// =============================================================================

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TeamTabs, type TeamTabType } from "../TeamTabs";
import {
  ADMIN_ONLY_TEAM_TAB_IDS,
  TEAM_TAB_IDS,
  resolveTeamTabId,
} from "../teamTabDefs";

const EXPECTED_LABELS = ["メンバー", "予定", "出欠", "その他"];

describe("TeamTabs", () => {
  const makeProps = (
    overrides: Partial<{
      activeTab: TeamTabType;
      isAdmin: boolean;
      onTabChange: (tab: TeamTabType) => void;
      pendingCount: number;
    }> = {},
  ) => ({
    activeTab: "members" as TeamTabType,
    isAdmin: false,
    onTabChange: vi.fn(),
    ...overrides,
  });

  it.each([false, true])("isAdmin=%s でも、タブはちょうど 4 つで同じ並び", (isAdmin) => {
    render(<TeamTabs {...makeProps({ isAdmin })} />);

    const tabs = screen.getAllByRole("button");
    expect(tabs).toHaveLength(4);
    expect(tabs.map((tab) => tab.textContent)).toEqual(EXPECTED_LABELS);
    expect(screen.getByTestId("icon-users")).toBeTruthy();
    expect(screen.getByTestId("icon-calendar")).toBeTruthy();
    expect(screen.getByTestId("icon-clipboard")).toBeTruthy();
    expect(screen.getByTestId("icon-grid")).toBeTruthy();
  });

  it.each([
    ["メンバー", "members"],
    ["予定", "schedule"],
    ["出欠", "attendance"],
    ["その他", "others"],
  ] as const)("「%s」をタップすると onTabChange('%s') が呼ばれる", (label, id) => {
    const onTabChange = vi.fn();
    render(<TeamTabs {...makeProps({ onTabChange })} />);

    fireEvent.click(screen.getByText(label));

    expect(onTabChange).toHaveBeenCalledTimes(1);
    expect(onTabChange).toHaveBeenCalledWith(id);
  });

  it("承認待ちがあればメンバータブにバッジを出す (99 件超は 99+)", () => {
    const { rerender } = render(<TeamTabs {...makeProps({ isAdmin: true, pendingCount: 3 })} />);
    expect(screen.getByText("3")).toBeTruthy();

    rerender(<TeamTabs {...makeProps({ isAdmin: true, pendingCount: 120 })} />);
    expect(screen.getByText("99+")).toBeTruthy();

    rerender(<TeamTabs {...makeProps({ isAdmin: true, pendingCount: 0 })} />);
    expect(screen.queryByText("0")).toBeNull();
  });
});

describe("teamTabDefs", () => {
  it("TEAM_TAB_IDS は表示順どおり", () => {
    expect(TEAM_TAB_IDS).toEqual(["members", "schedule", "attendance", "others"]);
  });

  it("管理者専用のタブは無い (管理者ビューでもタブ数を変えない)", () => {
    expect(ADMIN_ONLY_TEAM_TAB_IDS).toEqual([]);
  });

  it.each([
    ["members", "members"],
    ["schedule", "schedule"],
    ["attendance", "attendance"],
    ["others", "others"],
    // 旧タブ ID は対応する新しいタブへ読み替える
    ["practices", "schedule"],
    ["competitions", "schedule"],
    ["rankings", "others"],
    ["goals", "others"],
    ["groups", "members"],
    ["announcements", "members"],
    ["settings", "members"],
  ])("resolveTeamTabId(%s) は %s", (input, expected) => {
    expect(resolveTeamTabId(input)).toBe(expected);
  });

  it.each([undefined, null, 1, "", "unknown", "constructor"])(
    "resolveTeamTabId(%s) は undefined (members に倒れる)",
    (input) => {
      expect(resolveTeamTabId(input)).toBeUndefined();
    },
  );
});
