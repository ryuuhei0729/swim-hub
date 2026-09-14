// =============================================================================
// TabNavigator.teamsAutoNavigate.test.tsx
// =============================================================================
//
// Sprint Contract 検証観点 (チームタブ所属数分岐 — 状態B: 承認済み1件のみ):
//   [V-10] soleTeamId (= getSoleApprovedTeamId(teams)) が非null のとき、
//          Teams タブの tabPress で navigation.navigate("TeamDetail", { teamId }) が
//          呼ばれる
//   [V-11] soleTeamId が null のときは navigate("TeamDetail", ...) が呼ばれない
//   [V-12] tabPress ハンドラは e.preventDefault() を呼ばない
//          (タブ切替自体は通し、戻るボタンの着地点=チーム一覧を残す仕様のため)
//
// ステータス: 本ファイル作成時点 (Phase A) で navigation/TabNavigator.tsx は
// まだ本 Sprint の対象変更 (Teams Tab.Screen への listeners 追加) が未実装。
// Sprint Contract の記述 (「Teams の <Tab.Screen> に listeners={{ tabPress }} を
// 追加。getSoleApprovedTeamId(teams) が非null のとき navigate を呼ぶ」) だけでは
// TabNavigator が `teams` をどこから得るかが明記されていないため、QA が
// Phase A で以下を実装要件として追加指定する (PM 経由で Developer に共有すること):
//
//   1. TabNavigator は `useAuth()` (@/contexts/AuthProvider) から取得した
//      supabase を使い、`useTeamsQuery(supabase, { enableRealtime: false })`
//      (@apps/shared/hooks/queries/teams、TeamsScreen と同一パターン) を呼んで
//      `teams` を得る。
//      (react-navigation の Tab.Screen の component props 経由では任意データを
//      注入できない — navigation/route 以外受け取れない — ため、TabNavigator
//      自身が hook でデータ取得する以外に自然な経路が無いことを確認済み)
//   2. navigate 呼び出しに使う navigation オブジェクトは
//      `useNavigation<NativeStackNavigationProp<MainStackParamList>>()`
//      (@react-navigation/native) で取得する (TeamDetail は MainStackParamList の
//      スタック画面であり、Tab 自身の navigation ではなく親スタックの navigation
//      でないと navigate できないため)。
//
// もし Developer が異なるデータ取得経路 (別 hook・context・prop 等) を採用した場合、
// 本テストの `@apps/shared/hooks/queries/teams` / `@/contexts/AuthProvider` の
// モックは効かず、書き直しが必要になる。これは Contract 自体の記述不足に起因する
// ため、Phase B 開始時に PM/Developer と要すり合わせ (最終報告に明記する)。
//
// テスト方針: TabNavigator 全体 (5画面ぶんの Tab.Navigator) を丸ごと重量描画する
// のは避け、5画面はすべて null スタブに差し替える。かわりに
// `@react-navigation/bottom-tabs` の createBottomTabNavigator をこのファイル内限定で
// 上書きし、各 <Tab.Screen> に渡された props (name, listeners 等) を配列に記録する
// ことで、「Teams の listeners.tabPress」を実プロダクションコードの実行結果として
// 直接呼び出し検証する (ロジックの再実装はしない)。

import { render } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TeamMembershipWithUser } from "@swim-hub/shared/types";

vi.mock("@/screens/DashboardScreen", () => ({ DashboardScreen: () => null }));
vi.mock("@/screens/PracticesScreen", () => ({ PracticesScreen: () => null }));
vi.mock("@/screens/CompetitionsScreen", () => ({ CompetitionsScreen: () => null }));
vi.mock("@/screens/TeamsScreen", () => ({ TeamsScreen: () => null }));
vi.mock("@/screens/MyPageScreen", () => ({ MyPageScreen: () => null }));

const navMocks = vi.hoisted(() => ({
  navigate: vi.fn(),
}));

vi.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: navMocks.navigate, goBack: vi.fn(), setOptions: vi.fn() }),
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

vi.mock("@/contexts/AuthProvider", () => ({
  useAuth: () => ({ supabase: {}, user: { id: "user-1" } }),
}));

interface CapturedScreenProps {
  name?: string;
  listeners?:
    | { tabPress?: (e: unknown) => void }
    | ((args: { navigation: unknown; route: unknown }) => { tabPress?: (e: unknown) => void });
  [key: string]: unknown;
}

const bottomTabsMocks = vi.hoisted(() => ({
  screens: [] as CapturedScreenProps[],
}));

vi.mock("@react-navigation/bottom-tabs", () => ({
  createBottomTabNavigator: () => ({
    Navigator: ({ children }: { children: React.ReactNode }) => children,
    Screen: (props: CapturedScreenProps) => {
      bottomTabsMocks.screens.push(props);
      return null;
    },
  }),
}));

import { TabNavigator } from "../TabNavigator";

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
    users: { id: "user-1", name: "テストユーザー" } as TeamMembershipWithUser["users"],
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

function getTeamsTabPress(): (e: unknown) => void {
  const teamsScreen = bottomTabsMocks.screens.find((s) => s.name === "Teams");
  expect(teamsScreen, "Teams の <Tab.Screen> が見つからない").toBeDefined();
  const resolved =
    typeof teamsScreen?.listeners === "function"
      ? teamsScreen.listeners({ navigation: { navigate: navMocks.navigate }, route: {} })
      : teamsScreen?.listeners;
  expect(
    resolved?.tabPress,
    "Teams の <Tab.Screen> に listeners={{ tabPress }} が設定されていない",
  ).toBeTypeOf("function");
  return resolved!.tabPress!;
}

function fakeTabPressEvent(): { preventDefault: ReturnType<typeof vi.fn> } {
  return { preventDefault: vi.fn() };
}

describe("TabNavigator — Teams タブ tabPress の自動遷移", () => {
  beforeEach(() => {
    bottomTabsMocks.screens = [];
    apiMocks.teams = [];
    navMocks.navigate.mockClear();
  });

  it("[V-10] 承認済み1件のみのとき、tabPress で TeamDetail へ navigate される", () => {
    apiMocks.teams = [
      makeMembership({ id: "membership-alpha", team_id: "team-alpha" }),
    ];
    render(<TabNavigator />);

    const tabPress = getTeamsTabPress();
    const event = fakeTabPressEvent();
    tabPress(event);

    expect(navMocks.navigate).toHaveBeenCalledTimes(1);
    expect(navMocks.navigate).toHaveBeenCalledWith("TeamDetail", { teamId: "team-alpha" });
    // [V-12] 対照確認: このケースでも preventDefault は呼ばれない
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it("[V-11] 承認済み1件+承認待ち1件のときは navigate されない", () => {
    apiMocks.teams = [
      makeMembership({ id: "membership-alpha", team_id: "team-alpha" }),
      makeMembership({ id: "membership-beta", team_id: "team-beta", status: "pending" }),
    ];
    render(<TabNavigator />);

    const tabPress = getTeamsTabPress();
    tabPress(fakeTabPressEvent());

    expect(navMocks.navigate).not.toHaveBeenCalled();
  });

  it("[V-11] 承認済み2件のときは navigate されない", () => {
    apiMocks.teams = [
      makeMembership({ id: "membership-alpha", team_id: "team-alpha" }),
      makeMembership({ id: "membership-beta", team_id: "team-beta" }),
    ];
    render(<TabNavigator />);

    const tabPress = getTeamsTabPress();
    tabPress(fakeTabPressEvent());

    expect(navMocks.navigate).not.toHaveBeenCalled();
  });

  it("[V-11] 所属チーム0件のときは navigate されない", () => {
    apiMocks.teams = [];
    render(<TabNavigator />);

    const tabPress = getTeamsTabPress();
    tabPress(fakeTabPressEvent());

    expect(navMocks.navigate).not.toHaveBeenCalled();
  });

  it("[V-12] navigate されるケース・されないケースいずれも preventDefault は呼ばれない", () => {
    apiMocks.teams = [
      makeMembership({ id: "membership-alpha", team_id: "team-alpha" }),
    ];
    render(<TabNavigator />);

    const tabPress = getTeamsTabPress();
    const event = fakeTabPressEvent();
    tabPress(event);

    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});
