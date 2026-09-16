/**
 * teamsTabAutoNavigate.integration.test.tsx — チームタブ直行の**実挙動**回帰テスト
 *
 * ■ なぜ別プロジェクト (vitest.nav.config.ts) なのか
 *   既定の mobile テスト環境は `react-native` を静的モックに、
 *   `@react-navigation/*` をスタブに差し替えている。そのため
 *   **BottomTabBar の onPress（= 既定の dispatch 本体）が一切動かない。**
 *
 *   実際の不具合はまさにそこにあった:
 *     `BottomTabBar.tsx` の onPress は tabPress を emit した後、
 *     `!focused && !defaultPrevented` のときに
 *     `CommonActions.navigate(route)` を **push 前のスナップショット由来の state**
 *     に対して dispatch する。我々のリスナーが emit 内で同期的に push すると、
 *     直後のこの dispatch が state ごと書き戻して push を打ち消す。
 *     → 他タブから押したときだけ遷移が消える（60〜140ms 後）。
 *
 *   `TabNavigator.teamsAutoNavigate.test.tsx` は `createBottomTabNavigator` を
 *   モックし `listeners.tabPress` を直接呼ぶため、この打ち消しを**構造的に
 *   観測できない**。あちらの主張（navigate が正しい引数で呼ばれる）は真だが、
 *   保証すべきは「**結果として stack に TeamDetail が残るか**」だった。
 *   実挙動の担保は本ファイルが持つ。
 *
 * ■ 方針
 *   - `createBottomTabNavigator` をモックしない（本物の Tab/Stack/Container）
 *   - `listeners.tabPress` を直接呼ばない（実際のタブボタンを press する）
 *   - 「navigate が呼ばれたか」ではなく **navigationRef.getRootState() に
 *     TeamDetail が残っているか** を、**非同期に解決した後**に見る
 *   - `react-native` は `react-native-web` に解決し、実 DOM 上で押せるようにする
 *
 * ■ 検証観点
 *   [V-NAV-01] ホーム発（focused=false）でタブを押すと TeamDetail が stack に残る
 *   [V-NAV-02] チームタブ発（focused=true）で押しても TeamDetail が残る
 *   [V-NAV-03] 所属0件では遷移しない
 *   [V-NAV-04] 承認済み2件では遷移しない
 *   [V-NAV-05] 承認済み1件+承認待ち1件では遷移しない
 *   [V-12]     preventDefault を呼ばない（= タブ自体は Teams へ切り替わる）
 */

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, act, cleanup } from "@testing-library/react";
import { NavigationContainer, createNavigationContainerRef } from "@react-navigation/native";
import type { NavigationContainerRefWithCurrent } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { TeamMembershipWithUser } from "@swim-hub/shared/types";

const mocks = vi.hoisted(() => ({ teams: [] as unknown[] }));

vi.mock("@/screens/DashboardScreen", () => ({ DashboardScreen: () => null }));
vi.mock("@/screens/PracticesScreen", () => ({ PracticesScreen: () => null }));
vi.mock("@/screens/CompetitionsScreen", () => ({ CompetitionsScreen: () => null }));
vi.mock("@/screens/TeamsScreen", () => ({ TeamsScreen: () => null }));
vi.mock("@/screens/MyPageScreen", () => ({ MyPageScreen: () => null }));
vi.mock("@/contexts/AuthProvider", () => ({ useAuth: () => ({ supabase: {}, user: { id: "u1" } }) }));
vi.mock("@apps/shared/hooks/queries/teams", () => ({
  useTeamsQuery: () => ({ teams: mocks.teams, isLoading: false, isError: false, refetch: vi.fn() }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "ja", changeLanguage: vi.fn() } }),
}));
vi.mock("@expo/vector-icons", () => ({
  Feather: ({ name }: { name: string }) => <span data-testid={`icon-${name}`} />,
}));

import { TabNavigator } from "@/navigation/TabNavigator";

const Stack = createNativeStackNavigator();

/**
 * ⚠️ NavigationContainer の ref は **テストごとに作り直す**。
 * モジュール直下で1つだけ作ると、前のテストのコンテナが attach したままの
 * ref を次のテストが読み、`getRootState()` が前テストの状態を返して
 * 「押していないのにタブが Teams」のような偽の結果になる (実際に踏んだ)。
 */
// ジェネリクスは既定 (= アプリが declare global している ReactNavigation.RootParamList)
// に合わせる。独自の型を渡すと NavigationContainer の ref 型と食い違う
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

function makeMembership(
  o: Partial<TeamMembershipWithUser> & { id: string; team_id: string },
): TeamMembershipWithUser {
  return {
    user_id: "u1", role: "admin", status: "approved", is_active: true,
    joined_at: "2025-01-01", left_at: null,
    created_at: "2025-01-01T00:00:00Z", updated_at: "2025-01-01T00:00:00Z",
    users: { id: "u1", name: "テスト" },
    teams: { id: o.team_id, name: `チーム-${o.team_id}`, description: null, invite_code: null },
    ...o,
  } as unknown as TeamMembershipWithUser;
}

/** ルート Stack のルート名一覧 (= 実際のナビゲーション状態) */
function stackRouteNames(): string[] {
  const s = navigationRef.getRootState();
  return (s?.routes ?? []).map((r) => r.name);
}

/** いま選択されているタブ名 (= 既定動作が通ったかどうかの観測点) */
function currentTabRouteName(): string {
  const root = navigationRef.getRootState();
  const tabState = root?.routes?.[0]?.state as
    | { index?: number; routeNames?: string[] }
    | undefined;
  if (!tabState?.routeNames || typeof tabState.index !== "number") return "(unknown)";
  return tabState.routeNames[tabState.index] ?? "(unknown)";
}

/** 押下後に非同期の打ち消し／遅延実行が落ち着くまで進める */
async function settle() {
  await act(async () => {
    // 実装は requestAnimationFrame で次フレームに回すため rAF を1つ以上跨がせ、
    // さらに BottomTabBar 側の打ち消し dispatch が来るなら来させてから観測する
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    await new Promise((r) => setTimeout(r, 250));
  });
}

const pressTeamsTab = async () => {
  const btn = document.querySelector('[data-testid="tab-teams"]');
  expect(btn, "tab-teams のタブボタンが見つからない").not.toBeNull();
  await act(async () => {
    fireEvent.click(btn!);
  });
};

describe("チームタブ直行 — 実ナビゲーション状態での回帰テスト", () => {
  beforeEach(() => {
    mocks.teams = [];
  });

  // このプロジェクトは globals を有効にしていないため自動 cleanup が走らない。
  // 明示的にアンマウントしないと前テストのツリーが DOM に残り、
  // `document.querySelector('[data-testid="tab-teams"]')` が古い方を掴む
  afterEach(() => {
    cleanup();
  });

  it("[V-NAV-01] ホーム発: 1回押すと TeamDetail が stack に残る", async () => {
    mocks.teams = [makeMembership({ id: "m1", team_id: "team-alpha" })];
    renderApp();

    // 前提: いまホーム(Dashboard)タブに居る = Teams は focused ではない
    expect(stackRouteNames()).toEqual(["MainTabs"]);

    await pressTeamsTab();
    await settle();

    // 🚨 「navigate が呼ばれたか」ではなく **残っているか** を見る。
    // BottomTabBar の既定 dispatch に打ち消されると、ここで落ちる
    expect(stackRouteNames()).toContain("TeamDetail");
    expect(stackRouteNames()[stackRouteNames().length - 1]).toBe("TeamDetail");

    // 🚨 **フォーカス中タブが Teams であること**も必須。
    // `preventDefault()` + 自前遷移 (案C) でも TeamDetail は残るが、タブは
    // Dashboard のままになり「戻るとホームに着地する」退行になる。
    // この assert が無いと案C に差し替えられても緑のまま通る
    expect(currentTabRouteName()).toBe("Teams");
  });

  it("[V-NAV-02] チームタブ発 (既に focused) でも TeamDetail が残る", async () => {
    mocks.teams = [makeMembership({ id: "m1", team_id: "team-alpha" })];
    renderApp();

    // 1回目で Teams を focused にし、そこから戻ってもう一度押す
    await pressTeamsTab();
    await settle();
    await act(async () => {
      navigationRef.dispatch({ type: "POP_TO_TOP", target: navigationRef.getRootState()?.key });
    });
    await settle();
    expect(stackRouteNames()).toEqual(["MainTabs"]);

    await pressTeamsTab();
    await settle();

    expect(stackRouteNames()).toContain("TeamDetail");
    expect(currentTabRouteName()).toBe("Teams");
  });

  /**
   * [V-12] `preventDefault()` を呼ばないこと。
   *
   * スパイではなく**結果**で見る: 既定動作が止められていなければタブ側の state は
   * Teams を指す。さらに戻るボタンの着地点としてチーム一覧 (MainTabs) が
   * stack の底に残っていること。
   *
   * 📌 対照として [V-NAV-03] (所属0件 = navigate しない) では
   * タブが Teams に切り替わることを確認済み。つまりこの assert が落ちるときは
   * 「preventDefault を足した」か「同期 navigate が既定 dispatch に
   * 打ち消されてタブ切替ごと巻き戻っている」かのどちらかで、
   * いずれも直すべき状態である。
   */
  it("[V-12] preventDefault を呼ばない = タブ自体は Teams へ切り替わる", async () => {
    mocks.teams = [makeMembership({ id: "m1", team_id: "team-alpha" })];
    renderApp();

    await pressTeamsTab();
    await settle();

    expect(currentTabRouteName()).toBe("Teams");
    // 戻るボタンの着地点としてチーム一覧が残っていること
    expect(stackRouteNames()[0]).toBe("MainTabs");
  });

  it("[V-NAV-03] 所属0件では遷移しない", async () => {
    mocks.teams = [];
    renderApp();
    await pressTeamsTab();
    await settle();
    expect(stackRouteNames()).not.toContain("TeamDetail");
    // 対照: navigate しないケースではタブ切替自体は通る。
    // これが Teams なので、[V-12] が Dashboard のままなら原因は押下の失敗ではない
    expect(currentTabRouteName()).toBe("Teams");
  });

  it("[V-NAV-04] 承認済み2件では遷移しない", async () => {
    mocks.teams = [
      makeMembership({ id: "m1", team_id: "team-alpha" }),
      makeMembership({ id: "m2", team_id: "team-beta" }),
    ];
    renderApp();
    await pressTeamsTab();
    await settle();
    expect(stackRouteNames()).not.toContain("TeamDetail");
  });

  it("[V-NAV-05] 承認済み1件+承認待ち1件では遷移しない", async () => {
    mocks.teams = [
      makeMembership({ id: "m1", team_id: "team-alpha" }),
      makeMembership({ id: "m2", team_id: "team-beta", status: "pending" }),
    ];
    renderApp();
    await pressTeamsTab();
    await settle();
    expect(stackRouteNames()).not.toContain("TeamDetail");
  });
});
