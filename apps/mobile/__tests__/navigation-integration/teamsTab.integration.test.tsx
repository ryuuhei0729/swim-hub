/**
 * teamsTab.integration.test.tsx — チームタブへの遷移の実ナビゲーション回帰テスト
 *
 * チーム詳細はスタックに積む画面 (旧 TeamDetail) をやめ、チームタブの中に表示する。
 * 他画面からは `navigate("MainTabs", { screen: "Teams", params: { teamId, initialTab } })` で開き、
 * 大会フォームの保存後は `popTo("MainTabs", { screen: "Teams", params })` で戻る。
 * 入れ子の params がタブ画面まで届くかはナビゲーターの実装次第なので、
 * 本物の NavigationContainer / Stack / Bottom Tab を組んで確かめる (createBottomTabNavigator をモックしない)。
 *
 *   [TT-01] ホームから navigate(MainTabs > Teams, {teamId, initialTab}) でチームタブにフォーカスし、
 *           TeamsScreen に params が届く。stack には何も積まれない
 *   [TT-02] スタックの画面 (大会フォーム相当) から popTo(MainTabs > Teams, params) で
 *           stack が MainTabs だけに戻り、チームタブにフォーカスし、params が届く
 *   [TT-03] チームタブのバッジ = 出欠未回答の件数 + 承認待ちメンバー数。0 件なら出さない
 *   [TT-04] 承認待ちの件数は自分が管理者の承認済みチームだけ、出欠未回答は承認済みチームだけで数える
 */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, cleanup } from "@testing-library/react";
import { NavigationContainer, createNavigationContainerRef } from "@react-navigation/native";
import type { NavigationContainerRefWithCurrent, RouteProp } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { TabParamList } from "@/navigation/types";

const mocks = vi.hoisted(() => ({
  teams: [] as unknown[],
  unanswered: [] as unknown[],
  pendingCount: 0,
  pendingTeamIds: [] as readonly string[],
  unansweredTeams: [] as Array<{ team_id: string }>,
}));

vi.mock("@/screens/DashboardScreen", () => ({ DashboardScreen: () => <span data-testid="screen-dashboard" /> }));
vi.mock("@/screens/RecordsHubScreen", () => ({ RecordsHubScreen: () => null }));
vi.mock("@/screens/TeamsScreen", () => ({
  TeamsScreen: ({ route }: { route: RouteProp<TabParamList, "Teams"> }) => (
    <span
      data-testid="screen-teams"
      data-team-id={route.params?.teamId ?? ""}
      data-initial-tab={route.params?.initialTab ?? ""}
    />
  ),
}));
vi.mock("@/screens/GoalsScreen", () => ({ GoalsScreen: () => null }));
vi.mock("@/screens/MyPageScreen", () => ({ MyPageScreen: () => null }));
vi.mock("@/contexts/AuthProvider", () => ({ useAuth: () => ({ supabase: {}, user: { id: "u1" } }) }));
vi.mock("@apps/shared/hooks/queries/teams", () => ({
  useTeamsQuery: () => ({ teams: mocks.teams, isLoading: false, isError: false, refetch: vi.fn() }),
  usePendingMembersCountQuery: (_supabase: unknown, teamIds: readonly string[]) => {
    mocks.pendingTeamIds = teamIds;
    return mocks.pendingCount;
  },
}));
vi.mock("@apps/shared/hooks/queries/notifications", () => ({
  useUnansweredAttendancesQuery: (_s: unknown, _u: unknown, teams: Array<{ team_id: string }>) => {
    mocks.unansweredTeams = teams;
    return { data: mocks.unanswered };
  },
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "ja", changeLanguage: vi.fn() } }),
}));
vi.mock("@expo/vector-icons", () => ({
  Feather: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

import { TabNavigator } from "@/navigation/TabNavigator";

const Stack = createNativeStackNavigator();
// テストごとに作り直す (前テストのコンテナが attach したままの ref を読まないように)
let navigationRef: NavigationContainerRefWithCurrent<ReactNavigation.RootParamList>;

type LooseNavigation = {
  navigate: (name: string, params?: unknown) => void;
  dispatch: (action: unknown) => void;
};

function FormStub() {
  return <span data-testid="screen-form" />;
}

function renderApp() {
  navigationRef = createNavigationContainerRef();
  return render(
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="MainTabs" component={TabNavigator} />
        <Stack.Screen name="CompetitionTabForm" component={FormStub} />
      </Stack.Navigator>
    </NavigationContainer>,
  );
}

const nav = () => navigationRef as unknown as LooseNavigation;

function stackRouteNames(): string[] {
  return (navigationRef.getRootState()?.routes ?? []).map((r) => r.name);
}
function currentTab(): string {
  const tab = navigationRef.getRootState()?.routes?.[0]?.state as
    | { index?: number; routeNames?: string[] }
    | undefined;
  if (!tab?.routeNames || typeof tab.index !== "number") return "(unknown)";
  return tab.routeNames[tab.index] ?? "(unknown)";
}
function teamsScreen(): Element | null {
  return document.querySelector('[data-testid="screen-teams"]');
}
async function settle() {
  await act(async () => {
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    await new Promise((r) => setTimeout(r, 150));
  });
}

describe("チームタブへの遷移 — 実ナビゲーション状態", () => {
  beforeEach(() => {
    mocks.teams = [];
    mocks.unanswered = [];
    mocks.pendingCount = 0;
  });
  // globals 無効のため自動 cleanup が走らない
  afterEach(() => cleanup());

  it("[TT-01] ホームから navigate でチームタブに移り、teamId / initialTab が届く。stack には積まない", async () => {
    renderApp();
    await settle();
    expect(currentTab()).toBe("Dashboard");

    await act(async () => {
      nav().navigate("MainTabs", {
        screen: "Teams",
        params: { teamId: "team-alpha", initialTab: "attendance" },
      });
    });
    await settle();

    expect(currentTab()).toBe("Teams");
    expect(stackRouteNames()).toEqual(["MainTabs"]);
    expect(teamsScreen()?.getAttribute("data-team-id")).toBe("team-alpha");
    expect(teamsScreen()?.getAttribute("data-initial-tab")).toBe("attendance");
  });

  it("[TT-02] スタックの画面から popTo で MainTabs に戻り、チームタブの大会タブ指定が届く", async () => {
    renderApp();
    await settle();

    await act(async () => {
      nav().navigate("CompetitionTabForm");
    });
    await settle();
    expect(stackRouteNames()).toEqual(["MainTabs", "CompetitionTabForm"]);

    await act(async () => {
      nav().dispatch({
        type: "POP_TO",
        payload: {
          name: "MainTabs",
          params: { screen: "Teams", params: { teamId: "team-beta", initialTab: "competitions" } },
        },
      });
    });
    await settle();

    expect(stackRouteNames()).toEqual(["MainTabs"]);
    expect(currentTab()).toBe("Teams");
    expect(teamsScreen()?.getAttribute("data-team-id")).toBe("team-beta");
    expect(teamsScreen()?.getAttribute("data-initial-tab")).toBe("competitions");
  });

  it("[TT-03] バッジは出欠未回答 + 承認待ちの合計。0 件なら出さない", async () => {
    mocks.unanswered = [{ eventId: "p1" }, { eventId: "p2" }];
    mocks.pendingCount = 1;
    const { unmount } = renderApp();
    await settle();
    const teamsTab = document.querySelector('[data-testid="tab-teams"]');
    expect(teamsTab?.textContent).toContain("3");
    unmount();

    mocks.unanswered = [];
    mocks.pendingCount = 0;
    renderApp();
    await settle();
    const emptyTab = document.querySelector('[data-testid="tab-teams"]');
    expect(emptyTab?.textContent).toBe("navigation.mobile.tabs.teams");
  });

  it("[TT-04] 承認待ちの件数は管理者の承認済みチームだけ、出欠未回答は承認済みチームだけで数える", async () => {
    const membership = (teamId: string, role: string, status: string, isActive: boolean | null) => ({
      id: `m-${teamId}`,
      team_id: teamId,
      role,
      status,
      is_active: isActive,
      teams: { id: teamId, name: teamId },
    });
    mocks.teams = [
      membership("team-admin", "admin", "approved", true),
      membership("team-member", "member", "approved", true),
      membership("team-pending", "admin", "pending", null),
      membership("team-left", "admin", "approved", false),
    ];
    renderApp();
    await settle();

    expect(mocks.pendingTeamIds).toEqual(["team-admin"]);
    expect(mocks.unansweredTeams.map((t) => t.team_id)).toEqual(["team-admin", "team-member"]);
  });
});
