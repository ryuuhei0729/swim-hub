"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import type { AttendanceStatus, AttendanceStatusType } from "@swim-hub/shared/types";
import { SlideUpModal } from "@/components/ui/SlideUpModal";
import { useSafeInsets } from "@/hooks/useSafeInsets";
import { getSafeFooterPadding } from "@/utils/safeFooterPadding";
import { useAuth } from "@/contexts/AuthProvider";
import {
  ATTENDANCE_NOTE_MAX_LENGTH,
  useEventAttendanceRows,
  useMemberAnswerEditor,
  useTeamAttendanceMembers,
} from "@/hooks/useTeamAttendance";
import {
  effectiveAttendanceStatus,
  groupAttendancePeople,
  type AttendanceListItem,
  type AttendancePerson,
} from "@/utils/teamAttendance";
import { AnswerSegment, ANSWER_COLORS } from "./AnswerSegment";
import { attendanceEventDateLabel, attendanceEventTitle } from "./AttendanceRow";

interface AttendanceEventModalProps {
  /** 開いているイベント (一覧のキャッシュから毎回取り直した最新のもの)。null で閉じる */
  item: AttendanceListItem | null;
  teamId: string;
  isAdminView: boolean;
  onClose: () => void;
  onAnswer: (item: AttendanceListItem, change: { status: AttendanceStatus | null; note: string }) => void;
  onChangeStatus: (item: AttendanceListItem, status: AttendanceStatusType) => void;
}

const GROUPS: {
  key: "present" | "absent" | "other" | "unanswered";
  titleKey: string;
  color: string;
}[] = [
  { key: "present", titleKey: "teams.attendanceGrouping.present", color: ANSWER_COLORS.present },
  { key: "absent", titleKey: "teams.attendanceGrouping.absent", color: ANSWER_COLORS.absent },
  { key: "other", titleKey: "teams.attendanceGrouping.other", color: ANSWER_COLORS.other },
  { key: "unanswered", titleKey: "teams.attendanceGrouping.unanswered", color: "#9CA3AF" },
];

/**
 * 1 つの練習・大会の出欠のモーダル
 * - 上: (管理者) 受付状態の切り替え / 自分の出欠と備考
 * - 下: 全員の出欠を 出席・欠席・その他・未回答 に分けて、備考と一緒に並べる
 *   (管理者は各メンバーの「変更」から答えを直せる)
 */
export const AttendanceEventModal: React.FC<AttendanceEventModalProps> = ({
  item,
  teamId,
  isAdminView,
  onClose,
  onAnswer,
  onChangeStatus,
}) => {
  const { t } = useTranslation();
  const insets = useSafeInsets();
  const { user } = useAuth();
  const visible = item !== null;
  // 閉じるアニメーションの間も中身を描き続けるため、最後に開いたイベントを覚えておく
  const [shown, setShown] = useState(item);
  if (item && item !== shown) setShown(item);
  const current = item ?? shown;
  const event = current?.event ?? null;

  const rowsQuery = useEventAttendanceRows(visible ? event : null);
  const membersQuery = useTeamAttendanceMembers(teamId, visible);
  const editMemberAnswer = useMemberAnswerEditor(teamId);

  const myStatus = current?.myAttendance?.status ?? null;
  const savedNote = current?.myAttendance?.note ?? "";
  const [note, setNote] = useState(savedNote);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const eventId = event?.id;
  // 別のイベントを開いたとき・保存で備考が変わったときは入力欄を保存済みの値に戻す
  useEffect(() => {
    setNote(savedNote);
  }, [savedNote, eventId]);
  useEffect(() => {
    setEditingUserId(null);
  }, [eventId]);

  const groups = useMemo(
    () => groupAttendancePeople(rowsQuery.data ?? [], membersQuery.data ?? [], user?.id),
    [rowsQuery.data, membersQuery.data, user?.id],
  );

  if (!current || !event) return null;

  const status = effectiveAttendanceStatus(event);
  const closed = status === "closed";
  const title = attendanceEventTitle(event, t);
  const dateLabel = attendanceEventDateLabel(event, t);
  const noteChanged = note.trim() !== savedNote.trim();

  const renderPerson = (person: AttendancePerson) => {
    const editing = editingUserId === person.userId;
    return (
      <View key={person.userId} style={styles.person}>
        <View style={styles.personLine}>
          <View style={[styles.avatar, person.isMe && styles.avatarMe]}>
            <Text style={[styles.avatarText, person.isMe && styles.avatarTextMe]}>
              {person.name.slice(0, 1)}
            </Text>
          </View>
          <View style={styles.personBody}>
            <Text style={[styles.personName, person.isMe && styles.personNameMe]} numberOfLines={1}>
              {person.isMe ? `${person.name}（${t("teams.mobile.attendanceTab.you")}）` : person.name}
            </Text>
            {!!person.note && <Text style={styles.personNote}>{person.note}</Text>}
          </View>
          {isAdminView && !person.isMe && (
            <Pressable
              onPress={() => setEditingUserId(editing ? null : person.userId)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t("teams.mobile.attendanceTab.editMemberAria", { name: person.name })}
              testID={`attendance-edit-member-${person.userId}`}
            >
              <Text style={styles.editLink}>
                {editing ? t("common.close") : t("teams.mobile.attendanceTab.editMember")}
              </Text>
            </Pressable>
          )}
        </View>
        {editing && (
          <View style={styles.personEdit}>
            <AnswerSegment
              value={person.status}
              size="large"
              accessibilityTarget={person.name}
              onChange={async (next) => {
                const ok = await editMemberAnswer(
                  event,
                  { userId: person.userId, attendanceId: person.attendanceId, note: person.note },
                  next,
                );
                if (ok) setEditingUserId(null);
              }}
            />
          </View>
        )}
      </View>
    );
  };

  const listLoading = rowsQuery.isLoading || membersQuery.isLoading;
  const listError = rowsQuery.isError || membersQuery.isError;

  return (
    <SlideUpModal
      visible={visible}
      onClose={onClose}
      backdropAccessibilityLabel={t("common.close")}
      overlayColor="rgba(15, 23, 42, 0.4)"
      sheetStyle={styles.sheet}
    >
      <View style={styles.grabber} />
      <View style={styles.header}>
        <View style={styles.headerBody}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {dateLabel} {title}
          </Text>
          <Text style={styles.headerSub} numberOfLines={1}>
            {event.place ? `@ ${event.place} ・ ` : ""}
            {t(closed ? "teams.mobile.adminAttendance.statusClosed" : "teams.mobile.adminAttendance.statusOpen")}
          </Text>
        </View>
        <Pressable
          onPress={onClose}
          style={styles.closeButton}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t("common.close")}
        >
          <Feather name="x" size={18} color="#6B7280" />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {isAdminView && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>{t("teams.mobile.attendanceTab.statusSection")}</Text>
            <View style={styles.statusToggle}>
              {(["open", "closed"] as const).map((value) => {
                const selected = status === value;
                return (
                  <Pressable
                    key={value}
                    style={[
                      styles.statusOption,
                      value === "closed" && styles.statusOptionDivider,
                      selected && (value === "open" ? styles.statusOpenOn : styles.statusClosedOn),
                    ]}
                    onPress={() => !selected && onChangeStatus(current, value)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    testID={`attendance-modal-status-${value}`}
                  >
                    <Text style={[styles.statusOptionText, selected && styles.statusOptionTextOn]}>
                      {t(
                        value === "open"
                          ? "teams.mobile.adminAttendance.statusOpen"
                          : "teams.mobile.adminAttendance.statusClosed",
                      )}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.help}>
              {t(
                closed
                  ? "teams.mobile.attendanceTab.statusHelpClosed"
                  : "teams.mobile.attendanceTab.statusHelpOpen",
              )}
            </Text>
          </View>
        )}

        <View style={styles.mine}>
          <View style={styles.mineHeader}>
            <Text style={styles.sectionLabel}>{t("teams.mobile.attendanceTab.myAnswer")}</Text>
            <Text style={styles.mineHint}>
              {t(
                closed
                  ? "teams.mobile.attendanceTab.myAnswerHintClosed"
                  : "teams.mobile.attendanceTab.myAnswerHint",
              )}
            </Text>
          </View>
          <AnswerSegment
            value={myStatus}
            size="large"
            dimmed={closed}
            accessibilityTarget={`${dateLabel} ${title}`}
            onChange={(next) => onAnswer(current, { status: next, note: savedNote })}
            testID="attendance-modal-answer"
          />
          <TextInput
            style={styles.noteInput}
            value={note}
            onChangeText={setNote}
            placeholder={t("teams.mobile.attendanceNotePlaceholder")}
            placeholderTextColor="#9CA3AF"
            maxLength={ATTENDANCE_NOTE_MAX_LENGTH}
            multiline
            testID="attendance-modal-note"
          />
          {noteChanged && (
            <Pressable
              style={styles.noteSave}
              onPress={() => onAnswer(current, { status: myStatus, note: note.trim() })}
              accessibilityRole="button"
              testID="attendance-modal-note-save"
            >
              <Text style={styles.noteSaveText}>{t("teams.mobile.attendanceTab.noteSave")}</Text>
            </Pressable>
          )}
        </View>

        <Text style={[styles.sectionLabel, styles.everyoneLabel]}>
          {t("teams.mobile.attendanceTab.everyone")}
        </Text>
        {listLoading ? (
          <ActivityIndicator style={styles.loading} color="#2563EB" />
        ) : listError ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{t("teams.attendanceStatusHook.loadError")}</Text>
            <Pressable
              onPress={() => {
                void rowsQuery.refetch();
                void membersQuery.refetch();
              }}
              accessibilityRole="button"
            >
              <Text style={styles.retryText}>{t("common.retry")}</Text>
            </Pressable>
          </View>
        ) : (
          GROUPS.map(({ key, titleKey, color }) => {
            const people = groups[key];
            if (people.length === 0) return null;
            return (
              <View key={key} style={styles.group}>
                <View style={styles.groupHeader}>
                  <View style={[styles.groupDot, { backgroundColor: color }]} />
                  <Text style={styles.groupTitle}>{t(titleKey, { count: people.length })}</Text>
                </View>
                {people.map(renderPerson)}
              </View>
            );
          })
        )}
      </ScrollView>
      <View style={{ height: getSafeFooterPadding(0, insets.bottom) }} />
    </SlideUpModal>
  );
};

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    maxHeight: "88%",
    overflow: "hidden",
  },
  grabber: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D1D5DB",
    marginTop: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  headerBody: {
    flex: 1,
    minWidth: 0,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#111827",
  },
  headerSub: {
    marginTop: 2,
    fontSize: 12,
    color: "#6B7280",
  },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  body: {
    padding: 16,
    paddingBottom: 24,
  },
  section: {
    marginBottom: 14,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#374151",
  },
  statusToggle: {
    flexDirection: "row",
    marginTop: 6,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    overflow: "hidden",
  },
  statusOption: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    backgroundColor: "#FFFFFF",
  },
  statusOptionDivider: {
    borderLeftWidth: 1,
    borderLeftColor: "#E5E7EB",
  },
  statusOpenOn: {
    backgroundColor: "#2563EB",
  },
  statusClosedOn: {
    backgroundColor: "#6B7280",
  },
  statusOptionText: {
    fontSize: 13.5,
    fontWeight: "700",
    color: "#6B7280",
  },
  statusOptionTextOn: {
    color: "#FFFFFF",
  },
  help: {
    marginTop: 6,
    fontSize: 11.5,
    lineHeight: 17,
    color: "#6B7280",
  },
  mine: {
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 12,
    gap: 8,
  },
  mineHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  mineHint: {
    flexShrink: 1,
    fontSize: 11,
    color: "#6B7280",
    textAlign: "right",
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
    backgroundColor: "#FFFFFF",
    textAlignVertical: "top",
  },
  noteSave: {
    alignSelf: "flex-end",
    backgroundColor: "#2563EB",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  noteSaveText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  everyoneLabel: {
    marginTop: 18,
    marginBottom: 2,
  },
  loading: {
    paddingVertical: 24,
  },
  errorBox: {
    marginTop: 8,
    padding: 12,
    borderRadius: 8,
    backgroundColor: "#FEF2F2",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: "#DC2626",
  },
  retryText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#2563EB",
  },
  group: {
    marginTop: 12,
  },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 2,
  },
  groupDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  groupTitle: {
    fontSize: 12.5,
    fontWeight: "800",
    color: "#111827",
  },
  person: {
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  personLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  avatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarMe: {
    backgroundColor: "#DBEAFE",
  },
  avatarText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#4B5563",
  },
  avatarTextMe: {
    color: "#1D4ED8",
  },
  personBody: {
    flex: 1,
    minWidth: 0,
  },
  personName: {
    fontSize: 13.5,
    color: "#111827",
  },
  personNameMe: {
    fontWeight: "700",
  },
  personNote: {
    marginTop: 1,
    fontSize: 12,
    color: "#6B7280",
  },
  editLink: {
    fontSize: 12.5,
    fontWeight: "700",
    color: "#2563EB",
  },
  personEdit: {
    marginTop: 8,
    marginLeft: 36,
  },
});
