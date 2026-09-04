/**
 * GroupMemberListModal (チーム > グループ管理 > グループメンバー一覧モーダル)
 * WAポイント機能のための gender 配線 (第3経路) 検証
 *
 * ## 背景
 * `MemberDetailModal` は3経路から描画される:
 *   1. teams/[teamId]/_client/TeamDetailClient.tsx (useMembers 経由、既存)
 *   2. teams-admin/[teamId]/_client/TeamAdminClient.tsx (useMembers 経由、既存)
 *   3. team/group-management/TeamGroupManagement.tsx → GroupMemberListModal 経由 (本スプリントで
 *      `gender` を追加配線)
 *
 * PM 実測により、経路3は `apps/shared/api/teams/groups.ts` の `listGroupMembers` を経由せず、
 * このファイル内のインライン `supabase.from("team_memberships").select(...)` を直接使う。
 * よって `groups.ts` への `gender` 追加だけでは経路3は保護されず、このファイル自身の
 * SELECT 文字列に `gender` が含まれることを実測する必要がある。
 *
 * ## モック方針 (クエリ引数を捨てない)
 * 過去に「サーバー側絞り込みとクライアント filter を区別できず情報露出が全 green 通過」した
 * 事故があるため、`select()` に渡された実引用文字列そのものを capture し、
 * その文字列に `"gender"` が含まれることを直接 assert する
 * (モックがクエリ条件を握り潰すと、SELECT から `gender` を消しても green のままになり、
 * この経路を守れないテストになってしまう)。
 *
 * Sprint Contract 追加検証観点 (Checklist 外・追加タスク A):
 *   [V-GROUPMODAL-01] team_memberships への SELECT 文字列に "gender" が含まれる
 *   [V-GROUPMODAL-02] 取得したメンバーをクリックすると、gender を含む MemberDetail が
 *                      onMemberClick に渡される
 */

import React from "react";
import { renderWithI18n as render, screen, waitFor } from "../../../utils/render";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { MemberDetail } from "@/types/member-detail";
import type { TeamGroupWithCount } from "@/components/team/group-management/hooks/useTeamGroups";

const mocks = vi.hoisted(() => ({
  selectCalls: [] as string[],
}));

const RAW_MEMBER_ROW = {
  id: "membership-1",
  user_id: "user-1",
  role: "user" as const,
  is_active: true,
  joined_at: "2025-01-01T00:00:00Z",
  users: {
    id: "user-1",
    name: "テスト花子",
    birthday: "2000-01-01",
    bio: "",
    profile_image_path: null,
    gender: 1,
  },
};

vi.mock("@/contexts", () => ({
  useAuth: () => ({
    supabase: {
      from: (table: string) => {
        if (table === "team_group_memberships") {
          return {
            select: () => ({
              eq: () => Promise.resolve({ data: [{ user_id: "user-1" }], error: null }),
            }),
          };
        }
        // team_memberships: 実際のクエリ形状 (.eq().eq().eq().in().order()) を維持する
        return {
          select: (query: string) => {
            mocks.selectCalls.push(query);
            const builder = {
              eq: () => builder,
              in: () => builder,
              order: () => Promise.resolve({ data: [RAW_MEMBER_ROW], error: null }),
            };
            return builder;
          },
        };
      },
    },
  }),
}));

import { GroupMemberListModal } from "@/components/team/group-management/components/GroupMemberListModal";

const buildGroup = (overrides: Partial<TeamGroupWithCount> = {}): TeamGroupWithCount => ({
  id: "group-1",
  team_id: "team-1",
  category: null,
  name: "Aグループ",
  created_by: "admin-1",
  created_at: null,
  updated_at: null,
  member_count: 1,
  ...overrides,
});

describe("[V-GROUPMODAL-01] GroupMemberListModal の team_memberships SELECT に gender が含まれる", () => {
  beforeEach(() => {
    mocks.selectCalls.length = 0;
  });

  it("グループを開くと team_memberships への select() 呼び出し文字列に 'gender' が含まれる", async () => {
    render(
      <GroupMemberListModal
        isOpen={true}
        onClose={vi.fn()}
        group={buildGroup()}
        teamId="team-1"
        onMemberClick={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("テスト花子")).toBeInTheDocument();
    });

    expect(mocks.selectCalls.length).toBeGreaterThan(0);
    const teamMembershipsSelect = mocks.selectCalls[mocks.selectCalls.length - 1];
    expect(teamMembershipsSelect).toContain("gender");
  });
});

describe("[V-GROUPMODAL-02] メンバークリックで gender を含む MemberDetail が渡される", () => {
  beforeEach(() => {
    mocks.selectCalls.length = 0;
  });

  it("メンバー行をクリックすると、onMemberClick に gender=1 を含むメンバーが渡される", async () => {
    const user = userEvent.setup();
    const onMemberClick = vi.fn<(member: MemberDetail) => void>();

    render(
      <GroupMemberListModal
        isOpen={true}
        onClose={vi.fn()}
        group={buildGroup()}
        teamId="team-1"
        onMemberClick={onMemberClick}
      />,
    );

    const memberButton = await screen.findByText("テスト花子");
    await user.click(memberButton);

    expect(onMemberClick).toHaveBeenCalledTimes(1);
    const passedMember = onMemberClick.mock.calls[0]![0];
    expect(passedMember.users.gender).toBe(1);
  });
});
