import React from "react";
import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import type { TabParamList } from "./types";
import { DashboardScreen } from "@/screens/DashboardScreen";
import { PracticesScreen } from "@/screens/PracticesScreen";
import { CompetitionsScreen } from "@/screens/CompetitionsScreen";
import { TeamsScreen } from "@/screens/TeamsScreen";
import { MyPageScreen } from "@/screens/MyPageScreen";

const Tab = createBottomTabNavigator<TabParamList>();

/**
 * タブナビゲーター
 * 認証済みユーザー向けのメイン画面遷移を管理
 * ダッシュボード、練習、大会、チーム、マイページの5つのタブ
 */
export const TabNavigator: React.FC = () => {
  const { t } = useTranslation();

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
