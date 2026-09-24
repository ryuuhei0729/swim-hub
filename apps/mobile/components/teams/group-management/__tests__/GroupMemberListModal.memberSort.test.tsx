/**
 * GroupMemberListModal.memberSort.test.tsx (mobile) — メンバー一覧の年上順ソート検証
 *
 * Sprint Contract [並び順スプリント]:
 *   - team_memberships の select() 文字列に birthday が含まれる（未select化の検出）
 *   - 年上順（生年月日昇順、未設定は末尾）でメンバーが表示される
 *
 * モック方針 (クエリ引数を捨てない): 過去に「サーバー側絞り込みとクライアント filter を
 * 区別できず情報露出が全 green 通過」した事故があるため、select() に渡された
 * 実引用文字列そのものを capture して assert する。
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("@/hooks/useSignedImageUrl", () => ({
  useSignedImageUrl: () => ({ url: null, isLoading: false }),
}));

import { GroupMemberListModal } from "../GroupMemberListModal";
import type { TeamGroupWithCount } from "../hooks";

const GROUP: TeamGroupWithCount = {
  id: "g1",
  team_id: "t1",
  category: null,
  name: "Aグループ",
  member_count: 1,
} as unknown as TeamGroupWithCount;

function buildSupabaseMock(membershipsData: unknown[], groupMembershipsData: unknown[]) {
  const selectCalls: string[] = [];
  return {
    from: (table: string) => {
      if (table === "team_group_memberships") {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: groupMembershipsData, error: null }),
          }),
        };
      }
      return {
        select: (query: string) => {
          selectCalls.push(query);
          const builder = {
            eq: () => builder,
            in: () => Promise.resolve({ data: membershipsData, error: null }),
          };
          return builder;
        },
      };
    },
    selectCalls,
  } as unknown as { from: (table: string) => unknown; selectCalls: string[] };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GroupMemberListModal (mobile) - メンバー一覧の年上順ソート", () => {
  it("select() に渡す文字列に birthday が含まれる（未select化の検出）", async () => {
    const supabase = buildSupabaseMock(
      [
        {
          id: "m-1",
          user_id: "u-1",
          role: "user",
          users: { id: "u-1", name: "花子", profile_image_path: null, birthday: "2000-01-01" },
        },
      ],
      [{ user_id: "u-1" }],
    );

    render(
      <GroupMemberListModal
        visible={true}
        onClose={vi.fn()}
        group={GROUP}
        teamId="t1"
        supabase={supabase as never}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("花子")).toBeTruthy();
    });

    expect((supabase as unknown as { selectCalls: string[] }).selectCalls.length).toBeGreaterThan(
      0,
    );
    const lastSelect = (supabase as unknown as { selectCalls: string[] }).selectCalls.slice(-1)[0];
    expect(lastSelect).toContain("birthday");
  });

  it("2008年生まれが2012年生まれより先に表示され、未設定は末尾になる", async () => {
    const supabase = buildSupabaseMock(
      [
        {
          id: "m-younger",
          user_id: "u-younger",
          role: "admin",
          users: { id: "u-younger", name: "ジロウ", profile_image_path: null, birthday: "2012-04-01" },
        },
        {
          id: "m-older",
          user_id: "u-older",
          role: "user",
          users: { id: "u-older", name: "タロウ", profile_image_path: null, birthday: "2008-04-01" },
        },
        {
          id: "m-none",
          user_id: "u-none",
          role: "user",
          users: { id: "u-none", name: "サブロウ", profile_image_path: null, birthday: null },
        },
      ],
      [{ user_id: "u-younger" }, { user_id: "u-older" }, { user_id: "u-none" }],
    );

    render(
      <GroupMemberListModal
        visible={true}
        onClose={vi.fn()}
        group={GROUP}
        teamId="t1"
        supabase={supabase as never}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("タロウ")).toBeTruthy();
    });

    const names = screen.getAllByText(/^(タロウ|ジロウ|サブロウ)$/).map((el) => el.textContent);
    expect(names).toEqual(["タロウ", "ジロウ", "サブロウ"]);
  });
});
