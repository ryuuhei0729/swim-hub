// =============================================================================
// TeamsScreen.emptyStateCta.test.tsx
// =============================================================================
//
// Sprint Contract 検証観点 (チームタブ所属数分岐 — 状態A: 0チーム):
//   [V-01] 所属チーム0件のとき、画面中央に大型CTA (作成/参加) が表示され、
//          上部 actionBar (teams-action-create / teams-action-join) は表示されない
//   [V-02] 中央CTAの作成ボタン (teams-empty-cta-create) 押下で TeamCreateModal が開く
//   [V-03] 中央CTAの参加ボタン (teams-empty-cta-join) 押下で TeamJoinModal が開く
//   [V-07] 承認済み0件 + 承認待ち1件 のときは一覧 (承認待ちカード) を表示し、
//          中央CTAには切り替わらない (displayTeams.length > 0 のため)
//   [V-13] 回帰: 承認済み2件以上のときは従来どおり actionBar + 一覧を表示し、
//          中央CTAは表示されない
//
// テスト基盤メモ (TeamsScreen.refreshDrift.test.tsx の既知の壁を踏襲):
// TeamsScreen は `@/components/teams` バレル経由で TeamItem/TeamCreateModal/
// TeamJoinModal を import する。バレルは group-management (react-native-gesture-handler
// 依存で vitest 環境ではパース不能) を静的 export しているため、本テストでは
// バレル自体を丸ごとモックして実体の group-management を一切 import させない
// (これにより react-native-gesture-handler / react-native-reanimated 用のスタブは
// 不要になる)。一方 `@shopify/flash-list` は TeamsScreen が直接 import するため、
// 既存テストと同じ最小スタブを用意する。
//
// Pressable の testID は RN モック側の仕様で DOM 属性 `testid` (小文字・data-testid
// ではない) として素通しされる (`__mocks__/react-native.ts` 参照)。よって
// `screen.getByTestId` ではなく `container.querySelector('[testid="..."]')` で取得する
// (MyPageScreen 系の既存テストと同一の作法)。

import { fireEvent, render } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TeamMembershipWithUser } from "@swim-hub/shared/types";

vi.mock("@shopify/flash-list", () => ({
  FlashList: ({
    data,
    renderItem,
    keyExtractor,
    ListEmptyComponent,
    refreshControl,
    ...props
  }: {
    data?: unknown[];
    renderItem?: (info: { item: unknown; index: number }) => React.ReactNode;
    keyExtractor?: (item: unknown, index: number) => string | number;
    ListEmptyComponent?: React.ReactNode;
    refreshControl?: React.ReactNode;
  } & Record<string, unknown>) =>
    React.createElement(
      "div",
      props,
      refreshControl ?? null,
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

vi.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: vi.fn(), goBack: vi.fn(), setOptions: vi.fn() }),
  useFocusEffect: (callback: () => void) => {
    React.useEffect(() => {
      callback();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
  },
}));

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({ supabase: {}, user: { id: "user-1" } }),
}));

const apiMocks = vi.hoisted(() => ({
  teams: [] as unknown[],
}));

vi.mock("@apps/shared/hooks/queries/teams", () => ({
  useTeamsQuery: () => ({
    teams: apiMocks.teams,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

// @/components/teams バレルを丸ごとスタブに差し替える (group-management 経由の
// gesture-handler パース不能を回避)。TeamCreateModal/TeamJoinModal は「visible の
// ときだけマーカーを描画する」薄いスタブとし、TeamsScreen 自身の open/close wiring
// (state 制御) だけを検証対象にする (モーダル内部の実装は対象外)。
vi.mock("@/components/teams", () => ({
  TeamItem: ({
    membership,
  }: {
    membership: { id: string; team_id: string; teams: { name: string } };
  }) =>
    React.createElement(
      "div",
      { "data-testid": `team-item-${membership.team_id}` },
      membership.teams.name,
    ),
  TeamCreateModal: ({ visible }: { visible: boolean }) =>
    visible ? React.createElement("div", { "data-testid": "team-create-modal-marker" }) : null,
  TeamJoinModal: ({ visible }: { visible: boolean }) =>
    visible ? React.createElement("div", { "data-testid": "team-join-modal-marker" }) : null,
}));

import { TeamsScreen } from "../TeamsScreen";

function makeMembership(
  overrides: Partial<TeamMembershipWithUser> & { id: string; team_id: string },
): TeamMembershipWithUser {
  const { id, team_id, ...rest } = overrides;
  return {
    id,
    team_id,
    user_id: "user-1",
    role: "admin",
    status: "approved",
    is_active: true,
    joined_at: "2025-01-01T00:00:00Z",
    left_at: null,
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    users: {
      id: "user-1",
      name: "テストユーザー",
    } as TeamMembershipWithUser["users"],
    teams: {
      id: team_id,
      name: `チーム-${team_id}`,
      description: null,
      invite_code: null,
      created_at: null,
      updated_at: null,
    },
    ...rest,
  } as TeamMembershipWithUser;
}

describe("TeamsScreen — 所属チーム数による中央CTA/一覧の出し分け", () => {
  beforeEach(() => {
    apiMocks.teams = [];
  });

  it("[V-01] 所属チーム0件のとき、中央CTAが表示され上部actionBarは表示されない", () => {
    apiMocks.teams = [];
    const { container } = render(<TeamsScreen />);

    expect(container.querySelector('[testid="teams-empty-cta-create"]')).not.toBeNull();
    expect(container.querySelector('[testid="teams-empty-cta-join"]')).not.toBeNull();
    expect(container.querySelector('[testid="teams-action-create"]')).toBeNull();
    expect(container.querySelector('[testid="teams-action-join"]')).toBeNull();
  });

  it("[V-02] 中央CTAの作成ボタン押下で TeamCreateModal が開く", () => {
    apiMocks.teams = [];
    const { container } = render(<TeamsScreen />);

    expect(container.querySelector('[data-testid="team-create-modal-marker"]')).toBeNull();

    const createButton = container.querySelector(
      '[testid="teams-empty-cta-create"]',
    ) as HTMLElement;
    expect(createButton).not.toBeNull();
    fireEvent.click(createButton);

    expect(container.querySelector('[data-testid="team-create-modal-marker"]')).not.toBeNull();
    // 参加モーダルは開かない (誤配線でないことの対照)
    expect(container.querySelector('[data-testid="team-join-modal-marker"]')).toBeNull();
  });

  it("[V-03] 中央CTAの参加ボタン押下で TeamJoinModal が開く", () => {
    apiMocks.teams = [];
    const { container } = render(<TeamsScreen />);

    expect(container.querySelector('[data-testid="team-join-modal-marker"]')).toBeNull();

    const joinButton = container.querySelector('[testid="teams-empty-cta-join"]') as HTMLElement;
    expect(joinButton).not.toBeNull();
    fireEvent.click(joinButton);

    expect(container.querySelector('[data-testid="team-join-modal-marker"]')).not.toBeNull();
    // 作成モーダルは開かない (誤配線でないことの対照)
    expect(container.querySelector('[data-testid="team-create-modal-marker"]')).toBeNull();
  });

  it("[V-07] 承認済み0件+承認待ち1件のときは一覧(承認待ちカード)を表示し、中央CTAにはならない", () => {
    apiMocks.teams = [
      makeMembership({ id: "membership-beta", team_id: "team-beta", status: "pending" }),
    ];
    const { container } = render(<TeamsScreen />);

    expect(container.querySelector('[data-testid="team-item-team-beta"]')).not.toBeNull();
    expect(container.querySelector('[testid="teams-empty-cta-create"]')).toBeNull();
    expect(container.querySelector('[testid="teams-empty-cta-join"]')).toBeNull();
    // 一覧表示のときは上部actionBarも表示される (既存仕様)
    expect(container.querySelector('[testid="teams-action-create"]')).not.toBeNull();
  });

  it("[V-13] 回帰: 承認済み2件以上のときは actionBar + 一覧を表示し、中央CTAは出ない", () => {
    apiMocks.teams = [
      makeMembership({ id: "membership-alpha", team_id: "team-alpha" }),
      makeMembership({ id: "membership-beta", team_id: "team-beta" }),
    ];
    const { container } = render(<TeamsScreen />);

    expect(container.querySelector('[testid="teams-action-create"]')).not.toBeNull();
    expect(container.querySelector('[testid="teams-action-join"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="team-item-team-alpha"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="team-item-team-beta"]')).not.toBeNull();
    expect(container.querySelector('[testid="teams-empty-cta-create"]')).toBeNull();
    expect(container.querySelector('[testid="teams-empty-cta-join"]')).toBeNull();
  });
});
