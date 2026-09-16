// =============================================================================
// TeamMemberList.headerLayout.test.tsx
// =============================================================================
// mobile UI フィードバック: チーム詳細メンバータブの統計ヘッダーで
//   - タイトル行 (「メンバー」) の右端 = 「WAポイントで比較」ボタン
//   - 人数行 (「人数: N人」) の右端     = 「引き継ぎを含む」スイッチ
// になるよう入れ替えた。変更前は逆 (タイトル行にスイッチ / 人数行の下にボタン) だった。
//
// 検証観点:
//   [V-HDR-01] 「WAポイントで比較」ボタンとタイトルが同一の直近コンテナ (タイトル行) にあり、
//              ボタンがタイトルより後ろ (= 右端) に置かれている
//              ※ ボタンは info アイコンと横並びにするための行ラッパー (waPointsButtonWrapper)
//                で包まれているため、「タイトル行の直下の子」はボタン自身ではなくラッパー。
//                ラッパーの中身 (info アイコン) は TeamMemberList.waPointsInfoIcon.test.tsx が担当
//   [V-HDR-02] 「引き継ぎを含む」スイッチと人数テキストが同一の直近コンテナ (人数行) にあり、
//              スイッチが人数テキストより後ろ (= 右端) に置かれている
//   [V-HDR-03] 交差ガード: ボタンはタイトル行に「だけ」、スイッチは人数行に「だけ」存在する
//              (片方だけ移して逆側に残骸が残る／両方が同じ行に同居する退行を検出)
//
// 検出できないことの明示 (トートロジー/過大主張の防止):
//   jsdom は Flexbox を解決しないため、justifyContent:"space-between" による
//   実際の右寄せ描画は本テストでは検証できない (RN の実レイアウトは実機確認が必要)。
//   ここで保証するのは DOM 上の「どの行に属するか」と「行内での前後関係」のみ。
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
/** 統計ヘッダーのタイトル Text (span) */
const getTitle = () => screen.getByText("メンバー");
/** 人数 Text (span)。「人数: 1人」のような文言なので前方一致で拾う */
const getCountText = () => screen.getByText(/人数:/);

describe("[V-HDR] TeamMemberList 統計ヘッダーの配置", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // [V-HDR-01 反転] 本スプリントで「WAポイントで比較」はランキングタブへ移設された。
  // **「ある」を pin していたテストを消さずに「無い」へ反転する。**
  // 消してしまうと「どこにも無い」状態でも全 green になり、移設の失敗を検出できない。
  // 「ランキングタブにある」側は
  // components/teams/rankings/__tests__/TeamRankings.waPointsCompare.test.tsx が担保する。
  it("[V-HDR-01 反転] 「WAポイントで比較」ボタンはメンバータブに存在しない (ランキングタブへ移設)", () => {
    renderList();

    // --- 正のコントロール (先に置く) ---
    // 「描画そのものが失敗したので見つからない」を「撤去できている」と誤読しないため、
    // 統計ヘッダーが生きていることを先に確認する。これが無いと否定形は無意味になる
    expect(getTitle()).toBeTruthy();
    expect(getCountText()).toBeTruthy();
    expect(getRelaySwitch()).toBeTruthy();

    // --- 本体: ボタンが1つも無い ---
    expect(screen.queryByText("WAポイントで比較")).toBeNull();
  });

  it("[V-HDR-02] 「引き継ぎを含む」スイッチは人数テキストと同じ行にあり、人数より後ろに置かれる", () => {
    renderList();

    const countText = getCountText();
    const relaySwitch = getRelaySwitch();
    const countRow = countText.parentElement!;

    // 人数行(statsRow)がスイッチを子孫に含むこと (スイッチはラベルと共に
    // includeRelayToggle でラップされるため parentElement 一致ではなく contains で見る)
    expect(countRow.contains(relaySwitch)).toBe(true);

    // 行内の並び順: 人数テキスト → 引き継ぎトグル (右端)
    const rowChildren = Array.from(countRow.children);
    const toggleWrapperIndex = rowChildren.findIndex((el) => el.contains(relaySwitch));
    expect(toggleWrapperIndex).toBeGreaterThan(rowChildren.indexOf(countText));
  });

  it("[V-HDR-03 反転] 交差ガード: WA ボタンはどちらの行にも無く、スイッチは人数行に残っている", () => {
    renderList();

    const titleRow = getTitle().parentElement!;
    const countRow = getCountText().parentElement!;
    const relaySwitch = getRelaySwitch();

    // 2行が別コンテナであること (前提が崩れると以下の否定形が無意味になる)
    expect(titleRow).not.toBe(countRow);

    // WA ボタンはタイトル行にも人数行にも無い
    expect(titleRow.textContent).not.toContain("WAポイントで比較");
    expect(countRow.textContent).not.toContain("WAポイントで比較");

    // --- 対照: 撤去したのは WA ボタンだけで、引き継ぎスイッチは人数行のまま ---
    // (「ヘッダーごと消えた」のを「ボタンだけ消えた」と誤読しないため)
    expect(countRow.contains(relaySwitch)).toBe(true);
    expect(titleRow.contains(relaySwitch)).toBe(false);
    expect(screen.getAllByRole("switch", { name: "引き継ぎを含む" })).toHaveLength(1);
  });
});
