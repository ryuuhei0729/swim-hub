import React, { useMemo, useCallback, useState } from "react";
import { View, Text, StyleSheet, RefreshControl, Pressable } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { parseISO, isValid } from "date-fns";
import { useAuth } from "@/contexts/AuthProvider";
import { practiceKeys } from "@apps/shared/hooks/queries/keys";
import { PracticeAPI } from "@apps/shared/api/practices";
import { STYLE_CODE_TO_ABBREV } from "@apps/shared/utils/swimStyles";
import { PracticeItem } from "@/components/practices";
import { ListToolbar, SortBottomSheet, FilterBottomSheet } from "@/components/history";
import type { SortPreset, FilterGroup } from "@/components/history";
import {
  filterPracticeLogRows,
  sortPracticeLogRows,
  countActivePracticeFilters,
  getParticipatedPracticePlaces,
  getParticipatedPracticeStyleCodes,
  type PracticeFilterValues,
  type PracticeSortColumn,
} from "@/utils/practiceLogFilter";
import { buildPracticeLogRows, type PracticeLogRow } from "@apps/shared/utils/practiceLogRows";
import { LoadingSpinner } from "@/components/layout/LoadingSpinner";
import { ErrorView } from "@/components/layout/ErrorView";
import { usePracticeFilterStore } from "@/stores/practiceFilterStore";
import { useShallow } from "zustand/react/shallow";
import { useTranslation } from "react-i18next";
import { DayDetailModal } from "@/components/calendar";
import { useDayEntriesQuery } from "@/hooks/useDayEntriesQuery";
import { useDayDetailHandlers } from "@/hooks/useDayDetailHandlers";
import type { PracticeWithLogs, PracticeTag } from "@swim-hub/shared/types";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";

// 一覧の初期表示件数、および「もっと見る」(onEndReached)1回あたりの増分
const PAGE_INCREMENT = 20;

/**
 * 練習記録一覧画面
 * 練習記録(日単位)の一覧を全幅カード + ボトムシート(並べ替え/絞り込み)で表示する。
 * 絞り込み/並べ替え/表示件数はすべてクライアント側(useMemo)で処理し、
 * サーバーからは過去1年分を一括取得する(pageSize=1000 相当。日付範囲ロジックは既存を維持)。
 */
export const PracticesScreen: React.FC = () => {
  const { supabase } = useAuth();
  const { t, i18n } = useTranslation();

  // 行タップで開く日付詳細モーダル（ダッシュボードと同一のDayDetailModal）
  const [modalDate, setModalDate] = useState<Date | null>(null);
  const [showDayDetail, setShowDayDetail] = useState(false);

  const [displayCount, setDisplayCount] = useState(PAGE_INCREMENT);

  // 並べ替え/絞り込みボトムシートの開閉状態(排他制御: 同時に開かない)
  const [isSortSheetOpen, setIsSortSheetOpen] = useState(false);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const openSortSheet = useCallback(() => {
    setIsFilterSheetOpen(false);
    setIsSortSheetOpen(true);
  }, []);
  const openFilterSheetRaw = useCallback(() => {
    setIsSortSheetOpen(false);
    setIsFilterSheetOpen(true);
  }, []);

  // フィルター/ソートストア
  const {
    selectedTagIds,
    filterPlaces,
    filterStyle,
    sortColumn,
    sortOrder,
    setSelectedTags,
    setFilterPlaces,
    setFilterStyle,
    setSortColumn,
    setSortOrder,
    resetFilters,
  } = usePracticeFilterStore(
    useShallow((state) => ({
      selectedTagIds: state.selectedTagIds,
      filterPlaces: state.filterPlaces,
      filterStyle: state.filterStyle,
      sortColumn: state.sortColumn,
      sortOrder: state.sortOrder,
      setSelectedTags: state.setSelectedTags,
      setFilterPlaces: state.setFilterPlaces,
      setFilterStyle: state.setFilterStyle,
      setSortColumn: state.setSortColumn,
      setSortOrder: state.setSortOrder,
      resetFilters: state.reset,
    })),
  );

  // ---------------------------------------------------------------------------
  // 絞り込みシートのドラフト状態: チップ操作はこのローカル state のみを更新し、
  // 「適用」を押した時にのみストアへ一括コミットする。
  // ---------------------------------------------------------------------------
  const buildFilterDraftFromStore = useCallback(
    (): PracticeFilterValues => ({
      filterPlaces,
      filterStyle,
      selectedTagIds,
    }),
    [filterPlaces, filterStyle, selectedTagIds],
  );

  const [filterDraft, setFilterDraft] = useState<PracticeFilterValues>(buildFilterDraftFromStore);

  const openFilterSheet = useCallback(() => {
    setFilterDraft(buildFilterDraftFromStore());
    openFilterSheetRaw();
  }, [buildFilterDraftFromStore, openFilterSheetRaw]);

  const handleDraftPlacesChange = useCallback(
    (values: string[]) => setFilterDraft((prev) => ({ ...prev, filterPlaces: values })),
    [],
  );
  const handleDraftStyleChange = useCallback(
    (value: string) => setFilterDraft((prev) => ({ ...prev, filterStyle: value })),
    [],
  );
  const handleDraftTagIdsChange = useCallback(
    (values: string[]) => setFilterDraft((prev) => ({ ...prev, selectedTagIds: values })),
    [],
  );

  const handleClearDraftFilters = useCallback(() => {
    setFilterDraft({ filterPlaces: [], filterStyle: "", selectedTagIds: [] });
  }, []);

  const handleApplyFilters = useCallback(() => {
    setFilterPlaces(filterDraft.filterPlaces);
    setFilterStyle(filterDraft.filterStyle);
    setSelectedTags(filterDraft.selectedTagIds);
    setDisplayCount(PAGE_INCREMENT);
    setIsFilterSheetOpen(false);
  }, [filterDraft, setFilterPlaces, setFilterStyle, setSelectedTags]);

  // 0件空状態(絞り込み条件に一致なし)の「フィルタをリセット」導線: ドラフトを経由せず
  // 即時に全解除する(ソートも含めて全リセットする web と同じ仕様)
  const handleResetAllFilters = useCallback(() => {
    resetFilters();
    setDisplayCount(PAGE_INCREMENT);
  }, [resetFilters]);

  // デフォルトの日付範囲（過去1年間）- 初期化時に一度だけ計算
  const [defaultStartDate] = useState(() => {
    const date = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    return date.toISOString().split("T")[0];
  });

  const [defaultEndDate] = useState(() => {
    return new Date().toISOString().split("T")[0];
  });

  const practiceApi = useMemo(() => new PracticeAPI(supabase), [supabase]);

  // タグ一覧を取得
  const {
    data: tags = [],
    refetch: refetchTags,
  } = useQuery({
    queryKey: ["practice-tags"],
    queryFn: async () => {
      return await practiceApi.getPracticeTags();
    },
    staleTime: 5 * 60 * 1000,
  });

  // 練習記録データ取得: 絞り込み/並べ替え/表示件数は全てクライアント側で処理するため
  // 十分大きい件数(pageSize=1000)を一括取得する(日付範囲=過去1年は既存ロジックを維持)
  const {
    data: allPractices = [],
    error,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: practiceKeys.list({ startDate: defaultStartDate, endDate: defaultEndDate, pageSize: 1000 }),
    queryFn: async () => practiceApi.getPractices(defaultStartDate, defaultEndDate, 1000, 0),
    staleTime: 5 * 60 * 1000,
  });

  // 場所/種目フィルタの選択肢生成(全件ベース)
  const participatedPlaces = useMemo(
    () => getParticipatedPracticePlaces(allPractices, i18n.language),
    [allPractices, i18n.language],
  );
  const participatedStyleCodes = useMemo(
    () => getParticipatedPracticeStyleCodes(allPractices),
    [allPractices],
  );

  // 一覧のベース: 1練習ログ = 1カード行へ平坦化する(大会タブと同じ粒度)
  const practiceLogRows = useMemo(() => buildPracticeLogRows(allPractices), [allPractices]);

  // 絞り込み → 並べ替え(useMemoで即座に反映)
  const filteredRows = useMemo(
    () => filterPracticeLogRows(practiceLogRows, { filterPlaces, filterStyle, selectedTagIds }),
    [practiceLogRows, filterPlaces, filterStyle, selectedTagIds],
  );

  const sortedRows = useMemo(
    () => sortPracticeLogRows(filteredRows, sortColumn, sortOrder, i18n.language),
    [filteredRows, sortColumn, sortOrder, i18n.language],
  );

  // 「もっと見る」(FlashList onEndReached): 絞り込み後・並べ替え後の総件数のうち displayCount 件のみ表示
  const displayRows = useMemo(
    () => sortedRows.slice(0, displayCount),
    [sortedRows, displayCount],
  );

  const activeFilterCount = useMemo(
    () => countActivePracticeFilters({ filterPlaces, filterStyle, selectedTagIds }),
    [filterPlaces, filterStyle, selectedTagIds],
  );

  const draftActiveFilterCount = useMemo(() => countActivePracticeFilters(filterDraft), [filterDraft]);

  // 並べ替えボトムシートのプリセット(日付新/古 + 場所昇/降の4択。日付新しい順が既定)
  const sortPresets: SortPreset<Exclude<PracticeSortColumn, null>>[] = useMemo(
    () => [
      {
        id: "dateDesc",
        label: t("practice.page.sortOptionDateDesc"),
        column: "date",
        order: "desc",
        isDefault: true,
      },
      { id: "dateAsc", label: t("practice.page.sortOptionDateAsc"), column: "date", order: "asc" },
      { id: "placeAsc", label: t("practice.sortSheet.placeAsc"), column: "place", order: "asc" },
      { id: "placeDesc", label: t("practice.sortSheet.placeDesc"), column: "place", order: "desc" },
    ],
    [t],
  );

  const handleSortSelect = useCallback(
    (preset: SortPreset<Exclude<PracticeSortColumn, null>>) => {
      setSortColumn(preset.column);
      setSortOrder(preset.order);
      setDisplayCount(PAGE_INCREMENT);
      setIsSortSheetOpen(false);
    },
    [setSortColumn, setSortOrder],
  );

  // 絞り込みボトムシートのグループ定義(ドラフト state を参照する)
  const filterGroups: FilterGroup[] = useMemo(
    () => [
      {
        id: "place",
        label: t("practice.page.colPlace"),
        mode: "multi",
        options: participatedPlaces.map((place) => ({ value: place, label: place })),
        selectedValues: filterDraft.filterPlaces,
        onChange: handleDraftPlacesChange,
        onClearGroup: () => handleDraftPlacesChange([]),
      },
      {
        id: "style",
        label: t("practice.page.colStyle"),
        mode: "single",
        options: participatedStyleCodes.map((code) => ({
          value: code,
          label: t(`practice.styleAbbrev.${STYLE_CODE_TO_ABBREV[code]}`),
        })),
        selectedValues: filterDraft.filterStyle ? [filterDraft.filterStyle] : [],
        onChange: (values: string[]) => handleDraftStyleChange(values[0] ?? ""),
        onClearGroup: () => handleDraftStyleChange(""),
      },
      {
        id: "tags",
        label: t("practice.page.colTags"),
        mode: "multi",
        note: t("practice.filterSheet.tagsAndNote"),
        options: tags.map((tag: PracticeTag) => ({ value: tag.id, label: tag.name, color: tag.color })),
        selectedValues: filterDraft.selectedTagIds,
        onChange: handleDraftTagIdsChange,
        onClearGroup: () => handleDraftTagIdsChange([]),
      },
    ],
    [
      t,
      participatedPlaces,
      participatedStyleCodes,
      tags,
      filterDraft,
      handleDraftPlacesChange,
      handleDraftStyleChange,
      handleDraftTagIdsChange,
    ],
  );

  // 選択した日付のカレンダーエントリー（DayDetailModal表示用）
  const { data: dayEntries = [], refetch: refetchDayEntries } = useDayEntriesQuery(
    supabase,
    modalDate,
  );

  // 削除/変更後は一覧とモーダルの両方を再取得する
  const refetchAfterMutation = useCallback(() => {
    refetch();
    refetchDayEntries();
  }, [refetch, refetchDayEntries]);

  // DayDetailModal の編集/削除/追加ハンドラ（ダッシュボードと共通）
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
  } = useDayDetailHandlers(supabase, refetchAfterMutation);

  // 行タップで該当日のDayDetailModalを開く
  const handlePracticePress = useCallback((practice: PracticeWithLogs) => {
    const parsedDate = parseISO(practice.date);
    if (!isValid(parsedDate)) return;
    setModalDate(parsedDate);
    setShowDayDetail(true);
  }, []);

  // この画面が依存する全クエリ(練習一覧 + タグ一覧 + 開いている日付詳細)を尽くす
  const refreshAll = useCallback(async () => {
    await Promise.allSettled([refetch(), refetchTags(), refetchDayEntries()]);
  }, [refetch, refetchTags, refetchDayEntries]);

  // タブ遷移時にデータ再取得
  useRefreshOnFocus(refreshAll);

  // プルリフレッシュ処理
  const { refreshing: isUserRefreshing, handleRefresh } = usePullToRefresh(refreshAll);

  // 無限スクロール(displayCount を増やすのみ。ネットワーク再フェッチは行わない)。
  // 既に全件表示済みの場合は onEndReached の連続発火で無駄な再レンダーを起こさないよう
  // ガードする
  const handleLoadMore = useCallback(() => {
    if (displayCount >= sortedRows.length) return;
    setDisplayCount((count) => count + PAGE_INCREMENT);
  }, [displayCount, sortedRows.length]);

  // 練習記録アイテムのレンダリング（メモ化）。1行 = 1練習ログ
  const renderItem = useCallback(
    ({ item }: { item: PracticeLogRow }) => (
      <PracticeItem practice={item.practice} log={item.log} onPress={handlePracticePress} />
    ),
    [handlePracticePress],
  );

  // エラー状態
  if (error) {
    return (
      <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
        <ErrorView
          message={error.message || t("practice.mobile.fetchFailed")}
          onRetry={() => refetch()}
          fullScreen
        />
      </SafeAreaView>
    );
  }

  // ローディング状態（初回読み込み時）
  if (isLoading && allPractices.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
        <LoadingSpinner fullScreen message={t("practice.mobile.loading")} />
      </SafeAreaView>
    );
  }

  // データが空の場合（絞り込み前の全件が0件）
  if (allPractices.length === 0 && !isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>{t("practice.page.emptyTitle")}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <ListToolbar
        itemCount={sortedRows.length}
        onSortClick={openSortSheet}
        onFilterClick={openFilterSheet}
        activeFilterCount={activeFilterCount}
      />

      <FlashList
        data={displayRows}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isUserRefreshing}
            onRefresh={handleRefresh}
            colors={["#2563EB"]}
            tintColor="#2563EB"
          />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>{t("practice.page.noMatchTitle")}</Text>
            {/* データ自体は存在するが絞り込み条件に一致が無い場合のみ、フィルタ全解除の導線を出す
                (web PracticeClient と同様、「データが0件」とは区別する) */}
            {allPractices.length > 0 && activeFilterCount > 0 && (
              <Pressable
                style={styles.resetFilterButton}
                onPress={handleResetAllFilters}
                accessibilityRole="button"
              >
                <Text style={styles.resetFilterButtonText}>{t("competition.filter.resetButton")}</Text>
              </Pressable>
            )}
          </View>
        }
      />

      {/* 並べ替えボトムシート */}
      <SortBottomSheet<Exclude<PracticeSortColumn, null>>
        isOpen={isSortSheetOpen}
        onClose={() => setIsSortSheetOpen(false)}
        title={t("practice.sortSheet.title")}
        presets={sortPresets}
        activeColumn={sortColumn}
        activeOrder={sortOrder}
        onSelect={handleSortSelect}
      />

      {/* 絞り込みボトムシート(ドラフト化: X/backdrop/Android戻る/シート排他で閉じるとドラフトは
          破棄され、ストア(一覧・件数バッジ)には影響しない。「適用」でのみコミットされる) */}
      <FilterBottomSheet
        isOpen={isFilterSheetOpen}
        onClose={() => setIsFilterSheetOpen(false)}
        title={t("practice.filterSheet.title")}
        groups={filterGroups}
        activeCount={draftActiveFilterCount}
        onClearAll={handleClearDraftFilters}
        onApply={handleApplyFilters}
      />

      {/* 日付詳細モーダル（ダッシュボードと同一のDayDetailModal） */}
      {modalDate && (
        <DayDetailModal
          visible={showDayDetail}
          date={modalDate}
          entries={dayEntries}
          scope="practice"
          onClose={() => {
            setShowDayDetail(false);
            setModalDate(null);
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
  listContent: {
    paddingVertical: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#6B7280",
    marginBottom: 8,
  },
  resetFilterButton: {
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
  },
  resetFilterButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
  },
});
