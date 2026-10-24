// =============================================================================
// teamMemberListHarness.tsx
// TeamMemberList を render するテストの共通モック。QA (Evaluator) が所有するテスト支援コード。
// =============================================================================
//
// このファイルを import するだけで、下記モジュールが vi.mock される。
// ファイルごとに差し替えたい値は `harness` のプロパティを書き換える。
//
//   @/contexts/AuthProvider           supabase.from (harness.supabaseFrom)
//   @apps/shared/hooks/queries/teams  ロール変更・メンバー削除の mutation (何もしない)
//   ../member-detail                  MemberDetailModal。既定は描画しない。
//                                     harness.showOpenedMemberDetail = true で、開いたメンバー名を
//                                     「member-detail-open:<名前>」として描画する
//   ../TeamMemberGroupFilter          マウント時と members 変化時に onGroupedMembersChange(members, 見出し) を呼ぶ。
//                                     見出しは harness.groupHeaders (未設定なら空 Map)。
//                                     harness.groupFilterTogglesTwoGroups = true なら、押すと
//                                     先頭と中間に見出しを立てた2グループに分ける
//   @shopify/flash-list               FlashList を data.map で全件描画する div にする
//
// 🚨 テストファイル側で上記モジュールを vi.mock し直してはいけない。ファイル側の
//    vi.mock は巻き上げで先に登録され、このファイルの import 時に上書きされて
//    黙って無効になる (screenHarnesses.test.ts が検出する)。挙動を変えたいときは
//    harness にプロパティを足す。
//
// このファイルは `import { TeamMemberList } from "../TeamMemberList"` より前に import する。

import React, { useEffect } from "react";
import { Pressable, Text } from "react-native";
import { vi } from "vitest";
import type { TeamMembershipWithUser } from "@swim-hub/shared/types";

const harness = vi.hoisted(() => {
  const supabaseFrom = vi.fn();
  return {
    supabaseFrom,
    authValue: { supabase: { from: supabaseFrom } },
    /** TeamMemberGroupFilter スタブの表示テキスト */
    groupFilterLabel: "group-filter",
    groupFilterTogglesTwoGroups: false,
    groupHeaders: null as Map<number, string> | null,
    showOpenedMemberDetail: false,
  };
});

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => harness.authValue,
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
    harness.showOpenedMemberDetail && isOpen && member
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
      onGroupedMembersChange(members, harness.groupHeaders ?? new Map());
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [members]);

    const onPress = harness.groupFilterTogglesTwoGroups
      ? () => {
          const half = Math.ceil(members.length / 2);
          const headers = new Map<number, string>([
            [0, "グループA"],
            [half, "グループB"],
          ]);
          onGroupedMembersChange(members, headers);
        }
      : undefined;
    return React.createElement(Pressable, { onPress }, React.createElement(Text, null, harness.groupFilterLabel));
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

export { harness };

export const buildMember = (
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

/** メンバーのベストタイム取得 (`from(...).select().in().order()`) を指定の行で解決させる */
export const mockRecordsQuery = (records: unknown[]) => {
  harness.supabaseFrom.mockImplementation((_table: string) => ({
    select: vi.fn(() => ({
      in: vi.fn(() => ({
        order: vi.fn().mockResolvedValue({ data: records, error: null }),
      })),
    })),
  }));
};

export const mockEmptyRecordsQuery = () => {
  harness.supabaseFrom.mockImplementation((_table: string) => ({
    select: vi.fn(() => ({
      in: vi.fn(() => ({
        order: vi.fn().mockResolvedValue({ data: [], error: null }),
      })),
    })),
  }));
};
