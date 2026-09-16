// =============================================================================
// TabNavigator.teamsAutoNavigate.test.tsx
// =============================================================================
//
// 🚨 **このファイルだけでは実挙動を保証しない (重要)**
//
// 本ファイルは `createBottomTabNavigator` を**モック**し、記録した
// `listeners.tabPress` を**直接呼んで** `navigate` の引数を検証する。
// したがって **BottomTabBar の実 onPress が走らない**。
//
// 実際の不具合はそこにあった: BottomTabBar は tabPress を emit した後、
// `!focused && !defaultPrevented` のときに `CommonActions.navigate(route)` を
// **push 前のスナップショット由来の state** に dispatch する。リスナーが emit 内で
// 同期的に push すると、この2番目の dispatch が push を打ち消す
// (→ 他タブから押したときだけ TeamDetail が 60〜140ms で消える)。
//
// 下の [V-10]〜[V-12] の主張 (「navigate が正しい引数で呼ばれる」) は**真**であり、
// 実測でもそのとおりだった。しかし保証すべきだったのは
// **「結果として stack に TeamDetail が残るか」**である。
//
// 実挙動の担保は以下が持つ (本物の NavigationContainer / Stack / Tab を組み、
// 実際のタブボタンを press して `getRootState()` を見る):
//   apps/mobile/__tests__/navigation-integration/teamsTabAutoNavigate.integration.test.tsx
//   実行: pnpm --filter @swim-hub/mobile test:nav
//
// **本ファイルの緑だけで「直行が動いている」と判断しないこと。**
//
// Sprint Contract 検証観点 (チームタブ所属数分岐 — 状態B: 承認済み1件のみ):
//   [V-10] soleTeamId (= getSoleApprovedTeamId(teams)) が非null のとき、
//          Teams タブの tabPress で navigation.navigate("TeamDetail", { teamId }) が
//          呼ばれる
//   [V-B15] (本スプリント スコープB 項目3 / A案で追加) その navigate の第2引数は
//          { teamId, instant: true } である。instant は MainStack 側で
//          animation:"none" に変換され、TeamsScreen の上を TeamDetail が
//          スライドで覆う見え方を消す。
//          ⚠️ e.preventDefault() は **追加しない**。戻るボタンの着地点として
//          チーム一覧を残す仕様のため、[V-12] は緑のままであるべき
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

import { act, render } from "@testing-library/react";
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
  /**
   * 実装は遅延実行の中で `navigation.getState()` を読み、
   * 「まだ MainTabs に居て、フォーカス中タブが Teams か」を確認してから navigate する。
   * モックに getState が無いと遅延コールバックが TypeError で落ち、
   * 「navigate されない」が**実装の意図ではなくモック不備**で起きてしまう。
   * 既定は「MainTabs の Teams タブにフォーカスしている」= 遷移してよい状態。
   */
  state: {
    routes: [{ name: "MainTabs", state: { index: 3, routes: [
      { name: "Dashboard" }, { name: "Practices" }, { name: "Competitions" },
      { name: "Teams" }, { name: "MyPage" },
    ] } }],
  } as unknown,
}));

vi.mock("@react-navigation/native", () => ({
  useNavigation: () => ({
    navigate: navMocks.navigate,
    goBack: vi.fn(),
    setOptions: vi.fn(),
    getState: () => navMocks.state,
  }),
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

/**
 * 遅延実装 (rAF) の場合に備えてフレームを1つ進める。
 * 同期実装 (preventDefault 方式) では何も起きないので、どちらでも安全に呼べる。
 */
async function flushDeferred() {
  await act(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
  });
}

/** navigate 呼び出しに Teams タブへの切替が含まれるか */
function hasTabSwitchToTeams(): boolean {
  return navMocks.navigate.mock.calls.some(
    (call) =>
      call[0] === "MainTabs" &&
      typeof call[1] === "object" &&
      call[1] !== null &&
      (call[1] as { screen?: string }).screen === "Teams",
  );
}

/**
 * 🚨 **守るべき不変条件は「preventDefault を呼ばないこと」ではなく
 * 「戻るとチーム一覧に着地すること」。**
 *
 * 以前この観点は `preventDefault` が呼ばれないことを直接 pin していたが、それは
 * **手段**であって意図ではない。実際 `preventDefault` を使う案 (F/G) へ実装が
 * 変わった時点で、正しい実装変更をテストがブロックした。
 *
 * 成立する実装は2通りあり、どちらでも「Teams タブに着地する」が満たされる:
 *
 *   (a) preventDefault を**呼ばない** → ライブラリの既定 dispatch がタブを Teams に
 *       切り替える。ただしその dispatch は emit 前のスナップショットから state を
 *       組み立てるため、**同期で push すると打ち消される**。
 *       → よって navigate は**遅延**されていなければならない。
 *
 *   (b) preventDefault を**呼ぶ** → 既定 dispatch は走らない。同期 push で問題ないが、
 *       **タブ切替を自分で出さないとタブバーがホームのまま残り、戻るボタンで
 *       チーム一覧ではなくホームに着地する**。
 *       → よって `navigate("MainTabs", { screen: "Teams" })` が必要。
 *
 * この関数は「どちらかの形で着地点が守られている」ことだけを要求し、
 * 手段の選択は実装に委ねる。
 */
function expectTeamsLandingPreserved(
  event: { preventDefault: ReturnType<typeof vi.fn> },
  navigatedSynchronously: boolean,
) {
  if (event.preventDefault.mock.calls.length === 0) {
    // (a) 既定動作に委ねる場合 — 同期 push は既定 dispatch に打ち消される
    expect(
      navigatedSynchronously,
      "preventDefault を呼ばない実装で同期 navigate している。" +
        "BottomTabBar の既定 dispatch に打ち消されるため、遅延させること",
    ).toBe(false);
  } else {
    // (b) 自前で遷移する場合 — タブ切替を出さないと戻り先がホームになる
    expect(
      hasTabSwitchToTeams(),
      "preventDefault を呼ぶ実装で navigate(\"MainTabs\", { screen: \"Teams\" }) が無い。" +
        "タブバーがホームのまま残り、戻るボタンでチーム一覧に着地しない",
    ).toBe(true);
  }
}

describe("TabNavigator — Teams タブ tabPress の自動遷移", () => {
  beforeEach(() => {
    bottomTabsMocks.screens = [];
    apiMocks.teams = [];
    navMocks.navigate.mockClear();
  });

  it("[V-10] 承認済み1件のみのとき、tabPress で TeamDetail へ navigate される", async () => {
    apiMocks.teams = [
      makeMembership({ id: "membership-alpha", team_id: "team-alpha" }),
    ];
    render(<TabNavigator />);

    const tabPress = getTeamsTabPress();
    const event = fakeTabPressEvent();
    tabPress(event);

    // 同期時点で navigate されたか (手段の判定にだけ使う。ここでは合否にしない)
    const navigatedSynchronously = navMocks.navigate.mock.calls.length > 0;

    await flushDeferred();

    // [V-B15] タブ経由の遷移はスライドアニメーションを切る。
    // 完全一致で assert する — instant を落とした実装でも teamId だけ見ていれば
    // 緑のままになるため、objectContaining ではなく toHaveBeenCalledWith を使う
    expect(navMocks.navigate).toHaveBeenCalledWith("TeamDetail", {
      teamId: "team-alpha",
      instant: true,
    });

    // [V-12] 意図: 戻るとチーム一覧に着地すること (手段は問わない)
    expectTeamsLandingPreserved(event, navigatedSynchronously);
  });

  it("[V-11] 承認済み1件+承認待ち1件のときは navigate されない", async () => {
    apiMocks.teams = [
      makeMembership({ id: "membership-alpha", team_id: "team-alpha" }),
      makeMembership({ id: "membership-beta", team_id: "team-beta", status: "pending" }),
    ];
    render(<TabNavigator />);

    const tabPress = getTeamsTabPress();
    tabPress(fakeTabPressEvent());
    await flushDeferred();

    expect(navMocks.navigate).not.toHaveBeenCalled();
  });

  it("[V-11] 承認済み2件のときは navigate されない", async () => {
    apiMocks.teams = [
      makeMembership({ id: "membership-alpha", team_id: "team-alpha" }),
      makeMembership({ id: "membership-beta", team_id: "team-beta" }),
    ];
    render(<TabNavigator />);

    const tabPress = getTeamsTabPress();
    tabPress(fakeTabPressEvent());
    await flushDeferred();

    expect(navMocks.navigate).not.toHaveBeenCalled();
  });

  it("[V-11] 所属チーム0件のときは navigate されない", async () => {
    apiMocks.teams = [];
    render(<TabNavigator />);

    const tabPress = getTeamsTabPress();
    tabPress(fakeTabPressEvent());
    await flushDeferred();

    expect(navMocks.navigate).not.toHaveBeenCalled();
  });

  // ===========================================================================
  // [V-12] 戻るボタンの着地点にチーム一覧を残す
  //
  // 📌 **手段 (preventDefault の有無) ではなく意図を pin する。**
  //    旧版は「preventDefault を呼ばない」を直接 assert していたため、
  //    `preventDefault` を使う案 (F/G) への正しい実装変更をブロックした。
  //
  //    対比として、本物の NavigationContainer を組んで実際にタブを押す
  //    `__tests__/navigation-integration/teamsTabAutoNavigate.integration.test.tsx`
  //    は最初から意図 (タブ state が Teams / stack の底が MainTabs) で書いてあり、
  //    **案D → 案F の実装変更を跨いで無傷だった**。手段を pin するとこうなる、
  //    意図を pin するとこうなる、の実例として残す。
  // ===========================================================================
  it("[V-12] 遷移しても Teams タブへの着地点が保たれる (手段は問わない)", async () => {
    apiMocks.teams = [
      makeMembership({ id: "membership-alpha", team_id: "team-alpha" }),
    ];
    render(<TabNavigator />);

    const tabPress = getTeamsTabPress();
    const event = fakeTabPressEvent();
    tabPress(event);
    const navigatedSynchronously = navMocks.navigate.mock.calls.length > 0;
    await flushDeferred();

    expectTeamsLandingPreserved(event, navigatedSynchronously);
  });

  it("[V-12] 遷移しないケースでは余計な dispatch を出さない", async () => {
    // 所属2件 = 直行しないケース。ここで preventDefault したりタブ切替を
    // 自前で出したりすると、ライブラリの既定動作と二重になる
    apiMocks.teams = [
      makeMembership({ id: "membership-alpha", team_id: "team-alpha" }),
      makeMembership({ id: "membership-beta", team_id: "team-beta" }),
    ];
    render(<TabNavigator />);

    const tabPress = getTeamsTabPress();
    const event = fakeTabPressEvent();
    tabPress(event);
    await flushDeferred();

    expect(navMocks.navigate).not.toHaveBeenCalled();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});
