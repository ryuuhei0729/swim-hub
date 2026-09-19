/**
 * Issue #49 QA テスト (Phase A スケルトン): 統計ヘッダーの母数は非泳者を除外しない (R1)
 *
 * Sprint Contract 検証観点:
 *   [V-R1-01] PM裁定 R1: 「統計ヘッダーの母数は変更しない。総メンバー数は在籍者全員のまま。
 *             admin/user 内訳も変更しない」。TeamMemberManagement が MemberStatsHeader へ
 *             渡す totalMembers/adminCount/userCount が、非泳者を含んだ生の members 配列から
 *             計算されていることを、実コンポーネントを結合してレンダリングし確認する。
 *
 * このテストは「MembersTimeTable が非泳者を除外する」ことと「TeamMemberManagement の
 * 統計計算はそれとは無関係に生の members を使い続ける」ことの**両立**を確認するのが目的。
 * 実装時にありがちな誤りは「フィルタを1箇所に集約しよう」として誤って
 * `members.filter(excludeNonSwimmers)` を TeamMemberManagement の統計計算の手前に
 * 差し込んでしまうことで、これをやると本テストが red になる。
 *
 * モック方針: apps/web/__tests__/components/team/TeamMemberManagement.test.tsx の
 * ハーネス (useMembers/useMemberGroupSort/useMemberSort/useMemberBestTimes のみモックし、
 * MemberStatsHeader・MembersTimeTable は実装をそのまま結合する) を踏襲する。
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider, type AbstractIntlMessages } from "next-intl";
import { describe, it, expect, vi, beforeEach } from "vitest";

import jaMessages from "@apps/shared/messages/ja.json";

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({
    supabase: {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => Promise.resolve({ data: [], error: null }),
            order: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      }),
    },
  }),
}));

const useMembersMock = vi.fn();
const usePendingMembersMock = vi.fn();
const useMembershipActionsMock = vi.fn();
const useMemberSortMock = vi.fn();
const useMemberGroupSortMock = vi.fn();

vi.mock("../../../components/team/member-management/hooks", () => ({
  useMembers: (...args: unknown[]) => useMembersMock(...args),
  usePendingMembers: (...args: unknown[]) => usePendingMembersMock(...args),
  useMembershipActions: (...args: unknown[]) => useMembershipActionsMock(...args),
  useMemberSort: (...args: unknown[]) => useMemberSortMock(...args),
  useMemberGroupSort: (...args: unknown[]) => useMemberGroupSortMock(...args),
}));

const useMemberBestTimesMock = vi.fn();
vi.mock("../../../components/team/shared/hooks/useMemberBestTimes", () => ({
  useMemberBestTimes: (...args: unknown[]) => useMemberBestTimesMock(...args),
}));

import TeamMemberManagement from "../../../components/team/member-management/TeamMemberManagement";
import type { TeamMember } from "../../../components/team/member-management/hooks/useMembers";

type SwimmerMember = TeamMember & { is_swimmer: boolean };

const renderWithLocale = (ui: React.ReactElement) =>
  render(
    <NextIntlClientProvider locale="ja" messages={jaMessages as unknown as AbstractIntlMessages}>
      {ui}
    </NextIntlClientProvider>,
  );

const buildMember = (overrides: Partial<SwimmerMember> & { id: string; user_id: string }): SwimmerMember => ({
  role: "user",
  is_active: true,
  joined_at: "2025-01-01T00:00:00Z",
  is_swimmer: true,
  users: { id: overrides.user_id, name: `メンバー${overrides.id}` },
  ...overrides,
});

describe("TeamMemberManagement - 統計ヘッダーの母数 (R1: 非泳者を除外しない)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usePendingMembersMock.mockReturnValue({
      pendingMembers: [],
      loading: false,
      loadPendingMembers: vi.fn(),
    });
    useMembershipActionsMock.mockReturnValue({
      handleApprove: vi.fn(),
      handleReject: vi.fn(),
    });
    useMemberSortMock.mockImplementation((members: TeamMember[]) => ({
      sortStyle: null,
      sortDistance: null,
      sortOrder: "asc" as const,
      sortedMembers: members,
      groupHeaders: undefined,
      handleSort: vi.fn(),
    }));
    useMemberGroupSortMock.mockReturnValue({
      categories: [],
      activeCategory: null,
      toggleCategory: vi.fn(),
      groupMembers: vi.fn(() => null),
      getCategoryLabel: vi.fn((c: string) => c),
    });
    useMemberBestTimesMock.mockReturnValue({
      memberBestTimes: new Map(),
      loading: false,
      error: null,
      loadAllBestTimes: vi.fn(),
      getBestTimeForMember: vi.fn(() => null),
    });
  });

  it("[V-R1-01] 総メンバー数は非泳者を含めた全員の人数のまま表示される", () => {
    const members: SwimmerMember[] = [
      buildMember({ id: "m1", user_id: "m1", role: "admin", is_swimmer: true }),
      buildMember({ id: "m2", user_id: "m2", role: "user", is_swimmer: false }),
      buildMember({ id: "m3", user_id: "m3", role: "user", is_swimmer: false }),
    ];
    useMembersMock.mockReturnValue({ members, loading: false, error: null, loadMembers: vi.fn() });

    renderWithLocale(
      <TeamMemberManagement
        teamId="team-1"
        currentUserId="m1"
        isCurrentUserAdmin={true}
        onMemberClick={vi.fn()}
      />,
    );

    // 総数3人 (非泳者2人を含む)。ラベル文言は変えず、count 引数だけを厳密に確認する。
    const totalEl = screen.getByTestId("team-member-count-total");
    expect(totalEl.textContent).toContain("3");

    const adminEl = screen.getByTestId("team-member-count-admin");
    expect(adminEl.textContent).toContain("1");

    const userEl = screen.getByTestId("team-member-count-user");
    // role="user" は m2, m3 (どちらも非泳者) の2人。非泳者だからといって
    // user 内訳からも消えてはならない。
    expect(userEl.textContent).toContain("2");
  });

  it("[V-R1-02] 全員が非泳者でも総数・内訳は0にならない (フィルタが統計計算に混入していないことの境界値)", () => {
    const members: SwimmerMember[] = [
      buildMember({ id: "m1", user_id: "m1", role: "admin", is_swimmer: false }),
      buildMember({ id: "m2", user_id: "m2", role: "user", is_swimmer: false }),
    ];
    useMembersMock.mockReturnValue({ members, loading: false, error: null, loadMembers: vi.fn() });

    renderWithLocale(
      <TeamMemberManagement
        teamId="team-1"
        currentUserId="m1"
        isCurrentUserAdmin={true}
        onMemberClick={vi.fn()}
      />,
    );

    expect(screen.getByTestId("team-member-count-total").textContent).toContain("2");
    expect(screen.getByTestId("team-member-count-admin").textContent).toContain("1");
    expect(screen.getByTestId("team-member-count-user").textContent).toContain("1");
  });
});
