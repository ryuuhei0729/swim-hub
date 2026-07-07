import React, { useMemo } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useRoute, useNavigation, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthProvider";
import { useTeamsQuery } from "@apps/shared/hooks/queries/teams";
import { teamKeys } from "@apps/shared/hooks/queries/keys";
import { TeamBulkRegisterForm } from "@/components/teams/TeamBulkRegisterForm";
import { LoadingSpinner } from "@/components/layout/LoadingSpinner";
import { ErrorView } from "@/components/layout/ErrorView";
import type { MainStackParamList } from "@/navigation/types";

type RouteProps = RouteProp<MainStackParamList, "TeamBulkRegister">;
type NavProps = NativeStackNavigationProp<MainStackParamList>;

/**
 * チーム練習・大会一括登録画面（管理者専用）
 * web TeamAdminClient の bulk-register タブに相当。
 * NOTE: web はファイル(CSV/Excel)アップロード方式、mobile は手動行入力方式（既存 TeamBulkRegisterForm）。
 */
export const TeamBulkRegisterScreen: React.FC = () => {
  const route = useRoute<RouteProps>();
  const navigation = useNavigation<NavProps>();
  const { teamId } = route.params;
  const { supabase, user } = useAuth();
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  // メンバー一覧（権限判定に使用）
  const { members, isLoading, isError, error, refetch } = useTeamsQuery(supabase, {
    teamId,
    enableRealtime: false,
  });

  const isCurrentUserAdmin = useMemo(() => {
    if (!user || !members) return false;
    return members.some((m) => m.user_id === user.id && m.role === "admin");
  }, [user, members]);

  const handleSuccess = () => {
    // 一括登録後にチームの練習・大会一覧を再取得
    queryClient.invalidateQueries({ queryKey: teamKeys.practices(teamId) });
    queryClient.invalidateQueries({ queryKey: teamKeys.competitions(teamId) });
    queryClient.invalidateQueries({ queryKey: ["calendar"] });
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <LoadingSpinner fullScreen message={t("common.loading")} />
      </View>
    );
  }

  // 取得エラー（権限なしと誤表示しないよう専用のエラー表示に分岐）
  if (isError) {
    return (
      <View style={styles.container}>
        <ErrorView
          message={error?.message || t("teams.mobile.fetchTeamFailed")}
          onRetry={() => refetch()}
          fullScreen
        />
      </View>
    );
  }

  // 権限ゲート（API 側でも管理者チェックされるが、UX として早期表示）
  if (!isCurrentUserAdmin) {
    return (
      <View style={styles.container}>
        <View style={styles.permissionContainer}>
          <Feather name="lock" size={40} color="#DC2626" />
          <Text style={styles.permissionText}>{t("teams.mobile.bulkRegisterAdminRequired")}</Text>
          <Pressable style={styles.permissionButton} onPress={() => navigation.goBack()}>
            <Text style={styles.permissionButtonText}>{t("common.back")}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TeamBulkRegisterForm teamId={teamId} onSuccess={handleSuccess} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F9FAFB",
    padding: 12,
  },
  permissionContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
    gap: 16,
  },
  permissionText: {
    fontSize: 15,
    color: "#6B7280",
    textAlign: "center",
  },
  permissionButton: {
    backgroundColor: "#2563EB",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
  },
  permissionButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});
