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
            sfSymbol: "house",
          })}
        />
        <Tab.Screen
          name="Records"
          component={RecordsHubScreen}
          options={tabScreenOptions({
            label: t("navigation.mobile.tabs.records"),
            testID: "tab-records",
            feather: "clipboard",
            sfSymbol: "list.bullet.clipboard",
          })}
        />
        <Tab.Screen
          name="Teams"
          component={TeamsScreen}
          options={tabScreenOptions({
            label: t("navigation.mobile.tabs.teams"),
            testID: "tab-teams",
            feather: "users",
            sfSymbol: "person.2",
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
              // そこで preventDefault でライブラリ側の dispatch を止め、タブ切替と push の
              // 両方を我々の navigation から同一 tick で連続 dispatch する。こちらは毎回
              // 最新 state を読むため打ち消しが起きず、2つが同じコミットに畳まれるので
              // 「チーム一覧が1フレームだけ見える」中間描画も発生しない。
              //
              // ネイティブのタブバー (tabBar.native.tsx) の tabPress は打ち消し不可で emit される
              // (イベントに preventDefault が無い)。こちらは emit 後に navigate(Teams) を
              // dispatch するが、その時点で既に Teams が選ばれているため何も起きず、
              // ここで積んだ TeamDetail はそのまま残る。打ち消しは JS 描画版のときだけ行う。
              //
              // ⚠️ タブ切替(1行目)を省くと、タブバーのハイライトがホームのまま残り、
              // 戻るボタンでもチーム一覧ではなくホームに着地してしまう。2行はセット。
              e.preventDefault?.();
              navigation.navigate("MainTabs", { screen: "Teams" });
              navigation.navigate("TeamDetail", { teamId: targetTeamId, instant: true });
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
            sfSymbol: "target",
          })}
        />
        <Tab.Screen
          name="MyPage"
          component={MyPageScreen}
          options={tabScreenOptions({
            label: t("navigation.mobile.tabs.myPage"),
            testID: "tab-mypage",
            feather: "user",
            sfSymbol: "person.crop.circle",
          })}
        />
      </Tab.Navigator>
    </TabBarShell>
  );
};
