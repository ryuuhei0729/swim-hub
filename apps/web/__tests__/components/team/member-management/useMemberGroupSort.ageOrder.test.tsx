/**
 * useMemberGroupSort — グループ内の並び (ryuuhei0729/swimhub-tasks#106)
 *
 * sortWithinGroupsByAge を指定したとき (メンバー一覧)、各グループ内は年齢の降順
 * (同じ年齢は名前順、生年月日未設定は最後に名前順) になる。指定しないとき
 * (MemberSelectModal) は渡された順のまま。
 * 並べ替えの細かい規則は packages/shared の sortMembersByAgeForGroup のテストで見る。
 */
import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createTestQueryClient } from "@/__tests__/helpers/teamQueryTestUtils";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import type { SupabaseClient } from "@supabase/supabase-js";
import jaMessages from "@apps/shared/messages/ja.json";
import { useMemberGroupSort } from "../../../../components/team/member-management/hooks/useMemberGroupSort";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  listAllMemberships: vi.fn(),
}));

vi.mock("@apps/shared/api/teams/groups", () => ({
  TeamGroupsAPI: vi.fn().mockImplementation(function () {
    return {
      list: mocks.list,
      listAllMemberships: mocks.listAllMemberships,
    };
  }),
}));

let queryClient = createTestQueryClient();
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>
    <NextIntlClientProvider locale="ja" messages={jaMessages as unknown as AbstractIntlMessages}>
      {children}
    </NextIntlClientProvider>
  </QueryClientProvider>
);

const dummySupabase = {} as unknown as SupabaseClient;

// 年齢がはっきり分かれる生年月日にし、テストを実行する日付に左右されないようにする
const members = [
  { user_id: "u-young", users: { gender: 0, name: "アオイ", birthday: "2016-06-01" } },
  { user_id: "u-none", users: { gender: 0, name: "イツキ" } },
  { user_id: "u-old", users: { gender: 0, name: "ワタル", birthday: "2000-06-01" } },
  { user_id: "u-mid", users: { gender: 0, name: "ハル", birthday: "2008-06-01" } },
];

describe("useMemberGroupSort — グループ内の並び [#106]", () => {
  beforeEach(() => {
    queryClient = createTestQueryClient();
    mocks.list.mockReset().mockResolvedValue([
      { id: "g1", team_id: "team-1", category: "学年", name: "A組" },
    ]);
    mocks.listAllMemberships.mockReset().mockResolvedValue([
      { user_id: "u-young", team_group_id: "g1" },
      { user_id: "u-old", team_group_id: "g1" },
      { user_id: "u-none", team_group_id: "g1" },
    ]);
  });

  it("sortWithinGroupsByAge のときは性別のグループ内を年上から並べ、生年月日未設定は最後", () => {
    const { result } = renderHook(
      () => useMemberGroupSort("team-1", dummySupabase, true, { sortWithinGroupsByAge: true }),
      { wrapper },
    );

    const groups = result.current.groupMembers(members);
    expect(groups?.[0]?.members.map((m) => m.user_id)).toEqual([
      "u-old",
      "u-mid",
      "u-young",
      "u-none",
    ]);
  });

  it("sortWithinGroupsByAge のときはカテゴリのグループ内・未所属も年上から並べる", async () => {
    const { result } = renderHook(
      () => useMemberGroupSort("team-1", dummySupabase, true, { sortWithinGroupsByAge: true }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.categories).toContain("学年"));
    act(() => result.current.toggleCategory("学年"));
    await waitFor(() => expect(result.current.activeCategory).toBe("学年"));

    const groups = result.current.groupMembers(members);
    expect(groups?.map((g) => [g.groupName, g.members.map((m) => m.user_id)])).toEqual([
      ["A組", ["u-old", "u-young", "u-none"]],
      [jaMessages.teams.memberGroupSort.unassigned, ["u-mid"]],
    ]);
  });

  it("指定しないとき (MemberSelectModal) は渡された順のまま", () => {
    const { result } = renderHook(() => useMemberGroupSort("team-1", dummySupabase), { wrapper });

    const groups = result.current.groupMembers(members);
    expect(groups?.[0]?.members.map((m) => m.user_id)).toEqual([
      "u-young",
      "u-none",
      "u-old",
      "u-mid",
    ]);
  });
});
