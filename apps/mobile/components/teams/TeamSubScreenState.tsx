import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { LoadingSpinner } from "@/components/layout/LoadingSpinner";
import { ErrorView } from "@/components/layout/ErrorView";
import { colors } from "@/constants/theme";

interface TeamSubScreenStateProps {
  isLoading: boolean;
  /** 表示できるデータがあるか。再取得に失敗しても、前回のデータがあればそのまま見せる */
  hasData: boolean;
  error: Error | null | undefined;
  onRetry: () => void;
}

/**
 * チームタブから開く別画面 (チーム設定・お知らせ・ランキング・メンバーの目標) の
 * 読み込み中・取得失敗の表示。表示するものがあれば null を返す。
 */
export function renderTeamSubScreenState({
  isLoading,
  hasData,
  error,
  onRetry,
}: TeamSubScreenStateProps): React.ReactElement | null {
  if (hasData) return null;
  if (isLoading) return <TeamSubScreenLoading />;
  if (error) return <TeamSubScreenError error={error} onRetry={onRetry} />;
  return null;
}

const TeamSubScreenLoading: React.FC = () => {
  const { t } = useTranslation();
  return (
    <View style={styles.container}>
      <LoadingSpinner fullScreen message={t("teams.mobile.loadingTeam")} />
    </View>
  );
};

const TeamSubScreenError: React.FC<{ error: Error; onRetry: () => void }> = ({ error, onRetry }) => {
  const { t } = useTranslation();
  return (
    <View style={styles.container}>
      <ErrorView
        message={error.message || t("teams.mobile.fetchTeamFailed")}
        error={error}
        onRetry={onRetry}
        fullScreen
      />
    </View>
  );
};

/** 管理者ビューでのみ開ける画面に、そうでない状態で来たとき */
export const TeamAdminOnlyNotice: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const { t } = useTranslation();
  return (
    <View style={[styles.container, styles.center]}>
      <Feather name="lock" size={40} color="#9CA3AF" />
      <Text style={styles.noticeText}>{t("teams.mobile.bulkRegisterAdminRequired")}</Text>
      <Pressable style={styles.backButton} onPress={onBack} accessibilityRole="button">
        <Text style={styles.backButtonText}>{t("common.back")}</Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 12,
  },
  noticeText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: "center",
  },
  backButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.primary,
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});
