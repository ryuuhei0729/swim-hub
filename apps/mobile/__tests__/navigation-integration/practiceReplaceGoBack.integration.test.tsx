/**
 * practiceReplaceGoBack.integration.test.tsx — 練習フローの popToTop 誤爆 (A)/(B)/(C) 判定を
 * **実物の react-navigation スタック**で実証する。
 *
 * ■ 背景 (Sprint Contract 「大会/練習作成後にチーム一覧へ戻される」バグ)
 *   ユーザー報告は「大会や練習」の両方に言及しているが、静的調査 (grep) 当時
 *   apps/mobile 全体で `navigation.popToTop()` の呼び出しは
 *   CompetitionBasicFormScreen.tsx / EntryLogFormScreen.tsx / RecordLogFormScreen.tsx の
 *   3箇所のみだった。その後 EntryLogFormScreen.tsx はリダイレクトシム化、
 *   RecordLogFormScreen.tsx は削除済みで、現在 popToTop() を呼ぶのは
 *   CompetitionBasicFormScreen.tsx / CompetitionTabFormScreen.tsx の2箇所のみ (実測)。
 *   一方、練習系画面 (PracticeFormScreen / PracticeTabFormScreen /
 *   PracticeLogFormScreen / TeamPracticeLogBulkFormScreen) は当時から例外なく `goBack()`
 *   のみを使う (StackActions.reset 等も含め、練習側に popToTop 相当の呼び出しは一切無い。
 *   この点は本ファイルが検証したい前提であり今も変わっていない)。
 *
 *   ただし「理屈上は goBack で戻るはず」は実測ではない。特に
 *   TeamPracticeList → navigation.navigate("PracticeForm", ...) → PracticeFormScreen が
 *   マウント直後に navigation.replace("PracticeTabForm", ...) する経路は、
 *   REPLACE アクションが**スタックの他のエントリに影響しないこと**
 *   (@react-navigation/routers の StackRouter.getStateForAction の実装:
 *    `routes: state.routes.map((r, i) => i === currentIndex ? route : r)` — 対象
 *    index 以外の route オブジェクトは参照ごと不変) を前提にしており、これは
 *   ライブラリのソースを読んだだけでは「テストで実証した」ことにならない。
 *
 * ■ 本ファイルの方針
 *   - `createNativeStackNavigator` / `NavigationContainer` は本物を使う (モックしない)。
 *   - 各画面は本物の PracticeFormScreen 等を import せず、**実装が呼ぶのと全く同じ
 *     navigation API 呼び出し (`navigation.replace(...)` → `navigation.goBack()`,
 *     または直接 `push` → `goBack()`) だけを行う最小スタブ**にする。フォーム入力・
 *     バリデーション・API 呼び出しなど本題と無関係なロジックは含めない
 *     (プロダクションロジックの再実装ではなく、ナビゲーション機構そのものの検証)。
 *   - 「navigate/replace/goBack が呼ばれたか」ではなく
 *     `navigationRef.getRootState()` に**結果として何が残るか**を見る
 *     (teamsTabAutoNavigate.integration.test.tsx と同じ方針)。
 *   - TeamDetail 相当のスタブは内部に `useState` を持たせ、「戻ったときに同じ
 *     コンポーネントインスタンスか (state が保持されるか)」を可視のテキストで検証する。
 *
 * ■ 検証観点
 *   [V-PRACTICE-01] TeamDetail → PracticeForm(replace)→PracticeTabForm → 保存(goBack) で
 *                    スタックは ["MainTabs","TeamDetail"] に戻り、TeamDetail の
 *                    activeTab state (画面遷移前に "practice" にしていたもの) が保持される
 *                    (= 別コンポーネントインスタンスへの再マウントではない)
 *   [V-PRACTICE-02] TeamDetail → PracticeLogForm(push、非 admin の「記録追加」相当)
 *                    → 保存(goBack) でも同様にスタックは TeamDetail に戻り、
 *                    MainTabs (チーム一覧) までは戻らない
 *
 * 結論 (実測に基づく): 上記2経路とも popToTop 相当の挙動は発生しない。
 * Planner の報告「練習側に popToTop は無い」は本テストで裏付けられる (判定: A)。
 */

import React, { useState } from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, fireEvent, act, cleanup } from "@testing-library/react";
import { NavigationContainer, createNavigationContainerRef, useNavigation, useRoute } from "@react-navigation/native";
import type { NavigationContainerRefWithCurrent } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

type StubParamList = {
  MainTabs: undefined;
  TeamDetail: { teamId: string; initialTab?: "members" | "practice" };
  PracticeForm: { teamId: string };
  PracticeTabForm: { teamId: string };
  PracticeLogForm: { teamId: string; practiceId: string };
};

const Stack = createNativeStackNavigator<StubParamList>();

let navigationRef: NavigationContainerRefWithCurrent<StubParamList>;

function MainTabsStub() {
  return <span data-testid="screen-main-tabs" />;
}

/**
 * TeamDetailScreen の本質 (route.params.initialTab を初期値にした activeTab の
 * useState) だけを再現するスタブ。goBack 後に同一インスタンスが残るなら
 * activeTab はボタン操作前の値のまま表示され続ける。
 */
function TeamDetailStub() {
  const route = useRoute<import("@react-navigation/native").RouteProp<StubParamList, "TeamDetail">>();
  const navigation = useNavigation<import("@react-navigation/native-stack").NativeStackNavigationProp<StubParamList>>();
  const [activeTab, setActiveTab] = useState(route.params.initialTab ?? "members");

  return (
    <div>
      <span data-testid="screen-team-detail" data-active-tab={activeTab}>
        team-detail:{route.params.teamId}:{activeTab}
      </span>
      <button data-testid="switch-to-practice-tab" onClick={() => setActiveTab("practice")}>
        switch
      </button>
      <button
        data-testid="open-practice-form"
        onClick={() => navigation.navigate("PracticeForm", { teamId: route.params.teamId })}
      >
        add-practice
      </button>
      <button
        data-testid="open-practice-log-form"
        onClick={() =>
          navigation.navigate("PracticeLogForm", { teamId: route.params.teamId, practiceId: "p-1" })
        }
      >
        add-log
      </button>
    </div>
  );
}

/**
 * PracticeFormScreen.tsx の本質 (マウント直後に replace) だけを再現するスタブ。
 * 実装: `navigation.replace("PracticeTabForm", { ...(teamId ? { teamId } : {}) })`
 */
function PracticeFormStub() {
  const route = useRoute<import("@react-navigation/native").RouteProp<StubParamList, "PracticeForm">>();
  const navigation = useNavigation<import("@react-navigation/native-stack").NativeStackNavigationProp<StubParamList>>();
  React.useEffect(() => {
    navigation.replace("PracticeTabForm", { teamId: route.params.teamId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <span data-testid="screen-practice-form" />;
}

/**
 * PracticeTabFormScreen.tsx の本質 (保存 → goBack のみ。popToTop は一切呼ばない) を
 * 再現するスタブ。
 */
function PracticeTabFormStub() {
  const navigation = useNavigation<import("@react-navigation/native-stack").NativeStackNavigationProp<StubParamList>>();
  return (
    <div>
      <span data-testid="screen-practice-tab-form" />
      <button data-testid="save-practice" onClick={() => navigation.goBack()}>
        save
      </button>
    </div>
  );
}

/**
 * PracticeLogFormScreen.tsx の本質 (returnTo 未指定 = チーム経由では常にこの分岐 →
 * goBack のみ。popToTop は一切呼ばない) を再現するスタブ。
 */
function PracticeLogFormStub() {
  const navigation = useNavigation<import("@react-navigation/native-stack").NativeStackNavigationProp<StubParamList>>();
  return (
    <div>
      <span data-testid="screen-practice-log-form" />
      <button data-testid="save-practice-log" onClick={() => navigation.goBack()}>
        save
      </button>
    </div>
  );
}

function renderApp() {
  navigationRef = createNavigationContainerRef<StubParamList>();
  return render(
    <NavigationContainer ref={navigationRef}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="MainTabs" component={MainTabsStub} />
        <Stack.Screen name="TeamDetail" component={TeamDetailStub} />
        <Stack.Screen name="PracticeForm" component={PracticeFormStub} />
        <Stack.Screen name="PracticeTabForm" component={PracticeTabFormStub} />
        <Stack.Screen name="PracticeLogForm" component={PracticeLogFormStub} />
      </Stack.Navigator>
    </NavigationContainer>,
  );
}

function stackRouteNames(): string[] {
  const s = navigationRef.getRootState();
  return (s?.routes ?? []).map((r) => r.name);
}

async function settle() {
  await act(async () => {
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    await new Promise((r) => setTimeout(r, 50));
  });
}

describe("練習フロー — replace/goBack の実挙動 (popToTop 誤爆の有無を実測)", () => {
  afterEach(() => {
    cleanup();
  });

  it("[V-PRACTICE-01] TeamDetail→PracticeForm(replace)→PracticeTabForm→保存(goBack) は TeamDetail に戻り、activeTab state を保持する (チーム一覧までは戻らない)", async () => {
    const { container } = renderApp();
    await act(async () => {
      navigationRef.navigate("TeamDetail", { teamId: "team-1", initialTab: "members" });
    });
    await settle();
    expect(stackRouteNames()).toEqual(["MainTabs", "TeamDetail"]);

    // ユーザーが練習タブに切り替えてから「練習を追加」を押す状況を再現
    await act(async () => {
      fireEvent.click(container.querySelector('[data-testid="switch-to-practice-tab"]')!);
    });
    await act(async () => {
      fireEvent.click(container.querySelector('[data-testid="open-practice-form"]')!);
    });
    await settle();

    // PracticeForm が push され、マウント直後の replace で PracticeTabForm に
    // 差し替わっている (スタックの深さは変わらず、TeamDetail はそのまま残る)
    expect(stackRouteNames()).toEqual(["MainTabs", "TeamDetail", "PracticeTabForm"]);

    await act(async () => {
      fireEvent.click(container.querySelector('[data-testid="save-practice"]')!);
    });
    await settle();

    // 🚨 popToTop 相当が紛れ込んでいれば ["MainTabs"] まで縮む。実際は TeamDetail に戻る
    expect(stackRouteNames()).toEqual(["MainTabs", "TeamDetail"]);

    // 🚨 同一コンポーネントインスタンスなら activeTab="practice" が保持されたまま。
    // popToTop→再 push のような別経路に置き換わっていれば "members" に巻き戻る
    const teamDetailEl = container.querySelector('[data-testid="screen-team-detail"]');
    expect(teamDetailEl?.getAttribute("data-active-tab")).toBe("practice");
  });

  it("[V-PRACTICE-02] TeamDetail→PracticeLogForm(push)→保存(goBack) も TeamDetail に戻る (非 admin「記録追加」相当)", async () => {
    const { container } = renderApp();
    await act(async () => {
      navigationRef.navigate("TeamDetail", { teamId: "team-1", initialTab: "practice" });
    });
    await settle();

    await act(async () => {
      fireEvent.click(container.querySelector('[data-testid="open-practice-log-form"]')!);
    });
    await settle();
    expect(stackRouteNames()).toEqual(["MainTabs", "TeamDetail", "PracticeLogForm"]);

    await act(async () => {
      fireEvent.click(container.querySelector('[data-testid="save-practice-log"]')!);
    });
    await settle();

    expect(stackRouteNames()).toEqual(["MainTabs", "TeamDetail"]);
    expect(
      container.querySelector('[data-testid="screen-team-detail"]')?.getAttribute("data-active-tab"),
    ).toBe("practice");
  });
});
