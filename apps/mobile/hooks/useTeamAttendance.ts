"use client";

/**
 * チームの出欠タブのデータ取得と保存
 *
 * - useTeamAttendanceList: 今日〜12か月先の練習・大会と、それぞれに対する自分の出欠 (過去のものは出さない)
 * - useMyAttendanceSaver: 自分の出欠を「押した時点で」保存する (画面は先に切り替え、失敗したら戻す)
 * - useAttendanceStatusChanger: 管理者が受付状態 (受付中 / 締切) を切り替える
 * - useTeamAttendanceMembers / useEventAttendanceRows: モーダルで全員の出欠を並べるための名簿と出欠の行
 */
import { useCallback, useMemo, useRef } from "react";
import { Alert } from "react-native";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { addMonths, endOfMonth, format, parseISO } from "date-fns";
import { useAuth } from "@/contexts/AuthProvider";
import { useToast } from "@/providers/ToastProvider";
import { AttendanceAPI } from "@swim-hub/shared/api/attendance";
import type { AttendanceStatus, AttendanceStatusType, TeamEvent } from "@swim-hub/shared/types";
import type { TeamAttendance } from "@swim-hub/shared/types/attendance";
import { toISODateString } from "@swim-hub/shared/utils/date";
import { sanitizeTextInput } from "@swim-hub/shared/utils/sanitize";
import { fetchTeamMembers } from "@apps/shared/utils/team";
import { notificationKeys, teamKeys } from "@apps/shared/hooks/queries/keys";
import {
  useAttendanceByCompetitionQuery,
  useAttendanceByPracticeQuery,
  useUpdateAttendanceStatusMutation,
} from "@apps/shared/hooks/queries/teams";
import { UserFacingError, toUserFacingMessage } from "@apps/shared/utils/userFacingError";
import {
  buildAttendanceItems,
  isAttendanceClosed,
  type AttendanceListItem,
} from "@/utils/teamAttendance";

/** 備考の最大文字数 (web useAttendanceEdit と同じ) */
export const ATTENDANCE_NOTE_MAX_LENGTH = 500;

/** 締切後編集の印 (shared AttendanceAPI.addEditMark と同じ書式・同じ重複除去) */
const EDIT_MARK_REGEX = /\s*\(\d{1,2}\/\d{1,2}\s+\d{1,2}:\d{2}(?:締切後)?編集\)\s*/g;

export const teamAttendanceKeys = {
  list: (teamId: string, userId: string | undefined) =>
    ["teamAttendance", "list", teamId, userId ?? ""] as const,
  members: (teamId: string) => ["teamAttendance", "members", teamId] as const,
};

type ListData = AttendanceListItem[];

// =============================================================================
// 一覧
// =============================================================================

export function useTeamAttendanceList(teamId: string) {
  const { supabase, user } = useAuth();
  const userId = user?.id;

  return useQuery<ListData>({
    queryKey: teamAttendanceKeys.list(teamId, userId),
    enabled: !!userId,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const today = new Date();
      // 過去のイベントは出さない。今日は過去扱いしない (端末のローカル日付)
      const startDate = toISODateString(today);
      const endDate = toISODateString(endOfMonth(addMonths(today, 12)));

      const [practicesResult, competitionsResult] = await Promise.all([
        supabase
          .from("practices")
          .select("*")
          .eq("team_id", teamId)
          .gte("date", startDate)
          .lte("date", endDate),
        supabase
          .from("competitions")
          .select("*")
          .eq("team_id", teamId)
          .gte("date", startDate)
          .lte("date", endDate),
      ]);
      if (practicesResult.error) throw practicesResult.error;
      if (competitionsResult.error) throw competitionsResult.error;

      const events: TeamEvent[] = [
        ...(practicesResult.data ?? []).map((p) => ({ ...p, type: "practice" as const })),
        ...(competitionsResult.data ?? []).map((c) => ({ ...c, type: "competition" as const })),
      ];
      const practiceIds = events.filter((e) => e.type === "practice").map((e) => e.id);
      const competitionIds = events.filter((e) => e.type === "competition").map((e) => e.id);

      const [practiceAttendances, competitionAttendances] = await Promise.all([
        practiceIds.length > 0
          ? supabase
              .from("team_attendance")
              .select("*")
              .eq("user_id", userId!)
              .in("practice_id", practiceIds)
          : Promise.resolve({ data: [] as TeamAttendance[], error: null }),
        competitionIds.length > 0
          ? supabase
              .from("team_attendance")
              .select("*")
              .eq("user_id", userId!)
              .in("competition_id", competitionIds)
          : Promise.resolve({ data: [] as TeamAttendance[], error: null }),
      ]);
      if (practiceAttendances.error) throw practiceAttendances.error;
      if (competitionAttendances.error) throw competitionAttendances.error;

      return buildAttendanceItems(events, [
        ...((practiceAttendances.data ?? []) as TeamAttendance[]),
        ...((competitionAttendances.data ?? []) as TeamAttendance[]),
      ]);
    },
  });
}

/** 出欠を変えたあとに取り直させるもの (ホームの未回答・チームタブのバッジ・そのイベントの全員の出欠) */
function invalidateAfterAnswer(queryClient: QueryClient, event: TeamEvent) {
  void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
  void queryClient.invalidateQueries({
    queryKey:
      event.type === "practice"
        ? teamKeys.attendanceByPractice(event.id)
        : teamKeys.attendanceByCompetition(event.id),
  });
}

// =============================================================================
// 自分の出欠の保存
// =============================================================================

export interface MyAnswerChange {
  status: AttendanceStatus | null;
  note: string;
}

/**
 * 自分の出欠を保存する。
 * - 押した時点で一覧の表示を切り替え、保存に失敗したら元に戻してエラーを出す
 * - 締切後は今までどおり確認ダイアログを出し、備考に「締切後編集」の印を付ける (shared API と同じ)
 * - 同じイベントへの保存は順番に送る (続けて押しても、後に押した方が最後に保存される)
 */
export function useMyAttendanceSaver(teamId: string) {
  const { supabase, user } = useAuth();
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const attendanceAPI = useMemo(() => new AttendanceAPI(supabase), [supabase]);
  const listKey = teamAttendanceKeys.list(teamId, user?.id);

  // イベントごとの保存の列と、新しく作った出欠の行の ID (作成直後に続けて押されたときに使う)
  const chainsRef = useRef(new Map<string, Promise<unknown>>());
  const createdRowIdsRef = useRef(new Map<string, string>());

  const confirmEditAfterDeadline = useCallback(
    (event: TeamEvent) =>
      new Promise<boolean>((resolve) => {
        const date = parseISO(event.date);
        Alert.alert(
          t("teams.mobile.adminAttendance.confirmTitle"),
          t("teams.mobile.attendanceConfirmEditAfterDeadline", {
            dates: `${date.getMonth() + 1}/${date.getDate()}`,
          }),
          [
            { text: t("common.cancel"), style: "cancel", onPress: () => resolve(false) },
            { text: t("common.ok"), onPress: () => resolve(true) },
          ],
          { cancelable: true, onDismiss: () => resolve(false) },
        );
      }),
    [t],
  );

  /** 一覧のキャッシュ上で、1 イベント分の自分の回答を書き換える */
  const patchListItem = useCallback(
    (eventId: string, patch: (item: AttendanceListItem) => AttendanceListItem) => {
      queryClient.setQueryData<ListData>(listKey, (prev) =>
        prev?.map((item) => (item.event.id === eventId ? patch(item) : item)),
      );
    },
    [queryClient, listKey],
  );

  const writeAnswer = useCallback(
    async (event: TeamEvent, existingRowId: string | null, change: MyAnswerChange) => {
      if (existingRowId) {
        // 既存の行: shared の bulkUpdateMyAttendances が締切後編集の印を付ける
        const [saved] = await attendanceAPI.bulkUpdateMyAttendances([
          { attendanceId: existingRowId, status: change.status, note: change.note || null },
        ]);
        return saved ?? null;
      }
      // 行が無い (イベント作成後に加入した等): 新しく作る
      if (!user) throw new UserFacingError(t("auth.errorMap.sessionNotFound"));
      let note: string | null = change.note
        ? sanitizeTextInput(change.note, ATTENDANCE_NOTE_MAX_LENGTH)
        : null;
      if (isAttendanceClosed(event)) {
        const editMark = `(${format(new Date(), "MM/dd HH:mm")}締切後編集)`;
        const cleaned = (note ?? "").replace(EDIT_MARK_REGEX, "").trim();
        note = (cleaned ? `${cleaned} ${editMark}` : editMark).slice(0, ATTENDANCE_NOTE_MAX_LENGTH);
      }
      const { data, error } = await supabase
        .from("team_attendance")
        .insert({
          user_id: user.id,
          practice_id: event.type === "practice" ? event.id : null,
          competition_id: event.type === "competition" ? event.id : null,
          status: change.status,
          note,
        })
        .select()
        .single();
      if (error) throw error;
      return data as TeamAttendance;
    },
    [attendanceAPI, supabase, user, t],
  );

  /**
   * 1 件保存する。確認ダイアログでやめた・失敗したときは false。
   * silent: 成功のトーストを出さない (まとめて保存するときに使う)
   */
  const saveAnswer = useCallback(
    async (
      item: AttendanceListItem,
      change: MyAnswerChange,
      options: { silent?: boolean } = {},
    ): Promise<boolean> => {
      const { event } = item;
      if (isAttendanceClosed(event) && !(await confirmEditAfterDeadline(event))) return false;

      const previous = item.myAttendance;
      patchListItem(event.id, (current) => ({
        ...current,
        myAttendance: {
          ...(current.myAttendance ?? {
            id: "",
            user_id: user?.id ?? "",
            practice_id: event.type === "practice" ? event.id : null,
            competition_id: event.type === "competition" ? event.id : null,
            created_at: "",
            updated_at: "",
          }),
          status: change.status,
          note: change.note || null,
        },
      }));

      const run = async () => {
        const rowId = previous?.id || createdRowIdsRef.current.get(event.id) || null;
        const saved = await writeAnswer(event, rowId, change);
        if (saved) {
          createdRowIdsRef.current.set(event.id, saved.id);
          // 締切後編集の印などサーバーで変わった備考を反映する
          patchListItem(event.id, (current) => ({ ...current, myAttendance: saved }));
        }
      };
      const chain = (chainsRef.current.get(event.id) ?? Promise.resolve())
        .catch(() => undefined)
        .then(run);
      chainsRef.current.set(event.id, chain);

      try {
        await chain;
        invalidateAfterAnswer(queryClient, event);
        if (!options.silent) toast.success(t("teams.mobile.attendanceTab.savedToast"));
        return true;
      } catch (err) {
        console.error("出欠の保存に失敗:", err);
        patchListItem(event.id, (current) => ({ ...current, myAttendance: previous }));
        toast.error(toUserFacingMessage(err, t("teams.mobile.attendanceSaveFailed")));
        return false;
      }
    },
    [confirmEditAfterDeadline, patchListItem, writeAnswer, queryClient, toast, t, user?.id],
  );

  return { saveAnswer };
}

// =============================================================================
// 受付状態 (管理者)
// =============================================================================

export function useAttendanceStatusChanger(teamId: string) {
  const { supabase, user } = useAuth();
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const mutation = useUpdateAttendanceStatusMutation(supabase);
  const listKey = teamAttendanceKeys.list(teamId, user?.id);

  /** 受付状態をまとめて変える。画面は先に切り替え、失敗したら取り直す */
  const changeStatus = useCallback(
    async (events: TeamEvent[], status: AttendanceStatusType): Promise<boolean> => {
      if (events.length === 0) return true;
      const ids = new Set(events.map((e) => e.id));
      queryClient.setQueryData<ListData>(listKey, (prev) =>
        prev?.map((item) =>
          ids.has(item.event.id)
            ? { ...item, event: { ...item.event, attendance_status: status } }
            : item,
        ),
      );
      try {
        for (const event of events) {
          await mutation.mutateAsync({ eventId: event.id, eventType: event.type, status });
        }
        const statusLabel = t(
          status === "open"
            ? "teams.mobile.adminAttendance.statusOpen"
            : "teams.mobile.adminAttendance.statusClosed",
        );
        toast.success(
          t("teams.mobile.attendanceTab.statusChangedToast", { count: events.length, status: statusLabel }),
        );
        return true;
      } catch (err) {
        console.error("受付状態の変更に失敗:", err);
        toast.error(toUserFacingMessage(err, t("teams.mobile.adminAttendance.saveFailed")));
        return false;
      } finally {
        // 未回答の数は受付状態で変わるので、成否に関わらずサーバーの値で揃え直す
        void queryClient.invalidateQueries({ queryKey: listKey });
        void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
      }
    },
    [queryClient, listKey, mutation, toast, t],
  );

  return { changeStatus, isChanging: mutation.isPending };
}

// =============================================================================
// モーダル: 名簿と、そのイベントの全員の出欠
// =============================================================================

export function useTeamAttendanceMembers(teamId: string, enabled: boolean) {
  const { supabase } = useAuth();
  return useQuery({
    queryKey: teamAttendanceKeys.members(teamId),
    queryFn: () => fetchTeamMembers(supabase, teamId),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

export function useEventAttendanceRows(event: TeamEvent | null) {
  const { supabase } = useAuth();
  const practiceQuery = useAttendanceByPracticeQuery(
    supabase,
    event?.type === "practice" ? event.id : undefined,
  );
  const competitionQuery = useAttendanceByCompetitionQuery(
    supabase,
    event?.type === "competition" ? event.id : undefined,
  );
  return event?.type === "competition" ? competitionQuery : practiceQuery;
}

/** 管理者がメンバーの出欠を直す (行が無い人は作る) */
export function useMemberAnswerEditor(teamId: string) {
  const { supabase, user } = useAuth();
  const userId = user?.id;
  const { t } = useTranslation();
  const toast = useToast();
  const queryClient = useQueryClient();
  const attendanceAPI = useMemo(() => new AttendanceAPI(supabase), [supabase]);

  return useCallback(
    async (
      event: TeamEvent,
      target: { userId: string; attendanceId: string | null; note: string },
      status: AttendanceStatus,
    ): Promise<boolean> => {
      try {
        if (target.attendanceId) {
          await attendanceAPI.updateAttendance(target.attendanceId, { status });
        } else {
          await attendanceAPI.createAttendance({
            user_id: target.userId,
            practice_id: event.type === "practice" ? event.id : null,
            competition_id: event.type === "competition" ? event.id : null,
            status,
            note: target.note || null,
          });
        }
        invalidateAfterAnswer(queryClient, event);
        if (target.userId === userId) {
          void queryClient.invalidateQueries({ queryKey: teamAttendanceKeys.list(teamId, userId) });
        }
        toast.success(t("teams.mobile.attendanceTab.savedToast"));
        return true;
      } catch (err) {
        console.error("メンバーの出欠の変更に失敗:", err);
        toast.error(toUserFacingMessage(err, t("teams.mobile.attendanceSaveFailed")));
        return false;
      }
    },
    [attendanceAPI, queryClient, toast, t, teamId, userId],
  );
}
