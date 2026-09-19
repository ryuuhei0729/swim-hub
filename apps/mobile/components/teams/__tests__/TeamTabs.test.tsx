// =============================================================================
// TeamTabs.test.tsx - QA Engineer 検証 (mobile チーム詳細タブ)
// adminOnly フィルタ・タブ表示切り替え・タブ数の厳密一致
//
// 更新履歴:
//   Sprint 1 … adminOnly フィルタの検証として新規作成
//   ランキング第1弾 … `rankings` タブ追加でタブ数が 4→5 / 6→7 に増えたため、
//     「4 タブ」「6 タブ」というタイトルと本文が嘘になっていた。
//     いずれも `getByTestId` の存在確認だけで **タブ数を数えていなかった**ため、
//     タブが増えても減っても緑のまま通る状態だった。
//     ここではタブ数を `getAllByRole("button")` の件数で**厳密一致**させ、
//     さらにラベルの並びまで固定する (増減・並べ替えの両方を検出する)。
//   設定タブ追加 … 全メンバー向けの `settings` タブが末尾に増え、5→6 / 7→8 になった。
//     **実装が正で期待値が古い赤**だったため期待値側を更新した (Contract 上、
//     設定タブは adminOnly ではないので非管理者側にも1つ増える)。
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

  // S1-V-04 / #1: 非管理者には管理者専用タブ (groups / announcements) 以外が表示される
  it("非管理者にはちょうど 6 タブが表示される（members/practices/competitions/attendance/rankings/settings）", () => {
    render(<TeamTabs {...makeProps({ isAdmin: false })} />);

    // 件数の厳密一致。タブが増えても減っても落ちる
    expect(screen.getAllByRole("button")).toHaveLength(6);
    // 並び順まで固定する (ラベルは shared/messages の ja.json 由来)
    expect(screen.getAllByRole("button").map((tab) => tab.textContent)).toEqual([
      "メンバー",
      "練習",
      "大会",
      "出欠",
      "ランキング",
      "設定",
    ]);
    expect(screen.getByTestId("icon-users")).toBeTruthy();      // members
    expect(screen.getByTestId("icon-clock")).toBeTruthy();      // practices
    expect(screen.getByTestId("icon-award")).toBeTruthy();      // competitions
    expect(screen.getByTestId("icon-clipboard")).toBeTruthy();  // attendance
    expect(screen.getByTestId("icon-bar-chart-2")).toBeTruthy(); // rankings
    expect(screen.getByTestId("icon-settings")).toBeTruthy();   // settings (全メンバー向け)
    expect(screen.queryByTestId("icon-layers")).toBeNull();     // groups (adminOnly: 非表示)
    expect(screen.queryByTestId("icon-bell")).toBeNull();       // announcements (adminOnly: 非表示)
  });

  // ランキングは一般メンバーも閲覧する (adminOnly を付けてはいけない)
  it("ランキングタブは非管理者にも表示され、タップで onTabChange('rankings') が呼ばれる", () => {
    const onTabChange = vi.fn();
    render(<TeamTabs {...makeProps({ isAdmin: false, onTabChange })} />);

    fireEvent.click(screen.getByText("ランキング"));

    expect(onTabChange).toHaveBeenCalledTimes(1);
    expect(onTabChange).toHaveBeenCalledWith("rankings");
  });

  // #1: groups タブは管理者のみ表示される
  it("isAdmin=true のとき groups タブが表示される", () => {
    render(<TeamTabs {...makeProps({ isAdmin: true })} />);
    expect(screen.getByTestId("icon-layers")).toBeTruthy();
  });

  // S1-V-05: 管理者にはちょうど 7 タブすべてが表示される
  it("管理者にはちょうど 8 タブすべてが表示される", () => {
    render(<TeamTabs {...makeProps({ isAdmin: true })} />);

    expect(screen.getAllByRole("button")).toHaveLength(8);
    expect(screen.getAllByRole("button").map((tab) => tab.textContent)).toEqual([
      "メンバー",
      "グループ",
      "練習",
      "大会",
      "出欠",
      "ランキング",
      "お知らせ",
      "設定",
    ]);
    expect(screen.getByTestId("icon-users")).toBeTruthy();
    expect(screen.getByTestId("icon-layers")).toBeTruthy();
    expect(screen.getByTestId("icon-clock")).toBeTruthy();
    expect(screen.getByTestId("icon-award")).toBeTruthy();
    expect(screen.getByTestId("icon-clipboard")).toBeTruthy();
    expect(screen.getByTestId("icon-bar-chart-2")).toBeTruthy();
    expect(screen.getByTestId("icon-bell")).toBeTruthy();
    expect(screen.getByTestId("icon-settings")).toBeTruthy();
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
