import React, { useState, useMemo, useCallback } from "react";
import { ScrollView, StyleSheet, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { addMonths, subMonths, format as formatDate } from "date-fns";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthProvider";
import { useCalendarQuery } from "@/hooks/useCalendarQuery";
import { CalendarView } from "@/components/calendar";
import { DayDetailModal } from "@/components/calendar";
import { LoadingSpinner } from "@/components/layout/LoadingSpinner";
import { ErrorView } from "@/components/layout/ErrorView";
import { useTeamsQuery } from "@apps/shared/hooks/queries/teams";
import { useCalendarColorSettingsQuery } from "@apps/shared/hooks/queries/calendarColors";
import type { CalendarColorSettings } from "@apps/shared/types/calendarColors";
import { useDayDetailHandlers } from "@/hooks/useDayDetailHandlers";
import { TeamAnnouncementsSection } from "@/components/dashboard/TeamAnnouncementsSection";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";

// 未設定 (取得前・未カスタマイズ) の色設定。resolver がデフォルト色にフォールバックするための空値。
const DEFAULT_CALENDAR_COLOR_SETTINGS: CalendarColorSettings = {
  personal: { practice_color: null, competition_color: null },
  byTeam: {},
};

/**
 * ダッシュボード画面
 * チームのお知らせとカレンダー(練習・大会)を表示
 */
export const DashboardScreen: React.FC = () => {
  const { supabase, user } = useAuth();
  const { t } = useTranslation();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showDayDetail, setShowDayDetail] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // チーム一覧取得（お知らせ表示用）
  const { teams = [] } = useTeamsQuery(supabase, {
    enableRealtime: false,
  });

  // カレンダーデータ取得
  const {
    data: entries = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useCalendarQuery(supabase, {
    currentDate,
  });

  // 記録色カスタマイズ設定 (未設定・取得前はデフォルト色を使うフォールバック値)
  const { settings: colorSettings = DEFAULT_CALENDAR_COLOR_SETTINGS } = useCalendarColorSettingsQuery(
    supabase,
    user?.id,
  );

  // 選択した日付のエントリーを取得
  const selectedDateEntries = useMemo(() => {
    if (!selectedDate) return [];
    // CalendarViewと同じ方法で日付をフォーマット（タイムゾーン問題を回避）
    const dateKey = formatDate(selectedDate, "yyyy-MM-dd");
    return entries.filter((item) => item.date === dateKey);
  }, [selectedDate, entries]);

  // タブ遷移時にデータ再取得
  useRefreshOnFocus(refetch);

  // プルリフレッシュ処理
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  }, [refetch]);

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

  // DayDetailModal の編集/削除/追加ハンドラ（練習履歴/大会記録履歴タブと共通）
  const {
    isDeleting,
    setIsDeleting,
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

  // エラー状態
  if (isError && error) {
    return (
      <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
        <ErrorView
          message={error.message || t("dashboard.mobile.calendarFetchFailed")}
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
        <LoadingSpinner fullScreen message={t("dashboard.mobile.calendarLoading")} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={["#2563EB"]}
            tintColor="#2563EB"
          />
        }
      >
        <TeamAnnouncementsSection teams={teams} />
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
      </ScrollView>

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
          onDeletingChange={setIsDeleting}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#EFF6FF",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 8,
    paddingBottom: 16,
  },
});
