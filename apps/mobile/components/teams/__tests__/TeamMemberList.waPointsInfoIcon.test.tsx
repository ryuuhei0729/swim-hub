// =============================================================================
// TeamMemberList.waPointsInfoIcon.test.tsx
// =============================================================================
// mobile UI フィードバック: web のチームメンバータブでは「WAポイントで比較」ボタンの右上に
// info (i) アイコンがあるが mobile には無かった。mobile にも付ける (右上ではなくボタンの
// 右隣に横並び。タップで説明ポップアップ = CenterModal が開く)。
// 配置パターンはマイページの WA トグル横の info (MyPageScreen の waToggleWrapper) に倣う。
//
// 検証観点:
//   [V-WAI-01] info アイコンは「WAポイントで比較」ボタンと同じ行ラッパー内にあり、
//              ボタンより後ろ (= 右隣) に置かれている。ラッパー自身はタイトル行の直下
//   [V-WAI-02] info アイコンをタップするとポップアップが開き、タイトル/本文が
//              teams.waPointsCompare.infoAriaLabel / infoTooltip (WA 専用の説明) と一致する
//              (マイページ/メンバー詳細は「点数化の一般説明」に差し替えたが、このボタンは
//              WA ポイント専用なので WA の説明で正しい。取り違え防止に both 方向で固定する)
//   [V-WAI-03] info アイコンのタップで比較モーダル (WaPointsCompareModal) は開かない
//              (兄弟要素なのでバブリングしないことの結線確認)
//
// 検出できないことの明示:
//   jsdom は Flexbox を解決しないため「見た目で右隣に並ぶ」ことや 2px の縦ずれは検証できない。
//   ここで保証するのは DOM 上の所属コンテナと前後関係、および開くモーダルの中身のみ。
// =============================================================================

import React, { useEffect } from "react";
import { Pressable, Text } from "react-native";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TeamMembershipWithUser } from "@swim-hub/shared/types";
import jaMessages from "@apps/shared/messages/ja.json";

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

// グルーピングなしで素通し (TeamMemberList.headerLayout.test.tsx と同じ手法)
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

const INFO_TEST_ID = "team-member-list-wa-info";
const BUTTON_LABEL = jaMessages.teams.waPointsCompare.buttonLabel;
const EXPECTED_TITLE = jaMessages.teams.waPointsCompare.infoAriaLabel;
const EXPECTED_BODY = jaMessages.teams.waPointsCompare.infoTooltip;
// 取り違え防止用: マイページ/メンバー詳細で使っている「点数化の一般説明」
const MYPAGE_BODY = jaMessages.mypage.bestTimesTable.pointsInfo;
const MEMBER_DETAIL_BODY = jaMessages.teams.memberDetail.bestTimesTable.pointsInfo;

/** 「WAポイントで比較」Pressable (モックにより button として描画される) */
const getWaButton = () => screen.getByText(BUTTON_LABEL).closest("button") as HTMLElement;
/** 統計ヘッダーのタイトル Text (span) */
const getTitle = () => screen.getByText(jaMessages.teams.mobile.memberListTitle);

// `testID` は RN のプロップ名で、このリポジトリの DOM モックでは Pressable に渡すと生の
// `testid` 属性として転記される (`data-testid` ではない) ため属性セレクタで取る
// (components/ui/__tests__/WaPointsInfoTooltip.test.tsx と同じ理由)。
function getInfoIcon(container: HTMLElement): HTMLElement {
  const el = container.querySelector(`[testid="${INFO_TEST_ID}"]`);
  if (!el) throw new Error(`testid="${INFO_TEST_ID}" の要素が見つかりません`);
  return el as HTMLElement;
}

// CenterModal の `<Modal animationType="none">` は DOM モックで `animationtype="none"`
// 属性としてそのまま転記される。比較モーダル (SlideUpModal) は別の animationType なので、
// この属性で info ポップアップの subtree だけを特定できる
// (screens/__tests__/MyPageScreen.waPointsInfoIcon.test.tsx と同じ手法)。
function getInfoModals(container: HTMLElement): Element[] {
  return Array.from(container.querySelectorAll('[animationtype="none"]'));
}
function getTitleAndBodySpans(modal: Element): { titleEl?: Element; bodyEl?: Element } {
  const contentSpans = Array.from(modal.querySelectorAll("span")).filter(
    (el) => !el.hasAttribute("data-testid"),
  );
  return { titleEl: contentSpans[0], bodyEl: contentSpans[1] };
}

describe("[V-WAI] TeamMemberList 「WAポイントで比較」ボタン右隣の info アイコン", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("[V-WAI-01] info アイコンはボタンと同じ行ラッパー内でボタンの後ろ (右隣) にあり、ラッパーはタイトル行の直下", () => {
    const { container } = renderList();

    const waButton = getWaButton();
    const infoIcon = getInfoIcon(container);
    const wrapper = waButton.parentElement!;

    // 同じラッパーに属する (WaPointsInfoTooltip 自身の View で1段包まれるため contains で見る)
    expect(wrapper.contains(infoIcon)).toBe(true);

    // ラッパー内の並び順: ボタン → info アイコン (右隣)
    const wrapperChildren = Array.from(wrapper.children);
    const infoHolderIndex = wrapperChildren.findIndex((el) => el.contains(infoIcon));
    expect(infoHolderIndex).toBeGreaterThan(wrapperChildren.indexOf(waButton));

    // ラッパーはタイトル行 (statsHeaderTop) の直下 = 「メンバー」タイトルと同じ行
    expect(wrapper.parentElement).toBe(getTitle().parentElement);

    // 画面全体で info アイコンは1個だけ (複製されていない)
    expect(container.querySelectorAll(`[testid="${INFO_TEST_ID}"]`)).toHaveLength(1);
  });

  it("[V-WAI-02] info アイコンをタップするとポップアップが開き、タイトル/本文が teams.waPointsCompare.infoAriaLabel/infoTooltip と一致する", () => {
    const { container } = renderList();

    // タップ前: ポップアップは未マウント
    expect(getInfoModals(container)).toHaveLength(0);
    expect(screen.queryByText(EXPECTED_BODY)).toBeNull();

    fireEvent.click(getInfoIcon(container));

    const modals = getInfoModals(container);
    expect(modals).toHaveLength(1);
    const { titleEl, bodyEl } = getTitleAndBodySpans(modals[0]!);
    expect(titleEl).toBeTruthy();
    expect(bodyEl).toBeTruthy();

    expect(titleEl!.textContent).toBe(EXPECTED_TITLE);
    expect(bodyEl!.textContent).toBe(EXPECTED_BODY);

    // このボタンは WA ポイント専用なので WA の説明であること (「World Aquatics」を含む)。
    // マイページ/メンバー詳細用の「点数化の一般説明」に取り違えていないこと。
    expect(bodyEl!.textContent).toContain("World Aquatics");
    expect(bodyEl!.textContent).not.toBe(MYPAGE_BODY);
    expect(bodyEl!.textContent).not.toBe(MEMBER_DETAIL_BODY);
  });

  it("[V-WAI-03] info アイコンのタップで比較モーダル (WaPointsCompareModal) は開かない", () => {
    const { container } = renderList();

    // 比較モーダルのタイトル (modalTitle) はボタンラベルと同じ文字列なので、
    // 開くと画面上の「WAポイントで比較」が 2 個になる。タップ前は 1 個 (ボタンのみ)。
    expect(jaMessages.teams.waPointsCompare.modalTitle).toBe(BUTTON_LABEL);
    expect(screen.getAllByText(BUTTON_LABEL)).toHaveLength(1);

    fireEvent.click(getInfoIcon(container));

    // info ポップアップは開くが、比較モーダルは開かない
    expect(getInfoModals(container)).toHaveLength(1);
    expect(screen.getAllByText(BUTTON_LABEL)).toHaveLength(1);
    expect(screen.queryByText(jaMessages.teams.waPointsCompare.empty)).toBeNull();
  });
});
