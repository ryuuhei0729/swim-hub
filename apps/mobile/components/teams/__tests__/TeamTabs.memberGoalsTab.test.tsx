/**
 * 「目標」タブ (mobile) の定義・表示 — Sprint Contract v1
 *   - goals は adminOnly:true、rankings の直後
 *   - 非管理者ビューには出ない / 管理者ビューには出る
 *   - タップで onTabChange("goals")
 *   - 利用者ビューへ戻すと goals から離脱する (resolveActiveTabOnAdminViewToggle)
 */
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TeamTabs, type TeamTabType } from "../TeamTabs";
import { TEAM_TAB_DEFS, TEAM_TAB_IDS, ADMIN_ONLY_TEAM_TAB_IDS } from "../teamTabDefs";
import { resolveActiveTabOnAdminViewToggle } from "@/utils/teamAdminView";

describe("goals タブの定義", () => {
  it("adminOnly: true で、ランキングの直後にある", () => {
    const def = TEAM_TAB_DEFS.find((d) => d.id === "goals");
    expect(def?.adminOnly).toBe(true);
    const i = TEAM_TAB_IDS.indexOf("goals");
    expect(TEAM_TAB_IDS[i - 1]).toBe("rankings");
    expect(ADMIN_ONLY_TEAM_TAB_IDS).toContain("goals");
  });
  it("利用者ビューへ戻すと goals から離脱する", () => {
    expect(resolveActiveTabOnAdminViewToggle("goals" as TeamTabType, false)).toBe("members");
    // 管理者ビューを維持する場合は goals のまま
    expect(resolveActiveTabOnAdminViewToggle("goals" as TeamTabType, true)).toBe("goals");
  });
});

describe("goals タブの表示", () => {
  it("非管理者(利用者ビュー)には「目標」タブが出ない", () => {
    render(<TeamTabs activeTab="members" isAdmin={false} onTabChange={vi.fn()} />);
    expect(screen.queryByText("目標")).toBeNull();
    expect(screen.queryByTestId("icon-target")).toBeNull();
  });
  it("管理者ビューには「目標」タブが出て、タップで onTabChange('goals')", () => {
    const onTabChange = vi.fn();
    render(<TeamTabs activeTab="members" isAdmin={true} onTabChange={onTabChange} />);
    fireEvent.click(screen.getByText("目標"));
    expect(onTabChange).toHaveBeenCalledTimes(1);
    expect(onTabChange).toHaveBeenCalledWith("goals");
  });
});
