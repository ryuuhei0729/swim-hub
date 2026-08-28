import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
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
import { useAttendanceGrouping } from "@apps/shared/hooks/useAttendanceGrouping";
import { fetchTeamMembers, type TeamMember } from "@apps/shared/utils/team";
import type { TeamEvent } from "@swim-hub/shared/types";
import type { AttendanceStatusType } from "@swim-hub/shared/types";
import type { SupportedLocale } from "@apps/shared/utils/date";
import { formatDate } from "@apps/shared/utils/date";
import { useDateLocale } from "@/hooks/useDateLocale";
import { AttendanceGroupSection } from "./AttendanceGroupSection";
import { SlideUpModal } from "@/components/ui/SlideUpModal";

/** 背面タップでは閉じない (元実装どおり、背面タップ用の Pressable が存在しない) */
const NOOP_BACKDROP_PRESS = () => {};

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
  /** チーム全メンバー（親で teamId 単位に1回だけ取得し、EventCard ごとの再フェッチを避ける） */
  teamMembers: TeamMember[];
  teamMembersLoading: boolean;
  teamMembersError: boolean;
  /** 名簿取得の再試行（loadFutureEvents の再試行ボタンと同一パターン） */
  onRetryTeamMembers: () => void;
}

// イベントカードの展開状態とメンバー別出欠パネルを管理するサブコンポーネント
const EventCard: React.FC<EventCardProps> = ({
  event,
  isSaving,
  onToggleStatus,
  t,
  locale,
  supabase,
  teamMembers,
  teamMembersLoading,
  teamMembersError,
  onRetryTeamMembers,
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
    event.type === "practice"
      ? practiceAttendanceQuery
      : competitionAttendanceQuery;

  // 出席/欠席/その他/未回答の4グループに分類（web AttendanceGroupingDisplay と同一の共有フック）
  const grouping = useAttendanceGrouping(
    attendanceQuery.data ?? [],
    teamMembers,
  );

  const renderReceiptStatusBadge = (
    status: AttendanceStatusType | null | undefined,
  ) => {
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
          accessibilityLabel={t(
            "teams.mobile.adminAttendance.toggleStatusAria",
            {
              title: eventTitle,
            },
          )}
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
          accessibilityLabel={t(
            "teams.mobile.adminAttendance.memberAttendanceTitle",
          )}
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
          {attendanceQuery.isSuccess && (
            <View style={styles.memberGroups}>
              <AttendanceGroupSection
                title={t("teams.attendanceGrouping.present", {
                  count: grouping.presentMembers.length,
                })}
                titleStyle={styles.memberStatusTextPresent}
                members={grouping.presentMembers}
                emptyText={t("teams.attendanceGrouping.none")}
              />
              <AttendanceGroupSection
                title={t("teams.attendanceGrouping.absent", {
                  count: grouping.absentMembers.length,
                })}
                titleStyle={styles.memberStatusTextAbsent}
                members={grouping.absentMembers}
                emptyText={t("teams.attendanceGrouping.none")}
              />
              <AttendanceGroupSection
                title={t("teams.attendanceGrouping.other", {
                  count: grouping.otherMembers.length,
                })}
                titleStyle={styles.memberStatusTextOther}
                members={grouping.otherMembers}
                emptyText={t("teams.attendanceGrouping.none")}
              />

              {/* 未回答: 名簿(teamMembers)取得の成否に応じて表示を分岐（PM 裁定:
                  取得失敗時に0件表示・非表示にせず、控えめなエラー行を出す） */}
              {teamMembersLoading ? (
                <View style={styles.memberGroupSection}>
                  <Text style={styles.memberAttendanceInfoText}>
                    {t("teams.mobile.adminAttendance.memberAttendanceLoading")}
                  </Text>
                </View>
              ) : teamMembersError ? (
                <View style={styles.memberGroupSection}>
                  <Text style={styles.memberAttendanceErrorText}>
                    {t("teams.mobile.adminAttendance.teamMembersFetchFailed")}
                  </Text>
                  <Pressable
                    style={[styles.retryButton, styles.retryButtonInline]}
                    onPress={onRetryTeamMembers}
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
                  titleStyle={styles.memberStatusTextUnanswered}
                  members={grouping.unansweredMembers}
                  emptyText={t("teams.attendanceGrouping.none")}
                />
              )}
            </View>
          )}
        </View>
      )}
    </View>
  );
};

// 月ごとにイベントをグルーピング（web BulkChangeModal.groupEventsByMonth 相当）
interface EventMonthGroup {
  year: number;
  month: number;
  events: TeamEvent[];
}

function groupEventsByMonth(events: TeamEvent[]): EventMonthGroup[] {
  const grouped: Record<string, EventMonthGroup> = {};
  events.forEach((event) => {
    const date = new Date(event.date);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const key = `${year}-${month}`;
    if (!grouped[key]) {
      grouped[key] = { year, month, events: [] };
    }
    grouped[key].events.push(event);
  });
  return Object.values(grouped).sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.month - b.month;
  });
}

interface BulkChangeSheetProps {
  visible: boolean;
  events: TeamEvent[];
  isSaving: boolean;
  onClose: () => void;
  onBulkUpdate: (
    selectedEventIds: Set<string>,
    status: "open" | "closed",
  ) => Promise<void>;
  t: TFunction;
  locale: SupportedLocale;
}

// 一括ステータス変更ボトムシート（web BulkChangeModal 相当）。
// TeamCompetitionEntryModal のシート UI パターンに揃える。
const BulkChangeSheet: React.FC<BulkChangeSheetProps> = ({
  visible,
  events,
  isSaving,
  onClose,
  onBulkUpdate,
  t,
  locale,
}) => {
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(
    new Set(),
  );

  const groupedEvents = useMemo(() => groupEventsByMonth(events), [events]);

  const handleToggleMonth = (monthEvents: TeamEvent[]) => {
    const monthEventIds = monthEvents.map((e) => e.id);
    const allSelected = monthEventIds.every((id) => selectedEventIds.has(id));
    setSelectedEventIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        monthEventIds.forEach((id) => next.delete(id));
      } else {
        monthEventIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const handleToggleEvent = (eventId: string) => {
    setSelectedEventIds((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) {
        next.delete(eventId);
      } else {
        next.add(eventId);
      }
      return next;
    });
  };

  const isMonthAllSelected = (monthEvents: TeamEvent[]) =>
    monthEvents.length > 0 &&
    monthEvents.every((e) => selectedEventIds.has(e.id));

  const getStatusLabel = (status: "open" | "closed" | null | undefined) => {
    if (status === "open")
      return t("teams.mobile.adminAttendance.bulkChange.statusOpen");
    if (status === "closed")
      return t("teams.mobile.adminAttendance.bulkChange.statusClosed");
    return t("teams.mobile.adminAttendance.bulkChange.statusUnset");
  };

  const getStatusTextStyle = (status: "open" | "closed" | null | undefined) => {
    if (status === "open") return styles.bulkStatusOpen;
    if (status === "closed") return styles.bulkStatusClosed;
    return styles.bulkStatusUnset;
  };

  const handleUpdate = async (status: "open" | "closed") => {
    await onBulkUpdate(selectedEventIds, status);
    setSelectedEventIds(new Set());
  };

  const handleClose = () => {
    setSelectedEventIds(new Set());
    onClose();
  };

  const hasSelection = selectedEventIds.size > 0;

  return (
    <SlideUpModal
      visible={visible}
      onClose={handleClose}
      onBackdropPress={NOOP_BACKDROP_PRESS}
      overlayColor="rgba(0,0,0,0.4)"
      sheetStyle={styles.bulkSheet}
    >
      <View style={styles.bulkHeader}>
        <Text style={styles.bulkTitle} numberOfLines={1}>
          {t("teams.mobile.adminAttendance.bulkChange.title")}
        </Text>
        <Pressable
          onPress={handleClose}
          style={styles.bulkCloseIcon}
          accessibilityRole="button"
        >
          <Feather name="x" size={22} color="#6B7280" />
        </Pressable>
      </View>

      {groupedEvents.length === 0 ? (
        <View style={styles.bulkEmptyBlock}>
          <Text style={styles.bulkEmptyText}>
            {t("teams.mobile.adminAttendance.bulkChange.empty")}
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.bulkBody}
          showsVerticalScrollIndicator={false}
        >
          {groupedEvents.map((group) => {
            const allSelected = isMonthAllSelected(group.events);
            return (
              <View
                key={`${group.year}-${group.month}`}
                style={styles.bulkMonthGroup}
              >
                <Pressable
                  style={styles.bulkMonthHeader}
                  onPress={() => handleToggleMonth(group.events)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: allSelected }}
                >
                  <Feather
                    name={allSelected ? "check-square" : "square"}
                    size={18}
                    color={allSelected ? "#2563EB" : "#9CA3AF"}
                  />
                  <Text style={styles.bulkMonthLabel}>
                    {t("common.yearMonth", {
                      year: group.year,
                      month: group.month,
                    })}
                  </Text>
                  <Text style={styles.bulkSelectAllHint}>
                    {t("teams.mobile.adminAttendance.bulkChange.selectAll")}
                  </Text>
                </Pressable>

                {group.events.map((event) => {
                  const isSelected = selectedEventIds.has(event.id);
                  const title =
                    event.type === "competition"
                      ? (event.title ??
                        t("teams.mobile.adminAttendance.defaultCompetition"))
                      : t("teams.mobile.adminAttendance.defaultPractice");
                  return (
                    <Pressable
                      key={event.id}
                      style={styles.bulkEventRow}
                      onPress={() => handleToggleEvent(event.id)}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: isSelected }}
                    >
                      <Feather
                        name={isSelected ? "check-square" : "square"}
                        size={16}
                        color={isSelected ? "#2563EB" : "#9CA3AF"}
                      />
                      <View style={styles.bulkEventInfo}>
                        <Text style={styles.bulkEventDate}>
                          {formatDate(event.date, "shortWithWeekday", locale)}
                        </Text>
                        {event.type === "competition" && (
                          <Text style={styles.bulkCompetitionLabel}>
                            {t(
                              "teams.mobile.adminAttendance.bulkChange.competitionLabel",
                            )}
                          </Text>
                        )}
                        <Text style={styles.bulkEventTitle} numberOfLines={1}>
                          {title}
                        </Text>
                        <Text
                          style={[
                            styles.bulkEventStatus,
                            getStatusTextStyle(event.attendance_status),
                          ]}
                        >
                          [{getStatusLabel(event.attendance_status)}]
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            );
          })}
        </ScrollView>
      )}

      {groupedEvents.length > 0 && (
        <SafeAreaView edges={["bottom"]} style={styles.bulkFooter}>
          <Pressable
            style={[
              styles.bulkActionButton,
              styles.bulkOpenButton,
              (!hasSelection || isSaving) && styles.bulkActionDisabled,
            ]}
            onPress={() => handleUpdate("open")}
            disabled={!hasSelection || isSaving}
            accessibilityRole="button"
          >
            <Text style={styles.bulkActionText}>
              {t("teams.mobile.adminAttendance.bulkChange.openButton")}
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.bulkActionButton,
              styles.bulkClosedButton,
              (!hasSelection || isSaving) && styles.bulkActionDisabled,
            ]}
            onPress={() => handleUpdate("closed")}
            disabled={!hasSelection || isSaving}
            accessibilityRole="button"
          >
            <Text style={styles.bulkActionText}>
              {t("teams.mobile.adminAttendance.bulkChange.closedButton")}
            </Text>
          </Pressable>
        </SafeAreaView>
      )}
    </SlideUpModal>
  );
};

export const AdminMonthlyAttendance: React.FC<AdminMonthlyAttendanceProps> = ({
  teamId,
}) => {
  const { supabase } = useAuth();
  const { t } = useTranslation();
  const locale = useDateLocale();

  const [events, setEvents] = useState<TeamEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bulkSheetVisible, setBulkSheetVisible] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);

  const updateStatusMutation = useUpdateAttendanceStatusMutation(supabase);

  // チーム全メンバー（名簿）を teamId 単位に1回だけ取得する。EventCard 展開のたびに
  // 再フェッチしないよう、親コンポーネントで一括取得して EventCard へ prop 配布する
  // （下の loadFutureEvents と同じ直接 Supabase クエリ + useCallback/useEffect パターン。
  // 失敗時に再試行できるよう loadFutureEvents 同様 useCallback で切り出す）。
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [teamMembersLoading, setTeamMembersLoading] = useState(true);
  const [teamMembersError, setTeamMembersError] = useState(false);

  const loadTeamMembers = useCallback(async () => {
    try {
      setTeamMembersLoading(true);
      setTeamMembersError(false);
      const members = await fetchTeamMembers(supabase, teamId);
      setTeamMembers(members);
    } catch (err) {
      console.error(
        "AdminMonthlyAttendance: failed to fetch team members",
        err,
      );
      setTeamMembersError(true);
    } finally {
      setTeamMembersLoading(false);
    }
  }, [teamId, supabase]);

  useEffect(() => {
    loadTeamMembers();
  }, [loadTeamMembers]);

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
      const next: AttendanceStatusType | null =
        current === "open" ? "closed" : "open";

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
                console.error(
                  "AdminMonthlyAttendance: failed to update status",
                  err,
                );
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

  // 選択イベントに対して受付ステータスを一括変更（web useAdminAttendance:131-179 相当）。
  // 選択 event を順に mutateAsync し、完了後に再読込してシートを閉じる。
  const handleBulkUpdate = useCallback(
    async (selectedEventIds: Set<string>, status: "open" | "closed") => {
      if (selectedEventIds.size === 0) return;
      setBulkSaving(true);
      try {
        const targets = events.filter((e) => selectedEventIds.has(e.id));
        for (const event of targets) {
          await updateStatusMutation.mutateAsync({
            eventId: event.id,
            eventType: event.type,
            status,
          });
        }
        await loadFutureEvents();
        setBulkSheetVisible(false);
      } catch (err) {
        console.error(
          "AdminMonthlyAttendance: failed to bulk update status",
          err,
        );
        // 逐次 mutateAsync が途中で失敗した場合、確定済みの変更が UI と乖離する。
        // 再読込してサーバー状態に同期する（確定分を正しく反映）。
        await loadFutureEvents();
        const msg =
          err instanceof Error
            ? err.message
            : t("teams.mobile.adminAttendance.saveFailed");
        Alert.alert(t("common.error"), msg, [{ text: t("common.ok") }]);
      } finally {
        setBulkSaving(false);
      }
    },
    [events, updateStatusMutation, loadFutureEvents, t],
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
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
    >
      {error && (
        <View style={styles.inlineErrorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {events.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Feather name="calendar" size={40} color="#D1D5DB" />
          <Text style={styles.emptyText}>
            {t("teams.mobile.adminAttendance.empty")}
          </Text>
        </View>
      ) : (
        <>
          <Pressable
            style={styles.bulkChangeButton}
            onPress={() => setBulkSheetVisible(true)}
            accessibilityRole="button"
            accessibilityLabel={t(
              "teams.mobile.adminAttendance.bulkChange.title",
            )}
          >
            <Feather name="check-square" size={15} color="#2563EB" />
            <Text style={styles.bulkChangeButtonText}>
              {t("teams.mobile.adminAttendance.bulkChange.title")}
            </Text>
          </Pressable>

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
                  teamMembers={teamMembers}
                  teamMembersLoading={teamMembersLoading}
                  teamMembersError={teamMembersError}
                  onRetryTeamMembers={loadTeamMembers}
                />
              );
            })}
          </View>
        </>
      )}

      <BulkChangeSheet
        visible={bulkSheetVisible}
        events={events}
        isSaving={bulkSaving}
        onClose={() => setBulkSheetVisible(false)}
        onBulkUpdate={handleBulkUpdate}
        t={t}
        locale={locale}
      />
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
  // 未回答セクション内などの狭い領域で使う場合、親の stretch を打ち消してボタンを
  // コンテンツ幅に留める（retryButton 自体の見た目・色は変えない）
  retryButtonInline: {
    alignSelf: "flex-start",
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
  memberGroups: {
    gap: 12,
  },
  memberGroupSection: {
    gap: 4,
  },
  memberGroupTitle: {
    fontSize: 13,
    fontWeight: "600",
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
  // 4グループ見出しの色（旧・メンバー行ごとのステータスバッジ色を転用）
  memberStatusTextPresent: {
    color: "#166534",
  },
  memberStatusTextAbsent: {
    color: "#991B1B",
  },
  memberStatusTextOther: {
    color: "#92400E",
  },
  memberStatusTextUnanswered: {
    color: "#6B7280",
  },
  bulkChangeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2563EB",
    backgroundColor: "#EFF6FF",
    marginBottom: 12,
  },
  bulkChangeButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#2563EB",
  },
  bulkSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: "88%",
    overflow: "hidden",
  },
  bulkHeader: {
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
  bulkTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  bulkCloseIcon: {
    padding: 4,
  },
  bulkBody: {
    padding: 16,
    gap: 16,
  },
  bulkEmptyBlock: {
    padding: 32,
    alignItems: "center",
  },
  bulkEmptyText: {
    fontSize: 14,
    color: "#6B7280",
  },
  bulkMonthGroup: {
    gap: 6,
  },
  bulkMonthHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  bulkMonthLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
    flex: 1,
  },
  bulkSelectAllHint: {
    fontSize: 12,
    color: "#2563EB",
    fontWeight: "500",
  },
  bulkEventRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
    paddingLeft: 8,
  },
  bulkEventInfo: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  bulkEventDate: {
    fontSize: 13,
    fontWeight: "600",
    color: "#111827",
  },
  bulkCompetitionLabel: {
    fontSize: 11,
    color: "#7C3AED",
  },
  bulkEventTitle: {
    fontSize: 13,
    color: "#374151",
    flexShrink: 1,
  },
  bulkEventStatus: {
    fontSize: 11,
    fontWeight: "600",
  },
  bulkStatusOpen: {
    color: "#2563EB",
  },
  bulkStatusClosed: {
    color: "#DC2626",
  },
  bulkStatusUnset: {
    color: "#6B7280",
  },
  bulkFooter: {
    flexDirection: "row",
    gap: 12,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  bulkActionButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  bulkOpenButton: {
    backgroundColor: "#2563EB",
  },
  bulkClosedButton: {
    backgroundColor: "#DC2626",
  },
  bulkActionDisabled: {
    opacity: 0.5,
  },
  bulkActionText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});
