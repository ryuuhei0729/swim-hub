/**
 * TeamGroupManagement.memberSort.test.tsx (mobile) — メンバー割り当て候補一覧の
 * 年上順ソート検証 [並び順スプリント]
 *
 * Sprint Contract:
 *   - グループへのメンバー割り当て候補一覧 (teamMembers state) は年上順で並ぶ
 *   - select() に birthday が含まれることを、クエリ引数を捨てないモックで実測する
 *
 * グループCRUD (useTeamGroups/useGroupActions) は本テストの対象外なのでモックし、
 * teamMembers が渡る子コンポーネント (GroupMemberModal) をモックして props を捕捉する
 * (web 版 TeamGroupManagement.memberSort.test.tsx と同型のパターン)。
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  selectCalls: [] as string[],
  data: [] as unknown[],
  capturedTeamMembers: undefined as unknown,
}));

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({
    supabase: {
      from: (_table: string) => ({
        select: (query: string) => {
          mocks.selectCalls.push(query);
          const builder = {
            eq: () => builder,
            then: (
              onFulfilled?: (value: { data: unknown; error: unknown }) => unknown,
              onRejected?: (reason: unknown) => unknown,
            ) => Promise.resolve({ data: mocks.data, error: null }).then(onFulfilled, onRejected),
          };
          return builder;
        },
      }),
    },
    user: { id: "admin-1" },
  }),
}));

vi.mock("../hooks", () => ({
  useTeamGroups: () => ({
    groups: [],
    categories: [],
    groupsByCategory: new Map(),
    loading: false,
    error: null,
    loadGroups: vi.fn(),
  }),
  useGroupActions: () => ({
    saving: false,
    error: null,
    createGroup: vi.fn(),
    createGroups: vi.fn(),
    updateGroup: vi.fn(),
    deleteGroup: vi.fn(),
    listGroupMembers: vi.fn(),
    setGroupMembers: vi.fn(),
    clearError: vi.fn(),
  }),
}));

vi.mock("../CategorySection", () => ({ CategorySection: () => null }));
vi.mock("../GroupFormModal", () => ({ GroupFormModal: () => null }));
vi.mock("../GroupMemberListModal", () => ({ GroupMemberListModal: () => null }));
vi.mock("../BulkAssignModal", () => ({ BulkAssignModal: () => null }));
vi.mock("../../member-detail", () => ({ MemberDetailModal: () => null }));
vi.mock("../GroupMemberModal", () => ({
  GroupMemberModal: (props: { teamMembers: unknown }) => {
    mocks.capturedTeamMembers = props.teamMembers;
    return null;
  },
}));

import { TeamGroupManagement } from "../TeamGroupManagement";

beforeEach(() => {
  mocks.selectCalls.length = 0;
  mocks.data = [];
  mocks.capturedTeamMembers = undefined;
});

describe("TeamGroupManagement (mobile) - メンバー割り当て候補一覧の年上順ソート", () => {
  it("select() に渡す文字列に birthday が含まれる（未select化の検出）", async () => {
    render(
      <TeamGroupManagement teamId="team-1" members={[]} isCurrentUserAdmin={true} />,
    );

    await waitFor(() => {
      expect(mocks.selectCalls.length).toBeGreaterThan(0);
    });
    expect(mocks.selectCalls[mocks.selectCalls.length - 1]).toContain("birthday");
  });

  it("年上順（生年月日昇順）で teamMembers が GroupMemberModal に渡る", async () => {
    mocks.data = [
      {
        id: "m-younger",
        user_id: "u-younger",
        users: { id: "u-younger", name: "ジロウ", birthday: "2012-04-01" },
      },
      {
        id: "m-older",
        user_id: "u-older",
        users: { id: "u-older", name: "タロウ", birthday: "2008-04-01" },
      },
      {
        id: "m-none",
        user_id: "u-none",
        users: { id: "u-none", name: "サブロウ", birthday: null },
      },
    ];

    render(
      <TeamGroupManagement teamId="team-1" members={[]} isCurrentUserAdmin={true} />,
    );

    await waitFor(() => {
      expect(mocks.capturedTeamMembers).toBeDefined();
      expect((mocks.capturedTeamMembers as unknown[]).length).toBe(3);
    });

    const ids = (mocks.capturedTeamMembers as Array<{ user_id: string }>).map((m) => m.user_id);
    expect(ids).toEqual(["u-older", "u-younger", "u-none"]);
  });
});
