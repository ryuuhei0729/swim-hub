// =============================================================================
// カレンダーイベントハンドラー用カスタムフック
// =============================================================================

"use client";

import type { EditingData, EntryWithStyle } from "@/stores/types";
import type {
  CalendarItemType,
  PracticeLogWithTimes,
  PracticeTag,
  PracticeLogTemplate,
} from "@apps/shared/types";
import type { CalendarItem, EntryInfo, TimeEntry } from "@apps/shared/types/ui";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@swim-hub/shared/types";
import { parseISO, startOfDay } from "date-fns";
import { useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import type { PracticeTabId, CompetitionTabId } from "@/stores/types";
import { isDateTodayOrPast } from "@/utils/tabModalUtils";
import { resolveGalleryImages } from "@/lib/image-url";

// スプリットタイム型（編集時に使用）
export interface RecordSplitTime {
  distance: number;
  split_time: number;
}

// 記録型（編集時に使用）
export interface RecordForEdit {
  id: string;
  style_id: number;
  style?: { id: number };
  time?: number;
  time_result?: number;
  is_relaying?: boolean;
  note?: string | null;
  video_path?: string | null;
  reaction_time?: number | null;
  split_times?: RecordSplitTime[];
  competition_id?: string | null;
}

interface UseCalendarHandlersProps {
  supabase: SupabaseClient<Database>;
  // Form store actions
  openPracticeTabModal: (date?: Date, editData?: EditingData, tab?: PracticeTabId) => void;
  openCompetitionTabModal: (
    date?: Date,
    editData?: EditingData,
    tab?: CompetitionTabId,
    entryLocked?: boolean,
  ) => void;
  openEntryLogForm: (competitionId?: string, editData?: EditingData) => void;
  openRecordLogForm: (
    competitionId: string | undefined,
    entries?: EntryWithStyle[],
    editData?: EditingData,
  ) => void;
  setSelectedDate: (date: Date) => void;
  setEditingData: (data: EditingData | null) => void;
  /** 大会タブモーダル用の editingData 更新（画像解決後の反映に使用） */
  setCompetitionEditingData: (data: EditingData | null) => void;
  handleDeleteItem: (itemId: string, itemType?: CalendarItemType) => Promise<void>;
  refreshCalendar: () => void;
}

/**
 * カレンダーのイベントハンドラーを提供するカスタムフック
 */
export function useCalendarHandlers({
  supabase,
  openPracticeTabModal,
  openCompetitionTabModal,
  setSelectedDate,
  setEditingData,
  setCompetitionEditingData,
  handleDeleteItem,
  refreshCalendar,
}: UseCalendarHandlersProps) {
  const t = useTranslations("dashboard.entry");
  // データ取得失敗時の汎用エラー表示用 (DayDetailModal.tsx と同じ dashboard.handlers.dataLoadError を再利用)
  const tHandlers = useTranslations("dashboard.handlers");
  // 編集クリックごとにインクリメントし、解決済み画像の反映が古いクリックのものなら破棄する
  const editImageRequestIdRef = useRef(0);
  // タイムゾーンを考慮した日付パース
  const parseDateString = useCallback((dateString: string): Date => {
    const parsedDate = parseISO(dateString);
    return startOfDay(parsedDate);
  }, []);

  // 日付クリックハンドラー（現在は未使用）
  const onDateClick = useCallback((_date: Date) => {
    // 必要に応じて実装
  }, []);

  // アイテム追加ハンドラー（CalendarPropsでは'practice' | 'record'のみ受け取る）
  const onAddItem = useCallback(
    (date: Date, type: "practice" | "record") => {
      if (type === "practice") {
        openPracticeTabModal(date);
      } else {
        setSelectedDate(date);
        setEditingData(null);
        openCompetitionTabModal(date);
      }
    },
    [openPracticeTabModal, openCompetitionTabModal, setSelectedDate, setEditingData],
  );

  // アイテム編集ハンドラー
  const onEditItem = useCallback(
    async (item: CalendarItem) => {
      const dateObj = parseDateString(item.date);
      const requestId = ++editImageRequestIdRef.current;

      if (item.type === "practice" || item.type === "team_practice") {
        // 練習編集時は実データ（タイトル・場所・メモ）を practices から取得する。
        // カレンダー表示用の item.title は practice_log 由来の自動要約（例: "100m × 4本"）や
        // COALESCE の "練習" の場合があるため、編集フォームには使わず DB の実値を用いる。
        let editingData: EditingData = item as EditingData;
        let imagePaths: string[] = [];
        let practiceFields: {
          id: string;
          type: "practice";
          date: string;
          title: string;
          place: string;
          note: string;
          team_id: string | null;
        } | null = null;
        if (item.id) {
          try {
            const { data: practiceData } = await supabase
              .from("practices")
              .select("date, title, place, note, image_paths, team_id")
              .eq("id", item.id)
              .single();

            const practice = practiceData as {
              date?: string | null;
              title?: string | null;
              place?: string | null;
              note?: string | null;
              image_paths?: string[] | null;
              team_id?: string | null;
            } | null;

            if (practice) {
              imagePaths = Array.isArray(practice.image_paths) ? practice.image_paths : [];
              practiceFields = {
                id: item.id,
                type: "practice",
                date: practice.date || item.date,
                title: practice.title || "",
                place: practice.place || "",
                note: practice.note || "",
                team_id: practice.team_id ?? null,
              };
              editingData = practiceFields as EditingData;
            }
          } catch (error) {
            console.error("練習情報の取得エラー:", error);
          }
        }
        // 画像の署名URL解決を待たずにモーダルを開き、解決後に editingData へ反映する
        openPracticeTabModal(dateObj, editingData);
        if (practiceFields && imagePaths.length > 0) {
          const baseFields = practiceFields;
          resolveGalleryImages("practice-images", imagePaths).then((formattedImages) => {
            if (editImageRequestIdRef.current !== requestId) return;
            if (formattedImages.length > 0) {
              setEditingData({ ...baseFields, images: formattedImages } as EditingData);
            }
          });
        }
      } else if (item.type === "practice_log") {
        // #7: 練習ログ単体編集 → 親練習のeditingDataで練習タブモーダルを開く
        const practiceId =
          item.metadata?.practice?.id ||
          item.metadata?.practice_id ||
          (item.editData &&
          typeof item.editData === "object" &&
          "practiceId" in item.editData
            ? (item.editData as { practiceId?: string }).practiceId
            : undefined);

        if (!practiceId) {
          // practiceId が最初から特定できていない (対象未特定) → 従来どおり
          // 空のタブを開く (create 相当)。これは正当なケースなので対象外。
          openPracticeTabModal(dateObj, undefined, "practiceLog");
          return;
        }

        // ここから先は対象 (practiceId) は特定済み。取得失敗時に practiceId を捨てて
        // 開くと、無関係な個人練習が新規作成される無言のデータ損失になる
        // (Reviewer 指摘 F8、F6 と同型)。F1(1)/F6 と同じ方針: 取得失敗は
        // 半端な状態で開かずエラーを見せる。
        try {
          const { data: practiceRow, error } = await supabase
            .from("practices")
            .select("id, date, title, place, note, image_paths, team_id")
            .eq("id", practiceId)
            .single();

          if (error || !practiceRow) {
            throw error ?? new Error("practice not found");
          }

          const pRow = practiceRow as {
            id: string;
            date: string;
            title?: string | null;
            place?: string | null;
            note?: string | null;
            image_paths?: string[] | null;
            team_id?: string | null;
          };
          const practiceDate = parseDateString(pRow.date);

          const imagePaths = Array.isArray(pRow.image_paths) ? pRow.image_paths : [];
          const practiceFields = {
            id: pRow.id,
            type: "practice" as const,
            date: pRow.date,
            title: pRow.title || "",
            place: pRow.place || "",
            note: pRow.note || "",
            team_id: pRow.team_id ?? null,
          };

          // 画像の署名URL解決を待たずにモーダルを開き、解決後に editingData へ反映する
          openPracticeTabModal(practiceDate, practiceFields as EditingData, "practiceLog");
          if (imagePaths.length > 0) {
            resolveGalleryImages("practice-images", imagePaths).then((formattedImages) => {
              if (editImageRequestIdRef.current !== requestId) return;
              if (formattedImages.length > 0) {
                setEditingData({
                  ...practiceFields,
                  images: formattedImages,
                } as EditingData);
              }
            });
          }
        } catch (error) {
          console.error("練習情報の取得エラー:", error);
          window.alert(tHandlers("dataLoadError"));
        }
      } else if (item.type === "entry") {
        // editDataからcompetitionIdを取得（DayDetailModalから渡される場合）
        let competitionId: string | undefined;
        let isTeamCompetition = false;

        if (item.editData && typeof item.editData === "object") {
          // editDataが存在する場合、そこからcompetitionIdを取得
          if ("competitionId" in item.editData) {
            competitionId = item.editData.competitionId as string;
          }
          // competitionオブジェクトからteam_idを取得
          if ("competition" in item.editData && item.editData.competition) {
            const competition = item.editData.competition as { team_id?: string | null };
            isTeamCompetition = !!competition.team_id;
          }
        }

        // フォールバック: metadataから取得
        if (!competitionId) {
          competitionId = item.metadata?.entry?.competition_id || item.metadata?.competition?.id;
        }

        // チームcompetitionかどうかを判定
        if (!isTeamCompetition) {
          isTeamCompetition = !!item.metadata?.team_id;
        }

        if (competitionId) {
          // チームcompetitionのエントリー編集: タブモーダルに移行。
          // entry_status が open でない場合はエントリータブをロックし記録入力のみ許可する。
          if (isTeamCompetition) {
            const competitionMeta = item.metadata?.competition;
            let fetched = false;
            let status = "before";
            let dateStr = competitionMeta?.date || item.date;
            let title = competitionMeta?.title || item.title || "";
            let place = competitionMeta?.place || "";
            let poolType = competitionMeta?.pool_type;
            // isTeamCompetition === true 判定済みだが、実際の team_id 値は
            // editingData 経由で allowParentUpdate 判定に使うため別途保持する
            let teamId: string | null = competitionMeta?.team_id ?? null;

            try {
              const { data: competitionData, error: competitionError } = await supabase
                .from("competitions")
                .select("entry_status, date, title, place, pool_type, team_id")
                .eq("id", competitionId)
                .single();

              if (!competitionError && competitionData) {
                const cd = competitionData as {
                  entry_status?: string | null;
                  date?: string | null;
                  title?: string | null;
                  place?: string | null;
                  pool_type?: number | null;
                  team_id?: string | null;
                };
                fetched = true;
                status = cd.entry_status || "before";
                dateStr = cd.date || dateStr;
                title = cd.title || title;
                place = cd.place || place;
                poolType = cd.pool_type ?? poolType;
                teamId = cd.team_id ?? teamId;
              }
            } catch (err: unknown) {
              console.error("エントリーステータスの取得エラー:", err);
            }

            const entryDate = dateStr ? parseDateString(dateStr) : dateObj;
            const competitionEditingData: EditingData = {
              id: competitionId,
              type: "competition",
              date: dateStr,
              title,
              place,
              pool_type: poolType,
              team_id: teamId,
            } as EditingData;

            // フェッチ失敗時は従来どおりエントリー編集を許可する
            const entryOpen = !fetched || status === "open";
            if (!entryOpen) {
              // 受付期間外: 通知して記録タブを開き、エントリー編集はロック
              const statusLabel = status === "before" ? t("statusBefore") : t("statusClosed");
              window.alert(t("statusAlert", { status: statusLabel }));
              openCompetitionTabModal(entryDate, competitionEditingData, "record", true);
              return;
            }
            // 受付中: entryタブで大会タブモーダルを開く
            openCompetitionTabModal(entryDate, competitionEditingData, "entry", false);
          } else {
            // #8: 個人competitionのエントリー編集 → 大会タブモーダル(entryタブ)
            const competitionMeta = item.metadata?.competition;
            const entryDate = competitionMeta?.date
              ? parseDateString(competitionMeta.date)
              : dateObj;

            const competitionEditingData: EditingData = {
              id: competitionId,
              type: "competition",
              date: competitionMeta?.date || item.date,
              title: competitionMeta?.title || item.title || "",
              place: competitionMeta?.place || "",
              pool_type: competitionMeta?.pool_type,
              // isTeamCompetition === false 判定済み (個人大会)
              team_id: null,
            } as EditingData;

            openCompetitionTabModal(entryDate, competitionEditingData, "entry");
          }
        }
      } else if (item.type === "competition" || item.type === "team_competition") {
        // 画像の署名URL解決を待たずにモーダルを開き、解決後に editingData へ反映する
        openCompetitionTabModal(dateObj, item as EditingData);
        if (item.id) {
          void (async () => {
            try {
              const { data: competitionData } = await supabase
                .from("competitions")
                .select("image_paths")
                .eq("id", item.id)
                .single();

              const competition = competitionData as { image_paths?: string[] | null } | null;
              const imagePaths = competition?.image_paths || [];
              if (imagePaths.length === 0) return;

              const formattedImages = await resolveGalleryImages("competition-images", imagePaths);
              if (editImageRequestIdRef.current !== requestId) return;
              if (formattedImages.length === 0) return;

              // itemに画像情報を追加してストアの editingData を更新
              setCompetitionEditingData({
                ...item,
                editData: {
                  ...(item.editData || {}),
                  images: formattedImages,
                },
              } as EditingData);
            } catch (error) {
              console.error("画像情報の取得エラー:", error);
            }
          })();
        }
      }
    },
    [
      parseDateString,
      openPracticeTabModal,
      openCompetitionTabModal,
      setEditingData,
      setCompetitionEditingData,
      supabase,
      t,
      tHandlers,
    ],
  );

  // アイテム削除ハンドラー（handleDeleteItemを使用）
  const onDeleteItem = useCallback(
    async (itemId: string, itemType?: CalendarItemType) => {
      await handleDeleteItem(itemId, itemType);
    },
    [handleDeleteItem],
  );

  // #13: 既存練習への「練習ログ追加」 → 練習タブモーダル(練習ログタブ)
  // practiceId は呼び出し元が必ず対象を特定して渡す (省略不可の引数)。
  // 取得失敗時に practiceId を捨てて開くと、無関係な個人練習が新規作成される
  // 無言のデータ損失になる (Reviewer 指摘 F6)。F1(1) と同じ方針: 取得失敗は
  // 半端な状態で開かずエラーを見せる。
  const onAddPracticeLog = useCallback(
    async (practiceId: string) => {
      try {
        const { data: practiceRow, error } = await supabase
          .from("practices")
          .select("id, date, title, place, note, team_id")
          .eq("id", practiceId)
          .single();

        if (error || !practiceRow) {
          throw error ?? new Error("practice not found");
        }

        const pRow = practiceRow as {
          id: string;
          date: string;
          title?: string | null;
          place?: string | null;
          note?: string | null;
          team_id?: string | null;
        };
        const practiceDate = parseDateString(pRow.date);
        const practiceEditingData: EditingData = {
          id: pRow.id,
          type: "practice",
          date: pRow.date,
          title: pRow.title || "",
          place: pRow.place || "",
          note: pRow.note || "",
          team_id: pRow.team_id ?? null,
        } as EditingData;
        openPracticeTabModal(practiceDate, practiceEditingData, "practiceLog");
      } catch (error) {
        console.error("練習情報の取得エラー:", error);
        window.alert(tHandlers("dataLoadError"));
      }
    },
    [supabase, parseDateString, openPracticeTabModal, tHandlers],
  );

  // #14: テンプレートから練習ログ追加 → 練習タブモーダル(練習ログタブ)
  // テンプレート内容は editingData に含めて渡す（タブモーダル側でログ初期値として利用）
  // practiceId は呼び出し元が必ず対象を特定して渡す (省略不可の引数)。取得失敗時に
  // practiceId を捨てて開くと、無関係な個人練習が新規作成される無言のデータ損失に
  // なる (Reviewer 指摘 F6)。F1(1) と同じ方針: 取得失敗は半端な状態で開かずエラーを見せる。
  const onAddPracticeLogFromTemplate = useCallback(
    async (practiceId: string, template: PracticeLogTemplate) => {
      try {
        const { data: practiceRow, error } = await supabase
          .from("practices")
          .select("id, date, title, place, note, team_id")
          .eq("id", practiceId)
          .single();

        if (error || !practiceRow) {
          throw error ?? new Error("practice not found");
        }

        const pRow = practiceRow as {
          id: string;
          date: string;
          title?: string | null;
          place?: string | null;
          note?: string | null;
          team_id?: string | null;
        };
        const practiceDate = parseDateString(pRow.date);
        const practiceEditingData: EditingData = {
          id: pRow.id,
          type: "practice",
          date: pRow.date,
          title: pRow.title || "",
          place: pRow.place || "",
          // テンプレート内容を練習ログ初期値として渡す（noteはテンプレート優先）
          note: template.note || pRow.note || undefined,
          style: template.style,
          swim_category: template.swim_category,
          distance: template.distance,
          rep_count: template.rep_count,
          set_count: template.set_count,
          circle: template.circle,
          tag_ids: template.tag_ids,
          team_id: pRow.team_id ?? null,
        } as EditingData;
        openPracticeTabModal(practiceDate, practiceEditingData, "practiceLog");
      } catch (error) {
        console.error("練習情報の取得エラー:", error);
        window.alert(tHandlers("dataLoadError"));
      }
    },
    [supabase, parseDateString, openPracticeTabModal, tHandlers],
  );

  // 練習ログ編集ハンドラー（DayDetailModal から呼ばれる旧API — onEditItem の practice_log 分岐で代替）
  const onEditPracticeLog = useCallback(
    async (
      log: (PracticeLogWithTimes & { tags?: PracticeTag[] }) & {
        practiceId?: string;
        times?: Array<{ memberId: string; times: TimeEntry[] }> | TimeEntry[];
      },
    ) => {
      const practiceId = log.practice_id || log.practiceId;

      // practiceId が最初から無い (対象未特定) → 従来どおり空のタブを開く (create 相当)。
      // これは正当なケースなので Reviewer 指摘 F6 の対象外。
      if (!practiceId) {
        openPracticeTabModal(undefined, undefined, "practiceLog");
        return;
      }

      // ここから先は対象 (practiceId) は特定済み。取得失敗時に practiceId を捨てて
      // 開くと、無関係な個人練習が新規作成される無言のデータ損失になる
      // (Reviewer 指摘 F6)。F1(1) と同じ方針: 取得失敗は半端な状態で開かずエラーを見せる。
      try {
        const { data: practiceRow, error } = await supabase
          .from("practices")
          .select("id, date, title, place, note, team_id")
          .eq("id", practiceId)
          .single();

        if (error || !practiceRow) {
          throw error ?? new Error("practice not found");
        }

        const pRow = practiceRow as {
          id: string;
          date: string;
          title?: string | null;
          place?: string | null;
          note?: string | null;
          team_id?: string | null;
        };
        const practiceDate = parseDateString(pRow.date);
        const practiceEditingData: EditingData = {
          id: pRow.id,
          type: "practice",
          date: pRow.date,
          title: pRow.title || "",
          place: pRow.place || "",
          note: pRow.note || "",
          team_id: pRow.team_id ?? null,
        } as EditingData;
        openPracticeTabModal(practiceDate, practiceEditingData, "practiceLog");
      } catch (error) {
        console.error("練習情報の取得エラー:", error);
        window.alert(tHandlers("dataLoadError"));
      }
    },
    [supabase, parseDateString, openPracticeTabModal, tHandlers],
  );

  // 練習ログ削除ハンドラー
  const onDeletePracticeLog = useCallback(
    async (logId: string) => {
      try {
        const { error } = await supabase.from("practice_logs").delete().eq("id", logId);

        if (error) throw error;

        refreshCalendar();
      } catch (error) {
        console.error("練習ログの削除に失敗しました:", error);
      }
    },
    [supabase, refreshCalendar],
  );

  // #10/#11: 記録追加ハンドラー
  const onAddRecord = useCallback(
    async (params: {
      competitionId?: string;
      entryData?: EntryInfo;
      entryDataList?: EntryInfo[];
    }) => {
      const { competitionId, entryData, entryDataList } = params;

      if (!competitionId || competitionId.trim() === "") {
        openCompetitionTabModal();
        return;
      }

      // エントリーカードの「大会記録を追加」など、明示的な記録追加操作かどうか。
      // この場合は日付に関わらず個人フローでは record タブを開く。
      const isExplicitAddRecord = (!!entryDataList && entryDataList.length > 0) || !!entryData;

      // 大会情報を取得してチームcompetitionかどうか、日付が過去かどうかをチェック
      try {
        const { data: competitionData, error: competitionError } = await supabase
          .from("competitions")
          .select("entry_status, team_id, date, title, place, pool_type")
          .eq("id", competitionId)
          .single();

        if (competitionError || !competitionData) {
          throw competitionError ?? new Error("competition not found");
        }

        const cd = competitionData as {
          team_id?: string | null;
          date?: string | null;
          title?: string | null;
          place?: string | null;
          pool_type?: number | null;
          entry_status?: string | null;
        };
        const isTeamCompetition = !!cd.team_id;
        const competitionDate = cd.date;

        // 大会のeditingDataを構築（タブモーダルに渡す）
        const competitionEditingData: EditingData = {
          id: competitionId,
          type: "competition",
          date: cd.date || "",
          title: cd.title || "",
          place: cd.place || "",
          pool_type: cd.pool_type,
          team_id: cd.team_id ?? null,
        } as EditingData;

        const compDateObj = competitionDate ? parseDateString(competitionDate) : new Date();

        // チームフロー: タブモーダルに移行。entry_status が open でない場合は
        // エントリータブをロックし、記録入力のみ許可する。
        if (isTeamCompetition) {
          const status = cd.entry_status || "before";
          const entryOpen = status === "open";

          // 受付期間外の通知（旧フローのアラートを踏襲）。
          // 明示的な記録追加・今日/過去の記録入力時は通知しない。
          if (!entryOpen && !isExplicitAddRecord && !isDateTodayOrPast(competitionDate)) {
            const statusLabel = status === "before" ? t("statusBefore") : t("statusClosed");
            window.alert(t("statusAlert", { status: statusLabel }));
          }

          // 明示的な記録追加 / 今日・過去 / 受付期間外 → recordタブ、未来かつ受付中 → entryタブ
          const teamTab: CompetitionTabId =
            isExplicitAddRecord || isDateTodayOrPast(competitionDate) || !entryOpen
              ? "record"
              : "entry";
          openCompetitionTabModal(compDateObj, competitionEditingData, teamTab, !entryOpen);
          return;
        }

        // 個人フロー: 明示的な記録追加 or 今日/過去 → recordタブで大会タブモーダルを開く
        // （エントリー・記録は competitionId から自動取得される）
        if (isExplicitAddRecord || isDateTodayOrPast(competitionDate)) {
          openCompetitionTabModal(compDateObj, competitionEditingData, "record");
          return;
        }

        // #11 個人フロー: 未来大会 → entryタブで大会タブモーダルを開く
        openCompetitionTabModal(compDateObj, competitionEditingData, "entry");
      } catch (err: unknown) {
        console.error("エントリーステータスの取得エラー:", err);
        // Reviewer 指摘 (F1): team_id が不明なまま id だけで開くと、admin が
        // 個人画面からチーム大会の basicData を書き換えられる穴になる
        // (allowParentUpdate の判定が「不明 = 個人」に倒れてしまうため)。
        // mobile の CompetitionTabFormScreen.tsx に倣い、取得失敗時は
        // 半端な状態でモーダルを開かずエラーを見せる。
        window.alert(tHandlers("dataLoadError"));
      }
    },
    [openCompetitionTabModal, supabase, parseDateString, t, tHandlers],
  );

  // #15: 記録編集ハンドラー → 大会タブモーダル(recordタブ)
  const onEditRecord = useCallback(
    async (record: RecordForEdit) => {
      const competitionId = record.competition_id ?? undefined;

      if (!competitionId) {
        // competitionId 自体が無い (紐づく大会不明) → 大会コンテキスト無しで record タブを開く。
        // team_id が絡まないため Reviewer 指摘 F1 の対象外 (更新対象の親行が無い)。
        openCompetitionTabModal(undefined, undefined, "record");
        return;
      }

      try {
        const { data: competitionRow, error } = await supabase
          .from("competitions")
          .select("id, date, title, place, pool_type, team_id")
          .eq("id", competitionId)
          .single();

        if (error || !competitionRow) {
          throw error ?? new Error("competition not found");
        }

        const cr = competitionRow as {
          id: string;
          date: string;
          title?: string | null;
          place?: string | null;
          pool_type?: number | null;
          team_id?: string | null;
        };
        const compDate = parseDateString(cr.date);
        const competitionEditingData: EditingData = {
          id: cr.id,
          type: "competition",
          date: cr.date,
          title: cr.title || "",
          place: cr.place || "",
          pool_type: cr.pool_type,
          team_id: cr.team_id ?? null,
        } as EditingData;
        openCompetitionTabModal(compDate, competitionEditingData, "record");
      } catch (error) {
        console.error("大会情報の取得エラー:", error);
        // Reviewer 指摘 (F1): team_id 不明のまま id だけでモーダルを開かない。
        // mobile の CompetitionTabFormScreen.tsx に倣い、取得失敗時はエラーを見せて終了する。
        window.alert(tHandlers("dataLoadError"));
      }
    },
    [supabase, parseDateString, openCompetitionTabModal, tHandlers],
  );

  // 記録削除ハンドラー
  const onDeleteRecord = useCallback(
    async (recordId: string) => {
      try {
        const { error } = await supabase.from("records").delete().eq("id", recordId);

        if (error) throw error;

        refreshCalendar();
      } catch (error) {
        console.error("大会記録の削除に失敗しました:", error);
      }
    },
    [supabase, refreshCalendar],
  );

  return {
    onDateClick,
    onAddItem: onAddItem as (date: Date, type: CalendarItemType) => void, // 型定義ではCalendarItemType全体を受け取るが、実際は'practice' | 'record'のみ
    onEditItem,
    onDeleteItem,
    onAddPracticeLog,
    onAddPracticeLogFromTemplate,
    onEditPracticeLog,
    onDeletePracticeLog,
    onAddRecord,
    onEditRecord,
    onDeleteRecord,
  };
}
