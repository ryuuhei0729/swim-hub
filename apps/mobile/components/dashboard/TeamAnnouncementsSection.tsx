import React, { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { parseISO, isValid } from "date-fns";
import { useTranslation } from "react-i18next";
import { formatDateTime } from "@apps/shared/utils/date";
import { useDateLocale } from "@/hooks/useDateLocale";
import { useAuth } from "@/contexts/AuthProvider";
import { useTeamAnnouncementsQuery } from "@apps/shared/hooks/queries/announcements";
import type { TeamMembershipWithUser, TeamAnnouncement } from "@swim-hub/shared/types";
import {
  resolveIsTruncated,
  resolveNumberOfLines,
  shouldShowToggle,
} from "@/utils/announcementTruncation";
import { cardSurface } from "@/constants/theme";

const ANNOUNCEMENT_CONTENT_MAX_LINES = 2;

interface TeamAnnouncementsSectionProps {
  teams: TeamMembershipWithUser[];
}

/**
 * ダッシュボード用チームのお知らせセクション
 * 各チームのお知らせを表示する。出欠未回答・エントリー未提出は ActionItemsSection に出す
 */
export const TeamAnnouncementsSection: React.FC<TeamAnnouncementsSectionProps> = ({ teams }) => {
  const { supabase } = useAuth();

  // 承認済みチームのみ
  const approvedTeams = teams.filter((t) => t.status === "approved" && t.is_active);

  if (approvedTeams.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      {approvedTeams.map((membership) => (
        <TeamCard key={membership.team_id} membership={membership} supabase={supabase} />
      ))}
    </View>
  );
};

interface TeamCardProps {
  membership: TeamMembershipWithUser;
  supabase: ReturnType<typeof useAuth>["supabase"];
}

const TeamCard: React.FC<TeamCardProps> = ({ membership, supabase }) => {
  const { t } = useTranslation();
  const teamId = membership.team_id;
  const teamName = membership.teams?.name || t("teams.mobile.fallbackTeamName");

  const { data: announcements = [] } = useTeamAnnouncementsQuery(supabase, {
    teamId,
    viewOnly: true,
    enableRealtime: false,
  });

  // お知らせが無ければスキップ
  if (announcements.length === 0) {
    return null;
  }

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.teamName}>{teamName}{t("dashboard.announcements.title")}</Text>
        {membership.role === "admin" && (
          <Text style={styles.adminBadge}>{t("dashboard.announcements.adminRole")}</Text>
        )}
      </View>

      {/* お知らせ */}
      <View style={styles.section}>
        {announcements.map((announcement) => (
          <AnnouncementItem key={announcement.id} announcement={announcement} />
        ))}
      </View>
    </View>
  );
};

const AnnouncementItem: React.FC<{ announcement: TeamAnnouncement }> = ({ announcement }) => {
  const { t } = useTranslation();
  const locale = useDateLocale();
  const parsedUpdatedAt = announcement.updated_at ? parseISO(announcement.updated_at) : new Date(0);
  const updatedAt = isValid(parsedUpdatedAt)
    ? formatDateTime(parsedUpdatedAt, "shortDate", locale)
    : "-";

  const [isExpanded, setIsExpanded] = useState(false);
  const [isTruncated, setIsTruncated] = useState(false);

  // content が変わったら (お知らせ編集後の再フェッチ等) 展開状態をリセットする。
  // id が不変なため再マウントされないが、isTruncated は下記の非表示計測用 Text が
  // content 変更のたびに再レイアウトされ onTextLayout で自動的に再判定される。
  useEffect(() => {
    setIsExpanded(false);
  }, [announcement.content]);

  const toggleLabel = isExpanded
    ? t("teamsAdmin.announcementList.showLess")
    : t("teamsAdmin.announcementList.showMore");

  return (
    <View style={styles.announcementItem}>
      <Text style={styles.announcementTitle} numberOfLines={1}>
        {announcement.title}
      </Text>
      {/*
        可視の本文 Text。常に numberOfLines でクランプするため初回から
        高さが安定しており、計測に伴うレイアウトシフト (伸びて縮むジャンク) が
        発生しない。行数の実測はこの Text では行わない。
      */}
      <Text
        style={styles.announcementContent}
        numberOfLines={resolveNumberOfLines({ isExpanded, maxLines: ANNOUNCEMENT_CONTENT_MAX_LINES })}
        testID={`announcement-content-${announcement.id}`}
      >
        {announcement.content}
      </Text>
      {/*
        非表示の計測専用 Text。同じ content を numberOfLines 無しで描画し、
        絶対配置でレイアウトフローから外すことでカード高さに影響を与えずに
        真の行数を取得する。可視 Text と同じ styles.announcementContent を
        ベースにしてフォント指標を一致させ、行数のズレを防ぐ。
        content 変更時は自然に再レイアウトされ onTextLayout が再発火する。
      */}
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
      {shouldShowToggle({ isTruncated, isExpanded }) && (
        <Pressable
          testID={`announcement-toggle-${announcement.id}`}
          onPress={() => setIsExpanded((v) => !v)}
          accessibilityRole="button"
          accessibilityState={{ expanded: isExpanded }}
          accessibilityLabel={toggleLabel}
        >
          <Text style={styles.announcementToggle}>{toggleLabel}</Text>
        </Pressable>
      )}
      <Text style={styles.announcementDate}>{updatedAt}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 6,
    marginTop: 16,
    marginBottom: 6,
  },
  card: {
    ...cardSurface,
    marginHorizontal: 16,
    padding: 16,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  teamName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  adminBadge: {
    fontSize: 11,
    color: "#6B7280",
  },
  section: {
    marginTop: 4,
  },
  announcementItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: "#F9FAFB",
    borderRadius: 8,
    marginBottom: 8,
  },
  announcementTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 4,
  },
  announcementContent: {
    fontSize: 13,
    color: "#374151",
    lineHeight: 18,
    marginBottom: 4,
  },
  announcementContentMeasure: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    opacity: 0,
    zIndex: -1,
  },
  announcementToggle: {
    fontSize: 13,
    color: "#2563EB",
    fontWeight: "600",
    marginBottom: 4,
  },
  announcementDate: {
    fontSize: 11,
    color: "#9CA3AF",
  },
});
