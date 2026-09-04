"use client";

import React, { useState, useMemo, useEffect, useLayoutEffect, useTransition } from "react";
import { useTranslations, useLocale } from "next-intl";
import { TrophyIcon } from "@heroicons/react/24/outline";
import Button from "@/components/ui/Button";
import ListToolbar from "@/components/history/ListToolbar";
import SortBottomSheet, { type SortPreset } from "@/components/history/SortBottomSheet";
import FilterBottomSheet, { type FilterGroup } from "@/components/history/FilterBottomSheet";
import CompetitionRecordCard from "../_components/CompetitionRecordCard";
import CompetitionTabModal from "@/components/forms/CompetitionTabModal";
import CompetitionDetailModal from "../_components/CompetitionDetailModal";
import RecordDetailModal from "../_components/RecordDetailModal";
import RecordLogForm from "@/components/forms/RecordLogForm";
import type { RecordLogFormData } from "@/components/forms/record-log/types";
import { format, isAfter, parseISO, startOfDay } from "date-fns";
import { ja } from "date-fns/locale";
import { useAuth } from "@/contexts";
import {
  useRecordsQuery,
  useCreateRecordMutation,
  useUpdateRecordMutation,
  useDeleteRecordMutation,
  useCreateCompetitionMutation,
  useUpdateCompetitionMutation,
  useDeleteCompetitionMutation,
  useCreateSplitTimesMutation,
  useReplaceSplitTimesMutation,
} from "@apps/shared/hooks/queries/records";
import type { Record, Competition, Style, SwimStyle } from "@apps/shared/types";
import { EntryAPI } from "@apps/shared/api/entries";
import { useCompetitionStore } from "@/stores/competition/competitionStore";
import type { CompetitionSortColumn, RelayFilterMode } from "@/stores/competition/competitionStore";
import type { EditingData } from "@/stores/types";
import type { GalleryImage } from "@/components/ui/ImageGallery";
import { useCompetitionTabSave } from "@/hooks/useCompetitionTabSave";
import { getEntryDataListForRecord } from "@/utils/getEntryDataListForRecord";
import { useTableSort, type SortValue } from "@/hooks/useTableSort";

interface CompetitionClientProps {
  styles: Style[];
}

// エントリー済み（記録未登録）の大会・エントリー1件分
interface EntryOnlyItem {
  entryId: string;
  competitionId: string;
  competitionName: string;
  date: string;
  place?: string;
  poolType?: number;
  isTeamCompetition: boolean;
  teamId?: string | null;
  teamName?: string;
  styleId?: number;
  styleName: string;
  entryTime?: number | null;
}

type DetailSelection =
  | { mode: "record"; record: Record }
  | { mode: "entry"; item: EntryOnlyItem }
  | null;

// 絞り込みボトムシートのドラフト状態(適用ボタンを押すまでストアに反映しない値の入れ物)
interface FilterDraft {
  distances: string[];
  styles: string[];
  poolType: string;
  relayMode: RelayFilterMode;
  competitionNames: string[];
  places: string[];
}

// 一覧の初期表示件数、および「もっと見る」1回あたりの増分
const PAGE_INCREMENT = 20;

// 絞り込みシート「種目(泳法)」グループの表示順(STYLES 定義順: 自由形→平泳ぎ→背泳ぎ→バタフライ→個人メドレー)
const STYLE_ORDER: SwimStyle[] = ["Fr", "Br", "Ba", "Fly", "IM"];

// style.name_jp (例: "50m自由形") から距離接頭辞を除いた裸の泳法名 (例: "自由形") を取り出すための正規表現
const DISTANCE_PREFIX_PATTERN = /^\d+m/;

/**
 * 大会記録一覧カード用のソート値抽出(useTableSort 用)。
 *
 * - 日付: 大会日(なければ記録の作成日時)
 * - 記録(タイム): record.time は型上 number だが、DB上は未登録行を defensive に "-" 表示
 *   している既存実装([画面]の record.time ? ... : "-")に合わせ、falsy は null 扱いにして末尾固定する
 */
function getCompetitionSortValue(record: Record, column: CompetitionSortColumn): SortValue {
  const competition = record.competition as Competition | null;
  switch (column) {
    case "date": {
      const dateStr = competition?.date || record.created_at;
      return dateStr ? new Date(dateStr) : null;
    }
    case "time":
      return record.time || null;
    default:
      return null;
  }
}

/**
 * 大会記録ページのインタラクティブ部分を担当するClient Component
 * 記録データはHydrationBoundaryでReact Queryキャッシュに注入済み
 *
 * 行クリック時の詳細/編集/削除 UI/UX はダッシュボード (DayDetailModal 系) と統一している。
 * - 詳細表示: CompetitionDetailModal (dashboard の CompetitionDetails / CompetitionWithEntry を再利用)
 * - 編集: dashboard と同じ CompetitionTabModal
 * - 削除確認: dashboard と同じ DeleteConfirmModal (CompetitionDetailModal 内で使用)
 *
 * 一覧UI(2026-07-22 Sprint): テーブルを廃止し、全幅カード + ボトムシート(並べ替え/絞り込み)に刷新した。
 */
export default function CompetitionClient({ styles }: CompetitionClientProps) {
  const { user, supabase } = useAuth();
  const t = useTranslations("competition");
  const tCommon = useTranslations("common");
  // セクション見出しは dashboard.entry.enteredNoRecord ("エントリー済み（記録未登録）") を再利用する
  const tDash = useTranslations("dashboard");
  const locale = useLocale();
  const [displayCount, setDisplayCount] = useState(PAGE_INCREMENT);
  const [_isPending, startTransition] = useTransition();

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

  // Zustandストア（ダッシュボードと共通の useCompetitionStore。タブモーダル状態もここに集約されている）
  const {
    filterDistances,
    filterStyles,
    filterPoolType,
    filterRelayMode,
    filterCompetitionNames,
    filterPlaces,
    sortColumn,
    sortOrder,
    setFilterDistances,
    setFilterStyles,
    setFilterPoolType,
    setFilterRelayMode,
    setFilterCompetitionNames,
    setFilterPlaces,
    setSortColumn,
    setSortOrder,
    resetFilter,
    isOpen: isCompetitionTabModalOpen,
    activeTab: competitionActiveTab,
    editingData: tabEditingData,
    editingCompetitionId,
    selectedDate: tabSelectedDate,
    createdEntries,
    isLoading: isTabLoading,
    entryLocked,
    styles: storeStyles,
    openTabModal: openCompetitionTabModal,
    closeTabModal: closeCompetitionTabModal,
    closeAll: closeCompetitionStoreAll,
    setStyles: setStoreStyles,
    setLoading: setTabLoading,
    setEditingCompetitionId,
    setCreatedEntries,
  } = useCompetitionStore();

  // useCompetitionStore は Dashboard/practice/competition の3画面で共有される module-level singleton。
  // マウント時・アンマウント時にタブモーダル状態を必ず閉じておかないと、他画面で開いたまま
  // 遷移してきた場合に isOpen=true が残り、このページで意図せず TabModal が開いてしまう
  // (逆方向: このページで編集中に他画面へ遷移した場合の状態リークも防ぐ)。
  // 描画前(useLayoutEffect)でリセットすることで、古い TabModal が一瞬でも表示されるのを防ぐ。
  useLayoutEffect(() => {
    closeCompetitionStoreAll();
    return () => {
      closeCompetitionStoreAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------------------------------------------------------------------------
  // 絞り込みシートのドラフト状態(2026-07-22b: シート全体をドラフト化)
  // チップ操作はこのローカル state のみを更新し、ストア(一覧・件数バッジ)には反映しない。
  // 「適用」を押した時にのみストアへ一括コミットする。シートを開く瞬間にストアの現在値で
  // 初期化し、X/backdrop/Escape/シート排他で閉じた場合は再初期化されずそのまま破棄される。
  // ---------------------------------------------------------------------------
  const buildFilterDraftFromStore = (): FilterDraft => ({
    distances: filterDistances,
    styles: filterStyles,
    poolType: filterPoolType,
    relayMode: filterRelayMode,
    competitionNames: filterCompetitionNames,
    places: filterPlaces,
  });

  const [filterDraft, setFilterDraft] = useState<FilterDraft>(buildFilterDraftFromStore);

  // シートが開かれた瞬間(false→true)にのみストアの現在値で再初期化する。
  // filterDraft を書き換えている最中の再レンダーでは張り直さない(選択中のチップが消えないように)。
  useEffect(() => {
    if (isFilterSheetOpen) {
      setFilterDraft(buildFilterDraftFromStore());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFilterSheetOpen]);

  const handleDraftDistancesChange = (values: string[]) =>
    setFilterDraft((prev) => ({ ...prev, distances: values }));
  const handleDraftStylesChange = (values: string[]) =>
    setFilterDraft((prev) => ({ ...prev, styles: values }));
  const handleDraftPoolTypeChange = (value: string) =>
    setFilterDraft((prev) => ({ ...prev, poolType: value }));
  const handleDraftRelayModeChange = (value: string) =>
    setFilterDraft((prev) => ({ ...prev, relayMode: (value || "all") as RelayFilterMode }));
  const handleDraftCompetitionNamesChange = (values: string[]) =>
    setFilterDraft((prev) => ({ ...prev, competitionNames: values }));
  const handleDraftPlacesChange = (values: string[]) =>
    setFilterDraft((prev) => ({ ...prev, places: values }));

  // 絞り込みシートの「すべてクリア」: ドラフトのみを未選択に戻す(シートは閉じない・ストアは不変)
  const handleClearDraftFilters = () => {
    setFilterDraft({
      distances: [],
      styles: [],
      poolType: "",
      relayMode: "all",
      competitionNames: [],
      places: [],
    });
  };

  // 絞り込みシートの「適用」: ドラフトをストアへ一括コミットし、displayCount をリセットしてシートを閉じる
  const handleApplyFilters = () => {
    startTransition(() => {
      setFilterDistances(filterDraft.distances);
      setFilterStyles(filterDraft.styles);
      setFilterPoolType(filterDraft.poolType);
      setFilterRelayMode(filterDraft.relayMode);
      setFilterCompetitionNames(filterDraft.competitionNames);
      setFilterPlaces(filterDraft.places);
      setDisplayCount(PAGE_INCREMENT);
    });
    setIsFilterSheetOpen(false);
  };

  // 0件空状態(条件一致なし)の「フィルタをリセット」導線: ドラフトを経由せず即時に全解除する
  // (ソートも含めて全リセットする既存仕様を維持)
  const handleResetAllFilters = () => {
    startTransition(() => {
      resetFilter();
      setDisplayCount(PAGE_INCREMENT);
    });
  };

  // 詳細モーダルで表示中のアイテム（record 行 or entry-only 行）
  const [selection, setSelection] = useState<DetailSelection>(null);
  // 詳細モーダル内で記録を削除した際、CompetitionDetails (dashboard 由来) の内部フェッチを
  // 強制的にやり直させるための remount キー
  const [modalNonce, setModalNonce] = useState(0);

  // 大会に紐付いていない記録（一括ベストタイム入力等。competition が null）用の単体詳細/編集状態。
  // CompetitionDetailModal は competitionId でフェッチするため、competition_id が無い記録には使えない
  // (空フェッチで壊れたモーダルになる)。この場合はレコード単体の詳細/編集/削除パスに分岐する。
  const [standaloneRecord, setStandaloneRecord] = useState<Record | null>(null);
  const [standaloneEditRecord, setStandaloneEditRecord] = useState<Record | null>(null);

  // サーバー側から取得したデータをストアに設定（初回のみ）
  const initializedRef = React.useRef(false);
  if (!initializedRef.current) {
    setStoreStyles(styles);
    initializedRef.current = true;
  }

  // 大会記録を取得（HydrationBoundaryで注入済みキャッシュから取得 + リアルタイム更新）
  // 絞り込み/並べ替え/「もっと見る」は全て一覧側(クライアント)で行うため全件を取得する。
  // 既定の pageSize=20 は created_at 降順の先頭20件で切るため、登録が古い記録
  // (一括ベストタイム入力等)が一覧から欠落する。mobile RecordFormScreen と同じ十分大きい件数指定
  const {
    records = [],
    isLoading: loading,
    error,
    refetch,
  } = useRecordsQuery(supabase, { pageSize: 1000 });

  // ミューテーションフック
  const createRecordMutation = useCreateRecordMutation(supabase);
  const updateRecordMutation = useUpdateRecordMutation(supabase);
  const deleteRecordMutation = useDeleteRecordMutation(supabase);
  const createCompetitionMutation = useCreateCompetitionMutation(supabase);
  const updateCompetitionMutation = useUpdateCompetitionMutation(supabase);
  const deleteCompetitionMutation = useDeleteCompetitionMutation(supabase);
  const createSplitTimesMutation = useCreateSplitTimesMutation(supabase);
  const replaceSplitTimesMutation = useReplaceSplitTimesMutation(supabase);

  // サーバー側で取得した初期データとリアルタイム更新されたデータを統合
  // React Queryのキャッシュを使用
  const displayRecords = records;

  // 今日の日付（時刻を0時0分0秒にリセット）
  const today = startOfDay(new Date());

  // ---------------------------------------------------------------------------
  // エントリー済み（記録未登録）の大会一覧（V-W-C05）
  // records に載らない「エントリー済みだが記録がまだ無い」大会をダッシュボードと同じ粒度
  // (大会単位で1件でも記録があれば除外) で別途取得する。
  // ---------------------------------------------------------------------------
  const [entryOnlyItems, setEntryOnlyItems] = useState<EntryOnlyItem[]>([]);
  const [entryOnlyRefreshKey, setEntryOnlyRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const loadEntryOnlyItems = async () => {
      try {
        const {
          data: { user: authUser },
        } = await supabase.auth.getUser();
        if (!authUser) {
          if (!cancelled) setEntryOnlyItems([]);
          return;
        }

        type EntryRow = {
          id: string;
          style_id: number;
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
              .eq("user_id", authUser.id),
            supabase.from("records").select("competition_id").eq("user_id", authUser.id),
          ]);

        if (entryError || recordError) {
          console.error("エントリー済み(記録未登録)の取得エラー:", entryError || recordError);
          if (!cancelled) setEntryOnlyItems([]);
          return;
        }

        const recordedCompetitionIds = new Set(
          ((recordRows ?? []) as Array<{ competition_id: string | null }>)
            .map((r) => r.competition_id)
            .filter((id): id is string => !!id),
        );

        const items: EntryOnlyItem[] = ((entryRows ?? []) as unknown as EntryRow[])
          .filter((row) => row.competition && !recordedCompetitionIds.has(row.competition_id))
          .filter((row) => {
            const compDate = row.competition?.date;
            if (!compDate) return false;
            return !isAfter(startOfDay(new Date(compDate)), startOfDay(new Date()));
          })
          .map((row) => ({
            entryId: row.id,
            competitionId: row.competition_id,
            competitionName: row.competition?.title || t("client.competitionFallback"),
            date: row.competition?.date || "",
            place: row.competition?.place || undefined,
            poolType: row.competition?.pool_type,
            isTeamCompetition: !!row.competition?.team_id,
            teamId: row.competition?.team_id,
            teamName: row.competition?.team?.name,
            styleId: row.style?.id,
            styleName: row.style?.name_jp || "",
            entryTime: row.entry_time,
          }));

        if (!cancelled) setEntryOnlyItems(items);
      } catch (err) {
        console.error("エントリー済み(記録未登録)の取得エラー:", err);
        if (!cancelled) setEntryOnlyItems([]);
      }
    };

    loadEntryOnlyItems();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, entryOnlyRefreshKey]);

  // 種目/大会名/場所フィルタの選択肢生成対象: 未来日の大会は「選んでも常に0件」になる候補になるため、
  // filteredRecords と同じ未来日ガードを適用した集合(=表示対象になり得る行のみ)から distinct を生成する
  const pastOrTodayRecords = useMemo(() => {
    return displayRecords.filter((record: Record) => {
      const competition = record.competition as Competition | null;
      if (!competition?.date) return true;
      return !isAfter(startOfDay(new Date(competition.date)), today);
    });
  }, [displayRecords, today]);

  // 距離フィルタの選択肢（distinct, 昇順。record.style が無い行はスキップする）
  const participatedDistances = useMemo(() => {
    const distances = new Set<number>();
    pastOrTodayRecords.forEach((record: Record) => {
      const distance = (record.style as Style | undefined)?.distance;
      if (typeof distance === "number") {
        distances.add(distance);
      }
    });
    return Array.from(distances).sort((a, b) => a - b);
  }, [pastOrTodayRecords]);

  // 種目(泳法)フィルタの選択肢（distinct, STYLES 定義順。record.style が無い行はスキップする）
  const participatedStyleCodes = useMemo(() => {
    const codes = new Set<SwimStyle>();
    pastOrTodayRecords.forEach((record: Record) => {
      const code = (record.style as Style | undefined)?.style;
      if (code) {
        codes.add(code);
      }
    });
    return STYLE_ORDER.filter((code) => codes.has(code));
  }, [pastOrTodayRecords]);

  // 種目(泳法)コード → 距離接頭辞を除いた裸のラベル(例: "自由形") のマップ
  const styleLabelByCode = useMemo(() => {
    const map = new Map<SwimStyle, string>();
    styles.forEach((style: Style) => {
      if (!map.has(style.style)) {
        map.set(style.style, style.name_jp.replace(DISTANCE_PREFIX_PATTERN, ""));
      }
    });
    return map;
  }, [styles]);

  // 大会名フィルタの選択肢（distinct, ロケール順）
  const participatedCompetitionNames = useMemo(() => {
    const names = new Set<string>();
    pastOrTodayRecords.forEach((record: Record) => {
      const title = (record.competition as Competition | null)?.title;
      if (title) names.add(title);
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b, locale));
  }, [pastOrTodayRecords, locale]);

  // 場所フィルタの選択肢（distinct, ロケール順）+ 未設定(null)行の有無
  const { participatedPlaces, hasUnsetPlace } = useMemo(() => {
    const places = new Set<string>();
    let unset = false;
    pastOrTodayRecords.forEach((record: Record) => {
      const place = (record.competition as Competition | null)?.place;
      if (place) {
        places.add(place);
      } else if (record.competition) {
        unset = true;
      }
    });
    return {
      participatedPlaces: Array.from(places).sort((a, b) => a.localeCompare(b, locale)),
      hasUnsetPlace: unset,
    };
  }, [pastOrTodayRecords, locale]);

  // フィルタリングロジック（日付=常に今日以前のみ。カラム間 AND）
  const filteredRecords = displayRecords.filter((record: Record) => {
    // 日付フィルタリング：今日より未来の日付は除外
    const competition = record.competition as Competition | null;
    if (competition?.date) {
      const competitionDate = startOfDay(new Date(competition.date));
      if (isAfter(competitionDate, today)) {
        return false;
      }
    }

    // 距離フィルタ（複数select, OR。record.style が無い記録は除外する）
    if (filterDistances.length > 0) {
      const distance = (record.style as Style | undefined)?.distance;
      if (distance === undefined || !filterDistances.includes(distance.toString())) {
        return false;
      }
    }

    // 種目(泳法)フィルタ（複数select, OR。record.style が無い記録は除外する）
    if (filterStyles.length > 0) {
      const styleCode = (record.style as Style | undefined)?.style;
      if (!styleCode || !filterStyles.includes(styleCode)) {
        return false;
      }
    }

    // 記録(タイム)カラムのリレーフィルタ（単一select: すべて/リレー除く/リレーのみ）
    if (filterRelayMode === "excludeRelay" && record.is_relaying) {
      return false;
    }
    if (filterRelayMode === "onlyRelay" && !record.is_relaying) {
      return false;
    }

    // プール種別フィルタ（records.pool_type を使用、単一select）
    if (filterPoolType === "long" && record.pool_type !== 1) {
      return false;
    }
    if (filterPoolType === "short" && record.pool_type !== 0) {
      return false;
    }

    // 大会名フィルタ（複数select, OR）
    if (filterCompetitionNames.length > 0) {
      const title = competition?.title || null;
      if (!title || !filterCompetitionNames.includes(title)) {
        return false;
      }
    }

    // 場所フィルタ（複数select, OR。"" = 未設定(null行)を表すセンチネル値）
    if (filterPlaces.length > 0) {
      const place = competition?.place || null;
      const matchesUnset = place === null && filterPlaces.includes("");
      const matchesValue = place !== null && filterPlaces.includes(place);
      if (!matchesUnset && !matchesValue) {
        return false;
      }
    }

    return true;
  });

  // 日付の降順を既定順とし、useTableSort に渡す（sortColumn が null の間はこの順序を維持する）
  const dateDescRecords = useMemo(() => {
    return [...filteredRecords].sort((a, b) => {
      const dateA = new Date(a.competition?.date || a.created_at);
      const dateB = new Date(b.competition?.date || b.created_at);
      return dateB.getTime() - dateA.getTime();
    });
  }, [filteredRecords]);

  const { sortedItems: sortedRecords } = useTableSort<Record, CompetitionSortColumn>(
    dateDescRecords,
    sortColumn,
    sortOrder,
    setSortColumn,
    setSortOrder,
    getCompetitionSortValue,
    locale,
  );

  // 絞り込みバッジ/フッターの「有効な絞り込み条件の数」(ストアへ適用済みの値ベース。グループ単位で
  // カウントする。multi グループの選択件数ではなく、有効なグループの数を数える)
  const activeFilterCount = [
    filterDistances.length > 0,
    filterStyles.length > 0,
    filterPoolType !== "",
    filterRelayMode !== "all",
    filterCompetitionNames.length > 0,
    filterPlaces.length > 0,
  ].filter(Boolean).length;

  // 絞り込みシート内の「有効な絞り込み条件の数」(ドラフト値ベース。「すべてクリア」の有効/無効判定に使う)
  const draftActiveFilterCount = [
    filterDraft.distances.length > 0,
    filterDraft.styles.length > 0,
    filterDraft.poolType !== "",
    filterDraft.relayMode !== "all",
    filterDraft.competitionNames.length > 0,
    filterDraft.places.length > 0,
  ].filter(Boolean).length;

  // 並べ替えボトムシートのプリセット(2026-07-22b: 日付/記録の4件のみに縮小)
  const sortPresets: SortPreset<CompetitionSortColumn>[] = [
    { id: "dateDesc", label: t("sortSheet.dateDesc"), column: "date", order: "desc", isDefault: true },
    { id: "dateAsc", label: t("sortSheet.dateAsc"), column: "date", order: "asc" },
    { id: "timeAsc", label: t("sortSheet.timeAsc"), column: "time", order: "asc" },
    { id: "timeDesc", label: t("sortSheet.timeDesc"), column: "time", order: "desc" },
  ];

  const handleSortSelect = (preset: SortPreset<CompetitionSortColumn>) => {
    startTransition(() => {
      setSortColumn(preset.column);
      setSortOrder(preset.order);
      setDisplayCount(PAGE_INCREMENT);
    });
    setIsSortSheetOpen(false);
  };

  // 絞り込みボトムシートのグループ定義(ドラフト state を参照する。大会名/場所/距離/種目=multi・OR、
  // プール/リレー=single)
  const filterGroups: FilterGroup[] = [
    {
      id: "competitionName",
      label: t("table.competitionName"),
      mode: "multi",
      options: participatedCompetitionNames.map((name) => ({ value: name, label: name })),
      selectedValues: filterDraft.competitionNames,
      onChange: handleDraftCompetitionNamesChange,
      onClearGroup: () => handleDraftCompetitionNamesChange([]),
    },
    {
      id: "place",
      label: t("table.place"),
      mode: "multi",
      options: [
        ...(hasUnsetPlace ? [{ value: "", label: tCommon("notSet") }] : []),
        ...participatedPlaces.map((place) => ({ value: place, label: place })),
      ],
      selectedValues: filterDraft.places,
      onChange: handleDraftPlacesChange,
      onClearGroup: () => handleDraftPlacesChange([]),
    },
    {
      id: "pool",
      label: t("table.pool"),
      mode: "single",
      options: [
        { value: "short", label: tCommon("poolTypeShort") },
        { value: "long", label: tCommon("poolTypeLong") },
      ],
      selectedValues: filterDraft.poolType ? [filterDraft.poolType] : [],
      onChange: (values) => handleDraftPoolTypeChange(values[0] ?? ""),
      onClearGroup: () => handleDraftPoolTypeChange(""),
    },
    {
      id: "distance",
      label: t("filterSheet.distanceLabel"),
      mode: "multi",
      options: participatedDistances.map((distance) => ({
        value: distance.toString(),
        label: `${distance}m`,
      })),
      selectedValues: filterDraft.distances,
      onChange: handleDraftDistancesChange,
      onClearGroup: () => handleDraftDistancesChange([]),
    },
    {
      id: "style",
      label: t("filterSheet.strokeLabel"),
      mode: "multi",
      options: participatedStyleCodes.map((code) => ({
        value: code,
        label: styleLabelByCode.get(code) ?? code,
      })),
      selectedValues: filterDraft.styles,
      onChange: handleDraftStylesChange,
      onClearGroup: () => handleDraftStylesChange([]),
    },
    {
      id: "relay",
      label: t("filterSheet.relayLabel"),
      mode: "single",
      options: [
        { value: "excludeRelay", label: t("filter.excludeRelay") },
        { value: "onlyRelay", label: t("filter.onlyRelay") },
      ],
      selectedValues: filterDraft.relayMode === "all" ? [] : [filterDraft.relayMode],
      onChange: (values) => handleDraftRelayModeChange(values[0] ?? "all"),
      onClearGroup: () => handleDraftRelayModeChange("all"),
    },
  ];

  // もっと見る: 絞り込み後・並べ替え後の総件数のうち displayCount 件のみ表示する
  const visibleRecords = useMemo(() => {
    return sortedRecords.slice(0, displayCount);
  }, [sortedRecords, displayCount]);

  const handleLoadMore = () => {
    setDisplayCount((count) => count + PAGE_INCREMENT);
  };

  // 行クリック: ダッシュボードと同じ CompetitionDetails を表示する詳細モーダルを開く
  const handleViewRecord = (record: Record) => {
    setSelection({ mode: "record", record });
  };

  const handleViewEntryOnly = (item: EntryOnlyItem) => {
    setSelection({ mode: "entry", item });
  };

  const handleCloseDetailModal = () => {
    setSelection(null);
  };

  // 行クリック: 大会に紐付いている記録は CompetitionDetailModal、
  // 大会未紐付け(一括入力等)の記録はレコード単体の詳細モーダルへ分岐する。
  const handleRowClick = (record: Record) => {
    if (!record.competition) {
      setStandaloneRecord(record);
      return;
    }
    handleViewRecord(record);
  };

  // 単体レコードの編集（CompetitionTabModal は大会本体が無いため使えない。
  // 旧 web と同じ単体レコード編集フォーム RecordLogForm を再利用する）
  const handleEditStandaloneRecord = () => {
    if (!standaloneRecord) return;
    setStandaloneEditRecord(standaloneRecord);
  };

  const handleCloseStandaloneEditForm = () => {
    setStandaloneEditRecord(null);
  };

  const handleStandaloneRecordSubmit = async (dataList: RecordLogFormData[]) => {
    if (!standaloneEditRecord) return;
    const formData = dataList[0];
    if (!formData) return;

    try {
      await updateRecordMutation.mutateAsync({
        id: standaloneEditRecord.id,
        updates: {
          style_id: parseInt(formData.styleId),
          time: formData.time,
          video_path: formData.videoPath || null,
          note: formData.note || null,
          is_relaying: formData.isRelaying || false,
          reaction_time:
            formData.reactionTime && formData.reactionTime.trim() !== ""
              ? parseFloat(formData.reactionTime)
              : null,
        },
      });

      // スプリットタイム更新（空配列でも常に呼び出して既存のスプリットタイムを削除可能にする）
      const splitTimesData = (formData.splitTimes || []).map((st) => ({
        distance: st.distance,
        split_time: st.splitTime,
      }));
      await replaceSplitTimesMutation.mutateAsync({
        recordId: standaloneEditRecord.id,
        splitTimes: splitTimesData,
      });

      setModalNonce((n) => n + 1);
      setStandaloneEditRecord(null);
      setStandaloneRecord(null);
      await refetch();
    } catch (err) {
      console.error("大会記録の保存に失敗しました:", err);
      throw err;
    }
  };

  // 単体レコードの削除（DeleteConfirmModal 経由。RecordDetailModal 内で呼ばれる）
  const handleDeleteStandaloneRecord = async () => {
    if (!standaloneRecord) return;
    try {
      await deleteRecordMutation.mutateAsync(standaloneRecord.id);
      setStandaloneRecord(null);
      await refetch();
    } catch (err) {
      console.error("大会記録の削除に失敗しました:", err);
    }
  };

  // React Query mutation状態から派生（手動のsetLoadingは不要）
  const isAnyMutating =
    createRecordMutation.isPending ||
    updateRecordMutation.isPending ||
    deleteRecordMutation.isPending ||
    createCompetitionMutation.isPending ||
    deleteCompetitionMutation.isPending ||
    createSplitTimesMutation.isPending ||
    replaceSplitTimesMutation.isPending;

  // 大会タブモーダル一括保存（ダッシュボードと共通ロジック）
  const handleCompetitionTabSave = useCompetitionTabSave({
    supabase,
    user,
    styles: storeStyles.length > 0 ? storeStyles : styles,
    createCompetition: async (competition) => createCompetitionMutation.mutateAsync(competition),
    updateCompetition: async (id, updates) => updateCompetitionMutation.mutateAsync({ id, updates }),
    createRecord: async (record) => createRecordMutation.mutateAsync(record),
    updateRecord: async (id, updates) => updateRecordMutation.mutateAsync({ id, updates }),
    deleteRecord: async (id) => deleteRecordMutation.mutateAsync(id),
    deleteEntry: async (id) => {
      const entryAPI = new EntryAPI(supabase);
      await entryAPI.deleteEntry(id);
    },
    createSplitTimes: async (params) => createSplitTimesMutation.mutateAsync(params),
    replaceSplitTimes: async (params) => replaceSplitTimesMutation.mutateAsync(params),
    setCompetitionLoading: setTabLoading,
    setEditingCompetitionId,
    setCreatedEntries,
    closeCompetitionTabModal,
    onSaved: () => {
      setModalNonce((n) => n + 1);
      setEntryOnlyRefreshKey((n) => n + 1);
      refetch();
    },
  });

  const buildCompetitionEditingData = (
    competitionId: string,
    competition:
      | {
          date: string;
          title?: string | null;
          place?: string | null;
          pool_type?: number | null;
        }
      | undefined,
    images?: GalleryImage[],
  ): EditingData =>
    ({
      id: competitionId,
      type: "competition",
      date: competition?.date || "",
      title: competition?.title || "",
      place: competition?.place || "",
      pool_type: competition?.pool_type ?? undefined,
      editData: images ? { images } : undefined,
    }) as EditingData;

  // 大会情報を編集（CompetitionTabModal の competition タブを開く）
  const handleEditCompetition = (images?: GalleryImage[]) => {
    if (!selection) return;
    const competition =
      selection.mode === "record" ? (selection.record.competition as Competition) : undefined;
    const competitionId =
      selection.mode === "record" ? selection.record.competition_id : selection.item.competitionId;
    const date =
      selection.mode === "record" ? competition?.date : selection.item.date;
    if (!competitionId || !date) return;
    const dateObj = startOfDay(parseISO(date));
    openCompetitionTabModal(
      dateObj,
      buildCompetitionEditingData(
        competitionId,
        selection.mode === "record"
          ? competition
          : {
              date: selection.item.date,
              title: selection.item.competitionName,
              place: selection.item.place,
              pool_type: selection.item.poolType,
            },
        images,
      ),
      "competition",
    );
  };

  // 記録タブを開く（追加・編集共通。CompetitionTabModal 側が competitionId から既存記録を再取得する）
  const handleOpenRecordTab = () => {
    if (!selection) return;
    const competitionId =
      selection.mode === "record" ? selection.record.competition_id : selection.item.competitionId;
    const date = selection.mode === "record" ? selection.record.competition?.date : selection.item.date;
    if (!competitionId || !date) return;
    const dateObj = startOfDay(parseISO(date));
    openCompetitionTabModal(
      dateObj,
      buildCompetitionEditingData(
        competitionId,
        selection.mode === "record"
          ? (selection.record.competition as Competition)
          : {
              date: selection.item.date,
              title: selection.item.competitionName,
              place: selection.item.place,
              pool_type: selection.item.poolType,
            },
      ),
      "record",
    );
  };

  // エントリータブを開く（entry モードのみ）
  const handleOpenEntryTab = () => {
    if (!selection || selection.mode !== "entry") return;
    const { item } = selection;
    const dateObj = startOfDay(parseISO(item.date));
    openCompetitionTabModal(
      dateObj,
      buildCompetitionEditingData(item.competitionId, {
        date: item.date,
        title: item.competitionName,
        place: item.place,
        pool_type: item.poolType,
      }),
      "entry",
    );
  };

  // 大会全体の削除（DeleteConfirmModal 経由で呼ばれる）
  const handleDeleteCompetition = async () => {
    if (!selection) return;
    const competitionId =
      selection.mode === "record" ? selection.record.competition_id : selection.item.competitionId;
    if (!competitionId) return;
    try {
      await deleteCompetitionMutation.mutateAsync(competitionId);
      setSelection(null);
      setEntryOnlyRefreshKey((n) => n + 1);
      await refetch();
    } catch (err) {
      console.error("大会の削除に失敗しました:", err);
    }
  };

  // 個別の大会記録削除（即時削除・確認なし。ダッシュボードと同じ挙動）
  const handleDeleteRecord = async (recordId: string) => {
    try {
      await deleteRecordMutation.mutateAsync(recordId);
      setModalNonce((n) => n + 1);
      setEntryOnlyRefreshKey((n) => n + 1);
      await refetch();
    } catch (err) {
      console.error("大会記録の削除に失敗しました:", err);
    }
  };

  // エントリー削除（DeleteConfirmModal 経由で呼ばれる。entry モードのみ）
  const handleDeleteEntry = async (entryId: string) => {
    try {
      const entryAPI = new EntryAPI(supabase);
      await entryAPI.deleteEntry(entryId);
      setSelection(null);
      setEntryOnlyRefreshKey((n) => n + 1);
    } catch (err) {
      console.error("エントリーの削除に失敗しました:", err);
    }
  };

  if (loading || isAnyMutating) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">{t("header.title")}</h1>
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

  const errorMessage =
    error?.message ||
    createRecordMutation.error?.message ||
    updateRecordMutation.error?.message ||
    deleteRecordMutation.error?.message ||
    createCompetitionMutation.error?.message ||
    deleteCompetitionMutation.error?.message ||
    replaceSplitTimesMutation.error?.message;

  if (errorMessage && !loading) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">{t("header.title")}</h1>
          <div className="text-red-600">{t("error")}: {errorMessage}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="hidden lg:block bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">{t("header.title")}</h1>
            <p className="text-gray-600">{t("header.description")}</p>
          </div>
        </div>
      </div>

      {/* エントリー済み（記録未登録）セクション（V-W-C05） */}
      {entryOnlyItems.length > 0 && (
        <div className="bg-white rounded-lg shadow p-4 sm:p-6">
          <h2 className="text-sm font-semibold text-violet-800 mb-3">
            {tDash("entry.enteredNoRecord")}
          </h2>
          <div className="space-y-2">
            {entryOnlyItems.map((item) => (
              <div
                key={item.entryId}
                className="flex items-center justify-between gap-3 px-3 py-2 rounded-md border border-violet-200 bg-violet-50 hover:bg-violet-100 cursor-pointer"
                onClick={() => handleViewEntryOnly(item)}
                tabIndex={0}
                role="button"
                aria-label={t("client.viewDetailAriaLabel")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleViewEntryOnly(item);
                  }
                }}
              >
                <div className="min-w-0 flex items-center gap-3 text-sm text-gray-800">
                  <span className="shrink-0 text-gray-600">
                    {item.date && isValidDate(item.date)
                      ? format(new Date(item.date), "MM/dd", { locale: ja })
                      : "-"}
                  </span>
                  <span className="truncate font-medium">{item.competitionName}</span>
                  {item.place && <span className="shrink-0 text-gray-500">{item.place}</span>}
                  <span className="shrink-0 text-gray-700">{item.styleName}</span>
                </div>
                <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-violet-200 text-violet-800">
                  {tDash("entry.entered")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 大会記録一覧（全幅カード + ボトムシート）。
          スマホ幅はページラッパー(DashboardLayout)が既に px-0 のため、
          角丸を落として画面端まで貼り付ける(sm以上は従来の rounded-lg inset 見た目) */}
      <div className="bg-white rounded-none sm:rounded-lg shadow">
        {displayRecords.length === 0 ? (
          <div className="p-12 text-center">
            <TrophyIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">{t("empty.noRecordsTitle")}</h3>
            <p className="mt-1 text-sm text-gray-500">{t("empty.noRecordsDesc")}</p>
          </div>
        ) : sortedRecords.length === 0 ? (
          <div className="p-12 text-center">
            <TrophyIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">{t("empty.noMatchTitle")}</h3>
            <p className="mt-1 text-sm text-gray-500">
              {t("empty.noMatchDesc")}
            </p>
            <div className="mt-6">
              <Button variant="outline" onClick={handleResetAllFilters} className="text-sm">
                {t("filter.resetButton")}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <ListToolbar
              itemCount={sortedRecords.length}
              onSortClick={openSortSheet}
              onFilterClick={openFilterSheet}
              activeFilterCount={activeFilterCount}
            />

            <div className="space-y-2 sm:space-y-3 px-0 sm:px-6 pb-4">
              {visibleRecords.map((record: Record) => (
                <CompetitionRecordCard key={record.id} record={record} onClick={handleRowClick} />
              ))}
            </div>

            {sortedRecords.length > displayCount && (
              <div className="px-4 sm:px-6 pb-6 flex flex-col items-center gap-1">
                <Button variant="outline" onClick={handleLoadMore}>
                  {tCommon("loadMore.button")}
                </Button>
                <span className="text-xs text-gray-500">
                  {tCommon("loadMore.remaining", { n: sortedRecords.length - displayCount })}
                </span>
              </div>
            )}
          </>
        )}
      </div>

      {/* 並べ替えボトムシート */}
      <SortBottomSheet<CompetitionSortColumn>
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

      {/* 詳細モーダル（dashboard の CompetitionDetails / CompetitionWithEntry / AttendanceModal / DeleteConfirmModal を再利用） */}
      {selection && (
        <CompetitionDetailModal
          key={
            selection.mode === "record"
              ? `record-${selection.record.competition_id}-${modalNonce}`
              : `entry-${selection.item.entryId}-${modalNonce}`
          }
          isOpen={!!selection}
          onClose={handleCloseDetailModal}
          mode={selection.mode}
          competitionId={
            selection.mode === "record"
              ? selection.record.competition_id || ""
              : selection.item.competitionId
          }
          competitionName={
            selection.mode === "record"
              ? (selection.record.competition as Competition)?.title || undefined
              : selection.item.competitionName
          }
          date={
            selection.mode === "record"
              ? (selection.record.competition as Competition)?.date || ""
              : selection.item.date
          }
          place={
            selection.mode === "record"
              ? (selection.record.competition as Competition)?.place || undefined
              : selection.item.place
          }
          poolType={
            selection.mode === "record"
              ? (selection.record.competition as Competition)?.pool_type
              : selection.item.poolType
          }
          isTeamCompetition={
            selection.mode === "record"
              ? (selection.record.competition as Competition)?.team_id != null
              : selection.item.isTeamCompetition
          }
          teamId={
            selection.mode === "record"
              ? (selection.record.competition as Competition)?.team_id
              : selection.item.teamId
          }
          teamName={selection.mode === "entry" ? selection.item.teamName : undefined}
          entryId={selection.mode === "entry" ? selection.item.entryId : undefined}
          styleId={selection.mode === "entry" ? selection.item.styleId : undefined}
          styleName={selection.mode === "entry" ? selection.item.styleName : undefined}
          entryTime={selection.mode === "entry" ? selection.item.entryTime : undefined}
          onEditCompetition={handleEditCompetition}
          onDeleteCompetition={handleDeleteCompetition}
          onOpenRecordTab={handleOpenRecordTab}
          onOpenEntryTab={handleOpenEntryTab}
          onDeleteRecord={handleDeleteRecord}
          onDeleteEntry={handleDeleteEntry}
        />
      )}

      {/* タブモーダル: 大会 (dashboard と同じ CompetitionTabModal) */}
      <CompetitionTabModal
        isOpen={isCompetitionTabModalOpen}
        onClose={closeCompetitionTabModal}
        onSave={handleCompetitionTabSave}
        selectedDate={tabSelectedDate || new Date()}
        editingData={tabEditingData}
        editingCompetitionId={editingCompetitionId}
        styles={(storeStyles.length > 0 ? storeStyles : styles).map((s) => ({
          id: s.id.toString(),
          nameJp: s.name_jp,
          distance: s.distance,
        }))}
        existingEntries={getEntryDataListForRecord(tabEditingData, createdEntries)}
        isLoading={isTabLoading}
        initialTab={competitionActiveTab}
        entryLocked={entryLocked}
      />

      {/* 大会未紐付けレコード(一括ベストタイム入力等)の単体詳細モーダル */}
      {standaloneRecord && (
        <RecordDetailModal
          key={`standalone-${standaloneRecord.id}-${modalNonce}`}
          isOpen={!!standaloneRecord}
          onClose={() => setStandaloneRecord(null)}
          record={standaloneRecord}
          onEdit={handleEditStandaloneRecord}
          onDelete={handleDeleteStandaloneRecord}
        />
      )}

      {/* 大会未紐付けレコードの単体編集フォーム（CompetitionTabModal は大会本体が無いため使えない） */}
      <RecordLogForm
        isOpen={!!standaloneEditRecord}
        onClose={handleCloseStandaloneEditForm}
        onSubmit={handleStandaloneRecordSubmit}
        competitionId=""
        editData={
          standaloneEditRecord
            ? {
                id: standaloneEditRecord.id,
                styleId: standaloneEditRecord.style_id,
                time: standaloneEditRecord.time,
                isRelaying: standaloneEditRecord.is_relaying,
                splitTimes: standaloneEditRecord.split_times?.map((st) => ({
                  distance: st.distance,
                  splitTime: st.split_time,
                })),
                note: standaloneEditRecord.note ?? undefined,
                videoPath: standaloneEditRecord.video_path ?? undefined,
                reactionTime: standaloneEditRecord.reaction_time ?? undefined,
              }
            : null
        }
        isLoading={updateRecordMutation.isPending || replaceSplitTimesMutation.isPending}
        styles={(storeStyles.length > 0 ? storeStyles : styles).map((style) => ({
          id: style.id.toString(),
          nameJp: style.name_jp,
          distance: style.distance,
        }))}
      />
    </div>
  );
}

function isValidDate(dateStr: string): boolean {
  const d = new Date(dateStr);
  return !Number.isNaN(d.getTime());
}
