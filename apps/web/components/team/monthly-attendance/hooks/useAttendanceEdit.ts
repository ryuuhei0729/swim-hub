"use client";

import { useState, useCallback } from "react";
import { SupabaseClient } from "@supabase/supabase-js";
import { AttendanceAPI } from "@swim-hub/shared/api/attendance";
import { useTranslations } from "next-intl";
import type { TeamAttendanceWithDetails } from "@swim-hub/shared/types/attendance";
import { AttendanceStatus, TeamEvent } from "@swim-hub/shared/types";
import { sanitizeTextInput } from "@swim-hub/shared/utils/sanitize";
import { resolveAttendanceStatus } from "@swim-hub/shared/utils/attendanceStatus";
import { format, parseISO } from "date-fns";
import { toUserFacingMessage } from "@swim-hub/shared/utils/userFacingError";

export interface AttendanceEditState {
  status: AttendanceStatus | null;
  note: string;
}

const NOTE_MAX_LENGTH = 500;

export const useAttendanceEdit = (
  teamId: string,
  supabase: SupabaseClient,
  attendanceAPI: AttendanceAPI,
) => {
  const t = useTranslations("teams");
  const [editStates, setEditStates] = useState<Record<string, AttendanceEditState>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStatusChange = useCallback((eventId: string, status: AttendanceStatus | null) => {
    setEditStates((prev) => ({
      ...prev,
      [eventId]: {
        // prev[eventId] が未初期化のときは initializeEditStates と同じデフォルト値を使う
        ...(prev[eventId] ?? { status: null, note: "" }),
        status,
      },
    }));
  }, []);

  const handleNoteChange = useCallback((eventId: string, note: string) => {
    const trimmedNote = note.length > NOTE_MAX_LENGTH ? note.substring(0, NOTE_MAX_LENGTH) : note;

    setEditStates((prev) => ({
      ...prev,
      [eventId]: {
        // prev[eventId] が未初期化のときは initializeEditStates と同じデフォルト値を使う
        ...(prev[eventId] ?? { status: null, note: "" }),
        note: trimmedNote,
      },
    }));
  }, []);

  const initializeEditStates = useCallback(
    (events: TeamEvent[], attendances: TeamAttendanceWithDetails[]) => {
      const initialEditStates: Record<string, AttendanceEditState> = {};

      attendances.forEach((attendance) => {
        const eventId = attendance.practice_id || attendance.competition_id;
        if (eventId) {
          initialEditStates[eventId] = {
            status: attendance.status,
            note: attendance.note || "",
          };
        }
      });

      events.forEach((event) => {
        if (!initialEditStates[event.id]) {
          initialEditStates[event.id] = {
            status: null,
            note: "",
          };
        }
      });

      setEditStates(initialEditStates);
    },
    [],
  );

  const saveAll = useCallback(
    async (
      events: TeamEvent[],
      attendances: TeamAttendanceWithDetails[],
      onSuccess?: () => void,
    ) => {
      try {
        setSaving(true);
        setError(null);

        const updates = events
          .map((event) => {
            const editState = editStates[event.id];
            if (!editState) return null;

            const existingAttendance = attendances.find(
              (a) => (a.practice_id || a.competition_id) === event.id,
            );

            if (existingAttendance) {
              if (
                existingAttendance.status === editState.status &&
                (existingAttendance.note || "") === editState.note
              ) {
                return null;
              }
            } else if (editState.status === null && editState.note === "") {
              return null;
            }

            // 既存更新経路では締切後マークの付与を行わない（bulkUpdateMyAttendances の
            // addEditMark が closed 時に付与する）。ここでは raw note をそのまま渡す。
            const sanitizedNote = editState.note
              ? sanitizeTextInput(editState.note, NOTE_MAX_LENGTH)
              : null;

            return {
              attendanceId: existingAttendance?.id || "",
              status: editState.status,
              note: sanitizedNote,
              eventId: event.id,
              eventAttendanceStatus: event.attendance_status,
              isNew: !existingAttendance,
            };
          })
          .filter(
            (
              u,
            ): u is {
              attendanceId: string;
              status: AttendanceStatus | null;
              note: string | null;
              eventId: string;
              eventAttendanceStatus: "open" | "closed" | null | undefined;
              isNew: boolean;
            } => u !== null,
          );

        if (updates.length === 0) {
          return;
        }

        const closedEvents = updates
          .filter((update) => {
            const event = events.find((e) => e.id === update.eventId);
            return event && resolveAttendanceStatus(event.date, event.attendance_status) === "closed";
          })
          .map((update) => {
            const event = events.find((e) => e.id === update.eventId);
            return event;
          })
          .filter((e): e is TeamEvent => e !== undefined);

        if (closedEvents.length > 0) {
          const eventDates = closedEvents
            .map((event) => {
              const date = parseISO(event.date);
              return `${date.getMonth() + 1}/${date.getDate()}`;
            })
            .join("、");

          const confirmed = window.confirm(
            t("attendanceEditHook.confirmEditAfterDeadline", { dates: eventDates }),
          );
          if (!confirmed) {
            setSaving(false);
            return;
          }
        }

        const processedUpdates = updates.map((update) => ({
          attendanceId: update.attendanceId,
          status: update.status,
          note: update.note,
        }));

        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error(t("attendanceEditHook.authRequired"));

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
            if (!editState) return null; // 直前の filter で editStates[event.id] が
              // 存在することを確認済みだが、filter と map は別クロージャで型情報が
              // 引き継がれないため防御的に扱う
            let note = editState.note ? sanitizeTextInput(editState.note, NOTE_MAX_LENGTH) : null;

            if (resolveAttendanceStatus(event.date, event.attendance_status) === "closed") {
              const now = new Date();
              const editTimestamp = format(now, "MM/dd HH:mm");
              const editNote = `(${editTimestamp}締切後編集)`;

              if (note) {
                note = note.replace(/\s*\(\d{2}\/\d{2}\s+\d{2}:\d{2}締切後編集\)/g, "").trim();
                const combinedNote = note ? `${note} ${editNote}` : editNote;
                note =
                  combinedNote.length > NOTE_MAX_LENGTH
                    ? combinedNote.substring(0, NOTE_MAX_LENGTH)
                    : combinedNote;
              } else {
                note = editNote;
              }
            }

            return {
              user_id: user.id,
              practice_id: event.type === "practice" ? event.id : null,
              competition_id: event.type === "competition" ? event.id : null,
              status: editState.status,
              note,
            };
          })
          .filter((a): a is NonNullable<typeof a> => a !== null);

        if (newAttendances.length > 0) {
          const { error: insertError } = await supabase
            .from("team_attendance")
            .insert(newAttendances);

          if (insertError) throw insertError;
        }

        const updateOnly = processedUpdates.filter((u) => u.attendanceId !== "");
        if (updateOnly.length > 0) {
          await attendanceAPI.bulkUpdateMyAttendances(updateOnly);
        }

        onSuccess?.();
      } catch (err) {
        console.error("出欠情報の保存に失敗:", err);
        setError(toUserFacingMessage(err, t("attendanceEditHook.saveError")));
      } finally {
        setSaving(false);
      }
    },
    [editStates, supabase, attendanceAPI, t],
  );

  return {
    editStates,
    saving,
    error,
    handleStatusChange,
    handleNoteChange,
    initializeEditStates,
    saveAll,
    setEditStates,
  };
};
