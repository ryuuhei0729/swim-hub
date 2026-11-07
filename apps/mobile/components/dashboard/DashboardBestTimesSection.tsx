import React, { useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useTranslation } from "react-i18next";
import { useBestTimesQuery } from "@apps/shared/hooks/queries/records";
import { useUserQuery } from "@apps/shared/hooks/queries/user";
import { resolveAgeCategory } from "@apps/shared/utils/domesticRecords";
import { toUserFacingMessage } from "@apps/shared/utils/userFacingError";
import { useAuth } from "@/contexts/AuthProvider";
import { BestTimesTable } from "@/components/profile/BestTimesTable";
import { WaPointsInfoTooltip } from "@/components/ui/WaPointsInfoTooltip";
import { sectionSurface } from "@/constants/theme";
import type { MainStackParamList } from "@/navigation/types";

/**
 * ホームのベストタイム欄。
 * 2026-11-07 にマイページから見出し・一括入力・点数化の切り替え・表をそのまま移した (マイページからは削除)。
 */
export const DashboardBestTimesSection: React.FC = () => {
  const { supabase, user } = useAuth();
  const { t } = useTranslation();
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const [isWaPointsMode, setIsWaPointsMode] = useState(false);

  const {
    data: bestTimes = [],
    isLoading,
    isError,
    error,
  } = useBestTimesQuery(supabase, { userId: user?.id });
  const { profile } = useUserQuery(supabase, { enableRealtime: false });
  // 区分記録基準の初期選択に使う年齢区分 (生年月日そのものは BestTimesTable に渡さない)
  const ageCategory = useMemo(() => resolveAgeCategory(profile?.birthday), [profile?.birthday]);
  const errorMessage = error
    ? toUserFacingMessage(error, t("mypage.mobile.bestTimesFetchFailed"))
    : undefined;

  return (
    <View style={styles.section} testID="dashboard-best-times">
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Best Time</Text>
        <View style={styles.bestTimeHeaderActions}>
          <Pressable
            style={styles.bulkInputButton}
            onPress={() => navigation.navigate("BulkBestTime")}
            accessibilityRole="button"
            accessibilityLabel={t("mypage.mobile.bulkInputAria")}
          >
            <Feather name="upload" size={14} color="#374151" />
            <Text style={styles.bulkInputButtonText}>{t("mypage.mobile.bulkInput")}</Text>
          </Pressable>
          <View style={styles.waToggleWrapper}>
            <Pressable
              testID="best-times-wa-points-toggle"
              accessibilityRole="button"
              accessibilityState={{ selected: isWaPointsMode }}
              style={[styles.waToggleButton, isWaPointsMode && styles.waToggleButtonActive]}
              onPress={() => setIsWaPointsMode((prev) => !prev)}
            >
              <Text style={[styles.waToggleText, isWaPointsMode && styles.waToggleTextActive]}>
                {t("mypage.bestTimesTable.waPointsToggleShort")}
              </Text>
            </Pressable>
            <WaPointsInfoTooltip
              testID="best-times-wa-info"
              ariaLabel={t("mypage.bestTimesTable.pointsInfoAriaLabel")}
              tooltipText={t("mypage.bestTimesTable.pointsInfo")}
            />
          </View>
        </View>
      </View>
      {isLoading ? (
        <ActivityIndicator color="#2563EB" style={styles.loading} />
      ) : isError ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>
            {errorMessage || t("mypage.mobile.bestTimesFetchFailed")}
          </Text>
        </View>
      ) : (
        <BestTimesTable
          bestTimes={bestTimes}
          gender={profile?.gender}
          isWaPointsMode={isWaPointsMode}
          ageCategory={ageCategory}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  section: {
    ...sectionSurface,
    marginTop: 12,
    paddingVertical: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    rowGap: 8,
    marginBottom: 16,
    paddingBottom: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#111827",
  },
  bulkInputButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
  },
  bulkInputButtonText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#374151",
  },
  bestTimeHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    flexShrink: 1,
    gap: 8,
  },
  waToggleWrapper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  waToggleButton: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
  },
  waToggleButtonActive: {
    backgroundColor: "#2563EB",
    borderColor: "#2563EB",
  },
  waToggleText: {
    fontSize: 11,
    fontWeight: "500",
    color: "#374151",
  },
  waToggleTextActive: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  loading: {
    paddingVertical: 24,
  },
  errorContainer: {
    padding: 20,
    alignItems: "center",
  },
  errorText: {
    fontSize: 14,
    color: "#DC2626",
  },
});
