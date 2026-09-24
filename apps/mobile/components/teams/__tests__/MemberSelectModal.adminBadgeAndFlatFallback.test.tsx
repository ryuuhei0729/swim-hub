// =============================================================================
// MemberSelectModal.adminBadgeAndFlatFallback.test.tsx
// [QA Sprint Contract Phase B] R9 (管理者バッジ復活) / R10 (グルーピング無効時の
// 見出し無しフォールバック) の追加検証項目 V-12 / V-13
// =============================================================================
//
// 【V-12: 管理者バッジ (R9)】
// PM 裁定: Developer が「accessible name の完全一致が壊れる」という理由でチップから
// 管理者バッジ (t("teams.record.adminBadge")) を撤去したことは却下。バッジは復活させる
// のが Developer の仕事であり、QA は「復活後に green になる検証」と「バッジが同居しても
// 壊れないクエリ」を用意する。
//
// 【クエリ設計 (R9 の指示に対応)】
// `screen.getByRole("button", { name: "花子" })` のような完全一致は、バッジが
// 同一 Pressable 内の兄弟 Text として描画されると accessible name が
// "花子管理者" 等に変化し壊れる。そのため本ファイルでは
// `getAllByRole("button")` からメンバー名を含むボタンを textContent で特定し、
// その中に管理者バッジの文言が含まれるかどうかで判定する
// (完全一致の name 解決に依存しない)。
//
// 【修正ループ2周目時点の状態】
// Developer が MemberSelectModal.tsx にバッジを復活させたことを確認済み
// (role==="admin" のメンバーのみ表示、chip を flexDirection:"row" 化)。
// [V-12] は green になっている。あわせて Developer が独自判断で追加した
// 「選択済みチップ (青背景) 上ではバッジを半透明白に切り替える」配色変更
// (未選択時は従来の紫バッジ #EDE9FE/#6D28D9 のまま) も [V-12c] で実測する。
//
// 【V-13: グルーピング無効時のフォールバック (R10)】
// TeamMemberGroupFilter は activeCategory === null のとき
// onGroupedMembersChange(members, new Map()) を呼ぶ (グルーピング無効)。
// MemberSelectModal はこれを ranges.length === 0 として検出し、
// 見出し無しの単一セクション ([{ label: "", start: 0, end: groupedMembers.length }])
// にフォールバックする。この経路は Phase A のテストでは明示的な検証項目として
// 定義されていなかった (TG-1 系のテストは結果的にこの経路を通ってはいたが、
// 「見出しが無いこと」「ミニトグルが1つも出ないこと」自体は assert していなかった)。
//
// 【トートロジー防止】
// - バッジの有無は「テキストが存在するか」という観測可能な結果のみで判定し、
//   実装の条件式 (role === "admin" 等) をテスト内で再実装しない。
// - V-13 の「見出し無し」は「全選択ラベルのボタンがグローバル1つだけ」という
//   数量的な観測結果で判定する (これも実装の分岐条件を再現しない)。
// =============================================================================

import React, { useEffect } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
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

const ADMIN_BADGE_TEXT = "管理者";

const buildMember = (
  overrides: Partial<TeamMembershipWithUser> & {
    id: string;
    user_id: string;
    name: string;
    role?: "admin" | "user";
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
      gender: 0,
      birthday: null,
    },
  }) as unknown as TeamMembershipWithUser;

const renderModal = (members: TeamMembershipWithUser[]) =>
  render(
    <MemberSelectModal
      visible
      teamId="team-1"
      supabase={dummySupabase}
      members={members}
      selectedUserIds={[]}
      onConfirm={vi.fn()}
      onCancel={vi.fn()}
    />,
  );

/** メンバー名を含むボタン (チップ本体) を、完全一致ではなく textContent の
 *  部分一致で特定する (R9: バッジ同居後も壊れないクエリ)。 */
function findChipButtonByMemberName(name: string): HTMLElement {
  const buttons = screen.getAllByRole("button");
  const found = buttons.find((b) => (b.textContent ?? "").includes(name));
  if (!found) {
    throw new Error(`メンバー名 "${name}" を含むチップボタンが見つからない`);
  }
  return found;
}

describe("[V-12] 管理者バッジ (R9 復活対象)", () => {
  beforeEach(() => {
    mocks.currentHeaders = new Map();
  });

  it("[V-12] role==='admin' のメンバーのチップには管理者バッジが表示される", () => {
    renderModal([
      buildMember({ id: "m-1", user_id: "u-taro", name: "太郎", role: "user" }),
      buildMember({ id: "m-2", user_id: "u-hanako", name: "花子", role: "admin" }),
    ]);

    const hanakoChip = findChipButtonByMemberName("花子");
    expect(within(hanakoChip).queryByText(ADMIN_BADGE_TEXT)).not.toBeNull();
  });

  it("[V-12] 対照: role==='user' のメンバーのチップには管理者バッジが表示されない", () => {
    renderModal([
      buildMember({ id: "m-1", user_id: "u-taro", name: "太郎", role: "user" }),
      buildMember({ id: "m-2", user_id: "u-hanako", name: "花子", role: "admin" }),
    ]);

    const taroChip = findChipButtonByMemberName("太郎");
    expect(within(taroChip).queryByText(ADMIN_BADGE_TEXT)).toBeNull();
  });

  it("[V-12c] 選択済みチップ上のバッジは半透明白、未選択チップ上のバッジは従来の紫のまま (R8境界の確認)", () => {
    renderModal([
      buildMember({ id: "m-1", user_id: "u-taro", name: "太郎", role: "user" }),
      buildMember({ id: "m-2", user_id: "u-hanako", name: "花子", role: "admin" }),
      buildMember({ id: "m-3", user_id: "u-sachi", name: "幸", role: "admin" }),
    ]);

    // 花子だけを選択する。幸 (管理者だが未選択のまま) は対照として残す。
    fireEvent.click(findChipButtonByMemberName("花子"));

    const hanakoBadgeText = within(findChipButtonByMemberName("花子")).getByText(
      ADMIN_BADGE_TEXT,
    );
    const sachiBadgeText = within(findChipButtonByMemberName("幸")).getByText(ADMIN_BADGE_TEXT);

    // 選択済み (花子): 半透明白バッジ + 白文字
    expect(hanakoBadgeText.parentElement!.style.backgroundColor).toBe(
      "rgba(255, 255, 255, 0.25)",
    );
    expect(hanakoBadgeText.style.color).toBe("rgb(255, 255, 255)");

    // --- 対照: 未選択のまま (幸) は従来の紫バッジを維持する ---
    expect(sachiBadgeText.parentElement!.style.backgroundColor).toBe("rgb(237, 233, 254)");
    expect(sachiBadgeText.style.color).toBe("rgb(109, 40, 217)");
  });
});

describe("[V-13] グルーピング無効時 (activeCategory===null) の見出し無しフォールバック (R10)", () => {
  beforeEach(() => {
    // TeamMemberGroupFilter が activeCategory===null のとき返す形を再現する
    mocks.currentHeaders = new Map();
  });

  it("[V-13a] 見出しが1つも描画されず、全メンバーのチップがフラットに表示される", () => {
    renderModal([
      buildMember({ id: "m-1", user_id: "u-taro", name: "太郎" }),
      buildMember({ id: "m-2", user_id: "u-jiro", name: "次郎" }),
      buildMember({ id: "m-3", user_id: "u-hanako", name: "花子" }),
    ]);

    // 見出し無し = グループ内ミニトグルが1つも生成されない。
    // 「全選択」ラベルのボタンはグローバルの1つだけになる。
    expect(screen.getAllByRole("button", { name: "全選択" })).toHaveLength(1);

    expect(findChipButtonByMemberName("太郎")).toBeTruthy();
    expect(findChipButtonByMemberName("次郎")).toBeTruthy();
    expect(findChipButtonByMemberName("花子")).toBeTruthy();
  });

  it("[V-13b] 見出し無し状態でもグローバル全選択トグルは正しく全員を選択/解除する", () => {
    renderModal([
      buildMember({ id: "m-1", user_id: "u-taro", name: "太郎" }),
      buildMember({ id: "m-2", user_id: "u-jiro", name: "次郎" }),
    ]);

    const globalBtn = screen.getByRole("button", { name: "全選択" });
    fireEvent.click(globalBtn);

    // フッターの選択件数表示で全員 (2名) 選択されたことを確認する
    expect(screen.getByText(/2/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "全選択" }));
    expect(screen.getByText(/0/)).toBeTruthy();
  });
});
