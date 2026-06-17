import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  Alert,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { format, isValid, parseISO } from "date-fns";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useAuth } from "@/contexts/AuthProvider";
import {
  useUpdateAttendanceStatusMutation,
  useAttendanceByPracticeQuery,
  useAttendanceByCompetitionQuery,
} from "@apps/shared/hooks/queries/teams";
import type { TeamEvent } from "@swim-hub/shared/types";
import type { AttendanceStatusType, AttendanceStatus } from "@swim-hub/shared/types";
import type { SupportedLocale } from "@apps/shared/utils/date";
import { formatDate } from "@apps/shared/utils/date";
import { useDateLocale } from "@/hooks/useDateLocale";

export interface AdminMonthlyAttendanceProps {
  teamId: string;
}

interface EventCardProps {
  event: TeamEvent;
  isSaving: boolean;
  onToggleStatus: (event: TeamEvent) => void;
  t: TFunction;
  locale: SupportedLocale;
  supabase: SupabaseClient;
}

// イベントカードの展開状態とメンバー別出欠パネルを管理するサブコンポーネント
const EventCard: React.FC<EventCardProps> = ({
  event,
  isSaving,
  onToggleStatus,
  t,
  locale,
  supabase,
}) => {
  const [expanded, setExpanded] = useState(false);

  const dateStr = event.date;
  const dateObj = parseISO(dateStr);
  const formattedDate = isValid(dateObj)
    ? formatDate(dateStr, "shortWithWeekday", locale)
    : dateStr;

  const eventTitle =
    event.type === "competition"
      ? (event.title ?? t("teams.mobile.adminAttendance.defaultCompetition"))
      : t("teams.mobile.adminAttendance.defaultPractice");

  // 練習は useAttendanceByPracticeQuery、大会は useAttendanceByCompetitionQuery でメンバー別出欠を取得
  const practiceAttendanceQuery = useAttendanceByPracticeQuery(
    supabase,
    event.type === "practice" && expanded ? event.id : undefined,
  );
  const competitionAttendanceQuery = useAttendanceByCompetitionQuery(
    supabase,
    event.type === "competition" && expanded ? event.id : undefined,
  );

  const attendanceQuery =
    event.type === "practice" ? practiceAttendanceQuery : competitionAttendanceQuery;

  const renderReceiptStatusBadge = (status: AttendanceStatusType | null | undefined) => {
    switch (status) {
      case "open":
        return (
          <View style={styles.statusBadgeOpen}>
            <Text style={styles.statusBadgeTextOpen}>
              {t("teams.mobile.adminAttendance.statusOpen")}
            </Text>
          </View>
        );
      case "closed":
        return (
          <View style={styles.statusBadgeClosed}>
            <Text style={styles.statusBadgeTextClosed}>
              {t("teams.mobile.adminAttendance.statusClosed")}
            </Text>
          </View>
        );
      default:
        return (
          <View style={styles.statusBadgeDefault}>
            <Text style={styles.statusBadgeTextDefault}>
              {t("common.notSet")}
            </Text>
          </View>
        );
    }
  };

  const getMemberStatusLabel = (status: AttendanceStatus | null): string => {
    switch (status) {
      case "present":
        return t("teams.mobile.adminAttendance.memberStatusPresent");
      case "absent":
        return t("teams.mobile.adminAttendance.memberStatusAbsent");
      case "other":
        return t("teams.mobile.adminAttendance.memberStatusOther");
      default:
        return t("teams.mobile.adminAttendance.memberStatusUnanswered");
    }
  };

  const getMemberStatusBadgeStyle = (status: AttendanceStatus | null) => {
    switch (status) {
      case "present":
        return styles.memberStatusPresent;
      case "absent":
        return styles.memberStatusAbsent;
      case "other":
        return styles.memberStatusOther;
      default:
        return styles.memberStatusUnanswered;
    }
  };

  const getMemberStatusTextStyle = (status: AttendanceStatus | null) => {
    switch (status) {
      case "present":
        return styles.memberStatusTextPresent;
      case "absent":
        return styles.memberStatusTextAbsent;
      case "other":
        return styles.memberStatusTextOther;
      default:
        return styles.memberStatusTextUnanswered;
    }
  };

  return (
    <View
      style={[
        styles.eventCard,
        event.type === "competition" && styles.eventCardCompetition,
      ]}
    >
      <View style={styles.eventCardHeader}>
        <View style={styles.eventInfo}>
          <Text style={styles.eventDate}>{formattedDate}</Text>
          <Text style={styles.eventTitle} numberOfLines={1}>
            {eventTitle}
          </Text>
          {event.place && (
            <Text style={styles.eventPlace} numberOfLines={1}>
              @{event.place}
            </Text>
          )}
        </View>
        {renderReceiptStatusBadge(event.attendance_status)}
      </View>

      <View style={styles.eventActions}>
        <Pressable
          style={[styles.toggleButton, isSaving && styles.toggleButtonDisabled]}
          onPress={() => onToggleStatus(event)}
          disabled={isSaving}
          accessibilityLabel={t("teams.mobile.adminAttendance.toggleStatusAria", {
            title: eventTitle,
          })}
        >
          <Feather
            name={event.attendance_status === "open" ? "lock" : "unlock"}
            size={14}
            color="#FFFFFF"
          />
          <Text style={styles.toggleButtonText}>
            {isSaving
              ? t("teams.mobile.saveLoading")
              : event.attendance_status === "open"
                ? t("teams.mobile.adminAttendance.closeButton")
                : t("teams.mobile.adminAttendance.openButton")}
          </Text>
        </Pressable>

        <Pressable
          style={styles.expandButton}
          onPress={() => setExpanded((prev) => !prev)}
          accessibilityLabel={t("teams.mobile.adminAttendance.memberAttendanceTitle")}
        >
          <Feather
            name={expanded ? "chevron-up" : "chevron-down"}
            size={14}
            color="#6B7280"
          />
        </Pressable>
      </View>

      {expanded && (
        <View style={styles.memberAttendancePanel}>
          <Text style={styles.memberAttendancePanelTitle}>
            {t("teams.mobile.adminAttendance.memberAttendanceTitle")}
          </Text>
          {attendanceQuery.isLoading && (
            <Text style={styles.memberAttendanceInfoText}>
              {t("teams.mobile.adminAttendance.memberAttendanceLoading")}
            </Text>
          )}
          {attendanceQuery.isError && (
            <Text style={styles.memberAttendanceErrorText}>
              {t("teams.mobile.adminAttendance.memberAttendanceFetchFailed")}
            </Text>
          )}
          {attendanceQuery.isSuccess && attendanceQuery.data.length === 0 && (
            <Text style={styles.memberAttendanceInfoText}>
              {t("teams.mobile.adminAttendance.memberAttendanceEmpty")}
            </Text>
          )}
          {attendanceQuery.isSuccess && attendanceQuery.data.length > 0 && (
            <View style={styles.memberList}>
              {attendanceQuery.data.map((att) => (
                <View key={att.id} style={styles.memberRow}>
                  <Text style={styles.memberName} numberOfLines={1}>
                    {att.user?.name ?? att.user_id}
                  </Text>
                  <View style={getMemberStatusBadgeStyle(att.status)}>
                    <Text style={getMemberStatusTextStyle(att.status)}>
                      {getMemberStatusLabel(att.status)}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      )}
    </View>
  );
};

export const AdminMonthlyAttendance: React.FC<AdminMonthlyAttendanceProps> = ({ teamId }) => {
  const { supabase } = useAuth();
  const { t } = useTranslation();
  const locale = useDateLocale();

  const [events, setEvents] = useState<TeamEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const updateStatusMutation = useUpdateAttendanceStatusMutation(supabase);

  // NOTE: イベント一覧は直接 Supabase クエリで取得する。MyMonthlyAttendance パターンと同様に、
  // チーム全体の未来イベントを一括取得する用途には useTeamPracticesQuery/useTeamCompetitionsQuery
  // が過去データも含むため適さず、直接クエリの方が date フィルタを簡潔に適用できる。
  const loadFutureEvents = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const todayStr = format(new Date(), "yyyy-MM-dd");

      const [practicesResult, competitionsResult] = await Promise.all([
        supabase
          .from("practices")
          .select("*")
          .eq("team_id", teamId)
          .gte("date", todayStr)
          .order("date", { ascending: true }),
        supabase
          .from("competitions")
          .select("*")
          .eq("team_id", teamId)
          .gte("date", todayStr)
          .order("date", { ascending: true }),
      ]);

      if (practicesResult.error) throw practicesResult.error;
      if (competitionsResult.error) throw competitionsResult.error;

      const practices = (practicesResult.data || []).map((p) => ({
        ...p,
        type: "practice" as const,
      }));
      const competitions = (competitionsResult.data || []).map((c) => ({
        ...c,
        type: "competition" as const,
      }));
      const allEvents = [...practices, ...competitions].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      );
      setEvents(allEvents);
    } catch (err) {
      console.error("AdminMonthlyAttendance: failed to load events", err);
      setError(t("teams.mobile.adminAttendance.fetchFailed"));
    } finally {
      setLoading(false);
    }
  }, [teamId, supabase, t]);

  useEffect(() => {
    loadFutureEvents();
  }, [loadFutureEvents]);

  const handleToggleStatus = useCallback(
    (event: TeamEvent) => {
      const current = event.attendance_status ?? null;
      const next: AttendanceStatusType | null = current === "open" ? "closed" : "open";

      const confirmKey =
        next === "open"
          ? "teams.mobile.adminAttendance.confirmOpen"
          : "teams.mobile.adminAttendance.confirmClose";

      Alert.alert(
        t("teams.mobile.adminAttendance.confirmTitle"),
        t(confirmKey),
        [
          { text: t("common.cancel"), style: "cancel" },
          {
            text: t("common.ok"),
            onPress: async () => {
              // 楽観的更新: 成功を見越して先にローカル state を更新し、失敗時はロールバック
              const previousEvents = events;
              setEvents((prev) =>
                prev.map((e) =>
                  e.id === event.id ? { ...e, attendance_status: next } : e,
                ),
              );
              try {
                await updateStatusMutation.mutateAsync({
                  eventId: event.id,
                  eventType: event.type,
                  status: next,
                });
              } catch (err) {
                // 失敗時は変更前 state に復元してサーバ状態と同期
                setEvents(previousEvents);
                console.error("AdminMonthlyAttendance: failed to update status", err);
                const msg =
                  err instanceof Error
                    ? err.message
                    : t("teams.mobile.adminAttendance.saveFailed");
                Alert.alert(t("common.error"), msg, [{ text: t("common.ok") }]);
              }
            },
          },
        ],
      );
    },
    [t, updateStatusMutation, events],
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>{t("common.loading")}</Text>
        </View>
      </View>
    );
  }

  if (error && events.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retryButton} onPress={loadFutureEvents}>
            <Feather name="refresh-cw" size={14} color="#FFFFFF" />
            <Text style={styles.retryButtonText}>{t("common.retry")}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      {error && (
        <View style={styles.inlineErrorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {events.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Feather name="calendar" size={40} color="#D1D5DB" />
          <Text style={styles.emptyText}>{t("teams.mobile.adminAttendance.empty")}</Text>
        </View>
      ) : (
        <View style={styles.eventList}>
          {events.map((event) => {
            const isSaving =
              updateStatusMutation.isPending &&
              updateStatusMutation.variables?.eventId === event.id;

            return (
              <EventCard
                key={`${event.type}-${event.id}`}
                event={event}
                isSaving={isSaving}
                onToggleStatus={handleToggleStatus}
                t={t}
                locale={locale}
                supabase={supabase}
              />
            );
          })}
        </View>
      )}
    </ScrollView>
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
    alignItems: "center",
    gap: 12,
  },
  inlineErrorContainer: {
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  errorText: {
    color: "#DC2626",
    fontSize: 14,
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
  retryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  emptyContainer: {
    backgroundColor: "#F9FAFB",
    borderRadius: 8,
    padding: 40,
    alignItems: "center",
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
    color: "#6B7280",
    textAlign: "center",
  },
  eventList: {
    gap: 12,
  },
  eventCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    padding: 14,
    gap: 10,
  },
  eventCardCompetition: {
    backgroundColor: "#F5F3FF",
    borderColor: "#DDD6FE",
  },
  eventCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 8,
  },
  eventInfo: {
    flex: 1,
    gap: 2,
  },
  eventDate: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
  },
  eventTitle: {
    fontSize: 15,
    fontWeight: "500",
    color: "#111827",
  },
  eventPlace: {
    fontSize: 13,
    color: "#6B7280",
  },
  statusBadgeOpen: {
    backgroundColor: "#DBEAFE",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    flexShrink: 0,
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
    flexShrink: 0,
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
    flexShrink: 0,
  },
  statusBadgeTextDefault: {
    fontSize: 12,
    color: "#374151",
    fontWeight: "500",
  },
  eventActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  toggleButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#2563EB",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 6,
  },
  toggleButtonDisabled: {
    opacity: 0.5,
  },
  toggleButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "600",
  },
  expandButton: {
    padding: 8,
    borderRadius: 6,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  memberAttendancePanel: {
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    paddingTop: 10,
    gap: 8,
  },
  memberAttendancePanelTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
  },
  memberAttendanceInfoText: {
    fontSize: 13,
    color: "#6B7280",
  },
  memberAttendanceErrorText: {
    fontSize: 13,
    color: "#DC2626",
  },
  memberList: {
    gap: 6,
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  memberName: {
    flex: 1,
    fontSize: 13,
    color: "#111827",
  },
  memberStatusPresent: {
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    flexShrink: 0,
  },
  memberStatusTextPresent: {
    fontSize: 12,
    color: "#166534",
    fontWeight: "500",
  },
  memberStatusAbsent: {
    backgroundColor: "#FEE2E2",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    flexShrink: 0,
  },
  memberStatusTextAbsent: {
    fontSize: 12,
    color: "#991B1B",
    fontWeight: "500",
  },
  memberStatusOther: {
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    flexShrink: 0,
  },
  memberStatusTextOther: {
    fontSize: 12,
    color: "#92400E",
    fontWeight: "500",
  },
  memberStatusUnanswered: {
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    flexShrink: 0,
  },
  memberStatusTextUnanswered: {
    fontSize: 12,
    color: "#6B7280",
    fontWeight: "500",
  },
});
