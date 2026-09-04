import React, { useState, useMemo, useCallback } from "react";
import { View, Text, StyleSheet, RefreshControl, Alert, Pressable } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { parseISO, isValid } from "date-fns";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthProvider";
import { useRecordsQuery, useDeleteRecordMutation } from "@apps/shared/hooks/queries/records";
import { recordKeys } from "@apps/shared/hooks/queries/keys";
import { toUserFacingMessage } from "@apps/shared/utils/userFacingError";
import { useRecordStore } from "@/stores/recordStore";
import { useShallow } from "zustand/react/shallow";
import { RecordItem, StandaloneRecordDetailModal, EntryOnlySection } from "@/components/records";
import { ListToolbar, SortBottomSheet, FilterBottomSheet } from "@/components/history";
import type { SortPreset, FilterGroup } from "@/components/history";
import {
  filterRecords,
  sortRecords,
  countActiveRecordFilters,
  getParticipatedDistances,
  getParticipatedStyleCodes,
  getParticipatedCompetitionNames,
  getParticipatedPlaces,
  UNSET_PLACE_VALUE,
  type RecordFilterValues,
  type RecordSortBy,
} from "@/utils/recordFilter";
import { buildEntryOnlyItems, type EntryOnlyEntryRow, type EntryOnlyItem } from "@/utils/entryOnlyFilter";
import { LoadingSpinner } from "@/components/layout/LoadingSpinner";
import { ErrorView } from "@/components/layout/ErrorView";
import { DayDetailModal } from "@/components/calendar";
import { useDayEntriesQuery } from "@/hooks/useDayEntriesQuery";
import { useDayDetailHandlers } from "@/hooks/useDayDetailHandlers";
import type { MainStackParamList } from "@/navigation/types";
import type { RecordWithDetails } from "@swim-hub/shared/types";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";

type RecordsScreenNavigationProp = NativeStackNavigationProp<MainStackParamList>;

// 一覧の初期表示件数、および「もっと見る」(onEndReached)1回あたりの増分
const PAGE_INCREMENT = 20;

/**
 * 大会記録一覧画面
 * 大会記録の一覧を全幅カード + ボトムシート(並べ替え/絞り込み)で表示する。
 * 絞り込み/並べ替え/表示件数はすべてクライアント側(useMemo)で処理し、
 * サーバーからは十分大きい件数(pageSize=1000)を一括取得する(web CompetitionClient と同型)。
 */
export const RecordsScreen: React.FC = () => {
  const navigation = useNavigation<RecordsScreenNavigationProp>();
  const { supabase, user } = useAuth();
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [displayCount, setDisplayCount] = useState(PAGE_INCREMENT);

  // 並べ替え/絞り込みボトムシートの開閉状態(排他制御: 同時に開かない)
  const [isSortSheetOpen, setIsSortSheetOpen] = useState(false);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const openSortSheet = useCallback(() => {
    setIsFilterSheetOpen(false);
    setIsSortSheetOpen(true);
  }, []);
  const openFilterSheet = useCallback(() => {
    setIsSortSheetOpen(false);
    setIsFilterSheetOpen(true);
  }, []);

  // 行タップで開く日付詳細モーダル（ダッシュボードと同一のDayDetailModal）
  const [modalDate, setModalDate] = useState<Date | null>(null);
  const [showDayDetail, setShowDayDetail] = useState(false);

  // 大会未紐付けレコード（一括入力）単体の詳細モーダル
  const [standaloneRecord, setStandaloneRecord] = useState<RecordWithDetails | null>(null);
  const [isDeletingStandalone, setIsDeletingStandalone] = useState(false);

  // フィルター/ソートストア
  const {
    filterDistances,
    filterStyles,
    filterCompetitionNames,
    filterPlaces,
    filterPoolType,
    filterRelayMode,
    sortBy,
    sortOrder,
    setFilterDistances,
    setFilterStyles,
    setFilterCompetitionNames,
    setFilterPlaces,
    setFilterPoolType,
    setFilterRelayMode,
    setSortBy,
    setSortOrder,
    resetFilter,
  } = useRecordStore(
    useShallow((state) => ({
      filterDistances: state.filterDistances,
      filterStyles: state.filterStyles,
      filterCompetitionNames: state.filterCompetitionNames,
      filterPlaces: state.filterPlaces,
      filterPoolType: state.filterPoolType,
      filterRelayMode: state.filterRelayMode,
      sortBy: state.sortBy,
      sortOrder: state.sortOrder,
      resetFilter: state.resetFilter,
      setFilterDistances: state.setFilterDistances,
      setFilterStyles: state.setFilterStyles,
      setFilterCompetitionNames: state.setFilterCompetitionNames,
      setFilterPlaces: state.setFilterPlaces,
      setFilterPoolType: state.setFilterPoolType,
      setFilterRelayMode: state.setFilterRelayMode,
      setSortBy: state.setSortBy,
      setSortOrder: state.setSortOrder,
    })),
  );

  // ---------------------------------------------------------------------------
  // 絞り込みシートのドラフト状態: チップ操作はこのローカル state のみを更新し、
  // 「適用」を押した時にのみストアへ一括コミットする。X/backdrop/Android戻る/シート排他
  // で閉じた場合は再初期化されずそのまま破棄される。シートを開いた瞬間にストアの
  // 現在値で再構築する。
  // ---------------------------------------------------------------------------
  const buildFilterDraftFromStore = useCallback(
    (): RecordFilterValues => ({
      filterDistances,
      filterStyles,
      filterCompetitionNames,
      filterPlaces,
      filterPoolType,
      filterRelayMode,
    }),
    [filterDistances, filterStyles, filterCompetitionNames, filterPlaces, filterPoolType, filterRelayMode],
  );

  const [filterDraft, setFilterDraft] = useState<RecordFilterValues>(buildFilterDraftFromStore);

  const handleOpenFilterSheet = useCallback(() => {
    setFilterDraft(buildFilterDraftFromStore());
    openFilterSheet();
  }, [buildFilterDraftFromStore, openFilterSheet]);

  const handleDraftDistancesChange = useCallback(
    (values: string[]) => setFilterDraft((prev) => ({ ...prev, filterDistances: values })),
    [],
  );
  const handleDraftStylesChange = useCallback(
    (values: string[]) => setFilterDraft((prev) => ({ ...prev, filterStyles: values })),
    [],
  );
  const handleDraftCompetitionNamesChange = useCallback(
    (values: string[]) => setFilterDraft((prev) => ({ ...prev, filterCompetitionNames: values })),
    [],
  );
  const handleDraftPlacesChange = useCallback(
    (values: string[]) => setFilterDraft((prev) => ({ ...prev, filterPlaces: values })),
    [],
  );
  const handleDraftPoolTypeChange = useCallback(
    (value: string) => setFilterDraft((prev) => ({ ...prev, filterPoolType: value })),
    [],
  );
  const handleDraftRelayModeChange = useCallback(
    (value: string) =>
      setFilterDraft((prev) => ({
        ...prev,
        filterRelayMode: (value || "all") as RecordFilterValues["filterRelayMode"],
      })),
    [],
  );

  // 絞り込みシートの「すべてクリア」: ドラフトのみを未選択に戻す(シートは閉じない・ストアは不変)
  const handleClearDraftFilters = useCallback(() => {
    setFilterDraft({
      filterDistances: [],
      filterStyles: [],
      filterCompetitionNames: [],
      filterPlaces: [],
      filterPoolType: "",
      filterRelayMode: "all",
    });
  }, []);

  // 絞り込みシートの「適用」: ドラフトをストアへ一括コミットし、displayCount をリセットしてシートを閉じる
  const handleApplyFilters = useCallback(() => {
    setFilterDistances(filterDraft.filterDistances);
    setFilterStyles(filterDraft.filterStyles);
    setFilterCompetitionNames(filterDraft.filterCompetitionNames);
    setFilterPlaces(filterDraft.filterPlaces);
    setFilterPoolType(filterDraft.filterPoolType);
    setFilterRelayMode(filterDraft.filterRelayMode);
    setDisplayCount(PAGE_INCREMENT);
    setIsFilterSheetOpen(false);
  }, [
    filterDraft,
    setFilterDistances,
    setFilterStyles,
    setFilterCompetitionNames,
    setFilterPlaces,
    setFilterPoolType,
    setFilterRelayMode,
  ]);

  // 0件空状態(絞り込み条件に一致なし)の「フィルタをリセット」導線: ドラフトを経由せず
  // 即時に全解除する(ソートも含めて全リセットする web と同じ仕様)
  const handleResetAllFilters = useCallback(() => {
    resetFilter();
    setDisplayCount(PAGE_INCREMENT);
  }, [resetFilter]);

  // 大会記録データ取得: 絞り込み/並べ替え/表示件数は全てクライアント側で処理するため
  // 十分大きい件数(pageSize=1000)を一括取得する。
  // startDate/endDate は渡さない (web CompetitionClient と同型)。RecordAPI.getRecords の
  // 期間フィルタは大会日ではなく records.created_at に効くため、endDate="今日" を渡すと
  // 'YYYY-MM-DD' が当日 00:00 UTC (= JST 09:00) に解釈され、今日登録した記録が
  // サーバー側で除外されて一覧に永久に出てこない (翌日まで) 不具合になる。
  const {
    records = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useRecordsQuery(supabase, {
    pageSize: 1000,
    enableRealtime: true,
  });

  // ---------------------------------------------------------------------------
  // エントリー済み（記録未登録）の大会一覧（T-1）
  // records に載らない「エントリー済みだが記録がまだ無い」大会を web と同じ粒度
  // (大会単位で1件でも記録があれば除外) で別途取得する。
  // ---------------------------------------------------------------------------
  const {
    data: entryOnlyItems = [],
    isLoading: isEntryOnlyLoading,
    isError: isEntryOnlyError,
    refetch: refetchEntryOnly,
  } = useQuery({
    queryKey: ["entryOnlyItems", user?.id],
    queryFn: async (): Promise<EntryOnlyItem[]> => {
      if (!user) return [];

      type EntryRowRaw = {
        id: string;
        style_id: number | null;
        entry_time: number | null;
        competition_id: string;
        style: { id: number; name_jp: string } | null;
        competition: {
          id: string;
          title: string | null;
          date: string;
          place: string | null;
          pool_type: number;
          team_id: string | null;
          team: { name: string } | null;
        } | null;
      };

      const [{ data: entryRows, error: entryError }, { data: recordRows, error: recordError }] =
        await Promise.all([
          supabase
            .from("entries")
            .select(
              `
              id, style_id, entry_time, competition_id,
              style:styles(id, name_jp),
              competition:competitions(id, title, date, place, pool_type, team_id, team:teams(name))
            `,
            )
            .eq("user_id", user.id),
          supabase.from("records").select("competition_id").eq("user_id", user.id),
        ]);

      if (entryError) throw entryError;
      if (recordError) throw recordError;

      const rows: EntryOnlyEntryRow[] = ((entryRows ?? []) as unknown as EntryRowRaw[]).map(
        (row) => ({
          id: row.id,
          competitionId: row.competition_id,
          styleId: row.style_id,
          styleName: row.style?.name_jp ?? null,
          entryTime: row.entry_time,
          competition: row.competition
            ? {
                id: row.competition.id,
                title: row.competition.title,
                date: row.competition.date,
                place: row.competition.place,
                poolType: row.competition.pool_type,
                teamId: row.competition.team_id,
                teamName: row.competition.team?.name ?? null,
              }
            : null,
        }),
      );

      const recordedCompetitionIds = new Set(
        ((recordRows ?? []) as Array<{ competition_id: string | null }>)
          .map((r) => r.competition_id)
          .filter((id): id is string => !!id),
      );

      return buildEntryOnlyItems(
        rows,
        recordedCompetitionIds,
        new Date(),
        t("competition.client.competitionFallback"),
      );
    },
    enabled: !!user,
  });

  // エントリー済み(記録未登録)セクションのカードタップ:
  // 記録カードと同じく該当日の DayDetailModal(ダッシュボードと同一)を開く。
  // 編集/削除/「大会記録を追加」導線もダッシュボードと同じものが使える。
  const handleEntryOnlyPress = useCallback((item: EntryOnlyItem) => {
    const parsedDate = parseISO(item.date);
    if (!isValid(parsedDate)) return;
    setModalDate(parsedDate);
    setShowDayDetail(true);
  }, []);

  // 距離/種目/大会名/場所フィルタの選択肢生成(全件ベース)
  const participatedDistances = useMemo(() => getParticipatedDistances(records), [records]);
  const participatedStyleCodes = useMemo(() => getParticipatedStyleCodes(records), [records]);
  const participatedCompetitionNames = useMemo(
    () => getParticipatedCompetitionNames(records, i18n.language),
    [records, i18n.language],
  );
  const { places: participatedPlaces, hasUnsetPlace } = useMemo(
    () => getParticipatedPlaces(records, i18n.language),
    [records, i18n.language],
  );

  // 絞り込み → 並べ替え(useMemoで即座に反映)
  const filteredRecords = useMemo(
    () =>
      filterRecords(records, {
        filterDistances,
        filterStyles,
        filterCompetitionNames,
        filterPlaces,
        filterPoolType,
        filterRelayMode,
      }),
    [records, filterDistances, filterStyles, filterCompetitionNames, filterPlaces, filterPoolType, filterRelayMode],
  );

  const sortedRecords = useMemo(
    () => sortRecords(filteredRecords, sortBy, sortOrder),
    [filteredRecords, sortBy, sortOrder],
  );

  // 「もっと見る」(FlashList onEndReached): 絞り込み後・並べ替え後の総件数のうち displayCount 件のみ表示
  const displayRecords = useMemo(
    () => sortedRecords.slice(0, displayCount),
    [sortedRecords, displayCount],
  );

  // 有効な絞り込み条件の数(ストア適用済み値ベース。バッジ表示用)
  const activeFilterCount = useMemo(
    () =>
      countActiveRecordFilters({
        filterDistances,
        filterStyles,
        filterCompetitionNames,
        filterPlaces,
        filterPoolType,
        filterRelayMode,
      }),
    [filterDistances, filterStyles, filterCompetitionNames, filterPlaces, filterPoolType, filterRelayMode],
  );

  // 絞り込みシート内の「有効な絞り込み条件の数」(ドラフト値ベース。「すべてクリア」の有効/無効判定に使う)
  const draftActiveFilterCount = useMemo(() => countActiveRecordFilters(filterDraft), [filterDraft]);

  // 並べ替えボトムシートのプリセット(日付新/古 + 記録速い/遅いの4択)
  const sortPresets: SortPreset<RecordSortBy>[] = useMemo(
    () => [
      { id: "dateDesc", label: t("competition.sortSheet.dateDesc"), column: "date", order: "desc" },
      { id: "dateAsc", label: t("competition.sortSheet.dateAsc"), column: "date", order: "asc" },
      { id: "timeAsc", label: t("competition.sortSheet.timeAsc"), column: "time", order: "asc" },
      { id: "timeDesc", label: t("competition.sortSheet.timeDesc"), column: "time", order: "desc" },
    ],
    [t],
  );

  const handleSortSelect = useCallback(
    (preset: SortPreset<RecordSortBy>) => {
      setSortBy(preset.column);
      setSortOrder(preset.order);
      setDisplayCount(PAGE_INCREMENT);
      setIsSortSheetOpen(false);
    },
    [setSortBy, setSortOrder],
  );

  // 絞り込みボトムシートのグループ定義(ドラフト state を参照する)
  const filterGroups: FilterGroup[] = useMemo(
    () => [
      {
        id: "competitionName",
        label: t("competition.table.competitionName"),
        mode: "multi",
        options: participatedCompetitionNames.map((name) => ({ value: name, label: name })),
        selectedValues: filterDraft.filterCompetitionNames,
        onChange: handleDraftCompetitionNamesChange,
        onClearGroup: () => handleDraftCompetitionNamesChange([]),
      },
      {
        id: "place",
        label: t("competition.table.place"),
        mode: "multi",
        options: [
          ...(hasUnsetPlace ? [{ value: UNSET_PLACE_VALUE, label: t("common.notSet") }] : []),
          ...participatedPlaces.map((place) => ({ value: place, label: place })),
        ],
        selectedValues: filterDraft.filterPlaces,
        onChange: handleDraftPlacesChange,
        onClearGroup: () => handleDraftPlacesChange([]),
      },
      {
        id: "pool",
        label: t("competition.table.pool"),
        mode: "single",
        options: [
          { value: "short", label: t("recordMobile.poolTypeShort") },
          { value: "long", label: t("recordMobile.poolTypeLong") },
        ],
        selectedValues: filterDraft.filterPoolType ? [filterDraft.filterPoolType] : [],
        onChange: (values: string[]) => handleDraftPoolTypeChange(values[0] ?? ""),
        onClearGroup: () => handleDraftPoolTypeChange(""),
      },
      {
        id: "distance",
        label: t("competition.filterSheet.distanceLabel"),
        mode: "multi",
        options: participatedDistances.map((distance) => ({
          value: distance.toString(),
          label: `${distance}m`,
        })),
        selectedValues: filterDraft.filterDistances,
        onChange: handleDraftDistancesChange,
        onClearGroup: () => handleDraftDistancesChange([]),
      },
      {
        id: "style",
        label: t("competition.filterSheet.strokeLabel"),
        mode: "multi",
        options: participatedStyleCodes.map((code) => ({
          value: code,
          label: t(`practice.styleAbbrev.${code}`),
        })),
        selectedValues: filterDraft.filterStyles,
        onChange: handleDraftStylesChange,
        onClearGroup: () => handleDraftStylesChange([]),
      },
      {
        id: "relay",
        label: t("competition.filterSheet.relayLabel"),
        mode: "single",
        options: [
          { value: "excludeRelay", label: t("competition.filter.excludeRelay") },
          { value: "onlyRelay", label: t("competition.filter.onlyRelay") },
        ],
        selectedValues: filterDraft.filterRelayMode === "all" ? [] : [filterDraft.filterRelayMode],
        onChange: (values: string[]) => handleDraftRelayModeChange(values[0] ?? "all"),
        onClearGroup: () => handleDraftRelayModeChange("all"),
      },
    ],
    [
      t,
      participatedCompetitionNames,
      participatedPlaces,
      hasUnsetPlace,
      participatedDistances,
      participatedStyleCodes,
      filterDraft,
      handleDraftCompetitionNamesChange,
      handleDraftPlacesChange,
      handleDraftPoolTypeChange,
      handleDraftDistancesChange,
      handleDraftStylesChange,
      handleDraftRelayModeChange,
    ],
  );

  // 選択した日付のカレンダーエントリー（DayDetailModal表示用）
  const {
    data: dayEntries = [],
    isLoading: isDayEntriesLoading,
    isError: isDayEntriesError,
    refetch: refetchDayEntries,
  } = useDayEntriesQuery(supabase, modalDate);

  // この画面と子孫(RecordItem配下のBestTimeBadgeが保持するuseListBestCandidatesQuery)が
  // 依存する全クエリを尽くす。ベスト候補クエリは (userId, styleId, isRelaying, poolType) の
  // 組み合わせごとに queryKey が分かれ画面側からは個々の filters を再現できないため、
  // recordKeys.bestCandidates() の前方一致で invalidate する
  const refreshAll = useCallback(async () => {
    await Promise.allSettled([
      refetch(),
      refetchEntryOnly(),
      refetchDayEntries(),
      queryClient.invalidateQueries({ queryKey: recordKeys.bestCandidates() }),
    ]);
  }, [refetch, refetchEntryOnly, refetchDayEntries, queryClient]);

  // タブ遷移時にデータ再取得
  useRefreshOnFocus(refreshAll);

  // プルリフレッシュ処理
  const { refreshing, handleRefresh } = usePullToRefresh(refreshAll);

  // 無限スクロール(displayCount を増やすのみ。ネットワーク再フェッチは行わない)。
  // 既に全件表示済みの場合は onEndReached の連続発火で無駄な再レンダーを起こさないよう
  // ガードする
  const handleLoadMore = useCallback(() => {
    if (displayCount >= sortedRecords.length) return;
    setDisplayCount((count) => count + PAGE_INCREMENT);
  }, [displayCount, sortedRecords.length]);

  // 削除/変更後は一覧とモーダルの両方を再取得する(エントリー済み(記録未登録)セクションも対象)
  const refetchAfterMutation = useCallback(() => {
    refetch();
    refetchEntryOnly();
    refetchDayEntries();
  }, [refetch, refetchEntryOnly, refetchDayEntries]);

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

  // 記録アイテムのタップ処理
  // - 大会に紐づく記録: 該当日の DayDetailModal(calendar_view 単位)を開く
  // - 大会未紐付けレコード（一括入力。competition が存在しない）: 単体の詳細モーダルを開く。
  //   calendar_view には現れないため created_at 等へフォールバックしない
  const handleRecordPress = useCallback((record: RecordWithDetails) => {
    if (!record.competition) {
      setStandaloneRecord(record);
      return;
    }
    const dateStr = record.competition.date;
    if (!dateStr) return;
    const parsedDate = parseISO(dateStr);
    if (!isValid(parsedDate)) return;
    setModalDate(parsedDate);
    setShowDayDetail(true);
  }, []);

  // 大会未紐付けレコードの削除（ダッシュボードと同一の Alert.alert 確認、Platform分岐なし）
  const deleteStandaloneRecordMutation = useDeleteRecordMutation(supabase);
  const handleDeleteStandaloneRecord = useCallback(
    (recordId: string) => {
      Alert.alert(
        t("dashboard.mobile.deletePracticeConfirmTitle"),
        t("dashboard.mobile.deleteRecordConfirmMessage"),
        [
          { text: t("common.cancel"), style: "cancel" },
          {
            text: t("dashboard.mobile.deleteButton"),
            style: "destructive",
            onPress: async () => {
              setIsDeletingStandalone(true);
              try {
                await deleteStandaloneRecordMutation.mutateAsync(recordId);
                setStandaloneRecord(null);
                refetch();
              } catch (error) {
                console.error("削除エラー:", error);
                Alert.alert(
                  t("common.error"),
                  toUserFacingMessage(error, t("dashboard.mobile.deleteFailed")),
                  [{ text: "OK" }],
                );
              } finally {
                setIsDeletingStandalone(false);
              }
            },
          },
        ],
      );
    },
    [deleteStandaloneRecordMutation, refetch, t],
  );

  // 大会未紐付けレコードの編集: 大会が無いので CompetitionTabForm は使わず、
  // 単体レコード編集の既存パス(RecordForm、competitionId を渡さない編集モード)へ遷移する
  const handleEditStandaloneRecord = useCallback(
    (record: RecordWithDetails) => {
      setStandaloneRecord(null);
      navigation.navigate("RecordForm", { recordId: record.id });
    },
    [navigation],
  );

  // アイテムをレンダリング（メモ化）
  // ベストバッジは RecordItem 内 BestTimeBadge が「記録日時点で自己ベストだったか」を
  // 判定する（判定完了まで非表示）。候補取得は種目グループ単位の共有キャッシュクエリ
  // (useListBestCandidatesQuery) に集約されるため、行ごとのクエリは発行されない
  const renderItem = useCallback(
    ({ item }: { item: RecordWithDetails }) => {
      return <RecordItem record={item} onPress={handleRecordPress} />;
    },
    [handleRecordPress],
  );

  // エントリー済み(記録未登録)セクション(FlashList ListHeaderComponent としてメモ化して渡す)
  const listHeaderComponent = useMemo(
    () => (
      <EntryOnlySection
        items={entryOnlyItems}
        isLoading={isEntryOnlyLoading}
        isError={isEntryOnlyError}
        onRetry={refetchEntryOnly}
        onItemPress={handleEntryOnlyPress}
      />
    ),
    [entryOnlyItems, isEntryOnlyLoading, isEntryOnlyError, refetchEntryOnly, handleEntryOnlyPress],
  );

  // エラー状態
  if (isError && error) {
    return (
      <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
        <ErrorView
          message={error.message || t("recordMobile.fetchFailed")}
          onRetry={() => refetch()}
          fullScreen
        />
      </SafeAreaView>
    );
  }

  // ローディング状態（初回のみ）
  if (isLoading && records.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
        <LoadingSpinner fullScreen message={t("recordMobile.loading")} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
      <ListToolbar
        itemCount={sortedRecords.length}
        onSortClick={openSortSheet}
        onFilterClick={handleOpenFilterSheet}
        activeFilterCount={activeFilterCount}
      />

      <FlashList
        data={displayRecords}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={listHeaderComponent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={["#2563EB"]}
            tintColor="#2563EB"
          />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>{t("recordMobile.noRecords")}</Text>
            {/* データ自体は存在するが絞り込み条件に一致が無い場合のみ、フィルタ全解除の導線を出す
                (web PracticeClient/CompetitionClient と同様、「データが0件」とは区別する) */}
            {records.length > 0 && activeFilterCount > 0 && (
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
      <SortBottomSheet<RecordSortBy>
        isOpen={isSortSheetOpen}
        onClose={() => setIsSortSheetOpen(false)}
        title={t("competition.sortSheet.title")}
        presets={sortPresets}
        activeColumn={sortBy}
        activeOrder={sortOrder}
        onSelect={handleSortSelect}
      />

      {/* 絞り込みボトムシート(ドラフト化: X/backdrop/Android戻る/シート排他で閉じるとドラフトは
          破棄され、ストア(一覧・件数バッジ)には影響しない。「適用」でのみコミットされる) */}
      <FilterBottomSheet
        isOpen={isFilterSheetOpen}
        onClose={() => setIsFilterSheetOpen(false)}
        title={t("competition.filterSheet.title")}
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
          scope="competition"
          isLoading={isDayEntriesLoading}
          isError={isDayEntriesError}
          onRetry={refetchDayEntries}
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

      {/* 大会未紐付けレコード（一括入力）単体の詳細モーダル */}
      <StandaloneRecordDetailModal
        visible={!!standaloneRecord}
        record={standaloneRecord}
        onClose={() => setStandaloneRecord(null)}
        onEdit={handleEditStandaloneRecord}
        onDelete={handleDeleteStandaloneRecord}
        isDeleting={isDeletingStandalone}
      />
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
    padding: 40,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 16,
    color: "#6B7280",
  },
  resetFilterButton: {
    marginTop: 16,
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
