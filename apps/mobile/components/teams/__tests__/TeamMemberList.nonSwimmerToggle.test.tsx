// =============================================================================
// TeamMemberList.nonSwimmerToggle.test.tsx
// =============================================================================
// ## 仕様変更の経緯 (今回のラウンド)
// 前ラウンドは「非泳者 (N)」行タップで SlideUpModal が下から出て名前一覧だけを
// 表示する設計だったが、App Developer が実装を再度変更し、以下になっている
// (`apps/mobile/components/teams/TeamMemberList.tsx` を実測して確認)。
// 旧コメントは SlideUpModal / onClosed 前提で書かれていたため、現行実装に合わせて
// 全面的に書き直した (アサーション自体は observable behavior ベースだったため
// SlideUpModal 廃止後も偶然 green のままだったが、コメントは古いままだった)。
//
// ## 実装の実測結果
//   - SlideUpModal は完全廃止。非泳者行は表の流れの中、固定名前列・横スクロール
//     タイム列の両方で「最後のメンバー行の直下」に描画される
//     (`nonSwimmerMembers.length > 0` のときだけ、`displayedMembers.map` の外・
//     末尾に独立して追加される)
//   - 非泳者行 (トグル): `<Pressable accessibilityRole="button"
//     accessibilityState={{expanded: isNonSwimmerExpanded}}
//     accessibilityLabel={t("teams.nonSwimmer.sectionToggle", {count})}>`。
//     タップで `isNonSwimmerExpanded` を反転する (トグル。SlideUpModal 版は常に
//     true 固定だったが、今回は開閉両方向)
//   - シェブロンは `Feather name={isNonSwimmerExpanded ? "chevron-down" :
//     "chevron-right"}`。`@expo/vector-icons` は `vitest.setup.ts` でグローバルに
//     `data-testid="icon-<name>"` へモックされているため、`icon-chevron-right` /
//     `icon-chevron-down` の出現有無で開閉方向を検証できる
//     (`accessibilityState` は素の Pressable モックが DOM 属性へ変換しないため、
//     aria-expanded 相当の直接クエリはできない。シェブロンアイコンを代理指標にする)
//   - 展開行は `renderMemberNameCell` / `renderMemberTimeRow` を再利用した
//     「泳者と同じ、ベストタイム付きの通常の行」(旧: 名前だけのシート行)。
//     タップで `handleMemberPress(item)` → `MemberDetailModal` が対象メンバーで開く
//   - 非泳者の展開行は `displayedMembers.map` / `displayedGroupHeaders` の配列とは
//     完全に別枠 (`nonSwimmerMembers.map`) として描画され、グループ見出しの
//     インデックス計算に一切関与しない。混入すると見出しが誤った行に付く
//     (最重要ガード。過去に web/mobile で類似ロジックが割れて Critical になった実績あり)
//
// Sprint Contract 検証観点 (web MembersTimeTableNonSwimmerToggle.test.tsx とパリティ):
//   [V-13-01] グリッド本体には泳者のみが表示される (非泳者の名前は本体に出ない)
//   [V-13-02] 非泳者行は表示されるが、既定では展開されていない
//             (非泳者の名前が出ていない・閉じたシェブロン `icon-chevron-right`)
//   [V-13-03] 非泳者行をタップすると展開し、非泳者がベストタイム付きの通常行として
//             現れる (名前だけでなくベストタイムも表示される)。開いたシェブロン
//             `icon-chevron-down` になる
//   [V-13-04] もう一度タップすると閉じる (開閉往復。片道だけ検証しない)
//   [V-13-05] 展開行をタップすると、そのメンバーで MemberDetailModal が開く
//   [V-13-06] 統計ヘッダーの総数 (teams.mobile.memberListTotal) は非泳者を含む
//             全メンバー数のまま (R1: web と同じ挙動に揃える)
//   [境界値]  非泳者が0人のときは行そのものが描画されない (accessibilityLabel の
//             文言で厳密一致検索し、部分文字列一致による偽陽性を避ける)
//
// モック方針: 既存 TeamMemberList.test.tsx (ソート3状態サイクル検証) のハーネスを踏襲する
// (TeamMemberGroupFilter を素通しスタブ化、@shopify/flash-list をスタブ化)。
// `MemberDetailModal` は「isOpen && member のとき対象メンバー名を含むマーカーを描画する」
// 最小スタブに差し替える (名前タップ→モーダルオープンの配線を実際に検証するため。
// 従来の `() => null` 固定スタブでは isOpen/member の配線を検証できない)。
// records クエリは既定で全員 0件で固定するが、ベストタイム表示を検証するテストのみ
// 対象メンバー分の1件を返すよう差し替える (トートロジー回避のため、値は本番の
// selectBestTime/formatTime をそのまま実行させ、期待値だけテスト側で計算する)。
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
  MemberDetailModal: ({
    isOpen,
    member,
  }: {
    isOpen: boolean;
    member: { users: { name: string } } | null;
  }) =>
    isOpen && member
      ? React.createElement(Text, null, `member-detail-open:${member.users.name}`)
      : null,
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

// ベストタイム表示 (V-13-03) 検証専用: 指定した records 行をそのまま返すよう差し替える。
// 中身の突合ロジック (getBestTime の name_jp/distance 照合) はテスト側で再実装せず、
// 本番の TeamMemberList にそのまま流し込んで検証する (トートロジー回避)。
const mockRecordsQuery = (records: unknown[]) => {
  mocks.supabaseFrom.mockImplementation((_table: string) => ({
    select: vi.fn(() => ({
      in: vi.fn(() => ({
        order: vi.fn().mockResolvedValue({ data: records, error: null }),
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

describe("mobile TeamMemberList - 非泳者アコーディオン", () => {
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

  it("[V-13-02] 非泳者行は表示されるが、既定では展開されていない (シェブロンは閉)", async () => {
    const members = [
      buildMember({ id: "m1", user_id: "u-swimmer", name: "泳ぐ太郎", is_swimmer: true }),
      buildMember({ id: "m2", user_id: "u-nonswimmer", name: "見学次郎", is_swimmer: false }),
    ];

    renderList(members);

    await screen.findByText("泳ぐ太郎");

    expect(screen.getByRole("button", { name: expectedToggleLabel(1) })).not.toBeNull();
    expect(screen.getByTestId("icon-chevron-right")).not.toBeNull();
    expect(screen.queryByTestId("icon-chevron-down")).toBeNull();
    expect(screen.queryByText("見学次郎")).toBeNull();
  });

  it("[V-13-03] 非泳者行をタップすると展開し、非泳者がベストタイム付きの通常行として現れる", async () => {
    const members = [
      buildMember({ id: "m1", user_id: "u-swimmer", name: "泳ぐ太郎", is_swimmer: true }),
      buildMember({ id: "m2", user_id: "u-nonswimmer", name: "見学次郎", is_swimmer: false }),
    ];
    mockRecordsQuery([
      {
        user_id: "u-nonswimmer",
        time: 30.12,
        created_at: "2025-01-01T00:00:00Z",
        note: null,
        pool_type: 0,
        is_relaying: false,
        styles: { name_jp: "50m自由形", distance: 50 },
        competitions: null,
      },
    ]);

    renderList(members);

    await screen.findByText("泳ぐ太郎");
    const toggleRow = screen.getByRole("button", { name: expectedToggleLabel(1) });
    fireEvent.click(toggleRow);

    expect(await screen.findByText("見学次郎")).not.toBeNull();
    expect(screen.getByTestId("icon-chevron-down")).not.toBeNull();
    expect(screen.queryByTestId("icon-chevron-right")).toBeNull();
    // ポップアップ/シート専用の簡易名前リストではなく、ベストタイム付きの通常行である
    expect(await screen.findByText("30.12")).not.toBeNull();
  });

  it("[V-13-04] もう一度タップすると閉じる (開閉往復)", async () => {
    const members = [
      buildMember({ id: "m1", user_id: "u-swimmer", name: "泳ぐ太郎", is_swimmer: true }),
      buildMember({ id: "m2", user_id: "u-nonswimmer", name: "見学次郎", is_swimmer: false }),
    ];

    renderList(members);

    await screen.findByText("泳ぐ太郎");
    const toggleRow = screen.getByRole("button", { name: expectedToggleLabel(1) });

    fireEvent.click(toggleRow);
    expect(await screen.findByText("見学次郎")).not.toBeNull();

    fireEvent.click(toggleRow);

    expect(screen.queryByText("見学次郎")).toBeNull();
    expect(screen.getByTestId("icon-chevron-right")).not.toBeNull();
    expect(screen.queryByTestId("icon-chevron-down")).toBeNull();
  });

  it("[V-13-05] 展開行をタップすると、そのメンバーで MemberDetailModal が開く", async () => {
    const members = [
      buildMember({ id: "m1", user_id: "u-swimmer", name: "泳ぐ太郎", is_swimmer: true }),
      buildMember({ id: "m2", user_id: "u-nonswimmer", name: "見学次郎", is_swimmer: false }),
    ];

    renderList(members);

    await screen.findByText("泳ぐ太郎");
    fireEvent.click(screen.getByRole("button", { name: expectedToggleLabel(1) }));

    const nameRow = await screen.findByText("見学次郎");
    fireEvent.click(nameRow);

    expect(await screen.findByText("member-detail-open:見学次郎")).not.toBeNull();
  });

  it("[V-13-06] 統計ヘッダーの総数は非泳者を含む全メンバー数のまま (R1)", async () => {
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

    it("[最重要ガード] 非泳者を展開しても、泳者側のグループ見出しの位置はズレない", async () => {
      const members = [
        buildMember({ id: "m1", user_id: "u-nonswimmer", name: "見学花子", is_swimmer: false }),
        buildMember({ id: "m2", user_id: "u-swimmer", name: "泳ぐ次郎", is_swimmer: true }),
        buildMember({ id: "m3", user_id: "u-swimmer2", name: "泳ぐ三郎", is_swimmer: true }),
      ];
      // 「Aチーム」は元の並び index1 (泳者 泳ぐ次郎) から始まる
      mocks.groupHeadersBox.current = new Map([[1, "Aチーム"]]);

      renderList(members);

      await screen.findByText("泳ぐ次郎");

      // 展開前: 見出しは1つだけ、見出し→次郎→三郎の順
      expect(screen.getAllByText("Aチーム")).toHaveLength(1);
      const textBefore = document.body.textContent ?? "";
      expect(textBefore.indexOf("Aチーム")).toBeLessThan(textBefore.indexOf("泳ぐ次郎"));
      expect(textBefore.indexOf("泳ぐ次郎")).toBeLessThan(textBefore.indexOf("泳ぐ三郎"));

      // 非泳者セクションを展開する
      fireEvent.click(screen.getByRole("button", { name: expectedToggleLabel(1) }));
      await screen.findByText("見学花子");

      // 展開後も見出しは1つだけ・依然として「次郎」の直前 (「花子」に付け替わっていない・
      // 複製されていない)。これが崩れると「展開行が displayedMembers 側の配列に
      // 混入し groupHeaders のインデックス計算が壊れた」ことを意味する。
      // 正しい描画順は 見出し → 次郎 → 三郎 → (末尾に展開される非泳者) 花子 の
      // 全順序になるはずなので、その順序をそのまま検証する。
      expect(screen.getAllByText("Aチーム")).toHaveLength(1);
      const textAfter = document.body.textContent ?? "";
      const headerIdx = textAfter.indexOf("Aチーム");
      const jiroIdx = textAfter.indexOf("泳ぐ次郎");
      const saburoIdx = textAfter.indexOf("泳ぐ三郎");
      const hanakoIdx = textAfter.indexOf("見学花子");
      expect(headerIdx).toBeGreaterThanOrEqual(0);
      expect(headerIdx).toBeLessThan(jiroIdx);
      expect(jiroIdx).toBeLessThan(saburoIdx);
      expect(saburoIdx).toBeLessThan(hanakoIdx);
    });
  });

  it("[境界値] 非泳者が0人のときは非泳者行そのものが描画されない", async () => {
    const members = [
      buildMember({ id: "m1", user_id: "u-swimmer", name: "泳ぐ太郎", is_swimmer: true }),
      buildMember({ id: "m2", user_id: "u-swimmer2", name: "泳ぐ次郎", is_swimmer: true }),
    ];

    renderList(members);

    await screen.findByText("泳ぐ太郎");
    // 非泳者行 (count=0 でも 1 以上でも) の accessibilityLabel/テキストは
    // 「非泳者 (N)」形式。0人時は行自体が無いため、この文言の要素は一切存在しない。
    expect(screen.queryByText(/^非泳者 \(\d+\)$/)).toBeNull();
    expect(screen.queryAllByRole("button", { name: /^非泳者 \(\d+\)$/ })).toHaveLength(0);
    expect(screen.queryByTestId("icon-chevron-right")).toBeNull();
    expect(screen.queryByTestId("icon-chevron-down")).toBeNull();
    // 既存の includeRelaying 用 switch は影響を受けず残る (1件)
    expect(screen.queryAllByRole("switch")).toHaveLength(1);
  });
});
