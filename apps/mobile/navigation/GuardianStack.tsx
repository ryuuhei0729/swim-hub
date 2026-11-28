import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useTranslation } from "react-i18next";
import type { GuardianStackParamList } from "./types";
import { GuardianTeamScreen } from "@/screens/GuardianTeamScreen";
import { TeamAnnouncementsScreen } from "@/screens/TeamAnnouncementsScreen";
import { TeamRankingsScreen } from "@/screens/TeamRankingsScreen";

const Stack = createNativeStackNavigator<GuardianStackParamList>();

/**
 * 保護者アカウント (閲覧専用) 用のスタック。
 * ボトムタブ (TabNavigator) を持たず、チーム画面 (保護者版) と、そこから開く
 * 閲覧専用の画面 (お知らせ・ランキング) だけを登録する。
 * 記録の入力・エントリー・設定などの画面は登録しないので、保護者版からは辿れない。
 * ヘッダーの見た目は MainStack と揃える。
 */
export const GuardianStack: React.FC = () => {
  const { t } = useTranslation();
  const baseHeaderOptions = {
    headerShown: true,
    headerBackTitle: t("common.back"),
    headerStyle: { backgroundColor: "#FFFFFF" },
    headerTintColor: "#111827",
    headerTitleStyle: { fontWeight: "600" as const },
  };

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: {
          backgroundColor: "#F1F5F9", // constants/theme.ts の colors.background と同じ
        },
      }}
    >
      <Stack.Screen name="GuardianTeam" component={GuardianTeamScreen} />
      <Stack.Screen
        name="TeamAnnouncements"
        component={TeamAnnouncementsScreen}
        options={{
          ...baseHeaderOptions,
          title: t("navigation.mobile.titles.teamAnnouncements"),
        }}
      />
      <Stack.Screen
        name="TeamRankings"
        component={TeamRankingsScreen}
        options={{
          ...baseHeaderOptions,
          title: t("navigation.mobile.titles.teamRankings"),
        }}
      />
    </Stack.Navigator>
  );
};
