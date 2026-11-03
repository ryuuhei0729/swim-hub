import React, { useMemo } from "react";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useTranslation } from "react-i18next";
import type { MainStackParamList } from "./types";
import { DashboardScreen } from "@/screens/DashboardScreen";
import { RecordsHubScreen } from "@/screens/RecordsHubScreen";
import { TeamsScreen } from "@/screens/TeamsScreen";
import { GoalsScreen } from "@/screens/GoalsScreen";
import { MyPageScreen } from "@/screens/MyPageScreen";
import {
  createTabNavigator,
  TabBarShell,
  tabNavigatorScreenOptions,
  tabScreenOptions,
} from "./tabBar";
import { useAuth } from "@/contexts/AuthProvider";
import { useTeamsQuery } from "@apps/shared/hooks/queries/teams";
import { getSoleApprovedTeamId } from "@/utils/teamMembershipGroups";

// 実機では tabBar.native.tsx (OS 標準のタブバー)、web とテストでは tabBar.tsx (JS 描画)
const Tab = createTabNavigator();

/**
 * タブナビゲーター
 * 認証済みユーザー向けのメイン画面遷移を管理
 * ホーム、記録 (練習/大会)、チーム、目標、マイページの5つのタブ
 * (iOS 標準のタブバーは 5 つまでしか並ばず、6 つ目以降は「その他」にまとめられてしまう)
 */
export const TabNavigator: React.FC = () => {
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { supabase } = useAuth();

  // DashboardScreen も同じ queryKey (teamKeys.list()) を購読済みのため dedupe され追加フェッチは発生しない
  const { teams } = useTeamsQuery(supabase, {
    enableRealtime: false,
  });
  const soleTeamId = useMemo(() => getSoleApprovedTeamId(teams), [teams]);

  return (
    <TabBarShell>
      <Tab.Navigator screenOptions={tabNavigatorScreenOptions}>
        <Tab.Screen
          name="Dashboard"
          component={DashboardScreen}
          options={tabScreenOptions({
            label: t("navigation.mobile.tabs.home"),
            testID: "tab-dashboard",
            feather: "home",
          })}
        />
        <Tab.Screen
          name="Records"
          component={RecordsHubScreen}
          options={tabScreenOptions({
            label: t("navigation.mobile.tabs.records"),
            testID: "tab-records",
            feather: "clipboard",
          })}
        />
        <Tab.Screen
          name="Teams"
          component={TeamsScreen}
          options={tabScreenOptions({
            label: t("navigation.mobile.tabs.teams"),
            testID: "tab-teams",
            feather: "users",
          })}
          listeners={{
            tabPress: (e) => {
              // 所属チームが1件のみのときだけ、チーム一覧を飛ばして詳細へ直行させる。
              // それ以外は何もせず通常のタブ切替に任せる (preventDefault もしない)
              if (soleTeamId === null) return;

              // 押した時点の値で確定させる。以降の2つの dispatch は同一 tick で走るので
              // 実行時の再評価はしない
              const targetTeamId = soleTeamId;

              // タブ切替を「ライブラリに任せず自分で行う」ことが要点。
              // JS 描画の BottomTabBar.onPress は tabPress を emit した直後、!focused のときだけ
              // dispatch(CommonActions.navigate(route)) を実行するが、その新 state は
              // emit 前のスナップショットから組み立てられるため、リスナー内で積んだ
              // TeamDetail が上書きで捨てられる (POP ではないので beforeRemove も出ない)。
              // ＝ホーム等の別タブから押したときだけ遷移が消える、という不具合になる。
              //
              // そこで preventDefault でライブラリ側の dispatch を止め、タブ切替を我々の
              // navigation から行う (JS 描画版はこれで打ち消しが起きない)。
              //
              // ネイティブのタブバー (tabBar.native.tsx) の tabPress は打ち消し不可で emit され
              // (イベントに preventDefault が無い)、emit の直後に必ず navigate(Teams) を
              // タブナビゲーターへ dispatch する。ここで TeamDetail を同期で push してしまうと、
              // その navigate が「TeamDetail の下にある MainTabs をフォーカスする」扱いになり、
              // StackRouter.getStateForRouteFocus が TeamDetail を取り除く (= 直行しない)。
              // そのため push はマイクロタスクに回し、ライブラリ側の dispatch が終わってから行う。
              // JS 描画版でも同じ順序で問題なく動く。
              //
              // ⚠️ タブ切替(1行目)を省くと、タブバーのハイライトがホームのまま残り、
              // 戻るボタンでもチーム一覧ではなくホームに着地してしまう。2行はセット。
              e.preventDefault?.();
              navigation.navigate("MainTabs", { screen: "Teams" });
              queueMicrotask(() => {
                navigation.navigate("TeamDetail", { teamId: targetTeamId, instant: true });
              });
            },
          }}
        />
        <Tab.Screen
          name="Goals"
          component={GoalsScreen}
          options={tabScreenOptions({
            label: t("navigation.mobile.tabs.goals"),
            testID: "tab-goals",
            feather: "target",
          })}
        />
        <Tab.Screen
          name="MyPage"
          component={MyPageScreen}
          options={tabScreenOptions({
            label: t("navigation.mobile.tabs.myPage"),
            testID: "tab-mypage",
            feather: "user",
          })}
        />
      </Tab.Navigator>
    </TabBarShell>
  );
};
