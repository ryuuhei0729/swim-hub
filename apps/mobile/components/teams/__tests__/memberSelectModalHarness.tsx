// =============================================================================
// memberSelectModalHarness.tsx
// MemberSelectModal を render するテストの共通モックとヘルパー。QA (Evaluator) が所有するテスト支援コード。
// =============================================================================
//
// このファイルを import するだけで、下記モジュールが vi.mock される。
//
//   ../TeamMemberGroupFilter  何も描画せず、マウント時と members 変化時に onGroupedMembersChange を呼ぶ。
//                             harness.groupOverride があればその groupedMembers と headers を、
//                             無ければ members と harness.groupHeaders を渡す
//
// 🚨 テストファイル側で上記モジュールを vi.mock し直してはいけない。ファイル側の
//    vi.mock は巻き上げで先に登録され、このファイルの import 時に上書きされて
//    黙って無効になる (screenHarnesses.test.ts が検出する)。挙動を変えたいときは
//    harness にプロパティを足す。
//
// このファイルは `import { MemberSelectModal } from "../MemberSelectModal"` より前に import する。

import { screen } from "@testing-library/react";
import { useEffect } from "react";
import { expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TeamMembershipWithUser } from "@apps/shared/types";

const harness = vi.hoisted(() => ({
  groupHeaders: new Map<number, string>(),
  groupOverride: null as {
    groupedMembers: TeamMembershipWithUser[];
    headers: Map<number, string>;
  } | null,
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
      if (harness.groupOverride) {
        onGroupedMembersChange(harness.groupOverride.groupedMembers, harness.groupOverride.headers);
      } else {
        onGroupedMembersChange(members, harness.groupHeaders);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [members]);
    return null;
  },
}));

export { harness };

export const dummySupabase = {} as unknown as SupabaseClient;

export const buildMember = (
  overrides: Partial<TeamMembershipWithUser> & {
    id: string;
    user_id: string;
    name: string;
    role?: "admin" | "user";
    gender?: number;
    birthday?: string | null;
  },
): TeamMembershipWithUser =>
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
      gender: overrides.gender ?? 0,
      birthday: overrides.birthday ?? null,
    },
  }) as unknown as TeamMembershipWithUser;

export function findChipButtonByMemberName(name: string): HTMLElement {
  const buttons = screen.getAllByRole("button");
  const found = buttons.find((b) => (b.textContent ?? "").includes(name));
  if (!found) {
    throw new Error(`メンバー名 "${name}" を含むチップボタンが見つからない`);
  }
  return found;
}

/** 見出しテキストを含む最も近い共通コンテナ (行) を、その中に "全選択" ボタンが見つかるまで遡って特定する */
export function findGroupToggleButton(headerText: string): HTMLElement {
  const header = screen.getByText(headerText);
  const allToggleButtons = screen.getAllByRole("button", { name: "全選択" });
  let row: Element | null = header.parentElement;
  while (row) {
    const current = row;
    const found = allToggleButtons.find((b) => current.contains(b));
    if (found) return found as HTMLElement;
    row = row.parentElement;
  }
  throw new Error(`グループ見出し "${headerText}" の近くに全選択トグルが見つからない`);
}

/** グループ内に閉じ込められていない = グローバルの全選択ボタンを特定する */
export function findGlobalToggleButton(groupHeaderTexts: string[]): HTMLElement {
  const allToggleButtons = screen.getAllByRole("button", { name: "全選択" });
  const groupButtons = groupHeaderTexts.map((h) => findGroupToggleButton(h));
  const remaining = allToggleButtons.filter((b) => !groupButtons.includes(b));
  expect(remaining).toHaveLength(1);
  return remaining[0]!;
}
