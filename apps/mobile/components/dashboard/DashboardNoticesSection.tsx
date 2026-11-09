import React, { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useTranslation } from "react-i18next";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { isValid, parseISO } from "date-fns";
import { formatDate, formatDateTime } from "@apps/shared/utils/date";
import {
  useUnansweredAttendancesQuery,
  useUnsubmittedEntriesQuery,
} from "@apps/shared/hooks/queries/notifications";
import { useUnrecordedCompetitionsQuery } from "@apps/shared/hooks/queries/dashboard";
import { useTeamsAnnouncementsQuery } from "@apps/shared/hooks/queries/announcements";
import {
  actionItemKey,
  actionItemsCollapseStorageKey,
  isActionItemsExpanded,
  parseActionItemsCollapseState,
  type ActionItemsCollapseState,
} from "@apps/shared/utils/dashboardActionItems";
import type { TeamAnnouncement, TeamMembershipWithUser } from "@swim-hub/shared/types";
import { useAuth } from "@/contexts/AuthProvider";
import { useDateLocale } from "@/hooks/useDateLocale";
import { resolveIsTruncated, resolveNumberOfLines } from "@/utils/announcementTruncation";
import { cardSurface } from "@/constants/theme";
import type { MainStackParamList } from "@/navigation/types";

/** チームごとに最初に出すお知らせの件数。残りは「すべて表示」で同じカードに広げる */
const ANNOUNCEMENTS_PER_TEAM = 2;
const ANNOUNCEMENT_CONTENT_MAX_LINES = 1;

interface DashboardNoticesSectionProps {
  teams: TeamMembershipWithUser[];
}

/**
 * ホームの「お知らせ」。所属チームごとの「{チーム名}のお知らせ」に、そのチームのやること
 * (出欠の未回答・エントリー受付中で未提出) を黄色い行で並べ、その下にお知らせを出す (2026-11-07 ユーザー指定)。
 * チームを持たないやること (記録が未入力) は見出しなしで一番上に出す。
 * 見出しをタップすると開閉し、閉じた状態はユーザーごとに AsyncStorage へ保存する。
 * 閉じた時点に無かった項目 (やること・お知らせ) が現れたら開き直す。どちらも0件なら何も出さない。
 * チームのお知らせ一覧のタブは管理者限定なので、残りのお知らせは遷移せずこのカードの中で広げる。
 */
export const DashboardNoticesSection: React.FC<DashboardNoticesSectionProps> = ({ teams }) => {
  const { supabase, user } = useAuth();
  const { t } = useTranslation();
  const locale = useDateLocale();
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();

  // 承認済みで有効なチームだけを対象にする
  const approvedTeams = useMemo(
    () => teams.filter((m) => m.status === "approved" && m.is_active),
    [teams],
  );
  const teamsForNotifications = useMemo(
    () =>
      approvedTeams.map((m) => ({
        team_id: m.team_id,
        team: m.teams ? { name: m.teams.name } : undefined,
      })),
    [approvedTeams],
  );
  const teamIds = useMemo(() => approvedTeams.map((m) => m.team_id), [approvedTeams]);

  const { data: unansweredAttendances = [] } = useUnansweredAttendancesQuery(
    supabase,
    user?.id,
    teamsForNotifications,
  );
  const { data: unsubmittedEntries = [] } = useUnsubmittedEntriesQuery(
    supabase,
    user?.id,
    teamsForNotifications,
  );
  const { data: unrecordedCompetitions = [] } = useUnrecordedCompetitionsQuery(supabase, user?.id);
  const announcementsByTeam = useTeamsAnnouncementsQuery(supabase, teamIds);

  const unansweredByTeam = useMemo(() => {
    const byTeam = new Map<string, { teamId: string; teamName: string; count: number }>();
    for (const item of unansweredAttendances) {
      const current = byTeam.get(item.teamId);
      if (current) current.count += 1;
      else
        byTeam.set(item.teamId, {
          teamId: item.teamId,
          teamName: item.teamName,
          count: 1,
        });
    }
    return [...byTeam.values()];
  }, [unansweredAttendances]);

  // 黄色い行 (やること)。出欠の未回答とエントリー未提出はそのチームの欄に、
  // チームを持たない記録の未入力 (と、念のため一覧に無いチームの項目) は見出しなしで一番上に出す
  const actionRows: ActionRow[] = [
    ...unansweredByTeam.map((item) => ({
      key: `attendance-${item.teamId}`,
      teamId: item.teamId,
      label: t("dashboard.notices.unansweredAttendance", { count: item.count }),
      onPress: () =>
        navigation.navigate("MainTabs", {
          screen: "Teams",
          params: {
            teamId: item.teamId,
            initialTab: "attendance",
            asMember: true,
          },
        }),
    })),
    ...unsubmittedEntries.map((entry) => ({
      key: `entry-${entry.competitionId}`,
      teamId: entry.teamId,
      label: t("dashboard.actionItems.entryOpen", {
        name: entry.competitionName,
        date: formatDate(entry.competitionDate, "short", locale),
      }),
      onPress: () =>
        navigation.navigate("CompetitionTabForm", {
          competitionId: entry.competitionId,
          date: entry.competitionDate,
          initialTab: "entry",
        }),
    })),
    ...unrecordedCompetitions.map((competition) => ({
      key: `record-${competition.competitionId}`,
      teamId: null,
      label: t("dashboard.actionItems.unrecorded", {
        name: competition.competitionName,
        date: formatDate(competition.competitionDate, "short", locale),
      }),
      onPress: () =>
        navigation.navigate("CompetitionTabForm", {
          competitionId: competition.competitionId,
          date: competition.competitionDate,
          initialTab: "record",
        }),
    })),
  ];

  const teamGroups = approvedTeams
    .map((membership, i) => ({
      teamId: membership.team_id,
      teamName: membership.teams?.name || t("teams.mobile.fallbackTeamName"),
      actions: actionRows.filter((row) => row.teamId === membership.team_id),
      announcements: announcementsByTeam[i]?.announcements ?? [],
    }))
    .filter((team) => team.actions.length > 0 || team.announcements.length > 0);
  const looseActions = actionRows.filter(
    (row) => !teamGroups.some((team) => team.teamId === row.teamId),
  );

  const todoCount = actionRows.length;
  const itemKeys = [
    ...unansweredAttendances.map((a) => actionItemKey.attendance(a.eventType, a.eventId)),
    ...unsubmittedEntries.map((e) => actionItemKey.entry(e.competitionId)),
    ...unrecordedCompetitions.map((c) => actionItemKey.record(c.competitionId)),
    ...teamGroups.flatMap((team) =>
      team.announcements.map((a) => actionItemKey.announcement(a.id)),
    ),
  ];

  const [saved, setSaved] = useState<ActionItemsCollapseState | null>(null);
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    void AsyncStorage.getItem(actionItemsCollapseStorageKey(user.id)).then((raw) => {
      if (!cancelled) setSaved(parseActionItemsCollapseState(raw));
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  if (todoCount === 0 && teamGroups.length === 0) return null;

  const expanded = isActionItemsExpanded(saved, itemKeys);

  const toggle = () => {
    const next: ActionItemsCollapseState = {
      collapsed: expanded,
      keys: itemKeys,
    };
    setSaved(next);
    if (user?.id) {
      void AsyncStorage.setItem(actionItemsCollapseStorageKey(user.id), JSON.stringify(next));
    }
  };

  return (
    <View style={styles.container} testID="dashboard-notices">
      <Pressable
        onPress={toggle}
        style={styles.header}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        testID="dashboard-notices-toggle"
      >
        <Feather name="bell" size={16} color="#2563EB" />
        <Text style={styles.title}>{t("dashboard.notices.title")}</Text>
        {todoCount > 0 && (
          <View style={styles.todoBadge}>
            <Text style={styles.todoBadgeText}>
              {t("dashboard.notices.todoCount", { count: todoCount })}
            </Text>
          </View>
        )}
        <Feather
          name={expanded ? "chevron-up" : "chevron-down"}
          size={18}
          color="#6B7280"
          style={styles.chevron}
        />
      </Pressable>

      {expanded && (
        <>
          {looseActions.length > 0 && (
            <View style={styles.group}>
              {looseActions.map((row) => (
                <ActionItem key={row.key} label={row.label} onPress={row.onPress} />
              ))}
            </View>
          )}
          {teamGroups.map((team) => (
            <TeamNotices
              key={team.teamId}
              teamName={team.teamName}
              actions={team.actions}
              announcements={team.announcements}
            />
          ))}
        </>
      )}
    </View>
  );
};

interface ActionRow {
  key: string;
  /** その項目のチーム。チームを持たない項目 (記録の未入力) は null */
  teamId: string | null;
  label: string;
  onPress: () => void;
}

const ActionItem: React.FC<{ label: string; onPress: () => void }> = ({ label, onPress }) => (
  <Pressable style={styles.actionItem} onPress={onPress} accessibilityRole="button">
    <Feather name="alert-triangle" size={15} color="#B45309" />
    <Text style={styles.actionItemText} numberOfLines={1}>
      {label}
    </Text>
    <Feather name="chevron-right" size={16} color="#D97706" />
  </Pressable>
);

/**
 * 1チーム分の「{チーム名}のお知らせ」。そのチームのやること (黄色い行) を先に出し、
 * お知らせは新しい順に ANNOUNCEMENTS_PER_TEAM 件まで出して、残りは「すべて表示」で広げる
 */
const TeamNotices: React.FC<{
  teamName: string;
  actions: ActionRow[];
  announcements: TeamAnnouncement[];
}> = ({ teamName, actions, announcements }) => {
  const { t } = useTranslation();
  const [showAll, setShowAll] = useState(false);
  const hasMore = announcements.length > ANNOUNCEMENTS_PER_TEAM;
  const visible = showAll ? announcements : announcements.slice(0, ANNOUNCEMENTS_PER_TEAM);

  return (
    <View style={styles.group}>
      <View style={styles.groupHeader}>
        <Text style={styles.groupTitle} numberOfLines={1}>
          {t("dashboard.notices.teamTitle", { teamName })}
        </Text>
        {hasMore && (
          <Pressable
            onPress={() => setShowAll((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: showAll }}
            hitSlop={8}
          >
            <Text style={styles.showAll}>
              {showAll
                ? t("dashboard.notices.showLess")
                : t("dashboard.notices.showAll", {
                    count: announcements.length,
                  })}
            </Text>
          </Pressable>
        )}
      </View>
      {actions.map((row) => (
        <ActionItem key={row.key} label={row.label} onPress={row.onPress} />
      ))}
      {visible.map((announcement) => (
        <AnnouncementItem key={announcement.id} announcement={announcement} />
      ))}
    </View>
  );
};

/**
 * お知らせ1件。本文は1行で切り、切れているときだけ行をタップして全文を開く。
 * 切れているかは、同じ本文を行数制限なしで描く非表示の Text で行数を測って決める
 * (可視の Text は常に行数で切るので、測ってから縮むような表示の揺れが出ない)
 */
const AnnouncementItem: React.FC<{ announcement: TeamAnnouncement }> = ({ announcement }) => {
  const { t } = useTranslation();
  const locale = useDateLocale();
  const parsedUpdatedAt = announcement.updated_at ? parseISO(announcement.updated_at) : null;
  const updatedAt =
    parsedUpdatedAt && isValid(parsedUpdatedAt)
      ? formatDateTime(parsedUpdatedAt, "shortDate", locale)
      : "-";

  const [isExpanded, setIsExpanded] = useState(false);
  const [isTruncated, setIsTruncated] = useState(false);

  // 編集で本文が変わったら閉じる (id は変わらないので再マウントされない)
  useEffect(() => {
    setIsExpanded(false);
  }, [announcement.content]);

  // 行は1つの読み上げ要素になり、子の文字から読み上げ文を作る。非表示の計測用 Text も
  // 拾って本文を2回読むので、読み上げ文は明示する。
  // 切れていない行は押せないが、disabled にすると「無効」と読まれるので onPress を付けないだけにする
  return (
    <Pressable
      style={styles.announcement}
      onPress={isTruncated ? () => setIsExpanded((v) => !v) : undefined}
      accessible
      accessibilityLabel={`${announcement.title}、${updatedAt}、${announcement.content}`}
      accessibilityRole={isTruncated ? "button" : undefined}
      accessibilityState={isTruncated ? { expanded: isExpanded } : undefined}
      accessibilityHint={
        isTruncated
          ? isExpanded
            ? t("teamsAdmin.announcementList.showLess")
            : t("teamsAdmin.announcementList.showMore")
          : undefined
      }
      testID={`announcement-${announcement.id}`}
    >
      <View style={styles.announcementHead}>
        <Text style={styles.announcementTitle} numberOfLines={1}>
          {announcement.title}
        </Text>
        <Text style={styles.announcementDate}>{updatedAt}</Text>
        {isTruncated && (
          <Feather name={isExpanded ? "chevron-up" : "chevron-down"} size={14} color="#6B7280" />
        )}
      </View>
      {/* 計測用 Text の幅を可視の本文とそろえるため、padding の無い枠に2つを入れる */}
      <View>
        <Text
          style={styles.announcementContent}
          numberOfLines={resolveNumberOfLines({
            isExpanded,
            maxLines: ANNOUNCEMENT_CONTENT_MAX_LINES,
          })}
          testID={`announcement-content-${announcement.id}`}
        >
          {announcement.content}
        </Text>
        <Text
          style={[styles.announcementContent, styles.announcementContentMeasure]}
          onTextLayout={(e) =>
            setIsTruncated(
              resolveIsTruncated({
                measuredLines: e.nativeEvent.lines.length,
                maxLines: ANNOUNCEMENT_CONTENT_MAX_LINES,
                wasTruncated: false,
              }),
            )
          }
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          testID={`announcement-content-measure-${announcement.id}`}
        >
          {announcement.content}
        </Text>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    ...cardSurface,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    gap: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 28,
  },
  title: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  todoBadge: {
    backgroundColor: "#D97706",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 1,
  },
  todoBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  chevron: {
    marginLeft: "auto",
  },
  group: {
    gap: 6,
  },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  groupTitle: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: "700",
    color: "#374151",
  },
  showAll: {
    fontSize: 12,
    fontWeight: "600",
    color: "#2563EB",
  },
  actionItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FFFBEB",
    borderWidth: 1,
    borderColor: "#FDE68A",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  actionItemText: {
    flex: 1,
    fontSize: 14,
    color: "#1F2937",
  },
  announcement: {
    backgroundColor: "#F9FAFB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 3,
  },
  announcementHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  announcementTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  announcementDate: {
    fontSize: 11,
    color: "#6B7280",
  },
  announcementContent: {
    fontSize: 12,
    lineHeight: 17,
    color: "#4B5563",
  },
  announcementContentMeasure: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    opacity: 0,
    zIndex: -1,
  },
});
