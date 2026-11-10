import React, { useCallback } from "react";
import { ScrollView, StyleSheet, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthProvider";
import { useUserQuery } from "@apps/shared/hooks/queries/user";
import { calendarColorKeys, teamKeys } from "@apps/shared/hooks/queries/keys";
import { GoogleCalendarSyncSettings } from "@/components/settings/GoogleCalendarSyncSettings";
import { IOSCalendarSyncSettings } from "@/components/settings/IOSCalendarSyncSettings";
import { CalendarColorSettings } from "@/components/settings/CalendarColorSettings";
import { LoadingSpinner } from "@/components/layout/LoadingSpinner";
import { useSafeInsets } from "@/hooks/useSafeInsets";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { getSafeFooterPadding } from "@/utils/safeFooterPadding";
import { colors } from "@/constants/theme";

/**
 * アカウント > カレンダー
 * Google カレンダー連携・iOS カレンダー連携 (iOS のみ表示)・カレンダー記録色
 */
export const AccountCalendarScreen: React.FC = () => {
  const { supabase } = useAuth();
  const { t } = useTranslation();
  const insets = useSafeInsets();
  const queryClient = useQueryClient();

  const {
    profile,
    isLoading,
    refetch: refetchProfile,
  } = useUserQuery(supabase, {
    enableRealtime: false,
  });

  // この画面と子孫 (CalendarColorSettings が保持する useCalendarColorSettingsQuery /
  // useTeamsQuery) が依存する全クエリを尽くす。子孫が queryKey を握っているため
  // refetch を直接呼べず、queryClient.invalidateQueries で狙う
  const refreshAll = useCallback(async () => {
    await Promise.allSettled([
      refetchProfile(),
      queryClient.invalidateQueries({ queryKey: calendarColorKeys.all }),
      queryClient.invalidateQueries({ queryKey: teamKeys.lists() }),
    ]);
  }, [refetchProfile, queryClient]);
  const { refreshing, handleRefresh } = usePullToRefresh(refreshAll);

  if (isLoading && !profile) {
    return (
      <SafeAreaView style={styles.container} edges={["left", "right"]}>
        <LoadingSpinner fullScreen message={t("settings.mobile.loading")} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: getSafeFooterPadding(32, insets.bottom) },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        <GoogleCalendarSyncSettings profile={profile} onUpdate={refetchProfile} />
        <IOSCalendarSyncSettings profile={profile} onUpdate={refetchProfile} />
        <CalendarColorSettings />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 16,
  },
});
