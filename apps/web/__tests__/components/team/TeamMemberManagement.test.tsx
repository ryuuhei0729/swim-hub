/**
 * TeamMemberManagement コンポーネントテスト - 「WAポイントで比較」ボタン表示の統合検証
 *
 * Sprint Contract 検証観点:
 *   [V-14] グループ0件のチームでもボタンが表示される
 *          (MemberGroupSorter の categories.length===0 early return の罠。
 *          Developer は MemberGroupSorter の外側で「WAポイントで比較」ボタンの
 *          レイアウトを親コンポーネント (本ファイルの対象) で構成する設計に変更した。
 *          この設計変更が実際に効いているかを、実コンポーネントを結合して検証する)
 *   [V-16 補助] ボタンクリックで isWaPointsModalOpen state が true になり、
 *          WaPointsCompareModal が実際に開く配線を確認する。
 *
 * モック方針:
 *   - useAuth (@/contexts/AuthProvider) と member-management/hooks (index),
 *     shared/hooks/useMemberBestTimes のみモックする (データ取得層)。
 *   - MemberGroupSorter・WaPointsCompareButton・WaPointsCompareModal は実装をそのまま
 *     結合してレンダリングする (トートロジー回避: 表示条件の実コードパスを検証対象として残す)。
 *   - useMemberGroupSort の戻り値 (categories) だけをテストごとに差し替え、
 *     「グループ0件」「グループ2件以上」の両シナリオでボタンの有無を検証する。
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

const renderWithLocale = (ui: React.ReactElement) =>
  render(
    <NextIntlClientProvider locale="ja" messages={jaMessages as unknown as AbstractIntlMessages}>
      {ui}
    </NextIntlClientProvider>,
  );

const buildMember = (overrides: Partial<TeamMember> = {}): TeamMember => ({
  id: "member-1",
  user_id: "user-1",
  role: "user",
  is_active: true,
  joined_at: "2025-01-01T00:00:00Z",
  users: { id: "user-1", name: "テスト太郎", gender: 0 },
  ...overrides,
});

describe("TeamMemberManagement", () => {
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
    useMemberBestTimesMock.mockReturnValue({
      memberBestTimes: new Map(),
      loading: false,
      error: null,
      loadAllBestTimes: vi.fn(),
      getBestTimeForMember: vi.fn(() => null),
    });
  });

  describe("[V-14] グループ0件のチームでもボタンが表示される", () => {
    it("categories=[] のとき「グループ表示:」ラベルは出ないが「WAポイントで比較」ボタンは表示される", () => {
      const member = buildMember();
      useMembersMock.mockReturnValue({ members: [member], loading: false, error: null, loadMembers: vi.fn() });
      useMemberGroupSortMock.mockReturnValue({
        categories: [],
        activeCategory: null,
        toggleCategory: vi.fn(),
        groupMembers: vi.fn(() => null),
        getCategoryLabel: vi.fn((c: string) => c),
      });

      renderWithLocale(
        <TeamMemberManagement
          teamId="team-1"
          currentUserId="user-1"
          isCurrentUserAdmin={false}
          onMemberClick={vi.fn()}
        />,
      );

      // MemberGroupSorter は categories=[] のとき何も描画しない実コードパスであることの確認
      expect(screen.queryByText("グループ表示:")).not.toBeInTheDocument();
      // それでも「WAポイントで比較」ボタンはちょうど1つ表示される
      expect(screen.getByTestId("team-wa-points-button")).toBeInTheDocument();
      expect(screen.getAllByRole("button", { name: "WAポイントで比較" })).toHaveLength(1);
    });

    it("categories が2件以上のときも「WAポイントで比較」ボタンは表示される (グループ表示ラベルと併存)", () => {
      const member = buildMember();
      useMembersMock.mockReturnValue({ members: [member], loading: false, error: null, loadMembers: vi.fn() });
      useMemberGroupSortMock.mockReturnValue({
        categories: ["__gender__", "custom-group"],
        activeCategory: null,
        toggleCategory: vi.fn(),
        getCategoryLabel: vi.fn((c: string) => c),
        groupMembers: vi.fn(() => null),
      });

      renderWithLocale(
        <TeamMemberManagement
          teamId="team-1"
          currentUserId="user-1"
          isCurrentUserAdmin={false}
          onMemberClick={vi.fn()}
        />,
      );

      expect(screen.getByText("グループ表示:")).toBeInTheDocument();
      // カテゴリボタンが厳密に2件表示される
      expect(screen.getByText("__gender__")).toBeInTheDocument();
      expect(screen.getByText("custom-group")).toBeInTheDocument();
      // 「WAポイントで比較」ボタンも表示される
      expect(screen.getByTestId("team-wa-points-button")).toBeInTheDocument();
      expect(screen.getAllByRole("button", { name: "WAポイントで比較" })).toHaveLength(1);
    });
  });

  describe("[V-16 補助] ボタンクリックでモーダルが開く配線", () => {
    it("初期状態ではモーダルは閉じており、ボタンをクリックすると開く", async () => {
      const member = buildMember();
      useMembersMock.mockReturnValue({ members: [member], loading: false, error: null, loadMembers: vi.fn() });
      useMemberGroupSortMock.mockReturnValue({
        categories: [],
        activeCategory: null,
        toggleCategory: vi.fn(),
        getCategoryLabel: vi.fn((c: string) => c),
        groupMembers: vi.fn(() => null),
      });

      const { default: userEvent } = await import("@testing-library/user-event");
      const user = userEvent.setup();

      renderWithLocale(
        <TeamMemberManagement
          teamId="team-1"
          currentUserId="user-1"
          isCurrentUserAdmin={false}
          onMemberClick={vi.fn()}
        />,
      );

      expect(screen.queryByTestId("team-wa-points-modal")).not.toBeInTheDocument();

      await user.click(screen.getByTestId("team-wa-points-button"));

      expect(screen.getByTestId("team-wa-points-modal")).toBeInTheDocument();
    });
  });
});
