/**
 * MembersTimeTable の「非泳者」アコーディオン (旧: 中央ポップアップ、さらにその前: 表外トグル)
 *
 * 対象: apps/web/components/team/member-management/components/MembersTimeTable.tsx
 *
 * ## 仕様変更の経緯 (今回のラウンド)
 * 前ラウンドは「非泳者 (N)」行クリックで中央ポップアップ (`BaseModal`) が開き、
 * 名前一覧だけが出る設計だったが、実装を再度実測した結果、以下に変わっている:
 *   - ポップアップは廃止。`<tr data-testid="team-member-nonswimmer-row">` クリックで
 *     その場で下に展開するアコーディオンになった (`isNonSwimmerExpanded` state)
 *   - 展開行は `renderMemberRow` を再利用した「ベストタイム付きの通常のメンバー行」
 *     (`data-testid="team-member-row-{id}"`。ポップアップ専用だった
 *     `team-member-nonswimmer-name-{id}` は無くなっている)。クリックで `onMemberClick`
 *   - シェブロンは閉:`ChevronRightIcon` / 開:`ChevronDownIcon`。開閉状態は
 *     `aria-expanded` に反映される (閉=false / 開=true)
 *   - 展開行の描画は `swimmerMembers.map(...)` (グループ見出し計算に使う配列) とは別枠の
 *     `nonSwimmerMembers.map(...)` として tbody 末尾に追加される。この分離が崩れて
 *     `swimmerMembers` 側に混ざると、`swimmerGroupHeaders` (excludeNonSwimmers 前提で
 *     計算済み) のインデックスが実際の行とズレて見出しが誤った行に付く
 *     (最重要ガード。過去に web/mobile で類似ロジックが割れて Critical になった実績あり)
 *   - 全員非泳者のときは空状態ではなくヘッダー+非泳者行のみのテーブルを描画する仕様は
 *     変わらず維持されている
 *
 * Sprint Contract 検証観点 (Issue #49 本文 + R4、実装済み構造に合わせて更新):
 *   [V-09-01] 本体テーブルの行は泳者のみで、行数は「泳者の人数」と厳密一致する
 *   [V-09-02] 非泳者行は表示されるが、既定では非泳者は展開されていない
 *             (行が存在しない・aria-expanded=false・閉じたシェブロンアイコン)
 *   [V-09-03] 非泳者行をクリックすると展開し、非泳者がベストタイム付きの通常行として現れる
 *             (件数は厳密一致)。aria-expanded が true になり、開いたシェブロンになる
 *   [V-09-04] もう一度クリックすると閉じる (行が消え aria-expanded=false に戻る)
 *   [V-09-05] 非泳者が0人のときは非泳者行自体が描画されない
 *   [V-09-06] 全員が非泳者のとき、空状態ではなくヘッダー+非泳者行のみのテーブルが描画され、
 *             展開すると全員がベストタイム付きの通常行として確認できる
 *   [V-09-06'] 真に0人 (泳者0・非泳者0) のときは従来どおり空状態が出る (回帰確認)
 *   [V-09-07] 展開行をクリックすると、onMemberClick が対象メンバーで呼ばれる
 *
 * トートロジー回避: メンバー ID は "swimmer-1" のような部分文字列を含む名前にせず、
 * "m1"〜"m4" の一意な短い ID にする。行数は toHaveLength (厳密一致) で確認する。
 *
 * モック方針: 既存 MembersTimeTable.test.tsx の buildMember/renderWithLocale パターンを
 * 踏襲する。getBestTimeForMember はデフォルトで `() => null` とし、
 * 「ベストタイム付きの通常行」を検証するテストのみ固定の1件を返すスタブに差し替える。
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import jaMessages from "@apps/shared/messages/ja.json";
import { MembersTimeTable } from "../../../components/team/member-management/components/MembersTimeTable";
import type { TeamMember } from "../../../components/team/member-management/hooks/useMembers";
import type { BestTime } from "../../../components/team/shared/hooks/useMemberBestTimes";

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

const buildBestTime = (overrides: Partial<BestTime> = {}): BestTime => ({
  id: "bt-1",
  time: 30.12,
  created_at: "2025-01-01T00:00:00Z",
  pool_type: 0,
  is_relaying: false,
  style: { name_jp: "自由形", distance: 50 },
  ...overrides,
});

function renderTable(
  members: SwimmerMember[],
  options: {
    groupHeaders?: Map<number, string>;
    onMemberClick?: (member: TeamMember) => void;
    getBestTimeForMember?: (memberId: string, style: string, distance: number) => BestTime | null;
  } = {},
) {
  return renderWithLocale(
    <MembersTimeTable
      members={members}
      currentUserId="m1"
      includeRelaying={false}
      sortStyle={null}
      sortDistance={null}
      sortOrder="asc"
      isLoading={false}
      groupHeaders={options.groupHeaders}
      onSort={vi.fn()}
      onMemberClick={options.onMemberClick ?? vi.fn()}
      getBestTimeForMember={options.getBestTimeForMember ?? (() => null)}
    />,
  );
}

describe("MembersTimeTable - 非泳者アコーディオン", () => {
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

  it("[V-09-02] 非泳者が1人以上いる場合、非泳者行は表示されるが既定では展開されていない", () => {
    const members = [
      buildMember({ id: "m1", user_id: "m1", is_swimmer: true }),
      buildMember({ id: "m2", user_id: "m2", is_swimmer: false }),
    ];

    renderTable(members);

    const toggleRow = screen.getByTestId("team-member-nonswimmer-row");
    expect(toggleRow).toBeInTheDocument();
    expect(toggleRow).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("team-member-row-m2")).not.toBeInTheDocument();
  });

  it("[V-09-03] 非泳者行をクリックすると展開し、非泳者がベストタイム付きの通常行として現れる", async () => {
    const user = userEvent.setup();
    const members = [
      buildMember({ id: "m1", user_id: "m1", is_swimmer: true }),
      buildMember({ id: "m2", user_id: "m2", is_swimmer: false }),
    ];
    const bestTime = buildBestTime();
    const getBestTimeForMember = (memberId: string, style: string, distance: number) =>
      memberId === "m2" && style === "自由形" && distance === 50 ? bestTime : null;

    renderTable(members, { getBestTimeForMember });

    const toggleRow = screen.getByTestId("team-member-nonswimmer-row");
    await user.click(toggleRow);

    expect(toggleRow).toHaveAttribute("aria-expanded", "true");
    const nonSwimmerRow = screen.getByTestId("team-member-row-m2");
    expect(nonSwimmerRow).toBeInTheDocument();
    // ポップアップ専用だった名前ボタンは無い (通常行を再利用している)
    expect(screen.queryByTestId("team-member-nonswimmer-name-m2")).not.toBeInTheDocument();
    // 通常行と同じくベストタイムが表示される (件数は厳密一致で計測しない自由テキストなので getByText で確認)
    expect(screen.getByText("30.12")).toBeInTheDocument();
    // 展開後の行数も厳密一致で確認する (泳者1 + 非泳者1)
    expect(screen.getAllByTestId(/^team-member-row-/)).toHaveLength(2);
  });

  it("[V-09-04] もう一度クリックすると閉じる", async () => {
    const user = userEvent.setup();
    const members = [
      buildMember({ id: "m1", user_id: "m1", is_swimmer: true }),
      buildMember({ id: "m2", user_id: "m2", is_swimmer: false }),
    ];

    renderTable(members);

    const toggleRow = screen.getByTestId("team-member-nonswimmer-row");
    await user.click(toggleRow);
    expect(screen.getByTestId("team-member-row-m2")).toBeInTheDocument();
    expect(toggleRow).toHaveAttribute("aria-expanded", "true");

    await user.click(toggleRow);

    expect(toggleRow).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("team-member-row-m2")).not.toBeInTheDocument();
  });

  it("[V-09-05] 非泳者が0人のときは非泳者行自体が描画されない", () => {
    const members = [
      buildMember({ id: "m1", user_id: "m1", is_swimmer: true }),
      buildMember({ id: "m2", user_id: "m2", is_swimmer: true }),
    ];

    renderTable(members);

    expect(screen.queryByTestId("team-member-nonswimmer-row")).not.toBeInTheDocument();
  });

  it("[V-09-06] 全員が非泳者のとき、空状態ではなくヘッダー+非泳者行のみのテーブルが描画される", async () => {
    const user = userEvent.setup();
    const members = [
      buildMember({ id: "m1", user_id: "m1", is_swimmer: false }),
      buildMember({ id: "m2", user_id: "m2", is_swimmer: false }),
    ];

    renderTable(members);

    // 実装を実測した結果: hasNonSwimmers が true である限り、hasSwimmers が false でも
    // 空状態 (team-member-empty-state) ではなくテーブル (ヘッダー + 非泳者行) を描画する。
    expect(screen.queryByTestId("team-member-empty-state")).not.toBeInTheDocument();
    expect(screen.getByTestId("team-member-nonswimmer-row")).toBeInTheDocument();
    // 泳者の行は1件も無い (展開前)
    expect(screen.queryAllByTestId(/^team-member-row-/)).toHaveLength(0);

    await user.click(screen.getByTestId("team-member-nonswimmer-row"));

    // 展開後は非泳者2人分の行のみが厳密一致で現れる
    expect(screen.getByTestId("team-member-row-m1")).toBeInTheDocument();
    expect(screen.getByTestId("team-member-row-m2")).toBeInTheDocument();
    expect(screen.getAllByTestId(/^team-member-row-/)).toHaveLength(2);
  });

  it("[V-09-06'] 真に0人 (泳者0・非泳者0) のときは従来どおり空状態が描画される (回帰確認)", () => {
    renderTable([]);

    expect(screen.getByTestId("team-member-empty-state")).toBeInTheDocument();
    expect(screen.queryByTestId("team-member-nonswimmer-row")).not.toBeInTheDocument();
  });

  it("[V-09-07] 展開行をクリックすると、onMemberClick が対象メンバーで呼ばれる", async () => {
    const user = userEvent.setup();
    const onMemberClick = vi.fn();
    const members = [
      buildMember({ id: "m1", user_id: "m1", is_swimmer: true }),
      buildMember({ id: "m2", user_id: "m2", is_swimmer: false }),
    ];

    renderTable(members, { onMemberClick });

    await user.click(screen.getByTestId("team-member-nonswimmer-row"));
    await user.click(screen.getByTestId("team-member-row-m2"));

    expect(onMemberClick).toHaveBeenCalledTimes(1);
    expect(onMemberClick).toHaveBeenCalledWith(expect.objectContaining({ id: "m2" }));
  });

  it("[境界値] is_swimmer が undefined のメンバーは泳者として本体に表示される", () => {
    const members = [
      { ...buildMember({ id: "m1", user_id: "m1" }), is_swimmer: undefined } as unknown as SwimmerMember,
    ];

    renderTable(members);

    expect(screen.getByTestId("team-member-row-m1")).toBeInTheDocument();
    expect(screen.queryByTestId("team-member-nonswimmer-row")).not.toBeInTheDocument();
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

      renderTable(members, { groupHeaders });

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

      renderTable(members, { groupHeaders });

      expect(screen.queryByText("Bチーム")).not.toBeInTheDocument();
      expect(screen.getByText("Cチーム")).toBeInTheDocument();
    });

    it("[最重要ガード] 非泳者を展開しても、泳者側のグループ見出しの位置はズレない", async () => {
      const user = userEvent.setup();
      const members = [
        buildMember({ id: "m1", user_id: "m1", is_swimmer: false }),
        buildMember({ id: "m2", user_id: "m2", is_swimmer: true }),
        buildMember({ id: "m3", user_id: "m3", is_swimmer: true }),
      ];
      // 「Aチーム」は元の並び index1 (泳者 m2) から始まる
      const groupHeaders = new Map([[1, "Aチーム"]]);

      renderTable(members, { groupHeaders });

      // 展開前: 見出しは1つだけ、m2 の直前の <tr>
      expect(screen.getAllByText("Aチーム")).toHaveLength(1);
      const rowM2Before = screen.getByTestId("team-member-row-m2");
      const headerRowBefore = screen.getByText("Aチーム").closest("tr");
      expect(headerRowBefore?.nextElementSibling).toBe(rowM2Before);

      await user.click(screen.getByTestId("team-member-nonswimmer-row"));

      // 展開後、非泳者 m1 の行が末尾に増えるが、見出しは依然として1つだけ・
      // 依然として m2 の直前にある (m1 に付け替わっていない・複製されていない)。
      // これが崩れると「展開行が swimmerMembers 側の配列に混入し groupHeaders の
      // インデックス計算が壊れた」ことを意味する。
      const headers = screen.getAllByText("Aチーム");
      expect(headers).toHaveLength(1);
      const rowM1After = screen.getByTestId("team-member-row-m1");
      const rowM2After = screen.getByTestId("team-member-row-m2");
      const headerRowAfter = headers[0]!.closest("tr");
      expect(headerRowAfter?.nextElementSibling).toBe(rowM2After);
      expect(headerRowAfter?.nextElementSibling).not.toBe(rowM1After);
    });
  });
});
