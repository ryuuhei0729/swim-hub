// =============================================================================
// カレンダーイベントハンドラー用カスタムフック
// =============================================================================

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
import { useCallback } from "react";
import { useTranslations } from "next-intl";
import type { PracticeTabId, CompetitionTabId } from "@/stores/types";
import { isDateTodayOrPast } from "@/utils/tabModalUtils";

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
  handleDeleteItem,
  refreshCalendar,
}: UseCalendarHandlersProps) {
  const t = useTranslations("dashboard.entry");
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

      if (item.type === "practice" || item.type === "team_practice") {
        // 練習編集時は実データ（タイトル・場所・メモ・画像）を practices から取得する。
        // カレンダー表示用の item.title は practice_log 由来の自動要約（例: "100m × 4本"）や
        // COALESCE の "練習" の場合があるため、編集フォームには使わず DB の実値を用いる。
        let editingData: EditingData = item as EditingData;
        if (item.id) {
          try {
            const { data: practiceData } = await supabase
              .from("practices")
              .select("date, title, place, note, image_paths")
              .eq("id", item.id)
              .single();

            const practice = practiceData as {
              date?: string | null;
              title?: string | null;
              place?: string | null;
              note?: string | null;
              image_paths?: string[] | null;
            } | null;

            if (practice) {
              const imagePaths = Array.isArray(practice.image_paths) ? practice.image_paths : [];
              const formattedImages = imagePaths.map((path, index) => ({
                id: path,
                thumbnailUrl: supabase.storage.from("practice-images").getPublicUrl(path).data
                  .publicUrl,
                originalUrl: supabase.storage.from("practice-images").getPublicUrl(path).data
                  .publicUrl,
                fileName: path.split("/").pop() || `image-${index}`,
              }));

              editingData = {
                id: item.id,
                type: "practice",
                date: practice.date || item.date,
                title: practice.title || "",
                place: practice.place || "",
                note: practice.note || "",
                ...(formattedImages.length > 0 ? { images: formattedImages } : {}),
              } as EditingData;
            }
          } catch (error) {
            console.error("練習情報の取得エラー:", error);
          }
        }
        openPracticeTabModal(dateObj, editingData);
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

        if (practiceId) {
          try {
            const { data: practiceRow } = await supabase
              .from("practices")
              .select("id, date, title, place, note, image_paths")
              .eq("id", practiceId)
              .single();

            if (practiceRow) {
              const pRow = practiceRow as {
                id: string;
                date: string;
                title?: string | null;
                place?: string | null;
                note?: string | null;
                image_paths?: string[] | null;
              };
              const practiceDate = parseDateString(pRow.date);

              const imagePaths = Array.isArray(pRow.image_paths) ? pRow.image_paths : [];
              const formattedImages = imagePaths.map((path: string, index: number) => ({
                id: path,
                thumbnailUrl: supabase.storage
                  .from("practice-images")
                  .getPublicUrl(path).data.publicUrl,
                originalUrl: supabase.storage
                  .from("practice-images")
                  .getPublicUrl(path).data.publicUrl,
                fileName: path.split("/").pop() || `image-${index}`,
              }));

              const practiceEditingData: EditingData = {
                id: pRow.id,
                type: "practice",
                date: pRow.date,
                title: pRow.title || "",
                place: pRow.place || "",
                note: pRow.note || "",
                ...(formattedImages.length > 0 ? { images: formattedImages } : {}),
              } as EditingData;

              openPracticeTabModal(practiceDate, practiceEditingData, "practiceLog");
              return;
            }
          } catch (error) {
            console.error("練習情報の取得エラー:", error);
          }
        }
        // practiceId取得失敗時はフォールバック: 日付のみで練習タブモーダルを開く
        openPracticeTabModal(dateObj, undefined, "practiceLog");
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

            try {
              const { data: competitionData, error: competitionError } = await supabase
                .from("competitions")
                .select("entry_status, date, title, place")
                .eq("id", competitionId)
                .single();

              if (!competitionError && competitionData) {
                const cd = competitionData as {
                  entry_status?: string | null;
                  date?: string | null;
                  title?: string | null;
                  place?: string | null;
                };
                fetched = true;
                status = cd.entry_status || "before";
                dateStr = cd.date || dateStr;
                title = cd.title || title;
                place = cd.place || place;
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
            } as EditingData;

            openCompetitionTabModal(entryDate, competitionEditingData, "entry");
          }
        }
      } else if (item.type === "competition" || item.type === "team_competition") {
        // 大会編集時は画像情報を取得（image_pathsから）
        let itemWithImages = item;
        if (item.id) {
          try {
            const { data: competitionData } = await supabase
              .from("competitions")
              .select("image_paths")
              .eq("id", item.id)
              .single();

            const competition = competitionData as { image_paths?: string[] | null } | null;
            const imagePaths = competition?.image_paths || [];

            if (imagePaths.length > 0) {
              const formattedImages = imagePaths.map((path, index) => ({
                id: path, // パスをIDとして使用
                thumbnailUrl: supabase.storage.from("competition-images").getPublicUrl(path).data
                  .publicUrl,
                originalUrl: supabase.storage.from("competition-images").getPublicUrl(path).data
                  .publicUrl,
                fileName: path.split("/").pop() || `image-${index}`,
              }));

              // itemに画像情報を追加
              itemWithImages = {
                ...item,
                editData: {
                  ...(item.editData || {}),
                  images: formattedImages,
                },
              };
            }
          } catch (error) {
            console.error("画像情報の取得エラー:", error);
          }
        }
        openCompetitionTabModal(dateObj, itemWithImages as EditingData);
      }
    },
    [parseDateString, openPracticeTabModal, openCompetitionTabModal, supabase, t],
  );

  // アイテム削除ハンドラー（handleDeleteItemを使用）
  const onDeleteItem = useCallback(
    async (itemId: string, itemType?: CalendarItemType) => {
      await handleDeleteItem(itemId, itemType);
    },
    [handleDeleteItem],
  );

  // #13: 既存練習への「練習ログ追加」 → 練習タブモーダル(練習ログタブ)
  const onAddPracticeLog = useCallback(
    async (practiceId: string) => {
      try {
        const { data: practiceRow } = await supabase
          .from("practices")
          .select("id, date, title, place, note")
          .eq("id", practiceId)
          .single();

        if (practiceRow) {
          const pRow = practiceRow as {
            id: string;
            date: string;
            title?: string | null;
            place?: string | null;
            note?: string | null;
          };
          const practiceDate = parseDateString(pRow.date);
          const practiceEditingData: EditingData = {
            id: pRow.id,
            type: "practice",
            date: pRow.date,
            title: pRow.title || "",
            place: pRow.place || "",
            note: pRow.note || "",
          } as EditingData;
          openPracticeTabModal(practiceDate, practiceEditingData, "practiceLog");
          return;
        }
      } catch (error) {
        console.error("練習情報の取得エラー:", error);
      }
      // フォールバック: editingDataなしで練習ログタブを開く
      openPracticeTabModal(undefined, undefined, "practiceLog");
    },
    [supabase, parseDateString, openPracticeTabModal],
  );

  // #14: テンプレートから練習ログ追加 → 練習タブモーダル(練習ログタブ)
  // テンプレート内容は editingData に含めて渡す（タブモーダル側でログ初期値として利用）
  const onAddPracticeLogFromTemplate = useCallback(
    async (practiceId: string, template: PracticeLogTemplate) => {
      try {
        const { data: practiceRow } = await supabase
          .from("practices")
          .select("id, date, title, place, note")
          .eq("id", practiceId)
          .single();

        if (practiceRow) {
          const pRow = practiceRow as {
            id: string;
            date: string;
            title?: string | null;
            place?: string | null;
            note?: string | null;
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
          } as EditingData;
          openPracticeTabModal(practiceDate, practiceEditingData, "practiceLog");
          return;
        }
      } catch (error) {
        console.error("練習情報の取得エラー:", error);
      }
      // フォールバック
      const editData: EditingData = {
        practiceId,
        style: template.style,
        swim_category: template.swim_category,
        distance: template.distance,
        rep_count: template.rep_count,
        set_count: template.set_count,
        circle: template.circle,
        note: template.note || undefined,
        tag_ids: template.tag_ids,
      };
      openPracticeTabModal(undefined, editData, "practiceLog");
    },
    [supabase, parseDateString, openPracticeTabModal],
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

      if (practiceId) {
        try {
          const { data: practiceRow } = await supabase
            .from("practices")
            .select("id, date, title, place, note")
            .eq("id", practiceId)
            .single();

          if (practiceRow) {
            const pRow = practiceRow as {
              id: string;
              date: string;
              title?: string | null;
              place?: string | null;
              note?: string | null;
            };
            const practiceDate = parseDateString(pRow.date);
            const practiceEditingData: EditingData = {
              id: pRow.id,
              type: "practice",
              date: pRow.date,
              title: pRow.title || "",
              place: pRow.place || "",
              note: pRow.note || "",
            } as EditingData;
            openPracticeTabModal(practiceDate, practiceEditingData, "practiceLog");
            return;
          }
        } catch (error) {
          console.error("練習情報の取得エラー:", error);
        }
      }
      // フォールバック: 日付なしで練習ログタブを開く
      openPracticeTabModal(undefined, undefined, "practiceLog");
    },
    [supabase, parseDateString, openPracticeTabModal],
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

        if (!competitionError && competitionData) {
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
          return;
        }
      } catch (err: unknown) {
        console.error("エントリーステータスの取得エラー:", err);
      }
      // フォールバック: recordタブで大会タブモーダルを開く
      openCompetitionTabModal(undefined, { id: competitionId } as EditingData, "record");
    },
    [openCompetitionTabModal, supabase, parseDateString, t],
  );

  // #15: 記録編集ハンドラー → 大会タブモーダル(recordタブ)
  const onEditRecord = useCallback(
    async (record: RecordForEdit) => {
      const competitionId = record.competition_id ?? undefined;

      if (competitionId) {
        try {
          const { data: competitionRow } = await supabase
            .from("competitions")
            .select("id, date, title, place")
            .eq("id", competitionId)
            .single();

          if (competitionRow) {
            const cr = competitionRow as {
              id: string;
              date: string;
              title?: string | null;
              place?: string | null;
            };
            const compDate = parseDateString(cr.date);
            const competitionEditingData: EditingData = {
              id: cr.id,
              type: "competition",
              date: cr.date,
              title: cr.title || "",
              place: cr.place || "",
            } as EditingData;
            openCompetitionTabModal(compDate, competitionEditingData, "record");
            return;
          }
        } catch (error) {
          console.error("大会情報の取得エラー:", error);
        }
      }

      // フォールバック: competitionIdのみでタブモーダルを開く
      if (competitionId) {
        openCompetitionTabModal(
          undefined,
          { id: competitionId } as EditingData,
          "record",
        );
      } else {
        openCompetitionTabModal(undefined, undefined, "record");
      }
    },
    [supabase, parseDateString, openCompetitionTabModal],
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
