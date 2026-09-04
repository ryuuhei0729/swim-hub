"use client";

import React, { useState, useMemo, useLayoutEffect, useTransition } from "react";
import { useTranslations, useLocale } from "next-intl";
import { CalendarDaysIcon } from "@heroicons/react/24/outline";
import Button from "@/components/ui/Button";
import ListToolbar from "@/components/history/ListToolbar";
import SortBottomSheet, { type SortPreset } from "@/components/history/SortBottomSheet";
import FilterBottomSheet, { type FilterGroup } from "@/components/history/FilterBottomSheet";
import PracticeCard from "../_components/PracticeCard";
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
import type { PracticeTag, PracticeWithLogs, Style } from "@apps/shared/types";
import { getStyleOrderIndex, toStyleCode } from "@apps/shared/utils/swimStyles";
import { usePracticeStore } from "@/stores/practice/practiceStore";
import type { PracticeSortColumn } from "@/stores/practice/practiceStore";
import type { EditingData } from "@/stores/types";
import type { GalleryImage } from "@/components/ui/ImageGallery";
import { usePracticeTabSave } from "@/hooks/usePracticeTabSave";
import { useTableSort } from "@/hooks/useTableSort";
import {
  buildPracticeLogRows,
  logMatchesAllTags,
  type PracticeLogRow,
} from "@apps/shared/utils/practiceLogRows";
import { getPracticeLogRowSortValue } from "../_utils/practiceLogGrouping";
import { toUserFacingMessage } from "@swim-hub/shared/utils/userFacingError";

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

// 絞り込みボトムシートのドラフト状態(適用ボタンを押すまでストアに反映しない値の入れ物。
// CompetitionClient.tsx の FilterDraft と同型)
interface FilterDraft {
  tags: string[];
  places: string[];
  style: string;
}

/**
 * 練習記録ページのインタラクティブ部分を担当するClient Component
 *
 * 行クリック時の詳細/編集/削除 UI/UX はダッシュボード (DayDetailModal 系) と統一している。
 * - 詳細表示: PracticeDetailModal (dashboard の PracticeDetails を再利用)
 * - 編集: dashboard と同じ PracticeTabModal
 * - 削除確認: dashboard と同じ DeleteConfirmModal (PracticeDetailModal 内で使用)
 *
 * 一覧UI(2026-08-01): カードの粒度を 1練習ログ=1カード (log-level) とする。大会タブ
 * (CompetitionClient: 1記録=1カード) と粒度を揃えるためで、2026-07-23 に導入した
 * day-level(1練習=1カードに全ログを行として詰め込む)表示はユーザー指摘により撤回した。
 * クリック先は従来どおり練習全体 (PracticeDetailModal) なので、同じ練習のどのログの
 * カードを押しても全ログが載った同一モーダルが開く(mobile PracticesScreen とパリティ)。
 * 絞り込みシートは CompetitionClient.tsx と同型の draft/apply 方式。
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

  // ---------------------------------------------------------------------------
  // 絞り込みシートのドラフト状態(CompetitionClient.tsx と同型: シート全体をドラフト化)
  // チップ操作はこのローカル state のみを更新し、ストア(一覧・件数バッジ)には反映しない。
  // 「適用」を押した時にのみストアへ一括コミットする。シートを開く瞬間にストアの現在値で
  // 初期化し、X/backdrop/Escape/シート排他で閉じた場合は再初期化されずそのまま破棄される。
  // ---------------------------------------------------------------------------
  const buildFilterDraftFromStore = (): FilterDraft => ({
    tags: selectedTagIds,
    places: filterPlaces,
    style: filterStyle,
  });

  const [filterDraft, setFilterDraft] = useState<FilterDraft>(buildFilterDraftFromStore);

  // シートが開かれた瞬間(false→true)にのみストアの現在値で再初期化する。
  // filterDraft を書き換えている最中の再レンダーでは張り直さない(選択中のチップが消えないように)。
  // useLayoutEffect: プレーンな useEffect だと開いた瞬間に前回のドラフト値のまま1フレーム描画されて
  // から正しい値に更新される(ちらつき)ため、コミット前(描画前)に同期的に再初期化する。
  useLayoutEffect(() => {
    if (isFilterSheetOpen) {
      setFilterDraft(buildFilterDraftFromStore());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFilterSheetOpen]);

  const handleDraftTagsChange = (values: string[]) =>
    setFilterDraft((prev) => ({ ...prev, tags: values }));
  const handleDraftPlacesChange = (values: string[]) =>
    setFilterDraft((prev) => ({ ...prev, places: values }));
  const handleDraftStyleChange = (value: string) =>
    setFilterDraft((prev) => ({ ...prev, style: value }));

  // 絞り込みシートの「すべてクリア」: ドラフトのみを未選択に戻す(シートは閉じない・ストアは不変)
  const handleClearDraftFilters = () => {
    setFilterDraft({ tags: [], places: [], style: "" });
  };

  // 絞り込みシートの「適用」: ドラフトをストアへ一括コミットし、displayCount をリセットしてシートを閉じる
  const handleApplyFilters = () => {
    startTransition(() => {
      setSelectedTags(filterDraft.tags);
      setFilterPlaces(filterDraft.places);
      setFilterStyle(filterDraft.style);
      setDisplayCount(PAGE_INCREMENT);
    });
    setIsFilterSheetOpen(false);
  };

  // 0件空状態(条件一致なし)の「フィルタをクリア」導線: ドラフトを経由せず即時に全解除する
  // (ソートも含めて全リセットする既存仕様を維持)
  const handleResetAllFilters = () => {
    startTransition(() => {
      resetFilter();
      setDisplayCount(PAGE_INCREMENT);
    });
  };

  // 詳細モーダルで表示中の練習日(行クリックで選択される練習日。day-level カードなので
  // 選択単位は log ではなく practice そのもの)
  const [selectedPractice, setSelectedPractice] = useState<PracticeWithLogs | null>(null);
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

  // 一覧のベース: 1練習ログ = 1カード行へ平坦化する(practice.id で去重。大会タブと同じ粒度)
  const practiceLogRows = useMemo(() => buildPracticeLogRows(displayPractices), [displayPractices]);

  // 今日の日付（時刻を0時0分0秒にリセット）
  const today = useMemo(() => startOfDay(new Date()), []);

  // 場所/種目フィルタの選択肢生成対象: 未来日の練習は「選んでも常に0件」になる候補になるため、
  // filteredRows と同じ未来日ガードを適用した集合(=表示対象になり得る行のみ)から
  // distinct を生成する
  const pastOrTodayRows = useMemo(() => {
    return practiceLogRows.filter((row) => {
      if (!row.practice.date) return true;
      return !isAfter(startOfDay(new Date(row.practice.date)), today);
    });
  }, [practiceLogRows, today]);

  // 場所フィルタの選択肢（distinct, ロケール順。practice 単位のフィールドを行経由で走査する）
  const participatedPlaces = useMemo(() => {
    const places = new Set<string>();
    pastOrTodayRows.forEach((row) => {
      if (row.practice.place) places.add(row.practice.place);
    });
    return Array.from(places).sort((a, b) => a.localeCompare(b, locale));
  }, [pastOrTodayRows, locale]);

  // 種目フィルタの選択肢（distinct, STYLES定義順。log 単位のフィールド）
  // practice_logs.style は CHECK 制約の無い自由記述列で、legacy な小文字行("fr" 等)が
  // 混在し得る(backfill migration は別途進行中だが、本修正はそれに依存しない防御)。
  // toStyleCode() で canonical に正規化してから distinct 化することで、"Fr" と "fr" が
  // 別々のフィルタ選択肢に分裂するのを防ぐ。正規化できない値(canonical 外)は選択肢として
  // 提示しない(その行自体は絞り込み無しの一覧には表示され続ける。壊れたラベルの
  // 選択肢を出すより安全)。
  const participatedStyleKeys = useMemo(() => {
    const keys = new Set<string>();
    pastOrTodayRows.forEach((row) => {
      const code = toStyleCode(row.log?.style);
      if (code) keys.add(code);
    });
    return Array.from(keys).sort((a, b) => getStyleOrderIndex(a) - getStyleOrderIndex(b));
  }, [pastOrTodayRows]);

  // タグ/場所/種目フィルタリングロジック + 日付フィルタリング（今日以前のみ）。カラム間 AND。
  // log-level 化: 場所は親 practice、タグ(選択タグを全て持つか=AND)と種目はその行のログ自身を
  // 見る。day-level 時代の「条件に合うログが1件でもあれば日全体を表示」(OR-exists)は、
  // 条件に合わないログのカードまで一緒に出てしまうため撤回した。
  const filteredRows = useMemo(
    () =>
      practiceLogRows.filter((row) => {
        const { practice, log } = row;

        // 日付フィルタリング：今日より未来の日付は除外
        if (practice.date) {
          const practiceDate = startOfDay(new Date(practice.date));
          if (isAfter(practiceDate, today)) {
            return false;
          }
        }

        // タグフィルタリング（そのログが選択タグを全て持つ場合のみ表示）
        if (!logMatchesAllTags(log, selectedTagIds)) {
          return false;
        }

        // 場所フィルタリング（複数OR、practice の直接比較）
        if (filterPlaces.length > 0) {
          if (!practice.place || !filterPlaces.includes(practice.place)) {
            return false;
          }
        }

        // 種目フィルタリング（単一select。そのログの種目が一致する場合のみ表示）
        // filterStyle は participatedStyleKeys(正規化済み)から選ばれるため常に canonical。
        // log.style 側も toStyleCode() で正規化してから比較し、legacy な小文字行を
        // 取りこぼさない(例: filterStyle="Fr" のとき log.style="fr" の行も一致させる)。
        if (filterStyle) {
          if (toStyleCode(log?.style) !== filterStyle) {
            return false;
          }
        }

        return true;
      }),
    [practiceLogRows, selectedTagIds, filterPlaces, filterStyle, today],
  );

  // 日付の降順を既定順とし、useTableSort に渡す（sortColumn が null の間はこの順序を維持する）。
  // ソートキーは practice 単位なので、同じ練習のログ同士は常にタイ。Array.prototype.sort は
  // 安定ソートのため、同一練習のログは buildPracticeLogRows が並べた順序のまま隣り合う。
  const dateDescRows = useMemo(() => {
    return [...filteredRows].sort((a, b) => {
      const dateA = new Date(a.practice.date || a.practice.created_at);
      const dateB = new Date(b.practice.date || b.practice.created_at);
      return dateB.getTime() - dateA.getTime();
    });
  }, [filteredRows]);

  const { sortedItems: sortedRows } = useTableSort<PracticeLogRow, PracticeSortColumn>(
    dateDescRows,
    sortColumn,
    sortOrder,
    setSortColumn,
    setSortOrder,
    getPracticeLogRowSortValue,
    locale,
  );

  // 絞り込みバッジ/フッターの「有効な絞り込み条件の数」(ストアへ適用済みの値ベース。
  // グループ単位でカウントする)
  const activeFilterCount = [
    selectedTagIds.length > 0,
    filterPlaces.length > 0,
    filterStyle !== "",
  ].filter(Boolean).length;

  // 絞り込みシート内の「有効な絞り込み条件の数」(ドラフト値ベース。「すべてクリア」の有効/無効判定に使う)
  const draftActiveFilterCount = [
    filterDraft.tags.length > 0,
    filterDraft.places.length > 0,
    filterDraft.style !== "",
  ].filter(Boolean).length;

  // 並べ替えボトムシートのプリセット(2026-07-23 Sprint: day-level 化に伴い date/place の4択に縮小)
  const sortPresets: SortPreset<PracticeSortColumn>[] = [
    { id: "dateDesc", label: t("page.sortOptionDateDesc"), column: "date", order: "desc", isDefault: true },
    { id: "dateAsc", label: t("page.sortOptionDateAsc"), column: "date", order: "asc" },
    { id: "placeAsc", label: t("sortSheet.placeAsc"), column: "place", order: "asc" },
    { id: "placeDesc", label: t("sortSheet.placeDesc"), column: "place", order: "desc" },
  ];

  const handleSortSelect = (preset: SortPreset<PracticeSortColumn>) => {
    startTransition(() => {
      setSortColumn(preset.column);
      setSortOrder(preset.order);
      setDisplayCount(PAGE_INCREMENT);
    });
    setIsSortSheetOpen(false);
  };

  // 絞り込みボトムシートのグループ定義(ドラフト state を参照する。場所=multi/OR、種目=single、
  // タグ=multi/AND)
  const filterGroups: FilterGroup[] = [
    {
      id: "place",
      label: t("page.colPlace"),
      mode: "multi",
      options: participatedPlaces.map((place) => ({ value: place, label: place })),
      selectedValues: filterDraft.places,
      onChange: handleDraftPlacesChange,
      onClearGroup: () => handleDraftPlacesChange([]),
    },
    {
      id: "style",
      label: t("page.colStyle"),
      mode: "single",
      options: participatedStyleKeys.map((key) => ({
        value: key,
        label: t(`styles.${key}` as Parameters<typeof t>[0]),
      })),
      selectedValues: filterDraft.style ? [filterDraft.style] : [],
      onChange: (values) => handleDraftStyleChange(values[0] ?? ""),
      onClearGroup: () => handleDraftStyleChange(""),
    },
    {
      id: "tags",
      label: t("page.colTags"),
      mode: "multi",
      note: t("filterSheet.tagsAndNote"),
      options: tags.map((tag) => ({ value: tag.id, label: tag.name, color: tag.color })),
      selectedValues: filterDraft.tags,
      onChange: handleDraftTagsChange,
      onClearGroup: () => handleDraftTagsChange([]),
    },
  ];

  // もっと見る: 絞り込み後・並べ替え後の総件数のうち displayCount 件のみ表示する
  const visibleRows = useMemo(() => {
    return sortedRows.slice(0, displayCount);
  }, [sortedRows, displayCount]);

  const handleLoadMore = () => {
    setDisplayCount((count) => count + PAGE_INCREMENT);
  };

  // 行クリック: ダッシュボードと同じ PracticeDetails を表示する詳細モーダルを開く
  const handleRowClick = (practice: PracticeWithLogs) => {
    setSelectedPractice(practice);
  };

  const handleCloseDetailModal = () => {
    setSelectedPractice(null);
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
    if (!selectedPractice) return;
    const dateObj = startOfDay(parseISO(selectedPractice.date));
    openPracticeTabModal(
      dateObj,
      {
        id: selectedPractice.id,
        type: "practice",
        date: selectedPractice.date,
        title: selectedPractice.title || "",
        place: selectedPractice.place || "",
        note: selectedPractice.note || "",
        editData: images ? { images } : undefined,
      } as EditingData,
      "practice",
    );
  };

  // 練習ログタブを開く（追加・編集共通。PracticeTabModal 側が practiceId から全ログを再取得する）
  const handleOpenPracticeLogTab = () => {
    if (!selectedPractice) return;
    const dateObj = startOfDay(parseISO(selectedPractice.date));
    openPracticeTabModal(
      dateObj,
      {
        id: selectedPractice.id,
        type: "practice",
        date: selectedPractice.date,
        title: selectedPractice.title || "",
        place: selectedPractice.place || "",
        note: selectedPractice.note || "",
      } as EditingData,
      "practiceLog",
    );
  };

  // 練習全体の削除（DeleteConfirmModal 経由で呼ばれる）
  const handleDeletePractice = async () => {
    if (!selectedPractice) return;
    try {
      await deletePracticeMutation.mutateAsync(selectedPractice.id);
      setSelectedPractice(null);
      await refetch();
    } catch (error) {
      console.error("練習記録の削除に失敗しました:", error);
      const errorMessage = toUserFacingMessage(error, t("client.deleteFailed"));
      alert(t("client.saveError", { message: errorMessage }));
    }
  };

  // 個別の練習ログ削除（カスケード: 削除後に残りログが0件なら親 practice も削除する）
  // NOTE: この既存挙動（V-W-P05/06）は必ず維持すること
  const handleDeletePracticeLog = async (logId: string) => {
    if (!selectedPractice) return;
    const practiceId = selectedPractice.id;
    try {
      await deletePracticeLogMutation.mutateAsync(logId);

      // 直近(削除前)の displayPractices から、削除対象の practiceId に紐づく現在の
      // practice_logs を引き、削除したログを除いた残りログ数でカスケード判定する。
      // displayPractices は startDate/endDate でスコープされた個人一覧のため、
      // 対象の practice がここに含まれない(＝「不明」)ケースが起こりうる。
      // その場合は「残りログ0件」と区別し、カスケード削除を発火させない
      // (「不明」を「0件」として扱うと、他にログが残っていても親 practice ごと
      // 削除してしまう破壊的なバグになる)。
      const currentPractice = displayPractices.find((practice) => practice.id === practiceId);

      if (currentPractice === undefined) {
        console.warn(
          "handleDeletePracticeLog: displayPractices から practiceId に一致する practice が" +
            "見つからなかったため、カスケード削除の要否を判定できませんでした。ログ削除自体は" +
            "成功しているため、親 practice は削除せずモーダルの表示のみ更新します。",
          { practiceId, logId },
        );
        setModalNonce((n) => n + 1);
      } else {
        const remainingLogs = currentPractice.practice_logs.filter((log) => log.id !== logId);

        if (remainingLogs.length === 0) {
          try {
            await deletePracticeMutation.mutateAsync(practiceId);
            setSelectedPractice(null);
          } catch (practiceDeleteError) {
            console.error("Practiceの削除に失敗しました:", practiceDeleteError);
            const errorMessage = toUserFacingMessage(practiceDeleteError, t("client.deleteFailed"));
            alert(t("client.saveError", { message: errorMessage }));
          }
        } else {
          setModalNonce((n) => n + 1);
        }
      }

      await refetch();
    } catch (error) {
      console.error("削除エラー:", error);
      const errorMessage = toUserFacingMessage(error, t("client.deleteFailed"));
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

      {/* 練習記録一覧（全幅カード + ボトムシート、1練習ログ=1カード）。
          スマホ幅はページラッパー(DashboardLayout)が既に px-0 のため、
          角丸を落として画面端まで貼り付ける(sm以上は従来の rounded-lg inset 見た目) */}
      <div className="bg-white rounded-none sm:rounded-lg shadow">
        {practiceLogRows.length === 0 ? (
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
        ) : sortedRows.length === 0 ? (
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
              itemCount={sortedRows.length}
              onSortClick={openSortSheet}
              onFilterClick={openFilterSheet}
              activeFilterCount={activeFilterCount}
            />

            <div className="space-y-2 sm:space-y-3 px-0 sm:px-6 pb-4">
              {visibleRows.map((row) => (
                <PracticeCard
                  key={row.id}
                  practice={row.practice}
                  log={row.log}
                  onClick={handleRowClick}
                />
              ))}
            </div>

            {sortedRows.length > displayCount && (
              <div className="px-4 sm:px-6 pb-6 flex flex-col items-center gap-1">
                <Button variant="outline" onClick={handleLoadMore}>
                  {tCommon("loadMore.button")}
                </Button>
                <span className="text-xs text-gray-500">
                  {tCommon("loadMore.remaining", { n: sortedRows.length - displayCount })}
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

      {/* 絞り込みボトムシート(ドラフト化: X/backdrop/Escape で閉じるとドラフトは破棄され、
          ストア(一覧・件数バッジ)には影響しない。「適用」でのみコミットされる) */}
      <FilterBottomSheet
        isOpen={isFilterSheetOpen}
        onClose={() => setIsFilterSheetOpen(false)}
        title={t("filterSheet.title")}
        groups={filterGroups}
        activeCount={draftActiveFilterCount}
        onClearAll={handleClearDraftFilters}
        onApply={handleApplyFilters}
      />

      {/* 詳細モーダル（dashboard の PracticeDetails / AttendanceModal / DeleteConfirmModal を再利用） */}
      {selectedPractice && (
        <PracticeDetailModal
          key={`${selectedPractice.id}-${modalNonce}`}
          isOpen={!!selectedPractice}
          onClose={handleCloseDetailModal}
          practiceId={selectedPractice.id}
          date={selectedPractice.date || ""}
          place={selectedPractice.place || undefined}
          isTeamPractice={!!selectedPractice.team_id}
          teamId={selectedPractice.team_id}
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
