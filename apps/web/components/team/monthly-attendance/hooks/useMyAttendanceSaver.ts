"use client";

import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { SupabaseClient } from "@supabase/supabase-js";
import { useTranslations } from "next-intl";
import { format, isValid, parseISO } from "date-fns";
import { AttendanceAPI } from "@swim-hub/shared/api/attendance";
import type { AttendanceStatus, TeamEvent } from "@swim-hub/shared/types";
import type { TeamAttendance } from "@swim-hub/shared/types/attendance";
import { sanitizeTextInput } from "@swim-hub/shared/utils/sanitize";
import { toUserFacingMessage } from "@swim-hub/shared/utils/userFacingError";
import { notificationKeys } from "@apps/shared/hooks/queries/keys";
import { invalidateTeamAttendanceAnswerQueries } from "@/hooks/queries/teamDetailKeys";
import { isAttendanceClosed, type MyAttendanceItem } from "@/utils/teamAttendance";

/** 備考の最大文字数 */
export const ATTENDANCE_NOTE_MAX_LENGTH = 500;

/** 締切後編集の印 (shared AttendanceAPI.addEditMark と同じ書式・同じ重複除去) */
const EDIT_MARK_REGEX = /\s*\(\d{1,2}\/\d{1,2}\s+\d{1,2}:\d{2}(?:締切後)?編集\)\s*/g;

export interface MyAnswerChange {
  status: AttendanceStatus | null;
  note: string;
}

interface UseMyAttendanceSaverParams {
  supabase: SupabaseClient;
  attendanceAPI: AttendanceAPI;
  userId: string | null;
  /** 自分の出欠一覧 (useMyAttendanceList) のクエリキー。保存時にこのキャッシュを書き換える */
  listKey: readonly unknown[];
}

/**
 * 自分の出欠を「押した時点で」保存する (mobile の useMyAttendanceSaver と同じ流れ)。
 * - 押した時点で一覧の表示を切り替え、保存に失敗したら元に戻してエラーを出す
 * - 締切後は確認ダイアログを出し、備考に「締切後編集」の印を付ける
 *   (既存の行は shared の bulkUpdateMyAttendances が付ける。新しく作る行はここで付ける)
 * - 同じイベントへの保存は順番に送る (続けて押しても、後に押した方が最後に保存される)
 */
export const useMyAttendanceSaver = ({
  supabase,
  attendanceAPI,
  userId,
  listKey,
}: UseMyAttendanceSaverParams) => {
  const t = useTranslations("teams");
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  // イベントごとの保存の列と、新しく作った出欠の行の ID (作成直後に続けて押されたときに使う)
  const chainsRef = useRef(new Map<string, Promise<unknown>>());
  const createdRowIdsRef = useRef(new Map<string, string>());

  /** 一覧のキャッシュ上で、1 イベント分の自分の回答を書き換える */
  const patchListItem = useCallback(
    (eventId: string, patch: (item: MyAttendanceItem) => MyAttendanceItem) => {
      queryClient.setQueryData<MyAttendanceItem[]>(listKey, (prev) =>
        prev?.map((item) => (item.event.id === eventId ? patch(item) : item)),
      );
    },
    [queryClient, listKey],
  );

  const writeAnswer = useCallback(
    async (
      event: TeamEvent,
      existingRowId: string | null,
      change: MyAnswerChange,
    ): Promise<TeamAttendance | null> => {
      const sanitizedNote = change.note
        ? sanitizeTextInput(change.note, ATTENDANCE_NOTE_MAX_LENGTH)
        : null;
      if (existingRowId) {
        // 既存の行: shared の bulkUpdateMyAttendances が締切後編集の印を付ける (ここでは付けない)
        const [saved] = await attendanceAPI.bulkUpdateMyAttendances([
          { attendanceId: existingRowId, status: change.status, note: sanitizedNote },
        ]);
        return saved ?? null;
      }
      // 行が無い (イベント作成後に加入した等): 新しく作る
      if (!userId) throw new Error(t("attendanceEditHook.authRequired"));
      let note = sanitizedNote;
      if (isAttendanceClosed(event)) {
        const editMark = `(${format(new Date(), "MM/dd HH:mm")}締切後編集)`;
        const cleaned = (note ?? "").replace(EDIT_MARK_REGEX, "").trim();
        note = (cleaned ? `${cleaned} ${editMark}` : editMark).slice(
          0,
          ATTENDANCE_NOTE_MAX_LENGTH,
        );
      }
      const { data, error: insertError } = await supabase
        .from("team_attendance")
        .insert({
          user_id: userId,
          practice_id: event.type === "practice" ? event.id : null,
          competition_id: event.type === "competition" ? event.id : null,
          status: change.status,
          note,
        })
        .select()
        .single();
      if (insertError) throw insertError;
      return (data as TeamAttendance | null) ?? null;
    },
    [attendanceAPI, supabase, userId, t],
  );

  /** 1 件保存する。確認ダイアログでやめた・失敗したときは false */
  const saveAnswer = useCallback(
    async (item: MyAttendanceItem, change: MyAnswerChange): Promise<boolean> => {
      const { event } = item;
      if (isAttendanceClosed(event)) {
        const date = parseISO(event.date);
        const dates = isValid(date) ? format(date, "M/d") : event.date;
        if (!window.confirm(t("attendanceEditHook.confirmEditAfterDeadline", { dates }))) {
          return false;
        }
      }

      setError(null);
      const previous = item.myAttendance;
      patchListItem(event.id, (current) => ({
        ...current,
        myAttendance: {
          ...(current.myAttendance ?? {
            id: "",
            user_id: userId ?? "",
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
        // 出欠状況モーダル (全員の回答) とホームの未回答のお知らせを最新にする
        void invalidateTeamAttendanceAnswerQueries(queryClient, [event]);
        void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
        return true;
      } catch (err) {
        console.error("出欠情報の保存に失敗:", err);
        patchListItem(event.id, (current) => ({ ...current, myAttendance: previous }));
        setError(toUserFacingMessage(err, t("attendanceEditHook.saveError")));
        return false;
      }
    },
    [patchListItem, writeAnswer, queryClient, userId, t],
  );

  const clearError = useCallback(() => setError(null), []);

  return { saveAnswer, error, clearError };
};
