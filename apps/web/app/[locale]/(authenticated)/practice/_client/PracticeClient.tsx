"use client";

import React, { useState, useMemo, useLayoutEffect, useTransition } from "react";
import { useTranslations, useLocale } from "next-intl";
import { CalendarDaysIcon } from "@heroicons/react/24/outline";
import Button from "@/components/ui/Button";
import ListToolbar from "@/components/history/ListToolbar";
import SortBottomSheet, { type SortPreset } from "@/components/history/SortBottomSheet";
import FilterBottomSheet, { type FilterGroup } from "@/components/history/FilterBottomSheet";
import PracticeLogCard from "../_components/PracticeLogCard";
import PracticeTabModal from "@/components/forms/PracticeTabModal";
import PracticeDetailModal from "../_components/PracticeDetailModal";
import { isAfter, parseISO, startOfDay } from "date-fns";
import { useAuth } from "@/contexts";
import {
  usePracticesQuery,
  useCreatePracticeMutation,
  useUpdatePracticeMutation,
  useDeletePracticeMutation,
  useCreatePracticeLogMutation,
  useUpdatePracticeLogMutation,
  useDeletePracticeLogMutation,
  useCreatePracticeTimeMutation,
  useDeletePracticeTimeMutation,
} from "@apps/shared/hooks/queries/practices";
import type { PracticeTag, PracticeLogWithTags, Style } from "@apps/shared/types";
import { getStyleOrderIndex } from "@apps/shared/utils/swimStyles";
import { usePracticeStore } from "@/stores/practice/practiceStore";
import type { PracticeSortColumn } from "@/stores/practice/practiceStore";
import type { EditingData } from "@/stores/types";
import type { GalleryImage } from "@/components/ui/ImageGallery";
import { usePracticeTabSave } from "@/hooks/usePracticeTabSave";
import { useTableSort, type SortValue } from "@/hooks/useTableSort";
import { calculateOverallAverage } from "../_utils/practiceLogFormat";
import type { PracticeLogWithFormattedData } from "../_utils/practiceLogFormat";

interface PracticeClientProps {
  styles: Style[];
  tags: PracticeTag[];
  /**
   * PracticeDataLoader の getDefaultDateRange() が計算した日付範囲(詳細はそちらの JSDoc 参照)。
   * usePracticesQuery にそのまま渡す。未指定時は usePracticesQuery 側の既定値にフォールバックする
   * (既存テストとの後方互換のためオプショナルとする)。
   */
  startDate?: string;
  endDate?: string;
}

// 一覧の初期表示件数、および「もっと見る」1回あたりの増分
const PAGE_INCREMENT = 20;

/**
 * 練習履歴カード一覧のソート値抽出(useTableSort 用)。
 *
 * - 距離: [距離(distance), 本数(rep_count), セット(set_count)] のタプルを返す
 *   (distance 主キー、rep_count→set_count はタイブレーク)。rep_count/set_count に
 *   上限バリデーションが無いため、桁あふれのリスクがある数値合成(distance*1e6+...)はしない。
 * - 種目: PracticeLog.style は自由入力ではなく公式略称キー(Fr/Ba/Br/Fly/IM)が保存されるため、
 *   getStyleOrderIndex で STYLES 定義順のインデックスに変換する(マップ外は末尾)
 */
function getPracticeSortValue(log: PracticeLogWithFormattedData, column: PracticeSortColumn): SortValue {
  switch (column) {
    case "date": {
      const dateStr = log.practice?.date || log.created_at;
      return dateStr ? new Date(dateStr) : null;
    }
    case "place":
      return log.practice?.place || null;
    case "distance":
      return [log.distance, log.rep_count, log.set_count];
    case "circle":
      return log.circle ?? null;
    case "style": {
      const styleIndex = getStyleOrderIndex(log.style);
      return styleIndex === -1 ? null : styleIndex;
    }
    case "avgTime":
      return calculateOverallAverage(log.practice_times);
    default:
      return null;
  }
}

/**
 * 練習記録ページのインタラクティブ部分を担当するClient Component
 *
 * 行クリック時の詳細/編集/削除 UI/UX はダッシュボード (DayDetailModal 系) と統一している。
 * - 詳細表示: PracticeDetailModal (dashboard の PracticeDetails を再利用)
 * - 編集: dashboard と同じ PracticeTabModal
 * - 削除確認: dashboard と同じ DeleteConfirmModal (PracticeDetailModal 内で使用)
 *
 * 一覧UI(2026-07-22 Sprint): テーブルを廃止し、全幅カード + ボトムシート(並べ替え/絞り込み)に刷新した。
 */
export default function PracticeClient({
  styles: _styles,
  tags,
  startDate,
  endDate,
}: PracticeClientProps) {
  const t = useTranslations("practice");
  const tCommon = useTranslations("common");
  const { user, supabase } = useAuth();
  const locale = useLocale();
  const [displayCount, setDisplayCount] = useState(PAGE_INCREMENT);
  const [, startTransition] = useTransition();

  // 並べ替え/絞り込みボトムシートの開閉状態(排他制御: 同時に開かない)
  const [isSortSheetOpen, setIsSortSheetOpen] = useState(false);
  const [isFilterSheetOpen, setIsFilterSheetOpen] = useState(false);
  const openSortSheet = () => {
    setIsFilterSheetOpen(false);
    setIsSortSheetOpen(true);
  };
  const openFilterSheet = () => {
    setIsSortSheetOpen(false);
    setIsFilterSheetOpen(true);
  };

  // Zustandストア（ダッシュボードと共通の usePracticeStore。タブモーダル状態もここに集約されている）
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
    resetFilter,
    isOpen: isPracticeTabModalOpen,
    activeTab: practiceActiveTab,
    editingData: tabEditingData,
    editingPracticeId,
    selectedDate: tabSelectedDate,
    availableTags,
    isLoading: isTabLoading,
    openTabModal: openPracticeTabModal,
    closeTabModal: closePracticeTabModal,
    closeAll: closePracticeStoreAll,
    setAvailableTags,
    setLoading: setTabLoading,
    setEditingPracticeId,
  } = usePracticeStore();

  // usePracticeStore は Dashboard/practice/competition の3画面で共有される module-level singleton。
  // マウント時・アンマウント時にタブモーダル状態を必ず閉じておかないと、他画面で開いたまま
  // 遷移してきた場合に isOpen=true が残り、このページで意図せず TabModal が開いてしまう
  // (逆方向: このページで編集中に他画面へ遷移した場合の状態リークも防ぐ)。
  // 描画前(useLayoutEffect)でリセットすることで、古い TabModal が一瞬でも表示されるのを防ぐ。
  useLayoutEffect(() => {
    closePracticeStoreAll();
    return () => {
      closePracticeStoreAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 詳細モーダルで表示中の練習ログ（行クリックで選択される代表ログ。日付・場所・タイトル等の表示に使う）
  const [selectedLog, setSelectedLog] = useState<PracticeLogWithFormattedData | null>(null);
  // 詳細モーダル内で個別ログを削除した際、PracticeDetails (dashboard 由来) の内部フェッチを
  // 強制的にやり直させるための remount キー
  const [modalNonce, setModalNonce] = useState(0);

  // サーバー側から取得したデータをストアに設定（初回のみ）
  const initializedRef = React.useRef(false);
  if (!initializedRef.current) {
    setAvailableTags(tags);
    initializedRef.current = true;
  }

  // 練習記録を取得（HydrationBoundaryで注入済みキャッシュから取得 + リアルタイム更新）
  // 絞り込み/並べ替え/「もっと見る」は全て一覧側(クライアント)で行うため全件を取得する。
  // 既定の pageSize=20 は mutation 後の再取得で一覧が20件に縮んでしまうため、
  // PracticeDataLoader の prefetchQuery と同じ十分大きい件数を指定する
  // (CompetitionClient の useRecordsQuery({ pageSize: 1000 }) と同型)
  //
  // startDate/endDate は props 経由で PracticeDataLoader の計算値をそのまま渡す(内部で再計算しない)。
  // 詳細は PracticeDataLoader.tsx の getDefaultDateRange() JSDoc 参照。
  const {
    data: practices = [],
    isLoading: loading,
    error,
    refetch,
  } = usePracticesQuery(supabase, {
    startDate,
    endDate,
    pageSize: 1000,
  });

  // ミューテーションフック
  const createPracticeMutation = useCreatePracticeMutation(supabase);
  const updatePracticeMutation = useUpdatePracticeMutation(supabase);
  const deletePracticeMutation = useDeletePracticeMutation(supabase);
  const createPracticeLogMutation = useCreatePracticeLogMutation(supabase);
  const updatePracticeLogMutation = useUpdatePracticeLogMutation(supabase);
  const deletePracticeLogMutation = useDeletePracticeLogMutation(supabase);
  const createPracticeTimeMutation = useCreatePracticeTimeMutation(supabase);
  const deletePracticeTimeMutation = useDeletePracticeTimeMutation(supabase);

  // React Query mutation状態から派生
  const isAnyMutating =
    createPracticeMutation.isPending ||
    updatePracticeMutation.isPending ||
    deletePracticeMutation.isPending ||
    createPracticeLogMutation.isPending ||
    updatePracticeLogMutation.isPending ||
    deletePracticeLogMutation.isPending;

  // サーバー側で取得した初期データとリアルタイム更新されたデータを統合
  // React Queryのキャッシュを使用
  const displayPractices = practices;

  // practice_logsを平坦化し、タグデータを整形
  const practiceLogs = useMemo<PracticeLogWithFormattedData[]>(
    () =>
      displayPractices.flatMap((practice) =>
        (practice.practice_logs || []).map(
          (log: PracticeLogWithTags): PracticeLogWithFormattedData => {
            // タグデータを整形（practice_log_tags -> tags に変換）
            const tags: PracticeTag[] = log.practice_log_tags.map((plt) => plt.practice_tags);

            return {
              ...log,
              tags, // 整形したタグを追加
              practice: {
                id: practice.id,
                date: practice.date,
                title: practice.title,
                place: practice.place,
                note: practice.note,
                team_id: practice.team_id,
              },
              practiceId: practice.id,
            };
          },
        ),
      ),
    [displayPractices],
  );

  // 今日の日付（時刻を0時0分0秒にリセット）
  const today = useMemo(() => startOfDay(new Date()), []);

  // 場所/種目フィルタの選択肢生成対象: 未来日の練習は「選んでも常に0件」になる候補になるため、
  // filteredPracticeLogs と同じ未来日ガードを適用した集合(=表示対象になり得るログのみ)から distinct を生成する
  const pastOrTodayPracticeLogs = useMemo(() => {
    return practiceLogs.filter((log) => {
      if (!log.practice?.date) return true;
      return !isAfter(startOfDay(new Date(log.practice.date)), today);
    });
  }, [practiceLogs, today]);

  // 場所フィルタの選択肢（distinct, ロケール順）
  const participatedPlaces = useMemo(() => {
    const places = new Set<string>();
    pastOrTodayPracticeLogs.forEach((log) => {
      if (log.practice?.place) places.add(log.practice.place);
    });
    return Array.from(places).sort((a, b) => a.localeCompare(b, locale));
  }, [pastOrTodayPracticeLogs, locale]);

  // 種目フィルタの選択肢（distinct, STYLES定義順）
  const participatedStyleKeys = useMemo(() => {
    const keys = new Set<string>();
    pastOrTodayPracticeLogs.forEach((log) => {
      if (log.style) keys.add(log.style);
    });
    return Array.from(keys).sort((a, b) => getStyleOrderIndex(a) - getStyleOrderIndex(b));
  }, [pastOrTodayPracticeLogs]);

  // タグ/場所/種目フィルタリングロジック + 日付フィルタリング（今日以前のみ）。カラム間 AND
  const filteredPracticeLogs = useMemo(
    () =>
      practiceLogs.filter((log) => {
        // 日付フィルタリング：今日より未来の日付は除外
        if (log.practice?.date) {
          const practiceDate = startOfDay(new Date(log.practice.date));
          if (isAfter(practiceDate, today)) {
            return false;
          }
        }

        // タグフィルタリング（複数AND: 選択した全タグを持つログのみ表示）
        if (selectedTagIds.length > 0) {
          const logTagIds = (log.tags || []).map((tag) => tag.id);
          if (!selectedTagIds.every((tagId) => logTagIds.includes(tagId))) {
            return false;
          }
        }

        // 場所フィルタリング（複数OR）
        if (filterPlaces.length > 0) {
          const place = log.practice?.place || null;
          if (!place || !filterPlaces.includes(place)) {
            return false;
          }
        }

        // 種目フィルタリング（単一select）
        if (filterStyle && log.style !== filterStyle) {
          return false;
        }

        return true;
      }),
    [practiceLogs, selectedTagIds, filterPlaces, filterStyle, today],
  );

  // 日付の降順を既定順とし、useTableSort に渡す（sortColumn が null の間はこの順序を維持する）
  const dateDescPracticeLogs = useMemo(() => {
    return [...filteredPracticeLogs].sort((a, b) => {
      const dateA = new Date(a.practice?.date || a.created_at);
      const dateB = new Date(b.practice?.date || b.created_at);
      return dateB.getTime() - dateA.getTime();
    });
  }, [filteredPracticeLogs]);

  const { sortedItems: sortedPracticeLogs } = useTableSort<
    PracticeLogWithFormattedData,
    PracticeSortColumn
  >(dateDescPracticeLogs, sortColumn, sortOrder, setSortColumn, setSortOrder, getPracticeSortValue, locale);

  // 絞り込みバッジ/フッターの「有効な絞り込み条件の数」(グループ単位でカウントする)
  const activeFilterCount = [
    selectedTagIds.length > 0,
    filterPlaces.length > 0,
    filterStyle !== "",
  ].filter(Boolean).length;

  // 並べ替えボトムシートのプリセット(旧 lg 未満セレクトの12択を1:1移植)
  const sortPresets: SortPreset<PracticeSortColumn>[] = [
    { id: "dateDesc", label: t("page.sortOptionDateDesc"), column: "date", order: "desc", isDefault: true },
    { id: "dateAsc", label: t("page.sortOptionDateAsc"), column: "date", order: "asc" },
    { id: "placeAsc", label: t("sortSheet.placeAsc"), column: "place", order: "asc" },
    { id: "placeDesc", label: t("sortSheet.placeDesc"), column: "place", order: "desc" },
    { id: "distanceAsc", label: t("sortSheet.distanceAsc"), column: "distance", order: "asc" },
    { id: "distanceDesc", label: t("sortSheet.distanceDesc"), column: "distance", order: "desc" },
    { id: "circleAsc", label: t("sortSheet.circleAsc"), column: "circle", order: "asc" },
    { id: "circleDesc", label: t("sortSheet.circleDesc"), column: "circle", order: "desc" },
    { id: "styleAsc", label: t("sortSheet.styleAsc"), column: "style", order: "asc" },
    { id: "styleDesc", label: t("sortSheet.styleDesc"), column: "style", order: "desc" },
    { id: "avgTimeAsc", label: t("sortSheet.avgTimeAsc"), column: "avgTime", order: "asc" },
    { id: "avgTimeDesc", label: t("sortSheet.avgTimeDesc"), column: "avgTime", order: "desc" },
  ];

  const handleSortSelect = (preset: SortPreset<PracticeSortColumn>) => {
    startTransition(() => {
      setSortColumn(preset.column);
      setSortOrder(preset.order);
      setDisplayCount(PAGE_INCREMENT);
    });
    setIsSortSheetOpen(false);
  };

  // タグフィルター変更ハンドラー（useTransitionでUI応答性を維持 + もっと見る表示件数リセット）
  const handleTagFilterChange = (newTagIds: string[]) => {
    startTransition(() => {
      setSelectedTags(newTagIds);
      setDisplayCount(PAGE_INCREMENT);
    });
  };

  const handleFilterPlacesChange = (values: string[]) => {
    startTransition(() => {
      setFilterPlaces(values);
      setDisplayCount(PAGE_INCREMENT);
    });
  };

  const handleFilterStyleChange = (value: string) => {
    startTransition(() => {
      setFilterStyle(value);
      setDisplayCount(PAGE_INCREMENT);
    });
  };

  // 絞り込みシートの「すべてクリア」: フィルタ(タグ/場所/種目)のみをクリアし、ソート状態は保持する
  // (resetFilter() はストアの FilterState 全体=sortColumn/sortOrder も含むため、ここでは使わない)
  const handleClearFiltersOnly = () => {
    startTransition(() => {
      setSelectedTags([]);
      setFilterPlaces([]);
      setFilterStyle("");
      setDisplayCount(PAGE_INCREMENT);
    });
  };
  // フィルタ結果0件の空状態の「フィルタをクリア」導線: ソートも含めて全リセットする
  const handleResetAllFilters = () => {
    startTransition(() => {
      resetFilter();
      setDisplayCount(PAGE_INCREMENT);
    });
  };

  // 絞り込みボトムシートのグループ定義(場所=multi/OR、種目=single、タグ=multi/AND)
  const filterGroups: FilterGroup[] = [
    {
      id: "place",
      label: t("page.colPlace"),
      mode: "multi",
      options: participatedPlaces.map((place) => ({ value: place, label: place })),
      selectedValues: filterPlaces,
      onChange: handleFilterPlacesChange,
      onClearGroup: () => handleFilterPlacesChange([]),
    },
    {
      id: "style",
      label: t("page.colStyle"),
      mode: "single",
      options: participatedStyleKeys.map((key) => ({
        value: key,
        label: t(`styles.${key}` as Parameters<typeof t>[0]),
      })),
      selectedValues: filterStyle ? [filterStyle] : [],
      onChange: (values) => handleFilterStyleChange(values[0] ?? ""),
      onClearGroup: () => handleFilterStyleChange(""),
    },
    {
      id: "tags",
      label: t("page.colTags"),
      mode: "multi",
      note: t("filterSheet.tagsAndNote"),
      options: tags.map((tag) => ({ value: tag.id, label: tag.name, color: tag.color })),
      selectedValues: selectedTagIds,
      onChange: handleTagFilterChange,
      onClearGroup: () => handleTagFilterChange([]),
    },
  ];

  // もっと見る: 絞り込み後・並べ替え後の総件数のうち displayCount 件のみ表示する
  const visiblePracticeLogs = useMemo(() => {
    return sortedPracticeLogs.slice(0, displayCount);
  }, [sortedPracticeLogs, displayCount]);

  const handleLoadMore = () => {
    setDisplayCount((count) => count + PAGE_INCREMENT);
  };

  // 行クリック: ダッシュボードと同じ PracticeDetails を表示する詳細モーダルを開く
  const handleRowClick = (log: PracticeLogWithFormattedData) => {
    setSelectedLog(log);
  };

  const handleCloseDetailModal = () => {
    setSelectedLog(null);
  };

  // 練習タブモーダル一括保存（ダッシュボードと共通ロジック）
  const handlePracticeTabSave = usePracticeTabSave({
    supabase,
    user,
    createPractice: async (practice) => createPracticeMutation.mutateAsync(practice),
    updatePractice: async (id, updates) => updatePracticeMutation.mutateAsync({ id, updates }),
    createPracticeLog: async (log) => createPracticeLogMutation.mutateAsync(log),
    updatePracticeLog: async (id, updates) => updatePracticeLogMutation.mutateAsync({ id, updates }),
    deletePracticeLog: async (id) => deletePracticeLogMutation.mutateAsync(id),
    createPracticeTime: async (time) => createPracticeTimeMutation.mutateAsync(time),
    deletePracticeTime: async (id) => deletePracticeTimeMutation.mutateAsync(id),
    setPracticeLoading: setTabLoading,
    setEditingPracticeId,
    closePracticeTabModal,
    onSaved: () => {
      setModalNonce((n) => n + 1);
      refetch();
    },
  });

  // 練習全体を編集（PracticeTabModal の practice タブを開く）
  const handleEditPractice = (images?: GalleryImage[]) => {
    if (!selectedLog?.practice) return;
    const practice = selectedLog.practice;
    const dateObj = startOfDay(parseISO(practice.date));
    openPracticeTabModal(
      dateObj,
      {
        id: selectedLog.practiceId,
        type: "practice",
        date: practice.date,
        title: practice.title || "",
        place: practice.place || "",
        note: practice.note || "",
        editData: images ? { images } : undefined,
      } as EditingData,
      "practice",
    );
  };

  // 練習ログタブを開く（追加・編集共通。PracticeTabModal 側が practiceId から全ログを再取得する）
  const handleOpenPracticeLogTab = () => {
    if (!selectedLog?.practice) return;
    const practice = selectedLog.practice;
    const dateObj = startOfDay(parseISO(practice.date));
    openPracticeTabModal(
      dateObj,
      {
        id: selectedLog.practiceId,
        type: "practice",
        date: practice.date,
        title: practice.title || "",
        place: practice.place || "",
        note: practice.note || "",
      } as EditingData,
      "practiceLog",
    );
  };

  // 練習全体の削除（DeleteConfirmModal 経由で呼ばれる）
  const handleDeletePractice = async () => {
    if (!selectedLog) return;
    try {
      await deletePracticeMutation.mutateAsync(selectedLog.practiceId);
      setSelectedLog(null);
      await refetch();
    } catch (error) {
      console.error("練習記録の削除に失敗しました:", error);
      const errorMessage = error instanceof Error ? error.message : t("client.deleteFailed");
      alert(t("client.saveError", { message: errorMessage }));
    }
  };

  // 個別の練習ログ削除（カスケード: 削除後に残りログが0件なら親 practice も削除する）
  // NOTE: この既存挙動（V-W-P05/06）は必ず維持すること
  const handleDeletePracticeLog = async (logId: string) => {
    if (!selectedLog) return;
    const practiceId = selectedLog.practiceId;
    try {
      await deletePracticeLogMutation.mutateAsync(logId);

      const remainingLogs = practiceLogs.filter(
        (log) => log.practiceId === practiceId && log.id !== logId,
      );

      if (remainingLogs.length === 0) {
        try {
          await deletePracticeMutation.mutateAsync(practiceId);
          setSelectedLog(null);
        } catch (practiceDeleteError) {
          console.error("Practiceの削除に失敗しました:", practiceDeleteError);
          const errorMessage =
            practiceDeleteError instanceof Error
              ? practiceDeleteError.message
              : t("client.deleteFailed");
          alert(t("client.saveError", { message: errorMessage }));
        }
      } else {
        setModalNonce((n) => n + 1);
      }

      await refetch();
    } catch (error) {
      console.error("削除エラー:", error);
      const errorMessage = error instanceof Error ? error.message : t("client.deleteFailed");
      alert(t("client.saveError", { message: errorMessage }));
    }
  };

  if (loading || isAnyMutating) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">{t("details.badge")}</h1>
          <div className="animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded mb-4"></div>
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-16 bg-gray-200 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // クエリエラーのみをページレベルのエラーとして扱う
  const queryErrorMessage = error?.message;

  if (queryErrorMessage && !loading) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">{t("details.badge")}</h1>
          <div className="text-red-600">{t("details.error")}: {queryErrorMessage}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* ヘッダー（デスクトップのみ。タグ絞り込みは FilterBottomSheet の「タグ」グループに集約したため、
          旧・常時表示タグピル行はここから撤去した(selectedTagIds の二重操作導線になっていたため)） */}
      <div className="hidden lg:block bg-white rounded-lg shadow p-5 sm:p-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">{t("details.badge")}</h1>
        <p className="text-sm sm:text-base text-gray-600">{t("page.description")}</p>
      </div>

      {/* 練習記録一覧（全幅カード + ボトムシート）。
          スマホ幅はページラッパー(DashboardLayout)が既に px-0 のため、
          角丸を落として画面端まで貼り付ける(sm以上は従来の rounded-lg inset 見た目) */}
      <div className="bg-white rounded-none sm:rounded-lg shadow">
        {practiceLogs.length === 0 ? (
          <div className="p-12 text-center">
            <CalendarDaysIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">{t("page.emptyTitle")}</h3>
            <p className="mt-1 text-sm text-gray-500">
              {t("page.emptyDesc")}
            </p>
            <div className="mt-4">
              <Button
                onClick={() => (window.location.href = "/dashboard")}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {t("page.goToDashboard")}
              </Button>
            </div>
          </div>
        ) : sortedPracticeLogs.length === 0 ? (
          <div className="p-12 text-center">
            <CalendarDaysIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">{t("page.noMatchTitle")}</h3>
            <p className="mt-1 text-sm text-gray-500">{t("page.noMatchDesc")}</p>
            <div className="mt-6">
              <Button variant="outline" onClick={handleResetAllFilters} className="text-sm">
                {tCommon("bottomSheet.clearAll")}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <ListToolbar
              itemCount={sortedPracticeLogs.length}
              onSortClick={openSortSheet}
              onFilterClick={openFilterSheet}
              activeFilterCount={activeFilterCount}
            />

            <div className="space-y-2 sm:space-y-3 px-0 sm:px-6 pb-4">
              {visiblePracticeLogs.map((log) => (
                <PracticeLogCard key={log.id} log={log} onClick={handleRowClick} />
              ))}
            </div>

            {sortedPracticeLogs.length > displayCount && (
              <div className="px-4 sm:px-6 pb-6 flex flex-col items-center gap-1">
                <Button variant="outline" onClick={handleLoadMore}>
                  {tCommon("loadMore.button")}
                </Button>
                <span className="text-xs text-gray-500">
                  {tCommon("loadMore.remaining", { n: sortedPracticeLogs.length - displayCount })}
                </span>
              </div>
            )}
          </>
        )}
      </div>

      {/* 並べ替えボトムシート */}
      <SortBottomSheet<PracticeSortColumn>
        isOpen={isSortSheetOpen}
        onClose={() => setIsSortSheetOpen(false)}
        title={t("sortSheet.title")}
        presets={sortPresets}
        activeColumn={sortColumn}
        activeOrder={sortOrder}
        onSelect={handleSortSelect}
      />

      {/* 絞り込みボトムシート */}
      <FilterBottomSheet
        isOpen={isFilterSheetOpen}
        onClose={() => setIsFilterSheetOpen(false)}
        title={t("filterSheet.title")}
        groups={filterGroups}
        activeCount={activeFilterCount}
        onClearAll={handleClearFiltersOnly}
      />

      {/* 詳細モーダル（dashboard の PracticeDetails / AttendanceModal / DeleteConfirmModal を再利用） */}
      {selectedLog && (
        <PracticeDetailModal
          key={`${selectedLog.practiceId}-${modalNonce}`}
          isOpen={!!selectedLog}
          onClose={handleCloseDetailModal}
          practiceId={selectedLog.practiceId}
          date={selectedLog.practice?.date || ""}
          place={selectedLog.practice?.place || undefined}
          isTeamPractice={!!selectedLog.practice?.team_id}
          teamId={selectedLog.practice?.team_id}
          onEditPractice={handleEditPractice}
          onDeletePractice={handleDeletePractice}
          onOpenPracticeLogTab={handleOpenPracticeLogTab}
          onDeletePracticeLog={handleDeletePracticeLog}
        />
      )}

      {/* タブモーダル: 練習 (dashboard と同じ PracticeTabModal) */}
      <PracticeTabModal
        isOpen={isPracticeTabModalOpen}
        onClose={closePracticeTabModal}
        onSave={handlePracticeTabSave}
        selectedDate={tabSelectedDate || new Date()}
        editingData={tabEditingData}
        editingPracticeId={editingPracticeId}
        isLoading={isTabLoading}
        availableTags={availableTags}
        setAvailableTags={setAvailableTags}
        initialTab={practiceActiveTab}
      />
    </div>
  );
}
