// =============================================================================
// MemberSelectModal.duplicateMemberDedup.test.tsx
// [QA Sprint Contract Phase B 修正ループ2周目] Reviewer 指摘の回帰テストギャップ
// (V-14 / V-15 / V-16)
// =============================================================================
//
// 【真因 (PM 実測済み)】
// `TeamMemberGroupFilter.tsx:134-141` はカテゴリ内の各グループごとに
// `members.filter(...)` した結果を `flat.push(...)` する。DB のユニーク制約は
// `(team_group_id, user_id)` のみで「同一カテゴリ内で1グループまで」という制約は
// 無いため、1人のユーザーが同じカテゴリの2グループに所属する状態は正当に成立し、
// その場合 `groupedMembers` に同一 user_id の行が2つ (別 membership id) 入る。
//
// 【このファイルのスコープ】
// 実際の `TeamMemberGroupFilter` の性別/カテゴリ判定ロジックは対象外
// (既存の [TG] ファイルと同様にスタブ化する)。ここでは
// 「groupedMembers に同一 user_id が重複して含まれている状態」を fixture として
// 直接注入し、`handleGlobalToggle` / `handleRangeToggle` / `onConfirm` の
// 一意化契約だけを検証する。
//
// 【fixture 設計上の注意 (PM 指示)】
// `member.id` (membership PK, key に使われる) と `member.user_id` (選択状態の単位)
// は別物。同一 user_id を持つが `id` が異なる2件の membership を混在させる
// (React の `key` が `member.id` を使っているため、実際に起きうる形をそのまま再現する)。
//
// 【トートロジー防止】
// - 重複判定は「onConfirm に渡った配列の件数」を厳密一致で確認する
//   (`toContain` のような部分一致は使わない)。
// - `new Set(...).size` を「実装の一意化ロジックの再実装」として使ってはいない
//   (件数比較の道具として使うだけで、どの要素が残るべきかの判定には使っていない)。
// =============================================================================

import React, { useEffect } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TeamMembershipWithUser } from "@apps/shared/types";

const mocks = vi.hoisted(() => ({
  currentHeaders: new Map<number, string>(),
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
      onGroupedMembersChange(members, mocks.currentHeaders);
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

// 「花子」(user_id: u-hanako) が Aグループ / Bグループ 双方に所属している状態。
// membership id は別 (m-hanako-a / m-hanako-b) だが user_id は同一。
const buildDuplicateFixture = (): TeamMembershipWithUser[] => [
  buildMember({ id: "m-taro", user_id: "u-taro", name: "太郎" }),
  buildMember({ id: "m-jiro", user_id: "u-jiro", name: "次郎" }),
  buildMember({ id: "m-hanako-a", user_id: "u-hanako", name: "花子" }),
  buildMember({ id: "m-sachi", user_id: "u-sachi", name: "幸" }),
  buildMember({ id: "m-hanako-b", user_id: "u-hanako", name: "花子" }),
];

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

const clickConfirm = () => {
  fireEvent.click(screen.getByRole("button", { name: "決定" }));
};

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

describe("[V-14/V-15/V-16] groupedMembers 内の同一ユーザー重複 (複数グループ所属) の一意化", () => {
  beforeEach(() => {
    // Aグループ: index 0-2 (太郎, 次郎, 花子#1) / Bグループ: index 3-4 (幸, 花子#2)
    mocks.currentHeaders = new Map<number, string>([
      [0, "Aグループ"],
      [3, "Bグループ"],
    ]);
  });

  it("[V-14] グローバル全選択→決定で、onConfirm には重複 user_id が渡らない", () => {
    const onConfirm = vi.fn();
    renderModal(buildDuplicateFixture(), onConfirm);

    fireEvent.click(findGlobalToggleButton(["Aグループ", "Bグループ"]));
    clickConfirm();

    expect(onConfirm).toHaveBeenCalledTimes(1);
    const confirmed = onConfirm.mock.calls[0]![0] as string[];

    // 実メンバーは4人 (太郎/次郎/花子/幸) なので長さは厳密に4であること
    expect(confirmed).toHaveLength(4);
    // 花子 (u-hanako) の出現回数を厳密に1回であることで確認する (部分一致は使わない)
    expect(confirmed.filter((id) => id === "u-hanako")).toHaveLength(1);
    expect(new Set(confirmed).size).toBe(confirmed.length);
  });

  it("[V-15] AグループとBグループのミニトグルを両方押して決定しても、onConfirm には重複 user_id が渡らない", () => {
    const onConfirm = vi.fn();
    renderModal(buildDuplicateFixture(), onConfirm);

    // グローバル1 + グループ2 の計3つのうち、グループ見出しに紐づく2つを両方押す
    expect(screen.getAllByRole("button", { name: "全選択" })).toHaveLength(3);
    fireEvent.click(findGroupToggleButton("Aグループ"));
    fireEvent.click(findGroupToggleButton("Bグループ"));

    clickConfirm();

    expect(onConfirm).toHaveBeenCalledTimes(1);
    const confirmed = onConfirm.mock.calls[0]![0] as string[];

    expect(confirmed).toHaveLength(4);
    expect(confirmed.filter((id) => id === "u-hanako")).toHaveLength(1);
    expect(new Set(confirmed).size).toBe(confirmed.length);
  });

  it("[V-16] 重複表示された「花子」チップの片方をタップすると、両方のチップが連動して未選択表示になる", () => {
    const onConfirm = vi.fn();
    renderModal(buildDuplicateFixture(), onConfirm);

    // まずグローバル全選択で両方の「花子」チップを選択状態にする
    fireEvent.click(findGlobalToggleButton(["Aグループ", "Bグループ"]));

    const hanakoChipsSelected = screen.getAllByRole("button", { name: "花子" });
    expect(hanakoChipsSelected).toHaveLength(2);
    const SELECTED_BG = "rgb(37, 99, 235)";
    const UNSELECTED_BG = "rgb(255, 255, 255)";
    expect(hanakoChipsSelected[0]!.style.backgroundColor).toBe(SELECTED_BG);
    expect(hanakoChipsSelected[1]!.style.backgroundColor).toBe(SELECTED_BG);

    // 片方 (1つ目、Aグループ側) だけをタップして選択解除する
    fireEvent.click(hanakoChipsSelected[0]!);

    const hanakoChipsAfter = screen.getAllByRole("button", { name: "花子" });
    expect(hanakoChipsAfter).toHaveLength(2);
    // 観測された挙動をそのまま pin するのではなく、
    // 「選択状態は user_id 単位で共有される」という契約に照らして両方とも
    // 未選択表示になることを期待する。連動しなければこれは実装の不具合。
    expect(hanakoChipsAfter[0]!.style.backgroundColor).toBe(UNSELECTED_BG);
    expect(hanakoChipsAfter[1]!.style.backgroundColor).toBe(UNSELECTED_BG);
  });
});
