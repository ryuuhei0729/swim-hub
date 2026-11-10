import React, { useState, useMemo, useCallback } from "react";
import { ScrollView, StyleSheet, RefreshControl, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { addMonths, parseISO, subMonths, format as formatDate } from "date-fns";
import { useTranslation } from "react-i18next";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQueryClient } from "@tanstack/react-query";
import { goalKeys } from "@apps/shared/hooks/queries/goals";
import { useAuth } from "@/contexts/AuthProvider";
import { useCalendarQuery } from "@/hooks/useCalendarQuery";
import { CalendarView } from "@/components/calendar";
import { DayDetailModal } from "@/components/calendar";
import { ErrorView } from "@/components/layout/ErrorView";
import { StaleDataBanner } from "@/components/layout/StaleDataBanner";
import { CalendarSkeleton } from "@/components/ui/ScreenSkeletons";
import { useTeamsQuery } from "@apps/shared/hooks/queries/teams";
import { useCalendarColorSettingsQuery } from "@apps/shared/hooks/queries/calendarColors";
import {
  announcementKeys,
  dashboardKeys,
  notificationKeys,
  recordKeys,
  userKeys,
} from "@apps/shared/hooks/queries/keys";
import type { CalendarColorSettings } from "@apps/shared/types/calendarColors";
import { useDayDetailHandlers } from "@/hooks/useDayDetailHandlers";
import { DashboardNoticesSection } from "@/components/dashboard/DashboardNoticesSection";
import { NextCompetitionCard } from "@/components/dashboard/NextCompetitionCard";
import { DashboardBestTimesSection } from "@/components/dashboard/DashboardBestTimesSection";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useExpiredGoalCheck } from "@/hooks/useExpiredGoalCheck";
import { GoalReflectionModal } from "@/components/goals/GoalReflectionModal";
import { ReflectionModal } from "@/components/goals/ReflectionModal";
import type { MainStackParamList } from "@/navigation/types";

// 未設定 (取得前・未カスタマイズ) の色設定。resolver がデフォルト色にフォールバックするための空値。
const DEFAULT_CALENDAR_COLOR_SETTINGS: CalendarColorSettings = {
  personal: { practice_color: null, competition_color: null },
  byTeam: {},
};

/**
 * ダッシュボード画面
 * 対応が必要なこと・次の大会・カレンダー(練習・大会)・ベストタイム・チームのお知らせを表示
 */
export const DashboardScreen: React.FC = () => {
  const { supabase, user } = useAuth();
  const { t } = useTranslation();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showDayDetail, setShowDayDetail] = useState(false);
  const queryClient = useQueryClient();
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();

  // 期限切れの目標・マイルストーンの振り返り (マウント時に1回だけ確認)
  const {
    expiredGoal,
    expiredMilestone,
    handleGoalSaved,
    handleMilestoneSaved,
    skipGoal,
    skipMilestone,
  } = useExpiredGoalCheck(supabase, user?.id, () => {
    // ログイン直後の判定で置かれた達成候補を、確認ダイアログ (MilestoneAchievementPrompter) に取り直させる
    void queryClient.invalidateQueries({ queryKey: goalKeys.pendingAchievements() });
  });

  // チーム一覧取得（お知らせ表示用）
  const { teams = [], refetch: refetchTeams } = useTeamsQuery(supabase, {
    enableRealtime: false,
  });

  // カレンダーデータ取得
  const {
    data: calendarData,
    isLoading,
    isError,
    error,
    refetch,
  } = useCalendarQuery(supabase, {
    currentDate,
  });
  const entries = useMemo(() => calendarData ?? [], [calendarData]);
  // 再取得に失敗しても、前回取得したカレンダーがあれば全画面エラーにせず表示を続ける
  const hasCachedEntries = calendarData !== undefined;

  // 記録色カスタマイズ設定 (未設定・取得前はデフォルト色を使うフォールバック値)
  const {
    settings: colorSettings = DEFAULT_CALENDAR_COLOR_SETTINGS,
    refetch: refetchColorSettings,
  } = useCalendarColorSettingsQuery(supabase, user?.id);

  // 選択した日付のエントリーを取得
  const selectedDateEntries = useMemo(() => {
    if (!selectedDate) return [];
    // CalendarViewと同じ方法で日付をフォーマット（タイムゾーン問題を回避）
    const dateKey = formatDate(selectedDate, "yyyy-MM-dd");
    return entries.filter((item) => item.date === dateKey);
  }, [selectedDate, entries]);

  // この画面と子孫(DashboardNoticesSection・NextCompetitionCard・DashboardBestTimesSection)が
  // 依存する全クエリを尽くす。
  // announcements/notifications/dashboard は子孫が queryKey を握っているため
  // refetch を直接呼べず、queryClient.invalidateQueries で狙う
  // (子孫の query observer は announcements が0件でも active のまま維持されるため確実に再取得される)
  const refreshAll = useCallback(async () => {
    await Promise.allSettled([
      refetch(),
      refetchTeams(),
      refetchColorSettings(),
      queryClient.invalidateQueries({ queryKey: announcementKeys.lists() }),
      queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
      queryClient.invalidateQueries({ queryKey: dashboardKeys.all }),
      queryClient.invalidateQueries({ queryKey: recordKeys.bestTimes(user?.id) }),
      // ベストタイム表の WA ポイント・区分記録に使う性別と生年月日
      queryClient.invalidateQueries({ queryKey: userKeys.currentProfile() }),
    ]);
  }, [refetch, refetchTeams, refetchColorSettings, queryClient, user?.id]);

  // タブ遷移時にデータ再取得
  useRefreshOnFocus(refreshAll);

  // プルリフレッシュ処理
  const { refreshing, handleRefresh } = usePullToRefresh(refreshAll);

  // 前月へ
  const handlePrevMonth = () => {
    setCurrentDate((prev) => subMonths(prev, 1));
  };

  // 次月へ
  const handleNextMonth = () => {
    setCurrentDate((prev) => addMonths(prev, 1));
  };

  // 今日に戻る
  const handleTodayClick = () => {
    setCurrentDate(new Date());
  };

  // 年月選択
  const handleMonthYearSelect = (year: number, month: number) => {
    setCurrentDate(new Date(year, month, 1));
  };

  // 日付タップ
  const handleDateClick = (date: Date) => {
    setSelectedDate(date);
    setShowDayDetail(true);
  };

  // 次の大会のカードから、その大会日の詳細を開く。
  // 詳細の中身は表示中の月のカレンダーデータから取るので、カレンダーもその月へ移す
  const handleOpenCompetitionDay = (date: string) => {
    const day = parseISO(date);
    setCurrentDate(day);
    handleDateClick(day);
  };

  // DayDetailModal の編集/削除/追加ハンドラ（練習履歴/大会記録履歴タブと共通）
  const {
    isDeleting,
    handleEntryPress,
    handleAddPractice,
    handleAddRecord,
    handleEditPractice,
    handleDeletePractice,
    handleAddPracticeLog,
    handleEditPracticeLog,
    handleDeletePracticeLog,
    handleEditRecord,
    handleDeleteRecord,
    handleEditEntry,
    handleDeleteEntry,
    handleAddEntry,
    handleEditCompetition,
    handleDeleteCompetition,
  } = useDayDetailHandlers(supabase, refetch);

  // エラー状態 (表示できるデータが無いときだけ全画面エラーにする)
  if (isError && error && !hasCachedEntries) {
    return (
      <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
        <ErrorView
          message={error.message || t("dashboard.mobile.calendarFetchFailed")}
          error={error}
          onRetry={() => refetch()}
          fullScreen
        />
      </SafeAreaView>
    );
  }

  // ローディング状態
  if (isLoading && entries.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
        <CalendarSkeleton />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        // iOS 26 の浮いたタブバーの下に末尾が隠れないよう、OS に下端の余白を足させる
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={["#2563EB"]}
            tintColor="#2563EB"
          />
        }
      >
        <StaleDataBanner visible={isError && hasCachedEntries} onRetry={() => refetch()} />
        <DashboardNoticesSection teams={teams} />
        <NextCompetitionCard
          hasTeams={teams.some((m) => m.status === "approved" && m.is_active)}
          onOpenDay={handleOpenCompetitionDay}
        />
        <View style={styles.calendar}>
          <CalendarView
            currentDate={currentDate}
            entries={entries}
            isLoading={isLoading}
            onDateClick={handleDateClick}
            onPrevMonth={handlePrevMonth}
            onNextMonth={handleNextMonth}
            onTodayClick={handleTodayClick}
            onMonthYearSelect={handleMonthYearSelect}
            colorSettings={colorSettings}
          />
        </View>
        <DashboardBestTimesSection />
      </ScrollView>

      {/* 期限切れ目標の振り返り (優先) */}
      {expiredGoal && (
        <GoalReflectionModal
          key={expiredGoal.id}
          goal={expiredGoal}
          onSkip={skipGoal}
          onSaved={handleGoalSaved}
        />
      )}

      {/* 期限切れマイルストーンの振り返り (期限切れ目標が無いときだけ) */}
      {!expiredGoal && expiredMilestone && (
        <ReflectionModal
          key={expiredMilestone.id}
          milestone={expiredMilestone}
          onSkip={skipMilestone}
          onSaved={handleMilestoneSaved}
          onGoToGoals={() => {
            skipMilestone();
            navigation.navigate("MainTabs", { screen: "Goals" });
          }}
        />
      )}

      {/* 日付詳細モーダル */}
      {selectedDate && (
        <DayDetailModal
          visible={showDayDetail}
          date={selectedDate}
          entries={selectedDateEntries}
          colorSettings={colorSettings}
          onClose={() => {
            setShowDayDetail(false);
            setSelectedDate(null);
          }}
          onEntryPress={handleEntryPress}
          onAddPractice={handleAddPractice}
          onAddRecord={handleAddRecord}
          onEditPractice={handleEditPractice}
          onDeletePractice={handleDeletePractice}
          onAddPracticeLog={handleAddPracticeLog}
          onEditPracticeLog={handleEditPracticeLog}
          onDeletePracticeLog={handleDeletePracticeLog}
          onEditRecord={handleEditRecord}
          onDeleteRecord={handleDeleteRecord}
          onEditEntry={handleEditEntry}
          onDeleteEntry={handleDeleteEntry}
          onAddEntry={handleAddEntry}
          onEditCompetition={handleEditCompetition}
          onDeleteCompetition={handleDeleteCompetition}
          isDeleting={isDeleting}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F1F5F9",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 8,
    paddingBottom: 16,
  },
  calendar: {
    marginTop: 12,
  },
});
