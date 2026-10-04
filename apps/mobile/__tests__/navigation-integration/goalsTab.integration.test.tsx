/**
 * goalsTab.integration.test.tsx — 6つ目のタブ「目標」の実ナビゲーション回帰テスト (U1 / D3 / D9)
 *
 * 本物の NavigationContainer / Stack / Bottom Tab を組む (createBottomTabNavigator をモックしない)。
 * 画面コンポーネントだけを識別可能なスタブに差し替える。
 *
 * 判定対象:
 *   [GT-01] タブ順が厳密に Dashboard / Practices / Competitions / Teams / Goals / MyPage
 *   [GT-02] Goals タブのルート画面が GoalsScreen (スタブの testid が描画される)
 *   [GT-03] tab-goals を押すと Goals にフォーカスし、他タブへ戻れる
 *   [GT-04] Dashboard の「目標管理を見る」と同じ navigate("MainTabs", {screen:"Goals"}) で Goals タブにフォーカス
 *   [GT-05] 6タブ化後も Teams タブ (所属1件) の tabPress 直行が壊れていない
 *   [GT-06] タブラベルが i18n キー経由 (react-i18next の t が返した値) で、全6タブ分が描画される
 *   [GT-07] 目標タブのアイコンは Feather "target" (他5タブも Feather)
 * 「押した/呼ばれた」ではなく実ナビゲーション状態 (routeNames[index]) で見る。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, act, cleanup } from "@testing-library/react";
import { NavigationContainer, createNavigationContainerRef } from "@react-navigation/native";
import type { NavigationContainerRefWithCurrent } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { TeamMembershipWithUser } from "@swim-hub/shared/types";

const mocks = vi.hoisted(() => ({ teams: [] as unknown[] }));

vi.mock("@/screens/DashboardScreen", () => ({ DashboardScreen: () => <span data-testid="screen-dashboard" /> }));
vi.mock("@/screens/PracticesScreen", () => ({ PracticesScreen: () => <span data-testid="screen-practices" /> }));
vi.mock("@/screens/CompetitionsScreen", () => ({ CompetitionsScreen: () => <span data-testid="screen-competitions" /> }));
vi.mock("@/screens/TeamsScreen", () => ({ TeamsScreen: () => <span data-testid="screen-teams" /> }));
vi.mock("@/screens/GoalsScreen", () => ({ GoalsScreen: () => <span data-testid="screen-goals" /> }));
vi.mock("@/screens/MyPageScreen", () => ({ MyPageScreen: () => <span data-testid="screen-mypage" /> }));
vi.mock("@/contexts/AuthProvider", () => ({ useAuth: () => ({ supabase: {}, user: { id: "u1" } }) }));
vi.mock("@apps/shared/hooks/queries/teams", () => ({
  useTeamsQuery: () => ({ teams: mocks.teams, isLoading: false, isError: false, refetch: vi.fn() }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => `T(${k})`, i18n: { language: "ja", changeLanguage: vi.fn() } }),
}));
vi.mock("@expo/vector-icons", () => ({
  Feather: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

import { TabNavigator } from "@/navigation/TabNavigator";

const Stack = createNativeStackNavigator();
let navigationRef: NavigationContainerRefWithCurrent<ReactNavigation.RootParamList>;

function TeamDetailStub() {
  return <span data-testid="screen-team-detail" />;
}

function renderApp() {
  navigationRef = createNavigationContainerRef();
  return render(
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="MainTabs" component={TabNavigator} />
        <Stack.Screen name="TeamDetail" component={TeamDetailStub} />
      </Stack.Navigator>
    </NavigationContainer>,
  );
}

function tabState() {
  const root = navigationRef.getRootState();
  return root?.routes?.[0]?.state as { index?: number; routeNames?: string[] } | undefined;
}
function currentTab(): string {
  const s = tabState();
  if (!s?.routeNames || typeof s.index !== "number") return "(unknown)";
  return s.routeNames[s.index] ?? "(unknown)";
}
async function press(testId: string) {
  const btn = document.querySelector(`[data-testid="${testId}"]`);
  expect(btn, `${testId} のタブボタンが見つからない`).not.toBeNull();
  await act(async () => {
    fireEvent.click(btn!);
  });
}
async function settle() {
  await act(async () => {
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    await new Promise((r) => setTimeout(r, 150));
  });
}

describe("目標タブ (6つ目のタブ) — 実ナビゲーション", () => {
  beforeEach(() => {
    mocks.teams = [];
  });
  afterEach(() => cleanup());

  it("[GT-01] タブ順が厳密に Dashboard / Practices / Competitions / Teams / Goals / MyPage", async () => {
    renderApp();
    await settle();
    expect(tabState()?.routeNames).toEqual([
      "Dashboard", "Practices", "Competitions", "Teams", "Goals", "MyPage",
    ]);
  });

  it("[GT-03][GT-02] tab-goals を押すと Goals にフォーカスし、GoalsScreen が描画され、他タブへ戻れる", async () => {
    renderApp();
    await settle();
    expect(currentTab()).toBe("Dashboard");
    expect(document.querySelector('[data-testid="screen-goals"]')).toBeNull();

    await press("tab-goals");
    await settle();
    expect(currentTab()).toBe("Goals");
    expect(document.querySelector('[data-testid="screen-goals"]')).not.toBeNull();

    await press("tab-mypage");
    await settle();
    expect(currentTab()).toBe("MyPage");
    await press("tab-goals");
    await settle();
    expect(currentTab()).toBe("Goals");
  });

  it("[GT-04] navigate('MainTabs', {screen:'Goals'}) (Dashboard の『目標管理を見る』と同じ呼び形) で Goals タブにフォーカスが移る", async () => {
    renderApp();
    await settle();
    expect(currentTab()).toBe("Dashboard");
    await act(async () => {
      (navigationRef as unknown as { navigate: (n: string, p: unknown) => void }).navigate("MainTabs", { screen: "Goals" });
    });
    await settle();
    expect(currentTab()).toBe("Goals");
  });

  it("[GT-05] 6タブ化後も Teams (所属1件) の tabPress で TeamDetail が stack に残り、タブは Teams", async () => {
    mocks.teams = [
      {
        id: "m1", team_id: "team-alpha", user_id: "u1", role: "admin", status: "approved", is_active: true,
        joined_at: "2025-01-01", left_at: null, created_at: "2025-01-01T00:00:00Z", updated_at: "2025-01-01T00:00:00Z",
        users: { id: "u1", name: "t" }, teams: { id: "team-alpha", name: "A", description: null, invite_code: null },
      } as unknown as TeamMembershipWithUser,
    ];
    renderApp();
    await settle();
    await press("tab-teams");
    await settle();
    const names = (navigationRef.getRootState()?.routes ?? []).map((r) => r.name);
    expect(names[names.length - 1]).toBe("TeamDetail");
    expect(currentTab()).toBe("Teams");
  });

  it("[GT-06] 6タブすべてのラベルが i18n キー (navigation.mobile.tabs.*) 経由で描画される", async () => {
    renderApp();
    await settle();
    const text = document.body.textContent ?? "";
    for (const k of ["home", "practices", "competitions", "teams", "goals", "myPage"]) {
      expect(text, k).toContain(`T(navigation.mobile.tabs.${k})`);
    }
  });

  it("[GT-07] 目標タブのアイコンは Feather 'target'。6タブ分のアイコンが全て描画される", async () => {
    renderApp();
    await settle();
    for (const icon of ["home", "bar-chart-2", "award", "users", "target", "user"]) {
      expect(document.querySelector(`[data-testid="icon-${icon}"]`), icon).not.toBeNull();
    }
  });
});
