/**
 * Issue #49 QA テスト (Phase A スケルトン): MembersTimeTable の「非泳者」トグル
 *
 * 対象: apps/web/components/team/member-management/components/MembersTimeTable.tsx
 *   (Phase A 時点では is_swimmer によるフィルタ・トグルとも未実装)
 *
 * Sprint Contract 検証観点 (Issue #49 本文 + R3):
 *   [V-09-01] 本体テーブルの行は泳者のみで、行数は「泳者の人数」と厳密一致する
 *             (非泳者は本体から消える。行の有無は data-testid="team-member-row-{id}" の
 *              存在有無で判定し、部分文字列一致になる id は使わない)
 *   [V-09-02] 「非泳者」トグルは既定で閉じている (非泳者の行は最初は見えない)
 *   [V-09-03] トグルを開くと非泳者の行が表示される
 *   [V-09-04] トグルをもう一度押すと閉じる
 *   [V-09-05] 非泳者が0人のときはトグル自体が描画されない
 *   [V-09-06] 全員が非泳者のとき、本体は空状態 (team-member-empty-state) になり、
 *             かつトグルは非表示にならず非泳者を開いて確認できる
 *
 * 契約 (Developer 実装対象、Phase A で QA が確定させたインターフェース):
 *   - MembersTimeTable の `members` prop の要素は `is_swimmer: boolean` を持つ
 *     (TeamMember 型の拡張)。フィルタ処理はコンポーネント内部で行う
 *     (apps/shared/utils/swimmerFilter.ts の excludeNonSwimmers / selectNonSwimmers を使う)。
 *   - トグルボタン: data-testid="team-member-nonswimmer-toggle"
 *   - 非泳者セクション (開いたときに表示される領域): data-testid="team-member-nonswimmer-section"
 *   - 非泳者の行にも通常と同じ data-testid="team-member-row-{id}" を使う
 *     (テーブル構造そのものを再利用する設計を想定。別構造でも良いが、行の
 *      data-testid だけはこの規約に従うこと)
 *
 * トートロジー回避: メンバー ID は "swimmer-1" のような部分文字列を含む名前にせず、
 * "m1"〜"m4" の一意な短い ID にする。行数は toHaveLength (厳密一致) で確認する。
 *
 * モック方針: 既存 MembersTimeTable.test.tsx の buildMember/renderWithLocale パターンを
 * 踏襲するが、本ファイルはトグルの構造検証のみが目的でありベストタイムの中身は
 * 検証対象外のため getBestTimeForMember は `() => null` で固定する。
 */
import React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import jaMessages from "@apps/shared/messages/ja.json";
import { MembersTimeTable } from "../../../components/team/member-management/components/MembersTimeTable";
import type { TeamMember } from "../../../components/team/member-management/hooks/useMembers";

type SwimmerMember = TeamMember & { is_swimmer: boolean };

const renderWithLocale = (ui: React.ReactElement) =>
  render(
    <NextIntlClientProvider locale="ja" messages={jaMessages as unknown as AbstractIntlMessages}>
      {ui}
    </NextIntlClientProvider>,
  );

const buildMember = (overrides: Partial<SwimmerMember> & { id: string; user_id: string }): SwimmerMember => ({
  role: "user",
  is_active: true,
  joined_at: "2025-01-01T00:00:00Z",
  is_swimmer: true,
  users: { id: overrides.user_id, name: `メンバー${overrides.id}` },
  ...overrides,
});

function renderTable(members: SwimmerMember[], groupHeaders?: Map<number, string>) {
  return renderWithLocale(
    <MembersTimeTable
      members={members}
      currentUserId="m1"
      includeRelaying={false}
      sortStyle={null}
      sortDistance={null}
      sortOrder="asc"
      isLoading={false}
      groupHeaders={groupHeaders}
      onSort={vi.fn()}
      onMemberClick={vi.fn()}
      getBestTimeForMember={() => null}
    />,
  );
}

describe("MembersTimeTable - 非泳者トグル", () => {
  it("[V-09-01] 本体テーブルの行数は泳者のみの人数と厳密一致する (非泳者は本体から消える)", () => {
    const members = [
      buildMember({ id: "m1", user_id: "m1", is_swimmer: true }),
      buildMember({ id: "m2", user_id: "m2", is_swimmer: false }),
      buildMember({ id: "m3", user_id: "m3", is_swimmer: true }),
    ];

    renderTable(members);

    expect(screen.getByTestId("team-member-row-m1")).toBeInTheDocument();
    expect(screen.getByTestId("team-member-row-m3")).toBeInTheDocument();
    expect(screen.queryByTestId("team-member-row-m2")).not.toBeInTheDocument();

    // テーブル全体の行数も厳密一致で確認する (取りこぼしが無いことの二重確認)
    const rows = screen.getAllByTestId(/^team-member-row-/);
    expect(rows).toHaveLength(2);
  });

  it("[V-09-02] 非泳者が1人以上いる場合、トグルは既定で閉じている", () => {
    const members = [
      buildMember({ id: "m1", user_id: "m1", is_swimmer: true }),
      buildMember({ id: "m2", user_id: "m2", is_swimmer: false }),
    ];

    renderTable(members);

    expect(screen.getByTestId("team-member-nonswimmer-toggle")).toBeInTheDocument();
    expect(screen.queryByTestId("team-member-nonswimmer-section")).not.toBeInTheDocument();
    expect(screen.queryByTestId("team-member-row-m2")).not.toBeInTheDocument();
  });

  it("[V-09-03][V-09-04] トグルを開くと非泳者の行が現れ、もう一度押すと消える", async () => {
    const user = userEvent.setup();
    const members = [
      buildMember({ id: "m1", user_id: "m1", is_swimmer: true }),
      buildMember({ id: "m2", user_id: "m2", is_swimmer: false }),
    ];

    renderTable(members);

    const toggle = screen.getByTestId("team-member-nonswimmer-toggle");
    await user.click(toggle);

    const section = screen.getByTestId("team-member-nonswimmer-section");
    expect(within(section).getByTestId("team-member-row-m2")).toBeInTheDocument();

    await user.click(toggle);
    expect(screen.queryByTestId("team-member-nonswimmer-section")).not.toBeInTheDocument();
    expect(screen.queryByTestId("team-member-row-m2")).not.toBeInTheDocument();
  });

  it("[V-09-05] 非泳者が0人のときはトグルが描画されない", () => {
    const members = [
      buildMember({ id: "m1", user_id: "m1", is_swimmer: true }),
      buildMember({ id: "m2", user_id: "m2", is_swimmer: true }),
    ];

    renderTable(members);

    expect(screen.queryByTestId("team-member-nonswimmer-toggle")).not.toBeInTheDocument();
  });

  it("[V-09-06] 全員が非泳者のとき、本体は空状態になり、トグルから非泳者を確認できる", async () => {
    const user = userEvent.setup();
    const members = [
      buildMember({ id: "m1", user_id: "m1", is_swimmer: false }),
      buildMember({ id: "m2", user_id: "m2", is_swimmer: false }),
    ];

    renderTable(members);

    expect(screen.getByTestId("team-member-empty-state")).toBeInTheDocument();

    const toggle = screen.getByTestId("team-member-nonswimmer-toggle");
    await user.click(toggle);

    const section = screen.getByTestId("team-member-nonswimmer-section");
    expect(within(section).getByTestId("team-member-row-m1")).toBeInTheDocument();
    expect(within(section).getByTestId("team-member-row-m2")).toBeInTheDocument();
  });

  it("[境界値] is_swimmer が undefined のメンバーは泳者として本体に表示される", () => {
    const members = [
      { ...buildMember({ id: "m1", user_id: "m1" }), is_swimmer: undefined } as unknown as SwimmerMember,
    ];

    renderTable(members);

    expect(screen.getByTestId("team-member-row-m1")).toBeInTheDocument();
    expect(screen.queryByTestId("team-member-nonswimmer-toggle")).not.toBeInTheDocument();
  });

  // ---------------------------------------------------------------------
  // [Critical 2 回帰防止] グループ見出しの付け替え (remapGroupHeadersForSwimmers)
  //
  // web と mobile (TeamMemberList.nonSwimmerToggle.test.tsx) の両方が
  // apps/shared/utils/swimmerFilter.ts の remapGroupHeadersForSwimmers を
  // 単一定義元として呼んでいることの回帰防止。PM指摘: 「片方のテストしか
  // このロジックを実行できていないと、共有関数を壊しても半分しか検出できない」。
  // ---------------------------------------------------------------------
  describe("[Critical 2] グループ見出しの付け替え", () => {
    it("グループ先頭が非泳者のとき、見出しは消えずに次の泳者の位置へ繰り下がる", () => {
      const members = [
        buildMember({ id: "m1", user_id: "m1", is_swimmer: false }),
        buildMember({ id: "m2", user_id: "m2", is_swimmer: true }),
      ];
      // グループ「Aチーム」は元の並び (フィルタ前) の index0 (非泳者 m1) から始まる
      const groupHeaders = new Map([[0, "Aチーム"]]);

      renderTable(members, groupHeaders);

      // 正: 見出しは消えていない
      expect(screen.getByText("Aチーム")).toBeInTheDocument();
      // 非泳者本人は本体に出ない
      expect(screen.queryByTestId("team-member-row-m1")).not.toBeInTheDocument();
      // 見出しは、本体で最初に現れる泳者 (m2) の行より前に描画される
      const rowM2 = screen.getByTestId("team-member-row-m2");
      const headerRow = screen.getByText("Aチーム").closest("tr");
      expect(headerRow).not.toBeNull();
      // compareDocumentPosition: headerRow が rowM2 より前 (DOCUMENT_POSITION_FOLLOWING が
      // rowM2 側から見て立つ = headerRow は rowM2 より前にある)
      expect(
        (rowM2.compareDocumentPosition(headerRow!) & Node.DOCUMENT_POSITION_PRECEDING) !== 0,
      ).toBe(true);
    });

    it("グループ全員が非泳者のときは見出しごと消える", () => {
      const members = [
        buildMember({ id: "m1", user_id: "m1", is_swimmer: false }),
        buildMember({ id: "m2", user_id: "m2", is_swimmer: false }),
        buildMember({ id: "m3", user_id: "m3", is_swimmer: true }),
      ];
      // 「Bチーム」は全員非泳者のグループ (index0-1)。「Cチーム」は泳者のグループ (index2)
      const groupHeaders = new Map([
        [0, "Bチーム"],
        [2, "Cチーム"],
      ]);

      renderTable(members, groupHeaders);

      expect(screen.queryByText("Bチーム")).not.toBeInTheDocument();
      expect(screen.getByText("Cチーム")).toBeInTheDocument();
    });
  });
});
