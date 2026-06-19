import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  TextInput,
  Alert,
  Modal,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "@/contexts/AuthProvider";
import { AttendanceAPI } from "@swim-hub/shared/api/attendance";
import type { TeamAttendanceWithDetails } from "@swim-hub/shared/types/attendance";
import { AttendanceStatus, TeamEvent } from "@swim-hub/shared/types";
import { getMonthDateRange, formatDate, toISODateString } from "@swim-hub/shared/utils/date";
import { startOfMonth, endOfMonth, addMonths, format, parseISO } from "date-fns";
import { sanitizeTextInput } from "@swim-hub/shared/utils/sanitize";
import { useTranslation } from "react-i18next";
import { useDateLocale } from "@/hooks/useDateLocale";

export interface MyMonthlyAttendanceProps {
  teamId: string;
}

interface AttendanceEditState {
  status: AttendanceStatus | null;
  note: string;
}

// 備考の最大文字数（web useAttendanceEdit と統一）
const NOTE_MAX_LENGTH = 500;

// 既存の締切後編集マークを除去するための正規表現
// shared AttendanceAPI.addEditMark / web useAttendanceEdit と同一の挙動（重複付与防止）
const EDIT_MARK_REGEX = /\s*\(\d{2}\/\d{2}\s+\d{2}:\d{2}締切後編集\)/g;

interface MonthItem {
  year: number;
  month: number;
  status: "has_unanswered" | "all_answered" | null;
  eventCount: number;
  answeredCount: number;
}

/**
 * 月別出欠管理コンポーネント（モバイル版）
 */
export const MyMonthlyAttendance: React.FC<MyMonthlyAttendanceProps> = ({ teamId }) => {
  const { supabase } = useAuth();
  const { t } = useTranslation();
  const locale = useDateLocale();
  const attendanceAPI = useMemo(() => new AttendanceAPI(supabase), [supabase]);

  // 月リスト表示用の状態
  const [monthList, setMonthList] = useState<MonthItem[]>([]);
  const [loadingMonthList, setLoadingMonthList] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // モーダル表示用の状態
  const [selectedMonth, setSelectedMonth] = useState<{ year: number; month: number } | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // モーダル内の出欠情報とイベント情報（既存のロジックを再利用）
  const [attendances, setAttendances] = useState<TeamAttendanceWithDetails[]>([]);
  const [events, setEvents] = useState<TeamEvent[]>([]);
  const [loading, setLoading] = useState(false);

  // 編集状態（ローカル）
  const [editStates, setEditStates] = useState<Record<string, AttendanceEditState>>({});
  const [saving, setSaving] = useState(false);

  // 各月のステータスを計算
  const calculateMonthStatus = useCallback(
    async (
      year: number,
      month: number,
    ): Promise<{
      eventCount: number;
      answeredCount: number;
      status: "has_unanswered" | "all_answered" | null;
    }> => {
      const [startDateStr, endDateStr] = getMonthDateRange(year, month);

      // イベントIDを取得
      const [practicesResult, competitionsResult] = await Promise.all([
        supabase
          .from("practices")
          .select("id")
          .eq("team_id", teamId)
          .gte("date", startDateStr)
          .lte("date", endDateStr),
        supabase
          .from("competitions")
          .select("id")
          .eq("team_id", teamId)
          .gte("date", startDateStr)
          .lte("date", endDateStr),
      ]);

      if (practicesResult.error) throw practicesResult.error;
      if (competitionsResult.error) throw competitionsResult.error;

      const practiceIds = (practicesResult.data || []).map((p) => p.id);
      const competitionIds = (competitionsResult.data || []).map((c) => c.id);
      const eventCount = practiceIds.length + competitionIds.length;

      // 自分の出欠回答を取得
      // NOTE: イベント作成時の DB トリガーで status=NULL の未回答レコードが
      // 自動生成されるため、status が設定されたレコードのみを回答済みとみなす。
      const attendanceData = await attendanceAPI.getMyAttendancesByMonth(teamId, year, month);
      const answeredCount = attendanceData.filter((a) => a.status !== null).length;

      const eventIds = new Set([...practiceIds, ...competitionIds]);
      const answeredEventIds = new Set(
        attendanceData
          .filter((a) => a.status !== null)
          .map((a) => a.practice_id || a.competition_id)
          .filter((id): id is string => id !== null),
      );

      const allAnswered =
        eventCount > 0 && Array.from(eventIds).every((id) => answeredEventIds.has(id));

      return {
        eventCount,
        answeredCount,
        status: eventCount === 0 ? null : allAnswered ? "all_answered" : "has_unanswered",
      };
    },
    [teamId, supabase, attendanceAPI],
  );

  // 月リストを取得
  const loadMonthList = useCallback(async () => {
    try {
      setLoadingMonthList(true);
      setError(null);

      const now = new Date();
      const startDateStr = toISODateString(startOfMonth(now));
      const oneYearLater = addMonths(now, 12);
      const endDateStr = toISODateString(endOfMonth(oneYearLater));

      // 練習・大会を取得（日付のみ）
      const [practicesResult, competitionsResult] = await Promise.all([
        supabase
          .from("practices")
          .select("date")
          .eq("team_id", teamId)
          .gte("date", startDateStr)
          .lte("date", endDateStr),
        supabase
          .from("competitions")
          .select("date")
          .eq("team_id", teamId)
          .gte("date", startDateStr)
          .lte("date", endDateStr),
      ]);

      if (practicesResult.error) throw practicesResult.error;
      if (competitionsResult.error) throw competitionsResult.error;

      // 月ごとにグループ化
      const monthSet = new Set<string>();
      const allDates = [
        ...(practicesResult.data || []).map((p) => p.date),
        ...(competitionsResult.data || []).map((c) => c.date),
      ];

      allDates.forEach((dateStr) => {
        const date = new Date(dateStr);
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const monthKey = `${year}-${String(month).padStart(2, "0")}`;
        monthSet.add(monthKey);
      });

      // 月リストを作成してステータスを計算
      const monthList: MonthItem[] = [];
      const sortedMonthKeys = Array.from(monthSet).sort();

      for (const monthKey of sortedMonthKeys) {
        const [yearStr, monthStr] = monthKey.split("-");
        const year = parseInt(yearStr);
        const month = parseInt(monthStr);

        const status = await calculateMonthStatus(year, month);
        monthList.push({
          year,
          month,
          ...status,
        });
      }

      setMonthList(monthList);
    } catch (err) {
      console.error("月リストの取得に失敗:", err);
      setError(t("teams.mobile.attendanceListFetchFailed"));
    } finally {
      setLoadingMonthList(false);
    }
  }, [teamId, supabase, calculateMonthStatus, t]);

  // 月別の出欠情報を取得（モーダル用）
  const loadAttendances = useCallback(async () => {
    if (!selectedMonth) return;

    try {
      setLoading(true);
      setError(null);

      // 月の開始日と終了日を計算
      const [startDateStr, endDateStr] = getMonthDateRange(selectedMonth.year, selectedMonth.month);

      // 練習と大会を取得
      const [practicesResult, competitionsResult] = await Promise.all([
        supabase
          .from("practices")
          .select("*")
          .eq("team_id", teamId)
          .gte("date", startDateStr)
          .lte("date", endDateStr)
          .order("date", { ascending: true }),
        supabase
          .from("competitions")
          .select("*")
          .eq("team_id", teamId)
          .gte("date", startDateStr)
          .lte("date", endDateStr)
          .order("date", { ascending: true }),
      ]);

      if (practicesResult.error) throw practicesResult.error;
      if (competitionsResult.error) throw competitionsResult.error;

      // イベントを統合
      const practices: TeamEvent[] = (practicesResult.data || []).map((p) => ({
        ...p,
        type: "practice" as const,
      }));
      const competitions: TeamEvent[] = (competitionsResult.data || []).map((c) => ({
        ...c,
        type: "competition" as const,
      }));
      const allEvents = [...practices, ...competitions].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      );
      setEvents(allEvents);

      // 出欠情報を取得
      const attendanceData = await attendanceAPI.getMyAttendancesByMonth(
        teamId,
        selectedMonth.year,
        selectedMonth.month,
      );
      setAttendances(attendanceData);

      // 編集状態を初期化（既存の出欠情報から）
      const initialEditStates: Record<string, AttendanceEditState> = {};
      attendanceData.forEach((attendance) => {
        const eventId = attendance.practice_id || attendance.competition_id;
        if (eventId) {
          initialEditStates[eventId] = {
            status: attendance.status,
            note: attendance.note || "",
          };
        }
      });
      // イベントがあって出欠情報がない場合は未回答として初期化
      allEvents.forEach((event) => {
        if (!initialEditStates[event.id]) {
          initialEditStates[event.id] = {
            status: null,
            note: "",
          };
        }
      });
      setEditStates(initialEditStates);
    } catch (err) {
      console.error("出欠情報の取得に失敗:", err);
      setError(t("teams.mobile.attendanceFetchFailed"));
    } finally {
      setLoading(false);
    }
  }, [teamId, selectedMonth, supabase, attendanceAPI, t]);

  // 月リストを初期読み込み
  useEffect(() => {
    loadMonthList();
  }, [loadMonthList]);

  // モーダルが開かれたときに詳細データを読み込む
  useEffect(() => {
    if (selectedMonth && isModalOpen) {
      loadAttendances();
    }
  }, [selectedMonth, isModalOpen, loadAttendances]);

  // ステータス変更
  const handleStatusChange = (eventId: string, status: AttendanceStatus | null) => {
    setEditStates((prev) => ({
      ...prev,
      [eventId]: {
        ...prev[eventId],
        status,
      },
    }));
  };

  // 備考変更
  const handleNoteChange = (eventId: string, note: string) => {
    setEditStates((prev) => ({
      ...prev,
      [eventId]: {
        ...prev[eventId],
        note,
      },
    }));
  };

  // まとめて保存
  const handleSaveAll = async () => {
    try {
      setSaving(true);
      setError(null);

      // 編集された出欠情報のみを抽出
      const updates = events
        .map((event) => {
          const editState = editStates[event.id];
          if (!editState) return null;

          // 既存の出欠情報を取得
          const existingAttendance = attendances.find(
            (a) => (a.practice_id || a.competition_id) === event.id,
          );

          // 変更がない場合はスキップ
          if (existingAttendance) {
            if (
              existingAttendance.status === editState.status &&
              (existingAttendance.note || "") === editState.note
            ) {
              return null;
            }
          } else if (editState.status === null && editState.note === "") {
            // 新規で未回答の場合はスキップ
            return null;
          }

          return {
            attendanceId: existingAttendance?.id || "",
            status: editState.status,
            note: editState.note || null,
          };
        })
        .filter(
          (
            u,
          ): u is { attendanceId: string; status: AttendanceStatus | null; note: string | null } =>
            u !== null,
        );

      if (updates.length === 0) {
        // 変更がない場合は何もしない
        return;
      }

      // 締切後の編集を含む場合は確認ダイアログを表示（web useAttendanceEdit:152-167 と同一挙動）。
      // 保存対象 event のうち attendance_status === "closed" のものを抽出する。
      const savedEventIds = new Set(
        events
          .filter((event) => {
            const editState = editStates[event.id];
            if (!editState) return false;
            const existingAttendance = attendances.find(
              (a) => (a.practice_id || a.competition_id) === event.id,
            );
            if (existingAttendance) {
              return !(
                existingAttendance.status === editState.status &&
                (existingAttendance.note || "") === editState.note
              );
            }
            return !(editState.status === null && editState.note === "");
          })
          .map((event) => event.id),
      );
      const closedEvents = events.filter(
        (event) => savedEventIds.has(event.id) && event.attendance_status === "closed",
      );
      if (closedEvents.length > 0) {
        const dates = closedEvents
          .map((event) => {
            const date = parseISO(event.date);
            return `${date.getMonth() + 1}/${date.getDate()}`;
          })
          .join("、");
        const confirmed = await new Promise<boolean>((resolve) => {
          Alert.alert(
            t("teams.mobile.adminAttendance.confirmTitle"),
            t("teams.mobile.attendanceConfirmEditAfterDeadline", { dates }),
            [
              { text: t("common.cancel"), style: "cancel", onPress: () => resolve(false) },
              { text: t("common.ok"), onPress: () => resolve(true) },
            ],
            { cancelable: true, onDismiss: () => resolve(false) },
          );
        });
        if (!confirmed) {
          setSaving(false);
          return;
        }
      }

      // 新規作成が必要な出欠情報を特定
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error(t("auth.errorMap.sessionNotFound"));

      const newAttendances = events
        .filter((event) => {
          const editState = editStates[event.id];
          if (!editState) return false;
          const existingAttendance = attendances.find(
            (a) => (a.practice_id || a.competition_id) === event.id,
          );
          return !existingAttendance && (editState.status !== null || editState.note !== "");
        })
        .map((event) => {
          const editState = editStates[event.id];
          // web useAttendanceEdit:191 / useRecentAttendance:199 と同順: 先にユーザー入力を sanitize し、
          // その後に締切後編集マーク（システム生成・サニタイズ不要）を付与する。
          let note: string | null = editState.note
            ? sanitizeTextInput(editState.note, NOTE_MAX_LENGTH)
            : null;

          // 締切後の新規登録には締切後編集マークを付与（web useAttendanceEdit:191-208 と同一ロジック）。
          // update 経路は shared bulkUpdateMyAttendances→addEditMark が付与するため、ここでは insert のみ対象（二重付与防止）。
          if (event.attendance_status === "closed") {
            const editMark = `(${format(new Date(), "MM/dd HH:mm")}締切後編集)`;
            if (note) {
              const cleaned = note.replace(EDIT_MARK_REGEX, "").trim();
              const combined = cleaned ? `${cleaned} ${editMark}` : editMark;
              note = combined.length > NOTE_MAX_LENGTH ? combined.substring(0, NOTE_MAX_LENGTH) : combined;
            } else {
              note = editMark;
            }
          }

          return {
            user_id: user.id,
            practice_id: event.type === "practice" ? event.id : null,
            competition_id: event.type === "competition" ? event.id : null,
            status: editState.status,
            note,
          };
        });

      // 新規作成と更新を実行
      // 新規作成
      if (newAttendances.length > 0) {
        const { error: insertError } = await supabase
          .from("team_attendance")
          .insert(newAttendances);

        if (insertError) throw insertError;
      }

      // 更新（既存のIDがあるもののみ）
      const updateOnly = updates.filter((u) => u.attendanceId !== "");
      if (updateOnly.length > 0) {
        await attendanceAPI.bulkUpdateMyAttendances(updateOnly);
      }

      // 再読み込み
      await loadAttendances();
      // 月リストも更新
      await loadMonthList();

      // 保存成功後、モーダルを閉じる
      handleCloseModal();
      Alert.alert(
        t("teams.mobile.attendanceSaveSuccessTitle"),
        t("teams.mobile.attendanceSaveSuccessMessage"),
        [{ text: "OK" }],
      );
    } catch (err) {
      console.error("出欠情報の保存に失敗:", err);
      const errorMessage =
        err instanceof Error ? err.message : t("teams.mobile.attendanceSaveFailed");
      setError(errorMessage);
      Alert.alert(t("common.error"), errorMessage, [{ text: "OK" }]);
    } finally {
      setSaving(false);
    }
  };

  // 月アイテムをクリック
  const handleMonthClick = (year: number, month: number) => {
    setSelectedMonth({ year, month });
    setIsModalOpen(true);
  };

  // モーダルを閉じる
  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedMonth(null);
    setEditStates({});
  };

  // 月名を取得
  const getMonthLabel = (year: number, month: number) => {
    return t("common.yearMonth", { year, month });
  };

  // 月のステータスバッジ
  const StatusBadge = ({ status }: { status: "has_unanswered" | "all_answered" | null }) => {
    if (status === null) return null;

    return (
      <View
        style={
          status === "has_unanswered"
            ? styles.monthStatusBadgeUnanswered
            : styles.monthStatusBadgeAnswered
        }
      >
        <Text
          style={
            status === "has_unanswered"
              ? styles.monthStatusBadgeTextUnanswered
              : styles.monthStatusBadgeTextAnswered
          }
        >
          {status === "has_unanswered"
            ? t("teams.mobile.attendanceUnanswered")
            : t("teams.mobile.attendanceAllAnswered")}
        </Text>
      </View>
    );
  };

  // イベントのステータスバッジ
  const getStatusBadge = (status: "open" | "closed" | null | undefined) => {
    switch (status) {
      case "open":
        return (
          <View style={styles.statusBadgeOpen}>
            <Text style={styles.statusBadgeTextOpen}>{t("teams.mobile.monthlyAttendance.statusOpen")}</Text>
          </View>
        );
      case "closed":
        return (
          <View style={styles.statusBadgeClosed}>
            <Text style={styles.statusBadgeTextClosed}>{t("teams.mobile.monthlyAttendance.statusClosed")}</Text>
          </View>
        );
      default:
        return (
          <View style={styles.statusBadgeDefault}>
            <Text style={styles.statusBadgeTextDefault}>{t("common.notSet")}</Text>
          </View>
        );
    }
  };

  if (loadingMonthList) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>{t("common.loading")}</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      </View>
    );
  }

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        {/* 月リスト表示 */}
        {monthList.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>{t("teams.mobile.monthlyAttendance.noMonths")}</Text>
          </View>
        ) : (
          <View style={styles.monthListContainer}>
            {monthList.map((monthItem) => (
              <Pressable
                key={`${monthItem.year}-${monthItem.month}`}
                style={styles.monthItem}
                onPress={() => handleMonthClick(monthItem.year, monthItem.month)}
              >
                <Text style={styles.monthItemText}>
                  {getMonthLabel(monthItem.year, monthItem.month)}
                </Text>
                <StatusBadge status={monthItem.status} />
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>

      {/* 月詳細モーダル */}
      <Modal
        visible={isModalOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handleCloseModal}
      >
        <View style={styles.modalContainer}>
          {/* モーダルヘッダー */}
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {selectedMonth ? getMonthLabel(selectedMonth.year, selectedMonth.month) : ""}
            </Text>
            <Pressable onPress={handleCloseModal} style={styles.modalCloseButton}>
              <Feather name="x" size={24} color="#374151" />
            </Pressable>
          </View>

          {/* モーダルコンテンツ */}
          <ScrollView style={styles.modalContent} contentContainerStyle={styles.modalScrollContent}>
            {loading ? (
              <View style={styles.loadingContainer}>
                <Text style={styles.loadingText}>{t("common.loading")}</Text>
              </View>
            ) : error ? (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : (
              <View style={styles.eventsContainer}>
                {/* イベント一覧 */}
                {events.length === 0 ? (
                  <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>{t("teams.mobile.monthlyAttendance.noEvents")}</Text>
                  </View>
                ) : (
                  <>
                    {events.map((event) => {
                      const editState = editStates[event.id] || { status: null, note: "" };

                      return (
                        <View
                          key={`${event.type}-${event.id}`}
                          style={[
                            styles.eventCard,
                            event.type === "competition" && styles.eventCardCompetition,
                          ]}
                        >
                          {/* イベント情報とステータスバッジ */}
                          <View style={styles.eventHeader}>
                            <View style={styles.eventInfo}>
                              <Text style={styles.eventDate}>
                                {formatDate(event.date, "shortWithWeekday", locale)}
                              </Text>
                              <Text style={styles.eventTitle}>
                                {event.type === "competition"
                                  ? event.title
                                  : t("teams.mobile.fallbackPractice")}
                              </Text>
                              {event.place && <Text style={styles.eventPlace}>@{event.place}</Text>}
                            </View>
                            {getStatusBadge(event.attendance_status)}
                          </View>

                          {/* 出欠選択 */}
                          <View style={styles.attendanceButtons}>
                            <Pressable
                              style={[
                                styles.attendanceButton,
                                editState.status === "present" &&
                                  styles.attendanceButtonActivePresent,
                              ]}
                              onPress={() => handleStatusChange(event.id, "present")}
                            >
                              <Text
                                style={[
                                  styles.attendanceButtonText,
                                  editState.status === "present" &&
                                    styles.attendanceButtonTextActive,
                                ]}
                              >
                                {t("teams.mobile.attendanceStatusPresent")}
                              </Text>
                            </Pressable>
                            <Pressable
                              style={[
                                styles.attendanceButton,
                                editState.status === "absent" &&
                                  styles.attendanceButtonActiveAbsent,
                              ]}
                              onPress={() => handleStatusChange(event.id, "absent")}
                            >
                              <Text
                                style={[
                                  styles.attendanceButtonText,
                                  editState.status === "absent" &&
                                    styles.attendanceButtonTextActive,
                                ]}
                              >
                                {t("teams.mobile.attendanceStatusAbsent")}
                              </Text>
                            </Pressable>
                            <Pressable
                              style={[
                                styles.attendanceButton,
                                editState.status === "other" && styles.attendanceButtonActiveOther,
                              ]}
                              onPress={() => handleStatusChange(event.id, "other")}
                            >
                              <Text
                                style={[
                                  styles.attendanceButtonText,
                                  editState.status === "other" && styles.attendanceButtonTextActive,
                                ]}
                              >
                                {t("teams.mobile.attendanceStatusOther")}
                              </Text>
                            </Pressable>
                          </View>

                          {/* 備考入力 */}
                          <TextInput
                            style={styles.noteInput}
                            value={editState.note}
                            onChangeText={(text) => handleNoteChange(event.id, text)}
                            placeholder={t("teams.mobile.attendanceNotePlaceholder")}
                            multiline
                            numberOfLines={2}
                          />
                        </View>
                      );
                    })}

                    {/* まとめて保存ボタン */}
                    <Pressable
                      style={[styles.saveButton, saving && styles.saveButtonDisabled]}
                      onPress={handleSaveAll}
                      disabled={saving}
                    >
                      <Text style={styles.saveButtonText}>
                        {saving
                          ? t("teams.mobile.saveLoading")
                          : selectedMonth
                            ? t("teams.mobile.attendanceSaveMonth", {
                                label: getMonthLabel(selectedMonth.year, selectedMonth.month),
                              })
                            : t("teams.mobile.saveButton")}
                      </Text>
                    </Pressable>
                  </>
                )}
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  scrollContent: {
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  loadingText: {
    fontSize: 16,
    color: "#6B7280",
  },
  errorContainer: {
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 8,
    padding: 16,
    margin: 16,
  },
  errorText: {
    color: "#DC2626",
    fontSize: 14,
  },
  monthListContainer: {
    gap: 8,
  },
  monthItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
  },
  monthItemText: {
    fontSize: 18,
    fontWeight: "500",
    color: "#111827",
  },
  monthStatusBadgeUnanswered: {
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  monthStatusBadgeTextUnanswered: {
    fontSize: 12,
    color: "#92400E",
    fontWeight: "500",
  },
  monthStatusBadgeAnswered: {
    backgroundColor: "#D1FAE5",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  monthStatusBadgeTextAnswered: {
    fontSize: 12,
    color: "#065F46",
    fontWeight: "500",
  },
  modalContainer: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#111827",
  },
  modalCloseButton: {
    padding: 8,
  },
  modalContent: {
    flex: 1,
  },
  modalScrollContent: {
    padding: 16,
  },
  emptyContainer: {
    backgroundColor: "#F9FAFB",
    borderRadius: 8,
    padding: 32,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 16,
    color: "#6B7280",
  },
  eventsContainer: {
    gap: 16,
  },
  eventCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    padding: 16,
  },
  eventCardCompetition: {
    backgroundColor: "#F5F3FF",
    borderColor: "#DDD6FE",
  },
  eventHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  eventInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  eventDate: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#111827",
  },
  eventTitle: {
    fontSize: 16,
    fontWeight: "500",
    color: "#111827",
  },
  eventPlace: {
    fontSize: 14,
    color: "#6B7280",
  },
  statusBadgeOpen: {
    backgroundColor: "#DBEAFE",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeTextOpen: {
    fontSize: 12,
    color: "#1E40AF",
    fontWeight: "500",
  },
  statusBadgeClosed: {
    backgroundColor: "#FEE2E2",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeTextClosed: {
    fontSize: 12,
    color: "#991B1B",
    fontWeight: "500",
  },
  statusBadgeDefault: {
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeTextDefault: {
    fontSize: 12,
    color: "#374151",
    fontWeight: "500",
  },
  attendanceButtons: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  attendanceButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#F3F4F6",
    borderWidth: 2,
    borderColor: "transparent",
    alignItems: "center",
  },
  attendanceButtonActivePresent: {
    backgroundColor: "#D1FAE5",
    borderColor: "#10B981",
  },
  attendanceButtonActiveAbsent: {
    backgroundColor: "#FEE2E2",
    borderColor: "#EF4444",
  },
  attendanceButtonActiveOther: {
    backgroundColor: "#FEF3C7",
    borderColor: "#F59E0B",
  },
  attendanceButtonText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#6B7280",
  },
  attendanceButtonTextActive: {
    color: "#111827",
    fontWeight: "600",
  },
  noteInput: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: "#111827",
    backgroundColor: "#FFFFFF",
    minHeight: 60,
    textAlignVertical: "top",
  },
  saveButton: {
    backgroundColor: "#2563EB",
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 16,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
});
