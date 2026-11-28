"use client";

import React, { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthProvider";
import { useTeamsQuery } from "@apps/shared/hooks/queries/teams";
import { GUARDIAN_ROLE } from "@apps/shared/types";
import { toUserFacingMessage } from "@apps/shared/utils/userFacingError";
import { TeamDetailView } from "@/components/teams/TeamDetailView";
import { GuardianLogoutButton } from "@/components/teams/GuardianLogoutButton";
import { ErrorView } from "@/components/layout/ErrorView";
import { TeamSkeleton } from "@/components/ui/ScreenSkeletons";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { useTeamViewHydrated } from "@/hooks/useTeamViewHydrated";
import { useTeamViewStore } from "@/stores/teamViewStore";

const NOOP = () => {};

/**
 * 保護者アカウント (閲覧専用) でログインしたときの唯一の画面。
 * ボトムタブは無く、保護者として登録されたチームのチーム画面 (保護者版) だけを出す。
 * 保護者版の出し分け (バッジ・出欠タブ非表示・ログアウトボタン) は TeamDetailView 側で行う。
 */
export const GuardianTeamScreen: React.FC = () => {
  const { supabase } = useAuth();
  const { t } = useTranslation();
  const hydrated = useTeamViewHydrated();
  const lastTeamId = useTeamViewStore((state) => state.lastTeamId);

  const {
    teams = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useTeamsQuery(supabase, {
    enableRealtime: false, // モバイルでは一旦無効化
  });
  useRefreshOnFocus(refetch);

  // 保護者として登録されているチーム (承認済み・現役)。複数あれば最後に開いたチームを優先する
  const selectedMembership = useMemo(() => {
    const guardianTeams = teams.filter(
      (m) => m.role === GUARDIAN_ROLE && m.status === "approved" && m.is_active,
    );
    return guardianTeams.find((m) => m.team_id === lastTeamId) ?? guardianTeams[0] ?? null;
  }, [teams, lastTeamId]);

  if (isError && teams.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={["top", "left", "right", "bottom"]}>
        <ErrorView
          message={toUserFacingMessage(error, t("teams.mobile.fetchListFailed"))}
          error={error}
          onRetry={() => refetch()}
          fullScreen
        />
      </SafeAreaView>
    );
  }

  if ((isLoading && teams.length === 0) || !hydrated) {
    return (
      <SafeAreaView style={styles.container} edges={["top", "left", "right", "bottom"]}>
        <TeamSkeleton />
      </SafeAreaView>
    );
  }

  if (!selectedMembership) {
    // 保護者の登録が外された直後など。ログアウトだけはできるようにしておく
    return (
      <SafeAreaView style={styles.container} edges={["top", "left", "right", "bottom"]}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>{t("teams.mobile.teamNotFound")}</Text>
          <GuardianLogoutButton />
        </View>
      </SafeAreaView>
    );
  }

  const teamId = selectedMembership.team_id;

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right", "bottom"]}>
      <TeamDetailView
        key={teamId}
        teamId={teamId}
        teamName={selectedMembership.teams?.name || t("teams.mobile.fallbackTeamName")}
        onOpenSwitcher={NOOP}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F1F5F9",
  },
  emptyContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    padding: 24,
  },
  emptyText: {
    fontSize: 15,
    color: "#6B7280",
    textAlign: "center",
  },
});
