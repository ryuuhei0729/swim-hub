"use client";

import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet, TextInput } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { getDay, isValid, parseISO } from "date-fns";
import type { AttendanceStatus, AttendanceStatusType, TeamEvent } from "@swim-hub/shared/types";
import {
  effectiveAttendanceStatus,
  isUnansweredOpen,
  type AttendanceListItem,
} from "@/utils/teamAttendance";
import { ATTENDANCE_NOTE_MAX_LENGTH } from "@/hooks/useTeamAttendance";
import { AnswerSegment } from "./AnswerSegment";
import { AttendanceStatusBadge, AttendanceStatusDropdown } from "./AttendanceStatusDropdown";

/** 一覧・モーダルで使うイベント名 (名前が無ければ「練習」「大会」) */
export function attendanceEventTitle(event: TeamEvent, t: TFunction): string {
  return (
    event.title ||
    t(
      event.type === "practice"
        ? "teams.mobile.adminAttendance.defaultPractice"
        : "teams.mobile.adminAttendance.defaultCompetition",
    )
  );
}

/** 「12/5(金)」形式。曜日は端末の言語の曜日名 (カレンダーと同じ) */
export function attendanceEventDateLabel(event: TeamEvent, t: TFunction): string {
  const date = parseISO(event.date);
  if (!isValid(date)) return "-";
  const weekdays = t("common.datePicker.weekdays", { returnObjects: true }) as string[];
  return `${date.getMonth() + 1}/${date.getDate()}(${weekdays[getDay(date)] ?? ""})`;
}

interface AttendanceRowProps {
  item: AttendanceListItem;
  mode: "member" | "admin";
  /** 管理者の「まとめて変更」中 */
  selecting?: boolean;
  selected?: boolean;
  onPress: (item: AttendanceListItem) => void;
  onAnswer?: (item: AttendanceListItem, status: AttendanceStatus) => void;
  /** 「＋備考」から備考を保存する。保存できたら true (入力欄を閉じる) */
  onNoteSave?: (item: AttendanceListItem, note: string) => Promise<boolean>;
  /** 管理者: プルダウンで今と違う受付状態を選んだとき */
  onStatusChange?: (item: AttendanceListItem, status: AttendanceStatusType) => void;
}

/**
 * 出欠の一覧の 1 行
 * - メンバー: 右に 出席 / 欠席 / その他。押した時点で保存。
 *   場所の下の「＋備考」(備考があるときは備考そのもの) を押すと、行の下に入力欄が開く
 * - 管理者: 右に受付状態のプルダウン (大会のエントリー受付ステータスと同じ)。まとめて変更中はチェックボックス
 * - 行のそれ以外の部分を押すと、全員の出欠のモーダルを開く
 */
export const AttendanceRow = React.memo(function AttendanceRow({
  item,
  mode,
  selecting = false,
  selected = false,
  onPress,
  onAnswer,
  onNoteSave,
  onStatusChange,
}: AttendanceRowProps) {
  const { t } = useTranslation();
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const { event, myAttendance } = item;
  const date = parseISO(event.date);
  const weekday = getDay(date);
  const weekdays = t("common.datePicker.weekdays", { returnObjects: true }) as string[];
  const title = attendanceEventTitle(event, t);
  const status = effectiveAttendanceStatus(event);
  const closed = status === "closed";
  const unanswered = mode === "member" && isUnansweredOpen(item);
  const dateLabel = attendanceEventDateLabel(event, t);
  const savedNote = myAttendance?.note ?? "";

  const openNoteEditor = () => {
    setNoteDraft(savedNote);
    setEditingNote(true);
  };
  const saveNote = async () => {
    if (!onNoteSave || savingNote) return;
    setSavingNote(true);
    try {
      const ok = await onNoteSave(item, noteDraft.trim());
      if (ok) setEditingNote(false);
    } finally {
      setSavingNote(false);
    }
  };

  return (
    <View>
      <Pressable
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        onPress={() => onPress(item)}
        accessibilityRole="button"
        accessibilityLabel={
          selecting
            ? t("teams.mobile.attendanceTab.selectAria", { title: `${dateLabel} ${title}` })
            : t("teams.mobile.attendanceTab.rowAria", { date: dateLabel, title })
        }
        accessibilityState={selecting ? { checked: selected } : undefined}
        testID={`attendance-row-${event.id}`}
      >
        {selecting && (
          <View style={[styles.checkbox, selected && styles.checkboxOn]}>
            {selected && <Feather name="check" size={13} color="#FFFFFF" />}
          </View>
        )}
        <View style={styles.date}>
          <Text style={styles.day}>{isValid(date) ? date.getDate() : "-"}</Text>
          <Text
            style={[
              styles.weekday,
              weekday === 0 && styles.sunday,
              weekday === 6 && styles.saturday,
            ]}
          >
            {weekdays[weekday] ?? ""}
          </Text>
        </View>
        <View style={styles.body}>
          <View style={styles.titleLine}>
            {unanswered && <View style={styles.unansweredDot} />}
            <Text
              style={[styles.title, event.type === "competition" && styles.titleCompetition]}
              numberOfLines={1}
            >
              {title}
            </Text>
            {mode === "member" && closed && (
              <View style={styles.closedTag}>
                <Text style={styles.closedTagText}>{t("teams.mobile.attendanceTab.closedTag")}</Text>
              </View>
            )}
          </View>
          {!!event.place && (
            <Text style={styles.place} numberOfLines={1}>
              @ {event.place}
            </Text>
          )}
          {mode === "member" && !editingNote && (
            <Pressable
              onPress={openNoteEditor}
              hitSlop={{ top: 6, bottom: 6, right: 12 }}
              style={styles.noteButton}
              accessibilityRole="button"
              accessibilityLabel={t("teams.mobile.attendanceTab.noteEditAria", { title: `${dateLabel} ${title}` })}
              testID={`attendance-note-${event.id}`}
            >
              {savedNote ? (
                <>
                  <Feather name="edit-2" size={11} color="#2563EB" />
                  <Text style={styles.note} numberOfLines={1}>
                    {savedNote}
                  </Text>
                </>
              ) : (
                <Text style={styles.noteAdd}>{t("teams.mobile.attendanceTab.noteAdd")}</Text>
              )}
            </Pressable>
          )}
        </View>
        {mode === "member" ? (
          <AnswerSegment
            value={myAttendance?.status ?? null}
            onChange={(next) => onAnswer?.(item, next)}
            dimmed={closed}
            accessibilityTarget={`${dateLabel} ${title}`}
            testID={`attendance-answer-${event.id}`}
          />
        ) : selecting ? (
          <AttendanceStatusBadge status={status} />
        ) : (
          <AttendanceStatusDropdown
            status={status}
            onSelect={(next) => onStatusChange?.(item, next)}
            accessibilityLabel={t("teams.mobile.attendanceTab.statusPillAria", {
              title: `${dateLabel} ${title}`,
              status: t(
                closed
                  ? "teams.mobile.adminAttendance.statusClosed"
                  : "teams.mobile.adminAttendance.statusOpen",
              ),
            })}
            testID={`attendance-status-${event.id}`}
          />
        )}
      </Pressable>
      {editingNote && (
        <View style={styles.noteEditor}>
          <TextInput
            style={styles.noteInput}
            value={noteDraft}
            onChangeText={setNoteDraft}
            placeholder={t("teams.mobile.attendanceNotePlaceholder")}
            placeholderTextColor="#9CA3AF"
            maxLength={ATTENDANCE_NOTE_MAX_LENGTH}
            multiline
            autoFocus
            testID={`attendance-note-input-${event.id}`}
          />
          <View style={styles.noteActions}>
            <Pressable
              style={styles.noteCancel}
              onPress={() => setEditingNote(false)}
              disabled={savingNote}
              accessibilityRole="button"
              testID={`attendance-note-cancel-${event.id}`}
            >
              <Text style={styles.noteCancelText}>{t("common.cancel")}</Text>
            </Pressable>
            <Pressable
              style={[styles.noteSave, savingNote && styles.noteSaveDisabled]}
              onPress={saveNote}
              disabled={savingNote}
              accessibilityRole="button"
              accessibilityState={{ disabled: savingNote }}
              testID={`attendance-note-save-${event.id}`}
            >
              <Text style={styles.noteSaveText}>
                {savingNote ? t("teams.mobile.saveLoading") : t("teams.mobile.saveButton")}
              </Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#FFFFFF",
  },
  rowPressed: {
    backgroundColor: "#F9FAFB",
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#D1D5DB",
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxOn: {
    backgroundColor: "#2563EB",
    borderColor: "#2563EB",
  },
  date: {
    width: 32,
    alignItems: "center",
  },
  day: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    lineHeight: 19,
  },
  weekday: {
    fontSize: 10,
    color: "#6B7280",
  },
  sunday: {
    color: "#DC2626",
  },
  saturday: {
    color: "#2563EB",
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  titleLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  unansweredDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#D97706",
  },
  title: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  titleCompetition: {
    color: "#6D28D9",
  },
  closedTag: {
    backgroundColor: "#F3F4F6",
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  closedTagText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#6B7280",
  },
  place: {
    fontSize: 11.5,
    color: "#6B7280",
  },
  noteButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    maxWidth: "100%",
    gap: 4,
    marginTop: 2,
  },
  note: {
    flexShrink: 1,
    fontSize: 11.5,
    color: "#2563EB",
  },
  noteAdd: {
    fontSize: 11.5,
    fontWeight: "600",
    color: "#2563EB",
  },
  noteEditor: {
    paddingHorizontal: 12,
    paddingBottom: 10,
    paddingLeft: 54,
    gap: 8,
    backgroundColor: "#FFFFFF",
  },
  noteInput: {
    minHeight: 40,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13.5,
    color: "#111827",
    textAlignVertical: "top",
  },
  noteActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
  },
  noteCancel: {
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  noteCancelText: {
    fontSize: 13,
    color: "#6B7280",
  },
  noteSave: {
    backgroundColor: "#2563EB",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  noteSaveDisabled: {
    opacity: 0.5,
  },
  noteSaveText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
