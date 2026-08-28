import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AttendanceAPI } from "@swim-hub/shared/api/attendance";
import { useAttendanceGrouping } from "@apps/shared/hooks/useAttendanceGrouping";
import { fetchTeamMembers, type TeamMember } from "@apps/shared/utils/team";
import type { TeamAttendanceWithDetails } from "@swim-hub/shared/types/attendance";
import { formatDate, type SupportedLocale } from "@apps/shared/utils/date";
import {
  AttendanceGroupSection,
  ATTENDANCE_GROUP_TITLE_COLORS,
} from "./AttendanceGroupSection";
import { SlideUpModal } from "@/components/ui/SlideUpModal";

/** 背面タップでは閉じない (元実装どおり、背面タップ用の Pressable が存在しない) */
const NOOP_BACKDROP_PRESS = () => {};

export interface AttendanceGroupModalProps {
  visible: boolean;
  onClose: () => void;
  supabase: SupabaseClient;
  teamId: string;
  eventId: string | null;
  eventType: "practice" | "competition" | null;
  eventDate: string | null;
  locale: SupportedLocale;
  /**
   * true の場合、フッターに「出欠を変更する」導線を表示する。
   * DayDetailModal(T-6)からの最小フットプリント表示で使用。MyMonthlyAttendance(T-5b)からは
   * 既にその画面自体が出欠編集の起点のため付与しない。
   */
  showChangeLink?: boolean;
  onChangeLinkPress?: () => void;
}

/**
 * 出席/欠席/その他/未回答の4グループ閲覧モーダル（一般メンバー向け・閲覧専用）。
 *
 * web AttendanceStatusModal + AttendanceGroupingDisplay 相当。MyMonthlyAttendance(T-5b)と
 * DayDetailModal(T-6)の両方から同一実装を再利用する（フォーク禁止）。
 * 表示するイベント(practice/competition)の出欠データとチーム名簿を自前で取得する。
 */
export const AttendanceGroupModal: React.FC<AttendanceGroupModalProps> = ({
  visible,
  onClose,
  supabase,
  teamId,
  eventId,
  eventType,
  eventDate,
  locale,
  showChangeLink = false,
  onChangeLinkPress,
}) => {
  const { t } = useTranslation();
  const attendanceAPI = useMemo(() => new AttendanceAPI(supabase), [supabase]);

  const [attendanceData, setAttendanceData] = useState<
    TeamAttendanceWithDetails[]
  >([]);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [attendanceError, setAttendanceError] = useState(false);

  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [teamMembersLoading, setTeamMembersLoading] = useState(true);
  const [teamMembersError, setTeamMembersError] = useState(false);

  // チーム名簿は visible になった時にだけ取得する。AdminMonthlyAttendance は画面レベルで
  // 1つのインスタンスが N 個の EventCard に名簿を配るため mount 時の1回取得で済むが、
  // この AttendanceGroupModal は DayDetailModal 内でカレンダーアイテムの数だけ
  // インスタンス化される（=N 個のモーダルが同時に存在しうる）。mount 時に無条件取得すると
  // ユーザーがボタンを一度も押していなくても teamId 分の fetchTeamMembers が並走してしまうため、
  // loadAttendance と同じく visible をガードにして、実際にシートが開かれるまで取得しない。
  const loadTeamMembers = useCallback(async () => {
    try {
      setTeamMembersLoading(true);
      setTeamMembersError(false);
      const members = await fetchTeamMembers(supabase, teamId);
      setTeamMembers(members);
    } catch (err) {
      console.error("AttendanceGroupModal: failed to fetch team members", err);
      setTeamMembersError(true);
    } finally {
      setTeamMembersLoading(false);
    }
  }, [teamId, supabase]);

  useEffect(() => {
    if (visible) {
      loadTeamMembers();
    }
  }, [visible, loadTeamMembers]);

  const loadAttendance = useCallback(async () => {
    if (!eventId || !eventType) return;
    try {
      setAttendanceLoading(true);
      setAttendanceError(false);
      const data =
        eventType === "practice"
          ? await attendanceAPI.getAttendanceByPractice(eventId)
          : await attendanceAPI.getAttendanceByCompetition(eventId);
      setAttendanceData(data);
    } catch (err) {
      console.error("AttendanceGroupModal: failed to fetch attendance", err);
      setAttendanceError(true);
    } finally {
      setAttendanceLoading(false);
    }
  }, [eventId, eventType, attendanceAPI]);

  useEffect(() => {
    if (visible && eventId && eventType) {
      loadAttendance();
    }
  }, [visible, eventId, eventType, loadAttendance]);

  const grouping = useAttendanceGrouping(attendanceData, teamMembers);

  const title = eventDate
    ? `${formatDate(eventDate, "shortWithWeekday", locale)}${t("teams.attendanceStatusModal.title")}`
    : t("teams.attendanceStatusModal.title");

  return (
    <SlideUpModal
      visible={visible}
      onClose={onClose}
      onBackdropPress={NOOP_BACKDROP_PRESS}
      overlayColor="rgba(0,0,0,0.4)"
      sheetStyle={styles.sheet}
    >
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Pressable
          onPress={onClose}
          style={styles.closeIcon}
          accessibilityRole="button"
        >
          <Feather name="x" size={22} color="#6B7280" />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
      >
        {attendanceLoading ? (
          <View style={styles.infoContainer}>
            <Text style={styles.infoText}>{t("common.loading")}</Text>
          </View>
        ) : attendanceError ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>
              {t("teams.attendanceStatusHook.loadError")}
            </Text>
            <Pressable
              style={styles.retryButton}
              onPress={loadAttendance}
              accessibilityRole="button"
            >
              <Feather name="refresh-cw" size={14} color="#FFFFFF" />
              <Text style={styles.retryButtonText}>{t("common.retry")}</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.memberGroups}>
            <AttendanceGroupSection
              title={t("teams.attendanceGrouping.present", {
                count: grouping.presentMembers.length,
              })}
              titleStyle={ATTENDANCE_GROUP_TITLE_COLORS.present}
              members={grouping.presentMembers}
              emptyText={t("teams.attendanceGrouping.none")}
            />
            <AttendanceGroupSection
              title={t("teams.attendanceGrouping.absent", {
                count: grouping.absentMembers.length,
              })}
              titleStyle={ATTENDANCE_GROUP_TITLE_COLORS.absent}
              members={grouping.absentMembers}
              emptyText={t("teams.attendanceGrouping.none")}
            />
            <AttendanceGroupSection
              title={t("teams.attendanceGrouping.other", {
                count: grouping.otherMembers.length,
              })}
              titleStyle={ATTENDANCE_GROUP_TITLE_COLORS.other}
              members={grouping.otherMembers}
              emptyText={t("teams.attendanceGrouping.none")}
            />

            {/* 未回答: 名簿取得失敗時に0件表示にせず、エラー行+再試行を出す
                （AdminMonthlyAttendance の既存パターンを踏襲） */}
            {teamMembersLoading ? (
              <View style={styles.memberGroupSection}>
                <Text style={styles.infoText}>
                  {t("teams.mobile.adminAttendance.memberAttendanceLoading")}
                </Text>
              </View>
            ) : teamMembersError ? (
              <View style={styles.memberGroupSection}>
                <Text style={styles.errorTextInline}>
                  {t("teams.mobile.adminAttendance.teamMembersFetchFailed")}
                </Text>
                <Pressable
                  style={[styles.retryButton, styles.retryButtonInline]}
                  onPress={loadTeamMembers}
                  accessibilityRole="button"
                >
                  <Feather name="refresh-cw" size={14} color="#FFFFFF" />
                  <Text style={styles.retryButtonText}>
                    {t("common.retry")}
                  </Text>
                </Pressable>
              </View>
            ) : (
              <AttendanceGroupSection
                title={t("teams.attendanceGrouping.unanswered", {
                  count: grouping.unansweredMembers.length,
                })}
                titleStyle={ATTENDANCE_GROUP_TITLE_COLORS.unanswered}
                members={grouping.unansweredMembers}
                emptyText={t("teams.attendanceGrouping.none")}
              />
            )}
          </View>
        )}
      </ScrollView>

      {showChangeLink && onChangeLinkPress && (
        <View style={styles.footer}>
          <Pressable
            style={styles.changeLinkButton}
            onPress={onChangeLinkPress}
            accessibilityRole="button"
          >
            <Feather name="edit-3" size={16} color="#FFFFFF" />
            <Text style={styles.changeLinkButtonText}>
              {t("dashboard.attendance.changeButton")}
            </Text>
          </Pressable>
        </View>
      )}
    </SlideUpModal>
  );
};

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: "85%",
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    gap: 8,
  },
  title: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  closeIcon: {
    padding: 4,
  },
  body: {
    padding: 16,
  },
  memberGroups: {
    gap: 12,
  },
  memberGroupSection: {
    gap: 4,
  },
  infoContainer: {
    paddingVertical: 24,
    alignItems: "center",
  },
  infoText: {
    fontSize: 13,
    color: "#6B7280",
  },
  errorContainer: {
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
    gap: 12,
  },
  errorText: {
    color: "#DC2626",
    fontSize: 14,
  },
  errorTextInline: {
    fontSize: 13,
    color: "#DC2626",
  },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#EF4444",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  retryButtonInline: {
    alignSelf: "flex-start",
  },
  retryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  footer: {
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  changeLinkButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#2563EB",
    paddingVertical: 12,
    borderRadius: 8,
  },
  changeLinkButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
});
