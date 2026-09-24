// =============================================================================
// MemberSelectModal.globalToggleOrderAndDedupBoundary.test.tsx
// [QA Sprint Contract Phase B 修正ループ3周目] V-17 / V-18
// =============================================================================
//
// 【V-17: グローバル全選択の出力順序 pin (修正4の回帰ガード)】
// PM裁定: グローバル全選択で選ばれる順序は `members` (呼び出し元が
// compareMembersByBirthday で決定した生年月日順の原配列) を基準にする。
// `groupedMembers` (TeamMemberGroupFilter が性別/カテゴリで並べ替えた表示専用の配列)
// を基準にしてはいけない。
//
// 既存の [TG] 系テストは TeamMemberGroupFilter のスタブが `members` をそのまま
// `groupedMembers` として素通しするため、両者が常に同じ内容・同じ順序になり、
// 「`members` 基準か `groupedMembers` 基準か」を区別できない
// (Reviewer 指摘: 「この固定スタブでは今回の Medium は検出できない」)。
// このファイルでは意図的に `groupedMembers` を `members` と異なる順序で注入し、
// 出力順序がどちらに従うかを判別可能にする。
//
// 【トートロジー防止】
// 期待される onConfirm の出力順序はリテラルで直書きする
// (`members.map(...)` をテスト内で再計算して突き合わせない)。
//
// 【V-18: handleGlobalToggle 層単独の一意化を、決定ボタンを押す前の中間状態で検証】
// 前回 (修正ループ2周目) の QA 報告: `handleGlobalToggle` の Set と `onConfirm` の Set は
// どちらか片方を外してももう片方が吸収するため、`onConfirm` の最終出力だけを見る V-14 では
// 「`handleGlobalToggle` 層自体が壊れているか」を単独で判別できない。
// このテストでは「全選択」を押した直後・「決定」を押す前のフッター選択件数表示
// (`tempSelected.length` を直接反映する) を見ることで、`handleGlobalToggle` が
// `setTempSelected` に渡す時点で既に一意化されているかを、`onConfirm` を経由せずに検証する。
// 【観測可能性の判断】
// フッターの「{n}名選択中」テキストは `tempSelected.length` の React state を
// そのまま描画したものであり、DOM レンダリング結果として観測可能 (jsdom で計算可能。
// レイアウト計算は不要、テキストノードの内容比較のみ)。そのため
// 「中間状態の観測は構造的に不可能」ではなく、このアプローチで書ける。
// =============================================================================

import React, { useEffect } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TeamMembershipWithUser } from "@apps/shared/types";

const mocks = vi.hoisted(() => ({
  // 実際に onGroupedMembersChange へ渡す groupedMembers/headers を
  // テストごとに上書きできるようにする。未設定 (null) の場合は
  // members をそのまま素通しする ([TG] 系と同じデフォルト挙動)。
  override: null as { groupedMembers: TeamMembershipWithUser[]; headers: Map<number, string> } | null,
}));

vi.mock("../TeamMemberGroupFilter", () => ({
  TeamMemberGroupFilter: ({
    members,
    onGroupedMembersChange,
  }: {
    members: TeamMembershipWithUser[];
    onGroupedMembersChange: (
      sorted: TeamMembershipWithUser[],
      headers: Map<number, string>,
    ) => void;
  }) => {
    useEffect(() => {
      if (mocks.override) {
        onGroupedMembersChange(mocks.override.groupedMembers, mocks.override.headers);
      } else {
        onGroupedMembersChange(members, new Map());
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [members]);
    return null;
  },
}));

import { MemberSelectModal } from "../MemberSelectModal";

const dummySupabase = {} as unknown as SupabaseClient;

const buildMember = (overrides: {
  id: string;
  user_id: string;
  name: string;
}): TeamMembershipWithUser =>
  ({
    team_id: "team-1",
    role: "user",
    status: "approved",
    is_active: true,
    is_swimmer: true,
    joined_at: "2025-01-01T00:00:00Z",
    left_at: null,
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    ...overrides,
    users: {
      id: overrides.user_id,
      name: overrides.name,
      gender: 0,
      birthday: null,
    },
  }) as unknown as TeamMembershipWithUser;

/** 見出しテキストを含む最も近い共通コンテナ (行) を、その中に "全選択" ボタンが
 *  見つかるまで遡って特定する ([TG] 系テストと同じ手法)。 */
function findGroupToggleButton(headerText: string): HTMLElement {
  const header = screen.getByText(headerText);
  const allToggleButtons = screen.getAllByRole("button", { name: "全選択" });
  let row: Element | null = header.parentElement;
  while (row) {
    const found = allToggleButtons.find((b) => row!.contains(b));
    if (found) return found as HTMLElement;
    row = row.parentElement;
  }
  throw new Error(`グループ見出し "${headerText}" の近くに全選択トグルが見つからない`);
}

/** グループのミニトグルに紐づかない = グローバルの全選択ボタンを特定する。 */
function findGlobalToggleButton(groupHeaderTexts: string[]): HTMLElement {
  const allToggleButtons = screen.getAllByRole("button", { name: "全選択" });
  const groupButtons = groupHeaderTexts.map((h) => findGroupToggleButton(h));
  const remaining = allToggleButtons.filter((b) => !groupButtons.includes(b));
  expect(remaining).toHaveLength(1);
  return remaining[0]!;
}

const renderModal = (
  members: TeamMembershipWithUser[],
  onConfirm: (ids: string[]) => void,
) =>
  render(
    <MemberSelectModal
      visible
      teamId="team-1"
      supabase={dummySupabase}
      members={members}
      selectedUserIds={[]}
      onConfirm={onConfirm}
      onCancel={vi.fn()}
    />,
  );

describe("[V-17] グローバル全選択の出力順序は members (生年月日順) を維持する", () => {
  beforeEach(() => {
    mocks.override = null;
  });

  it("[V-17] groupedMembers が members と異なる順序でも、onConfirm の出力順序は members の順序と厳密一致する", () => {
    // members: 生年月日順 A→B→C→D (呼び出し元が既に compareMembersByBirthday で
    // 並べた原配列という想定)
    const membersInBirthdayOrder = [
      buildMember({ id: "m-a", user_id: "u-a", name: "A選手" }),
      buildMember({ id: "m-b", user_id: "u-b", name: "B選手" }),
      buildMember({ id: "m-c", user_id: "u-c", name: "C選手" }),
      buildMember({ id: "m-d", user_id: "u-d", name: "D選手" }),
    ];

    // TeamMemberGroupFilter が性別グルーピングした結果 (表示専用の並び替え) を模す。
    // 実物の A/C を女性、B/D を男性とみなし、意図的に生年月日順とは異なる並びにする。
    const [a, b, c, d] = membersInBirthdayOrder;
    mocks.override = {
      groupedMembers: [b!, d!, a!, c!],
      headers: new Map<number, string>([
        [0, "男性"],
        [2, "女性"],
      ]),
    };

    const onConfirm = vi.fn();
    renderModal(membersInBirthdayOrder, onConfirm);

    fireEvent.click(findGlobalToggleButton(["男性", "女性"]));
    fireEvent.click(screen.getByRole("button", { name: "決定" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    const confirmed = onConfirm.mock.calls[0]![0] as string[];

    // 期待値はリテラル直書き (members.map(...) の再計算はしない)
    expect(confirmed).toEqual(["u-a", "u-b", "u-c", "u-d"]);
  });
});

describe("[V-18] handleGlobalToggle 単独の一意化を、決定を押す前の中間状態で検証する", () => {
  beforeEach(() => {
    mocks.override = null;
  });

  it("[V-18] 「全選択」を押した直後 (決定は未押下) のフッター選択件数は、members に重複行があっても実ユーザー数と厳密一致する", () => {
    // members 自体に同一 user_id の行が2つ混在する状態を直接注入する
    // (通常 team_memberships は team_id+user_id で一意だが、handleGlobalToggle の
    // Set 一意化ロジック単体を決定ボタンを介さずに検証するための fixture)。
    const membersWithDuplicate = [
      buildMember({ id: "m-a", user_id: "u-a", name: "A選手" }),
      buildMember({ id: "m-b", user_id: "u-b", name: "B選手" }),
      buildMember({ id: "m-c", user_id: "u-c", name: "C選手" }),
      buildMember({ id: "m-d1", user_id: "u-d", name: "D選手" }),
      buildMember({ id: "m-d2", user_id: "u-d", name: "D選手" }),
    ];

    const onConfirm = vi.fn();
    renderModal(membersWithDuplicate, onConfirm);

    fireEvent.click(screen.getByRole("button", { name: "全選択" }));

    // 決定ボタンはまだ押していない = onConfirm の一意化は一切介在していない中間状態
    expect(onConfirm).not.toHaveBeenCalled();

    // フッターの選択件数表示 (tempSelected.length を直接描画) が
    // 実ユーザー数 (4人) と厳密一致することを、決定を介さずに確認する
    expect(screen.getByText("4名選択中")).toBeTruthy();
  });
});
