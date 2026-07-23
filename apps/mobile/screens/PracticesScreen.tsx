import React, { useMemo, useCallback, useState } from "react";
import { View, Text, StyleSheet, Pressable, RefreshControl, ScrollView } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { SafeAreaView } from "react-native-safe-area-context";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { parseISO, isValid } from "date-fns";
import { useAuth } from "@/contexts/AuthProvider";
import { practiceKeys } from "@apps/shared/hooks/queries/keys";
import { PracticeAPI } from "@apps/shared/api/practices";
import { PracticeItem } from "@/components/practices";
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

/**
 * 練習記録一覧画面
 * 練習記録の一覧を表示し、日付フィルター、プルリフレッシュ、無限スクロール機能を提供
 */
export const PracticesScreen: React.FC = () => {
  const { supabase } = useAuth();
  const { t } = useTranslation();

  // 行タップで開く日付詳細モーダル（ダッシュボードと同一のDayDetailModal）
  const [modalDate, setModalDate] = useState<Date | null>(null);
  const [showDayDetail, setShowDayDetail] = useState(false);

  // タグフィルターストア
  const { selectedTagIds, setSelectedTags } = usePracticeFilterStore(
    useShallow((state) => ({
      selectedTagIds: state.selectedTagIds,
      setSelectedTags: state.setSelectedTags,
    })),
  );

  // デフォルトの日付範囲（過去1年間）- 初期化時に一度だけ計算
  const [isUserRefreshing, setIsUserRefreshing] = useState(false);

  const [defaultStartDate] = useState(() => {
    const date = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    return date.toISOString().split("T")[0];
  });

  const [defaultEndDate] = useState(() => {
    return new Date().toISOString().split("T")[0];
  });

  const practiceApi = useMemo(() => new PracticeAPI(supabase), [supabase]);

  // タグ一覧を取得
  const { data: tags = [] } = useQuery({
    queryKey: ["practice-tags"],
    queryFn: async () => {
      return await practiceApi.getPracticeTags();
    },
    staleTime: 5 * 60 * 1000,
  });

  const {
    data,
    error,
    isLoading,
    isRefetching: _isRefetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: practiceKeys.list({
      startDate: defaultStartDate,
      endDate: defaultEndDate,
      pageSize: 20,
    }),
    queryFn: async ({ pageParam = 1 }) => {
      const offset = (pageParam - 1) * 20;
      return await practiceApi.getPractices(defaultStartDate, defaultEndDate, 20, offset);
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, pages) => (lastPage.length === 20 ? pages.length + 1 : undefined),
    staleTime: 5 * 60 * 1000,
  });

  const allPractices = useMemo(() => data?.pages.flat() ?? [], [data]);

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

  // タグフィルタリング
  const filteredPractices = useMemo(() => {
    if (selectedTagIds.length === 0) {
      return allPractices;
    }

    return allPractices.filter((practice) => {
      // 練習ログのタグを取得
      const logTags =
        practice.practice_logs?.flatMap(
          (log) => log.practice_log_tags?.map((plt) => plt.practice_tags?.id).filter(Boolean) || [],
        ) || [];

      // 選択されたタグIDのいずれかがログのタグに含まれているかチェック
      return selectedTagIds.some((tagId) => logTags.includes(tagId));
    });
  }, [allPractices, selectedTagIds]);

  // タグの選択/解除をトグル
  const handleTagToggle = useCallback(
    (tagId: string) => {
      if (selectedTagIds.includes(tagId)) {
        setSelectedTags(selectedTagIds.filter((id) => id !== tagId));
      } else {
        setSelectedTags([...selectedTagIds, tagId]);
      }
    },
    [selectedTagIds, setSelectedTags],
  );

  // タグフィルターをクリア
  const handleClearTags = useCallback(() => {
    setSelectedTags([]);
  }, [setSelectedTags]);

  // タブ遷移時にデータ再取得
  useRefreshOnFocus(refetch);

  // プルリフレッシュ処理
  const handleRefresh = useCallback(async () => {
    setIsUserRefreshing(true);
    try {
      await refetch();
    } finally {
      setIsUserRefreshing(false);
    }
  }, [refetch]);

  // 次のページを読み込む
  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage && !isLoading) {
      fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, isLoading]);

  // 練習記録アイテムのレンダリング（メモ化）
  // ⚠️ 重要: すべてのフックは条件付きレンダリングの前に定義する必要がある
  const renderItem = useCallback(
    ({ item }: { item: PracticeWithLogs }) => (
      <PracticeItem practice={item} onPress={handlePracticePress} />
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

  // データが空の場合
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
      {/* タグフィルターUI（常時表示） */}
      {tags.length > 0 && (
        <View style={styles.filterContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tagsScrollContent}
          >
            {tags.map((tag: PracticeTag) => (
              <Pressable
                key={tag.id}
                onPress={() => handleTagToggle(tag.id)}
                style={[
                  styles.tagButton,
                  selectedTagIds.includes(tag.id) && {
                    backgroundColor: tag.color,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.tagButtonText,
                    selectedTagIds.includes(tag.id) && styles.tagButtonTextSelected,
                  ]}
                >
                  {tag.name}
                </Text>
              </Pressable>
            ))}
            {selectedTagIds.length > 0 && (
              <Pressable style={styles.clearButton} onPress={handleClearTags}>
                <Text style={styles.clearButtonText}>{t("practice.page.clearFilter")}</Text>
              </Pressable>
            )}
          </ScrollView>
          {selectedTagIds.length > 0 && (
            <Text style={styles.filterInfoText}>
              {t("practice.page.filteringWith", { n: selectedTagIds.length })}
            </Text>
          )}
        </View>
      )}

      <FlashList
        data={filteredPractices}
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
        ListFooterComponent={
          isFetchingNextPage ? (
            <View style={styles.footerLoader}>
              <LoadingSpinner size="small" message={t("common.loading")} />
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>{t("practice.page.emptyTitle")}</Text>
          </View>
        }
      />

      {/* 日付詳細モーダル（ダッシュボードと同一のDayDetailModal） */}
      {modalDate && (
        <DayDetailModal
          visible={showDayDetail}
          date={modalDate}
          entries={dayEntries}
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
  filterContainer: {
    backgroundColor: "#FFFFFF",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  tagsScrollContent: {
    gap: 8,
    paddingRight: 16,
  },
  tagButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "#F3F4F6",
    minHeight: 32,
    justifyContent: "center",
    alignItems: "center",
  },
  tagButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#374151",
  },
  tagButtonTextSelected: {
    color: "#FFFFFF",
  },
  clearButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "#F3F4F6",
    minHeight: 32,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 4,
  },
  clearButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
  },
  filterInfoText: {
    marginTop: 8,
    fontSize: 12,
    color: "#6B7280",
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
  emptySubtext: {
    fontSize: 14,
    color: "#9CA3AF",
    textAlign: "center",
  },
  footerLoader: {
    paddingVertical: 20,
    alignItems: "center",
  },
});
