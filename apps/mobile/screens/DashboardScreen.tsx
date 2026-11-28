import React, {
  useState,
  useMemo,
  useCallback,
  useRef,
  useEffect,
} from "react";
import {
  ScrollView,
  StyleSheet,
  RefreshControl,
  View,
  Pressable,
  Keyboard,
  Platform,
  Dimensions,
} from "react-native";
import { useKeyboardState } from "react-native-keyboard-controller";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { FullWindowOverlay } from "react-native-screens";
import { addMonths, parseISO, subMonths, format as formatDate } from "date-fns";
import { useTranslation } from "react-i18next";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQueryClient } from "@tanstack/react-query";
import { goalKeys } from "@apps/shared/hooks/queries/goals";
import { recordFeedbackKeys } from "@apps/shared/hooks/queries/recordFeedbacks";
import { useAuth } from "@/contexts/AuthProvider";
import { useCalendarQuery } from "@/hooks/useCalendarQuery";
import { CalendarView } from "@/components/calendar";
import { DayDetailModal } from "@/components/calendar";
import { ErrorView } from "@/components/layout/ErrorView";
import { StaleDataBanner } from "@/components/layout/StaleDataBanner";
import { DashboardSkeleton } from "@/components/ui/ScreenSkeletons";
import { useTeamsQuery } from "@apps/shared/hooks/queries/teams";
import { useCalendarColorSettingsQuery } from "@apps/shared/hooks/queries/calendarColors";
import {
  announcementKeys,
  dashboardKeys,
  focusPointKeys,
  notificationKeys,
  recordKeys,
  userKeys,
} from "@apps/shared/hooks/queries/keys";
import type { CalendarColorSettings } from "@apps/shared/types/calendarColors";
import { useDayDetailHandlers } from "@/hooks/useDayDetailHandlers";
import { DashboardNoticesSection } from "@/components/dashboard/DashboardNoticesSection";
import { NextCompetitionCard } from "@/components/dashboard/NextCompetitionCard";
import { LastPracticeCard } from "@/components/dashboard/LastPracticeCard";
import { DashboardCardCarousel } from "@/components/dashboard/DashboardCardCarousel";
import { FocusPointCard } from "@/components/focusPoints/FocusPointCard";
import {
  useDashboardInitialCard,
  useLastPracticeQuery,
} from "@apps/shared/hooks/queries/dashboard";
import { DashboardBestTimesSection } from "@/components/dashboard/DashboardBestTimesSection";
import {
  BottomDockHost,
  BottomDockProvider,
  type BottomDockSetter,
} from "@/components/ui/BottomDock";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useExpiredGoalCheck } from "@/hooks/useExpiredGoalCheck";
import { GoalReflectionModal } from "@/components/goals/GoalReflectionModal";
import { ReflectionModal } from "@/components/goals/ReflectionModal";
import { RecordFeedbackArrivalHost } from "@/components/record-feedback/RecordFeedbackArrivalHost";
import type { MainStackParamList } from "@/navigation/types";

// 未設定 (取得前・未カスタマイズ) の色設定。resolver がデフォルト色にフォールバックするための空値。
/** iOS のネイティブのタブバーの高さ (ホームインジケータの分を除く) */
const IOS_TAB_BAR_HEIGHT = 49;

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
  const navigation =
    useNavigation<NativeStackNavigationProp<MainStackParamList>>();

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
    void queryClient.invalidateQueries({
      queryKey: goalKeys.pendingAchievements(),
    });
  });

  // チーム一覧取得（お知らせ表示用）
  const { teams = [], refetch: refetchTeams } = useTeamsQuery(supabase, {
    enableRealtime: false,
  });

  // 前回の練習 (次の大会と並べるカード)。無ければカードを出さない。
  // 並びは「次の大会 → 前回の練習」で固定し、今日・明日に練習があれば前回の練習を見せた状態で開く
  // (大会が今日・明日なら次の大会)。どちらを見せるか決まるまでは前回の練習を並べない
  const lastPracticeQuery = useLastPracticeQuery(supabase, user?.id);
  const lastPractice = lastPracticeQuery.data;
  const initialCard = useDashboardInitialCard(supabase, user?.id);
  const cardsReady =
    initialCard.ready && (lastPracticeQuery.data !== undefined || lastPracticeQuery.isError);

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
  // 一度でもカレンダーを取得できたか。月を切り替えると新しい月のデータが届くまで calendarData は
  // undefined に戻るが、そのときはホーム全体ではなくカレンダーだけを読み込み中にする
  const [hasLoadedCalendar, setHasLoadedCalendar] = useState(false);
  if (calendarData !== undefined && !hasLoadedCalendar) {
    setHasLoadedCalendar(true);
  }
  // 再取得に失敗しても、前回取得したカレンダーがあれば全画面エラーにせず表示を続ける
  const hasCachedEntries = calendarData !== undefined || hasLoadedCalendar;

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

  // ---- ベストタイム表の入力モード ------------------------------------------------
  // 入力欄はスクロールの外 (BottomDockHost) でキーボードの真上に固定し、表はスクロールで
  // 「ベストタイム欄の先頭が画面の上端に来る」位置へ1回だけ送る。
  // - ScrollView の automaticallyAdjustKeyboardInsets は使わない。フォーカスした入力欄へ
  //   自前でスクロールするため、こちらの送りと二重になり「一度上に動いてから下に動く」挙動になった
  // - 送るのはキーボードと入力欄の分の余白が下端に足された後 (足す前だと末尾が足りず途中で止まる)
  // - Android もウィンドウは縮まない (edge-to-edge では adjustResize が効かない) ため、iOS と同じく
  //   キーボードの高さで入力欄を持ち上げる。キーボード表示中はタブバーを隠す (tabBar.native.tsx)。
  //   高さは react-native-keyboard-controller から取る (RN 標準は Android で高さを 1 回しか通知せず、
  //   低い値のまま固まって入力欄の下半分がキーボードに隠れることがあった。こちらはナビゲーションバー込み)
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const containerRef = useRef<View>(null);
  const [iosKeyboardHeight, setIosKeyboardHeight] = useState(0);
  const androidKeyboardHeight = useKeyboardState((state) => (state.isVisible ? state.height : 0));
  const keyboardHeight = Platform.OS === "android" ? androidKeyboardHeight : iosKeyboardHeight;
  const [containerBottomGap, setContainerBottomGap] = useState(0);
  const [dockHeight, setDockHeight] = useState(0);
  const keyboardVisibleRef = useRef(false);
  const pendingRevealRef = useRef(false);
  const bestTimesYRef = useRef(0);
  const dockSetterRef = useRef<BottomDockSetter | null>(null);
  const dockApi = useMemo(
    () => ({
      set: (node: React.ReactNode | null) => dockSetterRef.current?.(node),
    }),
    [],
  );
  const registerDock = useCallback((setter: BottomDockSetter | null) => {
    dockSetterRef.current = setter;
  }, []);

  // ベストタイム表の入力モード中は、表以外を暗くする
  const [isBestTimesEditing, setIsBestTimesEditing] = useState(false);
  const [bestTimesLayout, setBestTimesLayout] = useState<{ y: number; height: number } | null>(
    null,
  );
  const bestTimesExitRef = useRef<(() => void) | null>(null);
  const requestExitBestTimesEditing = useCallback(() => {
    bestTimesExitRef.current?.();
  }, []);

  const scrollToBestTimes = useCallback(() => {
    pendingRevealRef.current = false;
    scrollRef.current?.scrollTo({
      y: Math.max(0, bestTimesYRef.current - 8),
      animated: true,
    });
  }, []);

  useEffect(() => {
    const isIOS = Platform.OS === "ios";
    const showSub = Keyboard.addListener(
      isIOS ? "keyboardWillShow" : "keyboardDidShow",
      (e) => {
        keyboardVisibleRef.current = true;
        // 余白が足されて中身の大きさが変わった後に handleContentSizeChange が送る
        if (isIOS) setIosKeyboardHeight(e.endCoordinates.height);
      },
    );
    const hideSub = Keyboard.addListener(
      isIOS ? "keyboardWillHide" : "keyboardDidHide",
      () => {
        keyboardVisibleRef.current = false;
        setIosKeyboardHeight(0);
      },
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [scrollToBestTimes]);

  const revealBestTimes = useCallback(() => {
    // キーボードが出たまま別のマスに移ったときはすぐ送る。出る前なら余白が足されるのを待つ
    if (keyboardVisibleRef.current) {
      scrollToBestTimes();
    } else {
      pendingRevealRef.current = true;
    }
  }, [scrollToBestTimes]);

  // 入力モードに入ったら、表全体が見える位置へ送る (「キャンセル / 登録」は入力欄と一緒に
  // 下に固定されるので、表の下までは送らなくてよい)
  const handleBestTimesEditingChange = useCallback(
    (editing: boolean) => {
      setIsBestTimesEditing(editing);
      if (editing) scrollToBestTimes();
    },
    [scrollToBestTimes],
  );

  const handleContentSizeChange = useCallback(() => {
    if (pendingRevealRef.current && keyboardVisibleRef.current)
      scrollToBestTimes();
  }, [scrollToBestTimes]);

  // 画面 (SafeAreaView) の下端と端末の下端の差。入力欄をキーボードの真上に置くのに使う。
  // Android: キーボードの高さ (keyboard-controller) は画面全体基準。measureInWindow は
  // ステータスバーの下を 0 とする座標で返すため、ステータスバーの高さを足して画面の高さと比べる
  const statusBarHeight = insets.top;
  const measureContainer = useCallback(() => {
    containerRef.current?.measureInWindow((_x, y, _w, h) => {
      if (Platform.OS === "android") {
        const screenBottom = y + statusBarHeight + h;
        setContainerBottomGap(Math.max(0, Dimensions.get("screen").height - screenBottom));
        return;
      }
      setContainerBottomGap(Math.max(0, Dimensions.get("window").height - (y + h)));
    });
  }, [statusBarHeight]);
  // キーボードが出ていない (ハードウェアキーボードなど) ときは、iOS のネイティブのタブバーの裏に
  // 隠れないよう、ホームインジケータ + タブバーの上に出す。
  // Android: キーボードが出ていないときは中身がタブバーの上に収まる (tabBar.native.tsx) ので 0
  const dockBottom =
    Platform.OS === "android"
      ? keyboardHeight > 0
        ? Math.max(0, keyboardHeight - containerBottomGap)
        : 0
      : Platform.OS !== "ios"
        ? 0
        : keyboardHeight > 0
          ? Math.max(0, keyboardHeight - containerBottomGap)
          : Math.max(0, insets.bottom + IOS_TAB_BAR_HEIGHT - containerBottomGap);

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
      queryClient.invalidateQueries({
        queryKey: recordKeys.bestTimes(user?.id),
      }),
      // ベストタイム表の WA ポイント・区分記録に使う性別と生年月日
      queryClient.invalidateQueries({ queryKey: userKeys.currentProfile() }),
      // チーム内フィードバックの未読 (受信ポップアップ)。ダッシュボードを表示するたびに確認する
      queryClient.invalidateQueries({ queryKey: recordFeedbackKeys.unread(user?.id) }),
      // フォーカスポイント (別端末・Web での追加・編集を拾う)
      queryClient.invalidateQueries({ queryKey: focusPointKeys.all }),
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

  // 詳細モーダルで削除したあと、カレンダーに加えて次の大会・前回の練習のカードも取り直す
  const refetchAfterDayChange = useCallback(() => {
    void refetch();
    void queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
  }, [refetch, queryClient]);

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
  } = useDayDetailHandlers(supabase, refetchAfterDayChange);

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

  // ローディング状態 (初回だけ。月の切り替え時はカレンダーのヘッダーに読み込み中を出す)
  if (isLoading && !hasLoadedCalendar) {
    return (
      <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
        <DashboardSkeleton
          showNotices={teams.some((m) => m.status === "approved" && m.is_active)}
        />
      </SafeAreaView>
    );
  }

  return (
    <BottomDockProvider value={dockApi}>
      <SafeAreaView
        ref={containerRef}
        style={styles.container}
        edges={["top", "left", "right"]}
        onLayout={measureContainer}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            (dockHeight > 0 || dockBottom > 0) && {
              paddingBottom: 16 + dockBottom + dockHeight,
            },
          ]}
          // iOS 26 の浮いたタブバーの下に末尾が隠れないよう、OS に下端の余白を足させる
          contentInsetAdjustmentBehavior="automatic"
          // ベストタイム表の入力モード: 入力中でも別のマスをタップできるようにする
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={handleContentSizeChange}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={["#2563EB"]}
              tintColor="#2563EB"
            />
          }
        >
          <StaleDataBanner
            visible={isError && hasCachedEntries}
            onRetry={() => refetch()}
          />
          <DashboardNoticesSection teams={teams} />
          {/* フォーカスポイントは泳ぐ前に毎回目に入るよう、カルーセルに入れず常に出す */}
          <FocusPointCard compactEmpty style={styles.focusPointCard} />
          {/* 次の大会・前回の練習を横に並べ、スワイプで切り替える。
              前回の練習が無ければ出さない。最初に見せるカードは useDashboardInitialCard が選ぶ */}
          <DashboardCardCarousel
            initialIndex={lastPractice ? initialCard.initialIndex : 0}
            ready={cardsReady}
          >
            <NextCompetitionCard
              key="next-competition"
              hasTeams={teams.some((m) => m.status === "approved" && m.is_active)}
              onOpenDay={handleOpenCompetitionDay}
              style={styles.carouselCard}
            />
            {lastPractice && (
              <LastPracticeCard
                key="last-practice"
                practice={lastPractice}
                onOpenDay={handleOpenCompetitionDay}
                style={styles.carouselCard}
              />
            )}
          </DashboardCardCarousel>
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
          <View
            style={styles.bestTimes}
            onLayout={(e) => {
              const { y, height } = e.nativeEvent.layout;
              bestTimesYRef.current = y;
              setBestTimesLayout({ y, height });
            }}
          >
            <DashboardBestTimesSection
              onRequestReveal={revealBestTimes}
              onEditingChange={handleBestTimesEditingChange}
              exitRequestRef={bestTimesExitRef}
            />
          </View>

          {/* ベストタイム表の入力モード中は、表の外側を暗くする。押すとキャンセルと同じ
              (入力があれば破棄の確認、無ければそのまま入力モードを抜ける) */}
          {isBestTimesEditing && bestTimesLayout && (
            <>
              <Pressable
                testID="best-times-edit-backdrop"
                style={[styles.editBackdrop, { top: 0, height: bestTimesLayout.y }]}
                onPress={requestExitBestTimesEditing}
                accessibilityRole="button"
                accessibilityLabel={t("mypage.bestTimesTable.edit.exitByBackdrop")}
              />
              <Pressable
                style={[
                  styles.editBackdrop,
                  { top: bestTimesLayout.y + bestTimesLayout.height, bottom: 0 },
                ]}
                onPress={requestExitBestTimesEditing}
                accessible={false}
              />
            </>
          )}
        </ScrollView>

        {/* iOS のタブバーは OS が画面より上に描くので、普通の View では重ねられない。
            FullWindowOverlay (アプリ全体より上の層) にタブバーの分だけ暗い幕を置く。
            幕の外 (表・入力欄) へのタップは下にそのまま通る。
            キーボードが出ている間はタブバーがキーボードの裏に隠れる (幕がキーボードに重なる) ので
            幕を消すが、層そのものは入力モードの間ずっと付けておく。キーボードの出入りに合わせて層を
            付け外しすると、そのたびに入力欄のフォーカスが外れてキーボードが閉じ、入力欄も閉じてしまう */}
        {isBestTimesEditing && Platform.OS === "ios" && (
          // 既定ではこの層が読み上げ (VoiceOver) 上のモーダル扱いになり、下のアプリ (表・入力欄) が
          // 読み上げから見えなくなる。暗い幕は飾りなので、モーダル扱いにしない
          <FullWindowOverlay unstable_accessibilityContainerViewIsModal={false}>
            {keyboardHeight === 0 && (
              <Pressable
                style={[
                  styles.editBackdrop,
                  { bottom: 0, height: insets.bottom + IOS_TAB_BAR_HEIGHT },
                ]}
                onPress={requestExitBestTimesEditing}
                accessible={false}
              />
            )}
          </FullWindowOverlay>
        )}

        {/* 画面上端 (ステータスバーの下の余白) も暗くする */}
        {isBestTimesEditing && (
          <Pressable
            style={[styles.editBackdrop, { top: 0, height: insets.top }]}
            onPress={requestExitBestTimesEditing}
            accessible={false}
          />
        )}

        {/* ベストタイム表の入力欄 (キーボードの真上) */}
        <BottomDockHost
          register={registerDock}
          bottom={dockBottom}
          onHeightChange={setDockHeight}
        />

        {/* 期限切れ目標の振り返り (優先) */}
        {expiredGoal && (
          <GoalReflectionModal
            key={expiredGoal.id}
            goal={expiredGoal}
            onSkip={skipGoal}
            onSaved={handleGoalSaved}
            onGoToGoals={() => {
              skipGoal();
              navigation.navigate("MainTabs", { screen: "Goals" });
            }}
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

        {/* チーム内フィードバックの受信ポップアップ (振り返り・日付詳細を出している間は重ねない) */}
        <RecordFeedbackArrivalHost
          enabled={!expiredGoal && !expiredMilestone && !showDayDetail}
        />

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
    </BottomDockProvider>
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
  carouselCard: {
    flex: 1,
  },
  // FocusPointCard は外側の余白を持たないので、ホームの他のカードと同じ余白をここで付ける
  focusPointCard: {
    marginHorizontal: 16,
    marginTop: 12,
  },
  calendar: {
    marginTop: 12,
  },
  bestTimes: {
    marginTop: 12,
  },
  editBackdrop: {
    position: "absolute",
    left: 0,
    right: 0,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
  },
});
