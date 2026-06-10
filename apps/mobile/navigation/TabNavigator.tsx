import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  return (
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
          paddingBottom: Math.max(insets.bottom, 4),
          paddingHorizontal: 12,
          height: 56 + Math.max(insets.bottom, 4),
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
  );
};
