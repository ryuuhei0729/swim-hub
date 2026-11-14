"use client";

import React from "react";
import { View, StyleSheet } from "react-native";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import { TeamMemberGoalsTab } from "@/components/teams/member-goals/TeamMemberGoalsTab";
import {
  TeamAdminOnlyNotice,
  renderTeamSubScreenState,
} from "@/components/teams/TeamSubScreenState";
import { useTeamAdminView } from "@/hooks/useTeamAdminView";
import { colors } from "@/constants/theme";
import type { MainStackParamList } from "@/navigation/types";

type RouteProps = RouteProp<MainStackParamList, "TeamMemberGoals">;

/** メンバーの目標 (管理者ビュー専用)。チームタブ「その他」のカードから開く */
export const TeamMemberGoalsScreen: React.FC = () => {
  const { teamId } = useRoute<RouteProps>().params;
  const navigation = useNavigation();
  const { members, isLoading, error, refetch, effectiveIsAdminView } = useTeamAdminView(teamId);

  const state = renderTeamSubScreenState({
    isLoading,
    hasData: members.length > 0,
    error,
    onRetry: () => void refetch(),
  });
  if (state) return state;

  if (!effectiveIsAdminView) {
    return <TeamAdminOnlyNotice onBack={() => navigation.goBack()} />;
  }

  return (
    <View style={styles.container}>
      <TeamMemberGoalsTab teamId={teamId} members={members} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
