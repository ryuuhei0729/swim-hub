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

  // ---------------------------------------------------------------------------
  // [V-14 / V-16 反転] 「WAポイントで比較」はランキングタブへ移設された
  //
  // 元は「メンバータブにボタンがある」を pin していた。**削除せず反転する** —
  // 削除すると「ボタンがどこにも無い」状態でも全 green になり、移設の失敗を
  // 検出できなくなる。
  //   - 「ランキングタブにある」= __tests__/components/team/rankings/
  //     WaPointsCompareLauncher.test.tsx が担保 (遅延ロード・members 同一参照・
  //     gender undefined の保全まで含む)
  //   - info アイコンもボタンと一緒に移設済み (PM 裁定)
  // ---------------------------------------------------------------------------
  describe("[V-14 反転] メンバータブから WAポイント比較の導線が撤去されている", () => {
    const renderMemberTab = (categories: string[]) => {
      const member = buildMember();
      useMembersMock.mockReturnValue({
        members: [member],
        loading: false,
        error: null,
        loadMembers: vi.fn(),
      });
      useMemberGroupSortMock.mockReturnValue({
        categories,
        activeCategory: null,
        toggleCategory: vi.fn(),
        groupMembers: vi.fn(() => null),
        getCategoryLabel: vi.fn((c: string) => c),
      });

      return renderWithLocale(
        <TeamMemberManagement
          teamId="team-1"
          currentUserId="user-1"
          isCurrentUserAdmin={false}
          onMemberClick={vi.fn()}
        />,
      );
    };

    it("グループ0件でも「WAポイントで比較」ボタン・モーダルは存在しない", () => {
      renderMemberTab([]);

      // --- 正のコントロール ---
      // 「描画が失敗して何も無い」を「撤去できている」と誤読しないため、
      // メンバータブ自体が生きている (メンバー名が出ている) ことを先に固定する
      expect(screen.getByText("テスト太郎")).toBeInTheDocument();
      // MemberGroupSorter は categories=[] のとき何も描画しない実コードパス
      expect(screen.queryByText("グループ表示:")).not.toBeInTheDocument();

      // --- 本体 ---
      expect(screen.queryByTestId("team-wa-points-button")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "WAポイントで比較" })).not.toBeInTheDocument();
      expect(screen.queryByTestId("team-wa-points-modal")).not.toBeInTheDocument();
    });

    it("グループが2件以上あってもボタンは復活しない (グループ表示ラベルだけが出る)", () => {
      renderMemberTab(["__gender__", "custom-group"]);

      // --- 正のコントロール: グループ表示まわりは従来どおり動く ---
      expect(screen.getByText("グループ表示:")).toBeInTheDocument();
      expect(screen.getByText("__gender__")).toBeInTheDocument();
      expect(screen.getByText("custom-group")).toBeInTheDocument();

      // --- 本体 ---
      expect(screen.queryByTestId("team-wa-points-button")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "WAポイントで比較" })).not.toBeInTheDocument();
    });

    it("[V-16 反転] メンバータブには比較モーダルを開く導線が一切ない", () => {
      renderMemberTab([]);

      expect(screen.getByText("テスト太郎")).toBeInTheDocument(); // 正のコントロール

      // 開く前・開いた後という状態遷移そのものが存在しない
      expect(screen.queryByTestId("team-wa-points-modal")).not.toBeInTheDocument();
      expect(screen.queryByTestId("team-wa-points-button")).not.toBeInTheDocument();
      // info アイコンもボタンと一緒に移設済み
      expect(screen.queryByTestId("team-wa-points-info")).not.toBeInTheDocument();
    });
  });

});
