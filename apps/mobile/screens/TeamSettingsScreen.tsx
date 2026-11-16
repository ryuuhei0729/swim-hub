"use client";

import React, { useCallback } from "react";
import { View, StyleSheet } from "react-native";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useTranslation } from "react-i18next";
import { TeamSettingsTab } from "@/components/teams/TeamSettingsTab";
import { renderTeamSubScreenState } from "@/components/teams/TeamSubScreenState";
import { useTeamAdminView } from "@/hooks/useTeamAdminView";
import { colors } from "@/constants/theme";
import type { MainStackParamList } from "@/navigation/types";

type RouteProps = RouteProp<MainStackParamList, "TeamSettings">;
type NavProps = NativeStackNavigationProp<MainStackParamList>;

/**
 * チーム設定 (チーム情報・招待コード・記録色・脱退)。チームタブのヘッダー ⚙ から開く。
 * チーム情報の編集は管理者ビューのときだけ (TeamSettingsTab の docstring 参照)。
 */
export const TeamSettingsScreen: React.FC = () => {
  const { teamId } = useRoute<RouteProps>().params;
  const navigation = useNavigation<NavProps>();
  const { t } = useTranslation();
  const { currentTeam, members, isLoading, error, refetch, effectiveIsAdminView } =
    useTeamAdminView(teamId);

  // 脱退したらチームタブへ戻し、そのチームを一覧から外してもらう (TeamsScreen の leftTeamId)
  const handleLeftTeam = useCallback(() => {
    navigation.popTo("MainTabs", { screen: "Teams", params: { leftTeamId: teamId } });
  }, [navigation, teamId]);

  const state = renderTeamSubScreenState({
    isLoading,
    hasData: currentTeam !== null,
    error,
    onRetry: () => void refetch(),
  });
  if (state || !currentTeam) return state;

  return (
    <View style={styles.container}>
      <TeamSettingsTab
        teamId={teamId}
        teamName={currentTeam.name || t("teams.mobile.fallbackTeamName")}
        teamDescription={currentTeam.description}
        inviteCode={currentTeam.invite_code}
        isAdminView={effectiveIsAdminView}
        members={members}
        onLeftTeam={handleLeftTeam}
        onTeamUpdated={() => void refetch()}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
