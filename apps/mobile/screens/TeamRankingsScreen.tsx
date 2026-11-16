"use client";

import React from "react";
import { View, StyleSheet } from "react-native";
import { useRoute, type RouteProp } from "@react-navigation/native";
import { TeamRankings } from "@/components/teams/rankings";
import { renderTeamSubScreenState } from "@/components/teams/TeamSubScreenState";
import { useTeamAdminView } from "@/hooks/useTeamAdminView";
import { colors } from "@/constants/theme";
import type { MainStackParamList } from "@/navigation/types";

type RouteProps = RouteProp<MainStackParamList, "TeamRankings">;

/** チーム内ランキング。チームタブ「その他」のカードから開く */
export const TeamRankingsScreen: React.FC = () => {
  const { teamId } = useRoute<RouteProps>().params;
  const { members, isLoading, error, refetch } = useTeamAdminView(teamId);

  const state = renderTeamSubScreenState({
    isLoading,
    hasData: members.length > 0,
    error,
    onRetry: () => void refetch(),
  });
  if (state) return state;

  return (
    <View style={styles.container}>
      <TeamRankings teamId={teamId} members={members} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
