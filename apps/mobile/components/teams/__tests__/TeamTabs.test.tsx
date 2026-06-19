// =============================================================================
// TeamTabs.test.tsx - QA Engineer Sprint 1 検証
// adminOnly フィルタ・タブ表示切り替え
// =============================================================================

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { TeamTabs, type TeamTabType } from "../TeamTabs";

describe("TeamTabs", () => {
  const makeProps = (overrides: Partial<{
    activeTab: TeamTabType;
    isAdmin: boolean;
    onTabChange: (tab: TeamTabType) => void;
  }> = {}) => ({
    activeTab: "members" as TeamTabType,
    isAdmin: false,
    onTabChange: vi.fn(),
    ...overrides,
  });

  // S1-V-02: isAdmin=false のとき announcements タブが表示されない
  it("isAdmin=false のとき announcements タブは表示されない", () => {
    render(<TeamTabs {...makeProps({ isAdmin: false })} />);
    expect(screen.queryByTestId("icon-bell")).toBeNull();
  });

  // S1-V-03: isAdmin=true のとき announcements タブが表示される
  it("isAdmin=true のとき announcements タブが表示される", () => {
    render(<TeamTabs {...makeProps({ isAdmin: true })} />);
    expect(screen.getByTestId("icon-bell")).toBeTruthy();
  });

  // S1-V-04 / #1: 非管理者には管理者専用タブ (groups / announcements) 以外の 4 タブのみ表示される
  it("非管理者には 4 タブが表示される（members/practices/competitions/attendance）", () => {
    render(<TeamTabs {...makeProps({ isAdmin: false })} />);
    // groups と announcements を除く 4 タブ
    expect(screen.getByTestId("icon-users")).toBeTruthy();     // members
    expect(screen.getByTestId("icon-clock")).toBeTruthy();     // practices
    expect(screen.getByTestId("icon-award")).toBeTruthy();     // competitions
    expect(screen.getByTestId("icon-clipboard")).toBeTruthy(); // attendance
    expect(screen.queryByTestId("icon-layers")).toBeNull();    // groups (adminOnly: 非表示)
    expect(screen.queryByTestId("icon-bell")).toBeNull();      // announcements (adminOnly: 非表示)
  });

  // #1: groups タブは管理者のみ表示される
  it("isAdmin=true のとき groups タブが表示される", () => {
    render(<TeamTabs {...makeProps({ isAdmin: true })} />);
    expect(screen.getByTestId("icon-layers")).toBeTruthy();
  });

  // S1-V-05: 管理者には 6 タブすべてが表示される
  it("管理者には 6 タブすべてが表示される", () => {
    render(<TeamTabs {...makeProps({ isAdmin: true })} />);
    expect(screen.getByTestId("icon-users")).toBeTruthy();
    expect(screen.getByTestId("icon-layers")).toBeTruthy();
    expect(screen.getByTestId("icon-clock")).toBeTruthy();
    expect(screen.getByTestId("icon-award")).toBeTruthy();
    expect(screen.getByTestId("icon-clipboard")).toBeTruthy();
    expect(screen.getByTestId("icon-bell")).toBeTruthy();
  });

  // タブクリックで onTabChange が呼ばれる
  it("タブをクリックすると onTabChange が該当タブ ID で呼ばれる", () => {
    const onTabChange = vi.fn();
    render(<TeamTabs {...makeProps({ isAdmin: true, onTabChange })} />);

    // announcements タブ（管理者のみ）のテキストをクリック
    const announcementsTab = screen.getByText("お知らせ");
    fireEvent.click(announcementsTab);

    expect(onTabChange).toHaveBeenCalledWith("announcements");
  });

  it("members タブをクリックすると onTabChange('members') が呼ばれる", () => {
    const onTabChange = vi.fn();
    render(<TeamTabs {...makeProps({ onTabChange })} />);
    fireEvent.click(screen.getByText("メンバー"));
    expect(onTabChange).toHaveBeenCalledWith("members");
  });

  // S1-V-06 関連: activeTab が announcements でも isAdmin=false のとき
  // タブ自体は非表示（コンテンツ側は TeamDetailScreen で制御）
  it("activeTab='announcements' で isAdmin=false のとき bell アイコンは表示されない", () => {
    render(
      <TeamTabs
        activeTab="announcements"
        isAdmin={false}
        onTabChange={vi.fn()}
      />,
    );
    expect(screen.queryByTestId("icon-bell")).toBeNull();
  });

  // アクティブタブのスタイル検証: タブテキストの存在確認
  it("activeTab='members' のときメンバーテキストが表示されている", () => {
    render(<TeamTabs {...makeProps({ activeTab: "members" })} />);
    expect(screen.getByText("メンバー")).toBeTruthy();
  });

  // isAdmin が true から false に変更されたとき announcements が消える
  it("isAdmin が false に変わると announcements タブが消える", () => {
    const { rerender } = render(
      <TeamTabs activeTab="members" isAdmin={true} onTabChange={vi.fn()} />,
    );
    expect(screen.getByTestId("icon-bell")).toBeTruthy();

    rerender(
      <TeamTabs activeTab="members" isAdmin={false} onTabChange={vi.fn()} />,
    );
    expect(screen.queryByTestId("icon-bell")).toBeNull();
  });
});
