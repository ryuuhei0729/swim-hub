import React, { useMemo } from "react";
import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import type { TabParamList, MainStackParamList } from "./types";
import { DashboardScreen } from "@/screens/DashboardScreen";
import { PracticesScreen } from "@/screens/PracticesScreen";
import { CompetitionsScreen } from "@/screens/CompetitionsScreen";
import { TeamsScreen } from "@/screens/TeamsScreen";
import { MyPageScreen } from "@/screens/MyPageScreen";
import { useAuth } from "@/contexts/AuthProvider";
import { useTeamsQuery } from "@apps/shared/hooks/queries/teams";
import { getSoleApprovedTeamId } from "@/utils/teamMembershipGroups";

const Tab = createBottomTabNavigator<TabParamList>();

/**
 * タブナビゲーター
 * 認証済みユーザー向けのメイン画面遷移を管理
 * ダッシュボード、練習、大会、チーム、マイページの5つのタブ
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

  // Android のシステムナビゲーションバー(3ボタン)ぶんの下部インセットは、
  // JS の useSafeAreaInsets フックが一部端末で 0 を返す既知不具合
  // (safe-area-context #546) があるため使わない。代わりにネイティブ経路で
  // 信頼できる SafeAreaView(edges=["bottom"]) でナビゲーター全体を包み、
  // タブバーはその上端に固定させる。これにより描画領域がシステムナビ
  // ゲーションバーの上端までに収まり、タブと3ボタンが重ならない。
  // タブバー自身は固定高さとし、フックの値に依存させない。
  return (
    <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#2563EB",
        tabBarInactiveTintColor: "#6B7280",
        tabBarStyle: {
          backgroundColor: "#FFFFFF",
          borderTopColor: "#E5E7EB",
          borderTopWidth: 1,
          paddingTop: 8,
          paddingBottom: 8,
          paddingHorizontal: 12,
          height: 64,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: "500",
          marginTop: 2,
        },
        tabBarIconStyle: {
          marginTop: 4,
        },
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          tabBarLabel: t("navigation.mobile.tabs.home"),
          tabBarButtonTestID: "tab-dashboard",
          tabBarIcon: ({ color }) => <Feather name="home" size={20} color={color} />,
        }}
      />
      <Tab.Screen
        name="Practices"
        component={PracticesScreen}
        options={{
          tabBarLabel: t("navigation.mobile.tabs.practices"),
          tabBarButtonTestID: "tab-practices",
          tabBarIcon: ({ color }) => <Feather name="bar-chart-2" size={20} color={color} />,
        }}
      />
      <Tab.Screen
        name="Competitions"
        component={CompetitionsScreen}
        options={{
          tabBarLabel: t("navigation.mobile.tabs.competitions"),
          tabBarButtonTestID: "tab-competitions",
          tabBarIcon: ({ color }) => <Feather name="award" size={20} color={color} />,
        }}
      />
      <Tab.Screen
        name="Teams"
        component={TeamsScreen}
        options={{
          tabBarLabel: t("navigation.mobile.tabs.teams"),
          tabBarButtonTestID: "tab-teams",
          tabBarIcon: ({ color }) => <Feather name="users" size={20} color={color} />,
        }}
        listeners={{
          tabPress: (e) => {
            // 所属チームが1件のみのときだけ、チーム一覧を飛ばして詳細へ直行させる。
            // それ以外は何もせず通常のタブ切替に任せる (preventDefault もしない)
            if (soleTeamId === null) return;

            // 押した時点の値で確定させる。以降の2つの dispatch は同一 tick で走るので
            // 実行時の再評価はしない
            const targetTeamId = soleTeamId;

            // タブ切替を「ライブラリに任せず自分で行う」ことが要点。
            // BottomTabBar.onPress は tabPress を emit した直後、!focused のときだけ
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
            // ⚠️ タブ切替(1行目)を省くと、タブバーのハイライトがホームのまま残り、
            // 戻るボタンでもチーム一覧ではなくホームに着地してしまう。2行はセット。
            e.preventDefault();
            navigation.navigate("MainTabs", { screen: "Teams" });
            navigation.navigate("TeamDetail", { teamId: targetTeamId, instant: true });
          },
        }}
      />
      <Tab.Screen
        name="MyPage"
        component={MyPageScreen}
        options={{
          tabBarLabel: t("navigation.mobile.tabs.myPage"),
          tabBarButtonTestID: "tab-mypage",
          tabBarIcon: ({ color }) => <Feather name="user" size={20} color={color} />,
        }}
      />
    </Tab.Navigator>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    // タブバーと下部インセット帯を同色にしてシステムナビゲーションバー
    // 上端までを白で埋め、タブバーが浮いて見えないようにする。
    backgroundColor: "#FFFFFF",
  },
});
