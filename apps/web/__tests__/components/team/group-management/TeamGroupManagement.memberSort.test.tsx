/**
 * TeamGroupManagement.memberSort.test.tsx (web) — メンバー一覧の年上順ソート検証
 *
 * Sprint Contract [並び順スプリント]:
 *   - グループへのメンバー割り当て候補一覧 (teamMembers state) も年上順で並ぶ
 *   - select() に birthday が含まれることを、クエリ引数を捨てないモックで実測する
 *
 * このコンポーネントは useTeamGroups / useGroupActions (グループCRUD) を内部で
 * 使うが、本テストの対象はそれらとは独立した「チームメンバー一覧取得 useEffect」
 * (T:88-115) のみなので、CRUD 系フックはモックしてノイズを排除する。
 * teamMembers は常にマウントされている GroupMemberModal に props として渡るため、
 * その子コンポーネントをモックして受け取った props を捕捉する
 * (EntriesDataLoader 等の既存パターンを踏襲)。
 */
import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderWithI18n as render, waitFor } from "../../../utils/render";

const mocks = vi.hoisted(() => ({
  selectCalls: [] as string[],
  data: [] as unknown[],
  capturedTeamMembers: undefined as unknown,
}));

vi.mock("@/contexts", () => ({
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

vi.mock("../../../../components/team/group-management/hooks/useTeamGroups", () => ({
  useTeamGroups: () => ({
    groups: [],
    categories: [],
    groupsByCategory: new Map(),
    loading: false,
    error: null,
    loadGroups: vi.fn(),
  }),
}));

vi.mock("../../../../components/team/group-management/hooks/useGroupActions", () => ({
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

vi.mock("../../../../components/team/group-management/components", () => ({
  GroupFormModal: () => null,
  GroupMemberModal: (props: { teamMembers: unknown }) => {
    mocks.capturedTeamMembers = props.teamMembers;
    return null;
  },
  GroupMemberListModal: () => null,
  BulkAssignModal: () => null,
  CategorySection: () => null,
}));

vi.mock("@/components/team/MemberDetailModal", () => ({
  default: () => null,
}));

import TeamGroupManagement from "../../../../components/team/group-management/TeamGroupManagement";

beforeEach(() => {
  mocks.selectCalls.length = 0;
  mocks.data = [];
  mocks.capturedTeamMembers = undefined;
});

describe("TeamGroupManagement (web) - メンバー割り当て候補一覧の年上順ソート", () => {
  it("select() に渡す文字列に birthday が含まれる（未select化の検出）", async () => {
    render(<TeamGroupManagement teamId="team-1" />);

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

    render(<TeamGroupManagement teamId="team-1" />);

    await waitFor(() => {
      expect(mocks.capturedTeamMembers).toBeDefined();
      expect((mocks.capturedTeamMembers as unknown[]).length).toBe(3);
    });

    const ids = (mocks.capturedTeamMembers as Array<{ user_id: string }>).map((m) => m.user_id);
    expect(ids).toEqual(["u-older", "u-younger", "u-none"]);
  });
});
