// =============================================================================
// TeamMemberList.headerLayout.test.tsx
// =============================================================================
// mobile UI フィードバック: チーム詳細メンバータブの上部を整理した。
//   - 統計ヘッダーカード (タイトル「メンバー」+ 人数行) を撤去
//   - 人数「人数: N人」はテーブル左上セル (旧「メンバー」ラベルの位置) へ移動
//   - グループ表示のラベル「グループ表示:」を撤去
//   - 「引き継ぎを含む」スイッチはグループ表示行 (カテゴリピルの行) の右端へ移動
//
// 検証観点:
//   [V-HDR-01 反転] 「WAポイントで比較」ボタンはメンバータブに存在しない (ランキングタブへ移設)
//   [V-HDR-02 改] 「引き継ぎを含む」スイッチはグループ表示行にあり、カテゴリピルより後ろ (= 右端)
//   [V-HDR-03 改] 交差ガード: 撤去したのは統計ヘッダーだけで、スイッチは1つだけ残っている
//   [V-HDR-04 新] 人数はテーブルのヘッダー行の先頭セルにあり、旧ラベル「メンバー」は消えている
//
// 検出できないことの明示 (トートロジー/過大主張の防止):
//   jsdom は Flexbox を解決しないため、実際の右寄せ描画は検証できない
//   (RN の実レイアウトは実機確認が必要)。ここで保証するのは DOM 上の
//   「どの行/どのセルに属するか」と「行内での前後関係」のみ。
// =============================================================================

import React, { useEffect } from "react";
import { Pressable, Text } from "react-native";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TeamMembershipWithUser } from "@swim-hub/shared/types";

const mocks = vi.hoisted(() => {
  const supabaseFrom = vi.fn();
  return { supabaseFrom, authValue: { supabase: { from: supabaseFrom } } };
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

// グルーピングなしで素通し (TeamMemberList.test.tsx と同じ手法)
vi.mock("../TeamMemberGroupFilter", () => ({
  TeamMemberGroupFilter: ({
    members,
    onGroupedMembersChange,
  }: {
    members: TeamMembershipWithUser[];
    onGroupedMembersChange: (sorted: TeamMembershipWithUser[], headers: Map<number, string>) => void;
  }) => {
    useEffect(() => {
      onGroupedMembersChange(members, new Map());
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [members]);
    return React.createElement(Pressable, {}, React.createElement(Text, null, "group-filter"));
  },
}));

// @shopify/flash-list は素の .ts 配布でこの vitest 環境では変換できないため
// ファイルローカルで最小スタブに差し替える (TeamMemberList.test.tsx と同じ理由)
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

const buildMember = (
  overrides: Partial<TeamMembershipWithUser> & { id: string; user_id: string; name: string },
): TeamMembershipWithUser =>
  ({
    team_id: "team-1",
    role: "user",
    status: "approved",
    is_active: true,
    joined_at: "2025-01-01T00:00:00Z",
    left_at: null,
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    users: { id: overrides.user_id, name: overrides.name, gender: 0 },
    ...overrides,
  }) as unknown as TeamMembershipWithUser;

const mockEmptyRecordsQuery = () => {
  mocks.supabaseFrom.mockImplementation(() => ({
    select: vi.fn(() => ({
      in: vi.fn(() => ({
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      })),
    })),
  }));
};

const renderList = () => {
  mockEmptyRecordsQuery();
  return render(
    <TeamMemberList
      members={[buildMember({ id: "m-1", user_id: "u-1", name: "細井 龍平" })]}
      teamId="team-1"
      isLoading={false}
      isError={false}
      error={null}
      currentUserId="u-1"
      isCurrentUserAdmin={false}
    />,
  );
};

/** 「引き継ぎを含む」Switch (モックにより role="switch" の button として描画される) */
const getRelaySwitch = () => screen.getByRole("switch", { name: "引き継ぎを含む" });
/** グループ表示行のカテゴリピル (TeamMemberGroupFilter のモックが描画する Text) */
const getGroupFilter = () => screen.getByText("group-filter");
/** 人数 Text (span)。「人数: 1人」のような文言なので前方一致で拾う。
 *  テーブルはベストタイム取得の解決後に描画されるので await が必要 */
const findCountText = () => screen.findByText(/人数:/);

describe("[V-HDR] TeamMemberList 上部レイアウトの配置", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // [V-HDR-01 反転] 「WAポイントで比較」はランキングタブへ移設された。
  // **「ある」を pin していたテストを消さずに「無い」へ反転する。**
  // 消してしまうと「どこにも無い」状態でも全 green になり、移設の失敗を検出できない。
  // 「ランキングタブにある」側は
  // components/teams/rankings/__tests__/TeamRankings.waPointsCompare.test.tsx が担保する。
  it("[V-HDR-01 反転] 「WAポイントで比較」ボタンはメンバータブに存在しない (ランキングタブへ移設)", async () => {
    renderList();

    // --- 正のコントロール (先に置く) ---
    // 「描画そのものが失敗したので見つからない」を「撤去できている」と誤読しないため、
    // 上部エリアとテーブルが生きていることを先に確認する。これが無いと否定形は無意味になる
    expect(getGroupFilter()).toBeTruthy();
    expect(getRelaySwitch()).toBeTruthy();
    expect(await findCountText()).toBeTruthy();

    // --- 本体: ボタンが1つも無い ---
    expect(screen.queryByText("WAポイントで比較")).toBeNull();
  });

  it("[V-HDR-02] 「引き継ぎを含む」スイッチはグループ表示行にあり、カテゴリピルより後ろに置かれる", () => {
    renderList();

    const groupFilter = getGroupFilter();
    const relaySwitch = getRelaySwitch();

    // グループ表示行 = カテゴリピルとスイッチの両方を含む最も近い共通コンテナ。
    // ピルは TeamMemberGroupFilter (+ flex ラッパー) に、スイッチはラベルと共に
    // includeRelayToggle に包まれるため、parentElement 一致ではなく contains で見る
    const rowChildren = (el: Element) => Array.from(el.children);
    let row: Element | null = groupFilter.parentElement;
    while (row && !row.contains(relaySwitch)) {
      row = row.parentElement;
    }
    expect(row).not.toBeNull();

    // 行内の並び順: カテゴリピル → 引き継ぎトグル (右端)
    const children = rowChildren(row!);
    const filterIndex = children.findIndex((el) => el.contains(groupFilter));
    const toggleIndex = children.findIndex((el) => el.contains(relaySwitch));
    expect(filterIndex).toBeGreaterThanOrEqual(0);
    expect(toggleIndex).toBeGreaterThan(filterIndex);
  });

  it("[V-HDR-03 改] 交差ガード: 統計ヘッダーは撤去され、スイッチは1つだけ残っている", async () => {
    renderList();

    // 撤去したのは統計ヘッダーカード (タイトル + 人数行)。
    // 旧タイトル「メンバー」はテーブル左上セルのラベルも兼ねていたので、
    // 画面上のどこにも単独の「メンバー」テキストは残らない
    expect(screen.queryByText("メンバー")).toBeNull();

    // --- 対照: 消したのはヘッダーだけで、人数とスイッチは生きている ---
    // (「まるごと壊れた」のを「ヘッダーだけ消えた」と誤読しないため)
    expect(await findCountText()).toBeTruthy();
    expect(screen.getAllByRole("switch", { name: "引き継ぎを含む" })).toHaveLength(1);
  });

  it("[V-HDR-04] 人数はテーブルヘッダー行の先頭セルにあり、引き継ぎトグルの行には無い", async () => {
    renderList();

    const countText = await findCountText();
    const countCell = countText.parentElement!;
    const headerRow = countCell.parentElement!;

    // 先頭セルであること (種目ヘッダーより前)
    expect(Array.from(headerRow.children).indexOf(countCell)).toBe(0);
    // 同じ行に種目ヘッダーが続いていること (= テーブルのヘッダー行だという前提の固定)
    expect(headerRow.textContent).toContain("自由形");

    // 人数はグループ表示行 (スイッチのある行) には無い
    const relaySwitch = getRelaySwitch();
    expect(countCell.contains(relaySwitch)).toBe(false);
  });
});
