// =============================================================================
// MemberSelectModal.chipWidthStyles.test.tsx
// [QA Sprint Contract Phase B 修正ループ3周目] V-19 (修正5: チップ幅対策のスタイル確認)
// =============================================================================
//
// 【検証対象】
// Developer 報告の修正5: `chip` に `maxWidth: "100%"` + `flexShrink: 1`、
// `chipText` に `flexShrink: 1` を追加。`adminBadge` には `flexShrink` を付けず、
// 縮むのは名前側だけにする。
//
// 【重要な限界 (必ず報告する)】
// jsdom はレイアウトエンジンを持たず、実際の折り返し・はみ出し・要素の
// 実測ピクセル幅を計算しない。そのため本テストで確認できるのは
// 「該当スタイルプロパティがインラインスタイルとして存在し、意図した値になっているか」
// だけであり、「実機/シミュレータで実際にはみ出さないか」は証明できない。
// 実機・シミュレータでの目視確認は Developer 未実施 (自己申告) であり、
// QA (このセッション) も実機を保有していないため、別途人間による目視確認が
// 必要な残作業として報告する。
//
// 【トートロジー防止】
// 期待値 ("100%", "1", "" など) はリテラルで直書きする。
// styles.ts 側の値を import して突き合わせるようなことはしない
// (スタイルオブジェクトの再実装/参照そのものになってしまうため)。
// =============================================================================

import React, { useEffect } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { TeamMembershipWithUser } from "@apps/shared/types";

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
      onGroupedMembersChange(members, new Map());
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
  role?: "admin" | "user";
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

function findChipButtonByMemberName(name: string): HTMLElement {
  const buttons = screen.getAllByRole("button");
  const found = buttons.find((b) => (b.textContent ?? "").includes(name));
  if (!found) {
    throw new Error(`メンバー名 "${name}" を含むチップボタンが見つからない`);
  }
  return found;
}

describe("[V-19] チップ幅対策 (修正5) のスタイル値", () => {
  it("[V-19] chip は maxWidth:100%/flexShrink:1、chipText は flexShrink:1、adminBadge には flexShrink が無い", () => {
    render(
      <MemberSelectModal
        visible
        teamId="team-1"
        supabase={dummySupabase}
        members={[
          buildMember({
            id: "m-1",
            user_id: "u-nagai",
            name: "とても長い名前のテストユーザーサンプル太郎",
            role: "admin",
          }),
        ]}
        selectedUserIds={[]}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    const chip = findChipButtonByMemberName("とても長い名前のテストユーザーサンプル太郎");

    // chip 本体: maxWidth:"100%" + flexShrink:1
    expect(chip.style.maxWidth).toBe("100%");
    expect(chip.style.flexShrink).toBe("1");

    // chipText (メンバー名): flexShrink:1
    const nameText = within(chip).getByText(
      "とても長い名前のテストユーザーサンプル太郎",
    );
    expect(nameText.style.flexShrink).toBe("1");

    // adminBadge: flexShrink は付与されていない (名前側だけが縮む設計)
    const badgeText = within(chip).getByText("管理者");
    const badgeView = badgeText.parentElement!;
    expect(badgeView.style.flexShrink).toBe("");
  });
});

// 【残作業 (人間への申し送り)】
// このテストは「スタイルプロパティが存在すること」のみを保証する。
// 実際に長い名前 + 管理者バッジが横並びになった状態で、チップが親行 (chipGrid) の
// 幅を超えてはみ出さないか、バッジが潰れて読めなくならないかは、
// 実機 or シミュレータでの目視確認でしか判断できない (jsdom はレイアウト計算をしない)。
// Developer も実機/シミュレータでの確認は未実施と自己申告しており、QA (本セッション) も
// 実機を保有していないため、PM/人間による目視確認が必要な残作業として明記する。
