// =============================================================================
// DayDetailModal 用の編集/削除/追加ハンドラ共通フック
// =============================================================================
// ダッシュボード（正）・練習履歴タブ・大会記録履歴タブの3画面で DayDetailModal の
// 挙動（編集導線・削除確認）を完全に一致させるため、ハンドラ群をここに集約する。
// 個人フローは常に PracticeTabForm / CompetitionTabForm へ統一し、削除確認は
// Platform.OS による出し分けをせず Alert.alert に統一する（team_id 分岐は持ち込まない）。

import { useState } from "react";
import { Alert, Platform } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { format as formatDate } from "date-fns";
import { useTranslation } from "react-i18next";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useUserQuery } from "@apps/shared/hooks/queries/user";
import { useDeletePracticeMutation, usePracticesQuery } from "@apps/shared/hooks/queries/practices";
import {
  useDeleteRecordMutation,
  useDeleteCompetitionMutation,
} from "@apps/shared/hooks/queries/records";
import { PracticeAPI } from "@apps/shared/api/practices";
import { RecordAPI } from "@apps/shared/api/records";
import { useIOSCalendarSync } from "@/hooks/useIOSCalendarSync";
import type { MainStackParamList } from "@/navigation/types";
import type { CalendarItem } from "@apps/shared/types/ui";

type NavigationProp = NativeStackNavigationProp<MainStackParamList>;

export interface UseDayDetailHandlersReturn {
  isDeleting: boolean;
  setIsDeleting: (value: boolean) => void;
  handleEntryPress: (item: CalendarItem) => void;
  handleAddPractice: (date: Date) => void;
  handleAddRecord: (dateOrCompetitionId: Date | string, dateParam?: string) => void;
  handleEditPractice: (item: CalendarItem) => void;
  handleDeletePractice: (itemId: string) => Promise<void>;
  handleAddPracticeLog: (practiceId: string) => void;
  handleEditPracticeLog: (item: CalendarItem) => void;
  handleDeletePracticeLog: (logId: string) => Promise<void>;
  handleEditRecord: (item: CalendarItem) => void;
  handleDeleteRecord: (recordId: string) => Promise<void>;
  handleEditEntry: (item: CalendarItem) => void;
  handleDeleteEntry: (entryId: string) => Promise<void>;
  handleAddEntry: (competitionId: string, date: string) => void;
  handleEditCompetition: (item: CalendarItem) => void;
  handleDeleteCompetition: (competitionId: string, isTeamCompetition: boolean) => Promise<void>;
}

/**
 * DayDetailModal の編集/削除/追加ハンドラをまとめて提供する
 * refetch は削除・変更後に呼び出し元の一覧（カレンダー/練習一覧/記録一覧）を
 * 再取得するためのコールバック
 */
export function useDayDetailHandlers(
  supabase: SupabaseClient,
  refetch: () => void,
): UseDayDetailHandlersReturn {
  const navigation = useNavigation<NavigationProp>();
  const { t } = useTranslation();
  const [isDeleting, setIsDeleting] = useState(false);

  // ユーザープロフィール取得（iOSカレンダー設定確認用）
  const { profile } = useUserQuery(supabase, { enableRealtime: false });

  // iOSカレンダー同期フック
  const { syncPractice, syncCompetition } = useIOSCalendarSync();

  // 練習データ取得（削除時のiOSカレンダー同期用）
  const { data: practices = [] } = usePracticesQuery(supabase, {
    page: 1,
    pageSize: 1000,
    enableRealtime: false,
  });

  // エントリータップ
  // 到達するのはエントリー/記録が紐づかない裸の大会アイテム(competition/team_competition)のみ
  // (practice/practice_log/record/entry は DayDetailModal 内の各コンポーネントで
  // 編集/削除が完結しており onEntryPress を経由しない)。
  // 大会の詳細画面は未実装のため、現状は no-op
  // TODO: CompetitionDetail画面を実装したら追加
  const handleEntryPress = (_item: CalendarItem) => {};

  // 練習追加（個人フロー → タブ統合画面）
  const handleAddPractice = (date: Date) => {
    const dateParam = formatDate(date, "yyyy-MM-dd");
    navigation.navigate("PracticeTabForm", { date: dateParam });
  };

  // 大会記録追加（個人フロー → タブ統合画面）
  const handleAddRecord = (dateOrCompetitionId: Date | string, dateParam?: string) => {
    // EntryDetailから呼ばれた場合（competitionIdとdateが渡される）
    if (typeof dateOrCompetitionId === "string" && dateParam) {
      navigation.navigate("CompetitionTabForm", {
        competitionId: dateOrCompetitionId,
        date: dateParam,
        initialTab: "record",
      });
    } else if (dateOrCompetitionId instanceof Date) {
      // 通常の呼び出し（dateのみ）
      const formattedDate = formatDate(dateOrCompetitionId, "yyyy-MM-dd");
      navigation.navigate("CompetitionTabForm", { date: formattedDate });
    }
  };

  // 練習編集（個人フロー → タブ統合画面）
  const handleEditPractice = (item: CalendarItem) => {
    const practiceId = item.metadata?.practice_id || item.id;
    const dateParam = item.date;
    navigation.navigate("PracticeTabForm", { practiceId, date: dateParam });
  };

  // 練習削除
  const deleteMutation = useDeletePracticeMutation(supabase);
  const handleDeletePractice = async (itemId: string) => {
    Alert.alert(
      t("dashboard.mobile.deletePracticeConfirmTitle"),
      t("dashboard.mobile.deletePracticeConfirmMessage"),
      [
        {
          text: t("common.cancel"),
          style: "cancel",
        },
        {
          text: t("dashboard.mobile.deleteButton"),
          style: "destructive",
          onPress: async () => {
            setIsDeleting(true);
            try {
              // iOSカレンダーから削除（iOS端末かつ連携が有効な場合）
              // カレンダー同期エラーはDB削除をブロックしないようにする
              if (
                Platform.OS === "ios" &&
                profile?.ios_calendar_enabled &&
                profile?.ios_calendar_sync_practices
              ) {
                const practiceToDelete = practices.find((p) => p.id === itemId);
                if (practiceToDelete) {
                  try {
                    await syncPractice(practiceToDelete, "delete");
                  } catch (syncError) {
                    console.warn("カレンダー同期エラー:", syncError);
                    // カレンダー同期失敗はDB削除に影響しない
                  }
                }
              }

              await deleteMutation.mutateAsync(itemId);
              refetch();
            } catch (error) {
              console.error("削除エラー:", error);
              Alert.alert(
                t("common.error"),
                error instanceof Error ? error.message : t("dashboard.mobile.deleteFailed"),
                [{ text: "OK" }],
              );
            } finally {
              setIsDeleting(false);
            }
          },
        },
      ],
    );
  };

  // 練習ログ追加（個人フロー → タブ統合画面のログタブへ）
  const handleAddPracticeLog = (practiceId: string) => {
    navigation.navigate("PracticeTabForm", { practiceId, initialTab: "log" });
  };

  // 練習ログ編集（個人フロー → タブ統合画面のログタブへ）
  const handleEditPracticeLog = (item: CalendarItem) => {
    const practiceId = item.metadata?.practice_id || item.metadata?.practice?.id;
    if (practiceId) {
      navigation.navigate("PracticeTabForm", { practiceId, initialTab: "log" });
    }
  };

  // 練習ログ削除
  const handleDeletePracticeLog = async (logId: string) => {
    Alert.alert(
      t("dashboard.mobile.deletePracticeConfirmTitle"),
      t("dashboard.mobile.deleteMenuConfirmMessage"),
      [
        {
          text: t("common.cancel"),
          style: "cancel",
        },
        {
          text: t("dashboard.mobile.deleteButton"),
          style: "destructive",
          onPress: async () => {
            setIsDeleting(true);
            try {
              const api = new PracticeAPI(supabase);
              await api.deletePracticeLog(logId);
              refetch();
            } catch (error) {
              console.error("削除エラー:", error);
              Alert.alert(
                t("common.error"),
                error instanceof Error ? error.message : t("dashboard.mobile.deleteFailed"),
                [{ text: "OK" }],
              );
            } finally {
              setIsDeleting(false);
            }
          },
        },
      ],
    );
  };

  // 記録編集（個人フロー → タブ統合画面のレコードタブへ）
  // team_id の有無に関わらず常に CompetitionTabForm(initialTab:"record") へ統一する
  const handleEditRecord = (item: CalendarItem) => {
    const competitionId = item.metadata?.competition?.id || item.metadata?.record?.competition_id;

    if (!competitionId) {
      Alert.alert(t("common.error"), t("dashboard.mobile.competitionNotFound"));
      return;
    }

    navigation.navigate("CompetitionTabForm", {
      competitionId,
      date: item.date,
      initialTab: "record",
    });
  };

  // 記録削除
  const deleteRecordMutation = useDeleteRecordMutation(supabase);
  const handleDeleteRecord = async (recordId: string) => {
    Alert.alert(
      t("dashboard.mobile.deletePracticeConfirmTitle"),
      t("dashboard.mobile.deleteRecordConfirmMessage"),
      [
        {
          text: t("common.cancel"),
          style: "cancel",
        },
        {
          text: t("dashboard.mobile.deleteButton"),
          style: "destructive",
          onPress: async () => {
            setIsDeleting(true);
            try {
              await deleteRecordMutation.mutateAsync(recordId);
              refetch();
            } catch (error) {
              console.error("削除エラー:", error);
              Alert.alert(
                t("common.error"),
                error instanceof Error ? error.message : t("dashboard.mobile.deleteFailed"),
                [{ text: "OK" }],
              );
            } finally {
              setIsDeleting(false);
            }
          },
        },
      ],
    );
  };

  // エントリー編集（個人フロー → タブ統合画面のエントリータブへ）
  const handleEditEntry = (item: CalendarItem) => {
    const competitionId = item.metadata?.entry?.competition_id || item.metadata?.competition?.id;
    const dateParam = item.date;

    if (competitionId) {
      navigation.navigate("CompetitionTabForm", {
        competitionId,
        date: dateParam,
        initialTab: "entry",
      });
    }
  };

  // 大会エントリー追加（個人フロー → タブ統合画面、isEntryTabVisible に従いタブ決定）
  const handleAddEntry = (competitionId: string, date: string) => {
    navigation.navigate("CompetitionTabForm", {
      competitionId,
      date,
      initialTab: "entry",
    });
  };

  // エントリー削除
  // EntryDetail内で削除確認と削除処理が完結しているため、
  // ここでは削除成功後に一覧をリフレッシュするだけ
  const handleDeleteEntry = async (_entryId: string) => {
    refetch();
  };

  // 大会編集（個人フロー → タブ統合画面）
  const handleEditCompetition = (item: CalendarItem) => {
    const competitionId = item.metadata?.competition?.id || item.id;
    const dateParam = item.date;
    navigation.navigate("CompetitionTabForm", {
      competitionId,
      date: dateParam,
    });
  };

  // 大会削除
  const deleteCompetitionMutation = useDeleteCompetitionMutation(supabase);
  const handleDeleteCompetition = async (competitionId: string, isTeamCompetition: boolean) => {
    let confirmMessage = t("dashboard.mobile.deleteCompetitionConfirmMessage");

    // records が削除されるのは個人大会のみ（チーム大会は削除されない）。
    // チーム大会では誤情報になるため件数フェッチ自体を行わない。
    if (!isTeamCompetition) {
      try {
        const recordCount = await new RecordAPI(supabase).countRecordsByCompetition(competitionId);
        if (recordCount > 0) {
          confirmMessage = `${confirmMessage}\n${t(
            "dashboard.deleteConfirm.competitionRecordsWarning",
            { count: recordCount },
          )}`;
        }
      } catch (error) {
        console.warn("記録件数の取得エラー:", error);
        // 件数取得の失敗は非致命。既存の汎用文言のみで削除確認を継続する。
      }
    }

    Alert.alert(
      t("dashboard.mobile.deletePracticeConfirmTitle"),
      confirmMessage,
      [
        {
          text: t("common.cancel"),
          style: "cancel",
        },
        {
          text: t("dashboard.mobile.deleteButton"),
          style: "destructive",
          onPress: async () => {
            setIsDeleting(true);
            try {
              // iOSカレンダーから削除（iOS端末かつ連携が有効な場合）
              // カレンダー同期エラーはDB削除をブロックしないようにする
              if (
                Platform.OS === "ios" &&
                profile?.ios_calendar_enabled &&
                profile?.ios_calendar_sync_competitions
              ) {
                // 大会データを取得してiOSカレンダーから削除
                try {
                  const { data: competitionToDelete } = await supabase
                    .from("competitions")
                    .select("*")
                    .eq("id", competitionId)
                    .single();
                  if (competitionToDelete) {
                    await syncCompetition(competitionToDelete, "delete");
                  }
                } catch (syncError) {
                  console.warn("カレンダー同期エラー:", syncError);
                  // カレンダー同期失敗はDB削除に影響しない
                }
              }

              await deleteCompetitionMutation.mutateAsync(competitionId);
              refetch();
            } catch (error) {
              console.error("削除エラー:", error);
              Alert.alert(
                t("common.error"),
                error instanceof Error ? error.message : t("dashboard.mobile.deleteFailed"),
                [{ text: "OK" }],
              );
            } finally {
              setIsDeleting(false);
            }
          },
        },
      ],
    );
  };

  return {
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
  };
}

