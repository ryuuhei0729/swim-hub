// =============================================================================
// TeamMemberList.nonSwimmerToggle.test.tsx - Issue #49 QA テスト (Phase A スケルトン)
// =============================================================================
// Sprint Contract 検証観点 (web MembersTimeTableNonSwimmerToggle.test.tsx とパリティ):
//   [V-13-01] グリッド本体には泳者のみが表示される (非泳者の名前は本体に出ない)
//   [V-13-02] 非泳者が1人以上いる場合、トグルは既定で閉じている
//   [V-13-03] トグルを開くと非泳者の名前が表示される
//   [V-13-04] 統計ヘッダーの総数 (teams.mobile.memberListTotal) は非泳者を含む
//             全メンバー数のまま (R1: web と同じ挙動に揃える)
//
// 契約 (Developer 実装対象、Phase A で QA が確定させたインターフェース):
//   - TeamMemberList の `members` prop の要素は `is_swimmer: boolean` を持つ
//     (shared TeamMembership 型の拡張。TeamMembershipWithUser 経由で自動的に反映される)
//   - 非泳者トグルは既存の includeRelaying と同じ RN <Switch> パターンで実装する。
//     accessibilityRole="switch", accessibilityLabel は
//     t("teams.nonSwimmer.sectionToggle", { count: 非泳者数 }) を使う
//     (ICU {count} プレースホルダーは apps/shared/__tests__/i18n/teamsNonSwimmer.i18n.test.ts
//      が必須化している)。
//   - 統計ヘッダーの総数 (teams.mobile.memberListTotal) は members.length (全員) のまま変更しない。
//
// モック方針: 既存 TeamMemberList.test.tsx (ソート3状態サイクル検証) のハーネスを踏襲する
// (TeamMemberGroupFilter を素通しスタブ化、MemberDetailModal をスタブ化、
//  @shopify/flash-list をスタブ化)。records クエリは全員 0件で固定する
// (本ファイルの関心はタイム表示ではなく行の出現/非出現なので簡略化する)。
// =============================================================================

import React, { useEffect } from "react";
import { Pressable, Text } from "react-native";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TeamMembershipWithUser } from "@swim-hub/shared/types";
import ja from "@apps/shared/messages/ja.json";

const mocks = vi.hoisted(() => {
  const supabaseFrom = vi.fn();
  // TeamMemberGroupFilter スタブが onGroupedMembersChange に渡す groupHeaders を
  // テストごとに差し替えるための箱。既定は空 Map (グルーピングなし)。
  const groupHeadersBox = { current: new Map<number, string>() };
  return { supabaseFrom, authValue: { supabase: { from: supabaseFrom } }, groupHeadersBox };
});

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => mocks.authValue,
}));

vi.mock("@apps/shared/hooks/queries/teams", () => ({
  useUpdateMemberRoleMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRemoveMemberMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("../member-detail", () => ({
  MemberDetailModal: () => null,
}));

vi.mock("../TeamMemberGroupFilter", () => ({
  TeamMemberGroupFilter: ({
    members,
    onGroupedMembersChange,
  }: {
    members: TeamMembershipWithUser[];
    onGroupedMembersChange: (sorted: TeamMembershipWithUser[], headers: Map<number, string>) => void;
  }) => {
    useEffect(() => {
      // 【Critical 2 回帰防止】このスタブが常に空 Map を返していたため、
      // remapGroupHeadersForSwimmers の付け替えロジックが一度も実行されないまま
      // 全 green になっていた (Reviewer がコード読解で発見)。
      // mocks.groupHeadersBox を経由してテストごとに非空の Map を注入できるようにする。
      onGroupedMembersChange(members, mocks.groupHeadersBox.current);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [members]);
    return React.createElement(Pressable, null, React.createElement(Text, null, "group-filter-stub"));
  },
}));

vi.mock("@shopify/flash-list", () => ({
  FlashList: ({
    data,
    renderItem,
    keyExtractor,
    ListEmptyComponent,
    ...props
  }: {
    data?: unknown[];
    renderItem?: (info: { item: unknown; index: number }) => React.ReactNode;
    keyExtractor?: (item: unknown, index: number) => string | number;
    ListEmptyComponent?: React.ReactNode;
  } & Record<string, unknown>) =>
    React.createElement(
      "div",
      props,
      data && data.length > 0
        ? data.map((item, index) =>
            React.createElement(
              "div",
              { key: keyExtractor ? keyExtractor(item, index) : index },
              renderItem ? renderItem({ item, index }) : null,
            ),
          )
        : (ListEmptyComponent ?? null),
    ),
}));

import { TeamMemberList } from "../TeamMemberList";

type MemberWithSwimmer = TeamMembershipWithUser & { is_swimmer: boolean };

const buildMember = (
  overrides: Partial<MemberWithSwimmer> & { id: string; user_id: string; name: string },
): MemberWithSwimmer =>
  ({
    team_id: "team-1",
    role: "user",
    status: "approved",
    is_active: true,
    joined_at: "2025-01-01T00:00:00Z",
    left_at: null,
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    is_swimmer: true,
    users: { id: overrides.user_id, name: overrides.name, gender: 0 },
    ...overrides,
  }) as unknown as MemberWithSwimmer;

const mockEmptyRecordsQuery = () => {
  mocks.supabaseFrom.mockImplementation((_table: string) => ({
    select: vi.fn(() => ({
      in: vi.fn(() => ({
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      })),
    })),
  }));
};

const renderList = (members: TeamMembershipWithUser[]) =>
  render(
    <TeamMemberList
      members={members}
      teamId="team-1"
      isLoading={false}
      isError={false}
      error={null}
      currentUserId="u-swimmer"
      isCurrentUserAdmin={false}
    />,
  );

const sectionToggleTemplate = (ja as { teams: { nonSwimmer: { sectionToggle: string } } }).teams
  .nonSwimmer.sectionToggle;
const expectedToggleLabel = (count: number) => sectionToggleTemplate.replace("{count}", String(count));

describe("mobile TeamMemberList - 非泳者トグル", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEmptyRecordsQuery();
    mocks.groupHeadersBox.current = new Map();
  });

  it("[V-13-01] グリッド本体には泳者の名前だけが表示され、非泳者の名前は出ない", async () => {
    const members = [
      buildMember({ id: "m1", user_id: "u-swimmer", name: "泳ぐ太郎", is_swimmer: true }),
      buildMember({ id: "m2", user_id: "u-nonswimmer", name: "見学次郎", is_swimmer: false }),
    ];

    renderList(members);

    await screen.findByText("泳ぐ太郎");
    expect(screen.queryByText("見学次郎")).toBeNull();
  });

  it("[V-13-02] 非泳者が1人以上いる場合、トグルは既定で閉じている", async () => {
    const members = [
      buildMember({ id: "m1", user_id: "u-swimmer", name: "泳ぐ太郎", is_swimmer: true }),
      buildMember({ id: "m2", user_id: "u-nonswimmer", name: "見学次郎", is_swimmer: false }),
    ];

    renderList(members);

    await screen.findByText("泳ぐ太郎");
    expect(screen.getByRole("switch", { name: expectedToggleLabel(1) })).not.toBeNull();
    expect(screen.queryByText("見学次郎")).toBeNull();
  });

  it("[V-13-03] トグルを開くと非泳者の名前が表示される", async () => {
    const members = [
      buildMember({ id: "m1", user_id: "u-swimmer", name: "泳ぐ太郎", is_swimmer: true }),
      buildMember({ id: "m2", user_id: "u-nonswimmer", name: "見学次郎", is_swimmer: false }),
    ];

    renderList(members);

    await screen.findByText("泳ぐ太郎");
    const toggle = screen.getByRole("switch", { name: expectedToggleLabel(1) });
    fireEvent.click(toggle);

    expect(await screen.findByText("見学次郎")).not.toBeNull();
  });

  it("[V-13-04] 統計ヘッダーの総数は非泳者を含む全メンバー数のまま (R1)", async () => {
    const members = [
      buildMember({ id: "m1", user_id: "u-swimmer", name: "泳ぐ太郎", is_swimmer: true }),
      buildMember({ id: "m2", user_id: "u-nonswimmer", name: "見学次郎", is_swimmer: false }),
      buildMember({ id: "m3", user_id: "u-nonswimmer2", name: "見学三郎", is_swimmer: false }),
    ];

    renderList(members);

    await screen.findByText("泳ぐ太郎");
    const expectedTotalText = (
      ja as { teams: { mobile: { memberListTotal: string } } }
    ).teams.mobile.memberListTotal.replace("{count}", "3");
    expect(screen.getByText(expectedTotalText)).not.toBeNull();
  });

  // ---------------------------------------------------------------------
  // [Critical 2 回帰防止] グループ見出しの付け替え (remapGroupHeadersForSwimmers)
  //
  // 従来のスタブは onGroupedMembersChange に常に空 Map を渡していたため、
  // このロジックの実行経路が一度もテストされていなかった (Reviewer 指摘)。
  // groupHeadersBox 経由で非空の Map を実際に注入し、web と共通の単一定義元
  // (apps/shared/utils/swimmerFilter.ts の remapGroupHeadersForSwimmers) が
  // mobile 側でも正しく呼び出されていることを検証する。
  // ---------------------------------------------------------------------
  describe("[Critical 2] グループ見出しの付け替え", () => {
    it("グループ先頭が非泳者のとき、見出しは消えずに次の泳者の位置へ繰り下がる", async () => {
      const members = [
        buildMember({ id: "m1", user_id: "u-nonswimmer", name: "見学花子", is_swimmer: false }),
        buildMember({ id: "m2", user_id: "u-swimmer", name: "泳ぐ次郎", is_swimmer: true }),
      ];
      // グループ「Aチーム」は元の並び (フィルタ前) の index0 (見学花子) から始まる
      mocks.groupHeadersBox.current = new Map([[0, "Aチーム"]]);

      renderList(members);

      await screen.findByText("泳ぐ次郎");

      // 正: 見出しは消えていない
      expect(screen.getByText("Aチーム")).not.toBeNull();
      // 非泳者本人は本体に出ない (V-13-01 と同じ確認をここでも独立に固定する)
      expect(screen.queryByText("見学花子")).toBeNull();

      // 見出しは本体で最初に現れる泳者 (泳ぐ次郎) より前に描画される
      const text = document.body.textContent ?? "";
      const headerIndex = text.indexOf("Aチーム");
      const memberIndex = text.indexOf("泳ぐ次郎");
      expect(headerIndex).toBeGreaterThanOrEqual(0);
      expect(memberIndex).toBeGreaterThan(headerIndex);
    });

    it("グループ全員が非泳者のときは見出しごと消える (web と同じ仕様)", async () => {
      const members = [
        buildMember({ id: "m1", user_id: "u-nonswimmer1", name: "見学花子", is_swimmer: false }),
        buildMember({ id: "m2", user_id: "u-nonswimmer2", name: "見学次郎", is_swimmer: false }),
        buildMember({ id: "m3", user_id: "u-swimmer", name: "泳ぐ三郎", is_swimmer: true }),
      ];
      // 「Bチーム」は全員非泳者のグループ (index0-1)。「Cチーム」は泳者のグループ (index2)
      mocks.groupHeadersBox.current = new Map([
        [0, "Bチーム"],
        [2, "Cチーム"],
      ]);

      renderList(members);

      await screen.findByText("泳ぐ三郎");

      // 全員非泳者のグループの見出しは消える
      expect(screen.queryByText("Bチーム")).toBeNull();
      // 泳者のグループの見出しは残る
      expect(screen.getByText("Cチーム")).not.toBeNull();
    });
  });

  it("[境界値] 非泳者が0人のときはトグルが描画されない", async () => {
    const members = [
      buildMember({ id: "m1", user_id: "u-swimmer", name: "泳ぐ太郎", is_swimmer: true }),
      buildMember({ id: "m2", user_id: "u-swimmer2", name: "泳ぐ次郎", is_swimmer: true }),
    ];

    renderList(members);

    await screen.findByText("泳ぐ太郎");
    // 既存の includeRelaying 用 switch は残る (1件) が、非泳者トグルは増えない
    expect(screen.queryAllByRole("switch")).toHaveLength(1);
  });
});
