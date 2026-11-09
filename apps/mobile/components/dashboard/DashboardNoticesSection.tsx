import React, { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useTranslation } from "react-i18next";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { formatDate } from "@apps/shared/utils/date";
import {
  useUnansweredAttendancesQuery,
  useUnsubmittedEntriesQuery,
} from "@apps/shared/hooks/queries/notifications";
import { useUnrecordedCompetitionsQuery } from "@apps/shared/hooks/queries/dashboard";
import {
  actionItemKey,
  actionItemsCollapseStorageKey,
  isActionItemsExpanded,
  parseActionItemsCollapseState,
  type ActionItemsCollapseState,
} from "@apps/shared/utils/dashboardActionItems";
import type { TeamMembershipWithUser } from "@swim-hub/shared/types";
import { useAuth } from "@/contexts/AuthProvider";
import { useDateLocale } from "@/hooks/useDateLocale";
import type { MainStackParamList } from "@/navigation/types";

interface ActionItemsSectionProps {
  teams: TeamMembershipWithUser[];
}

/**
 * ホームの「対応が必要なこと」。
 * 出欠の未回答 (チームごと)・エントリー受付中で未提出の大会・記録が未入力の大会を並べる。
 * 見出しをタップすると開閉し、閉じた状態はユーザーごとに AsyncStorage へ保存する。
 * 閉じた時点に無かった項目が現れたら開き直す。0件なら何も出さない。
 */
export const ActionItemsSection: React.FC<ActionItemsSectionProps> = ({ teams }) => {
  const { supabase, user } = useAuth();
  const { t } = useTranslation();
  const locale = useDateLocale();
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();

  // 承認済みで有効なチームだけを対象にする (チームのお知らせと同じ条件)
  const teamsForNotifications = useMemo(
    () =>
      teams
        .filter((m) => m.status === "approved" && m.is_active)
        .map((m) => ({
          team_id: m.team_id,
          team: m.teams ? { name: m.teams.name } : undefined,
        })),
    [teams],
  );

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

  const unansweredByTeam = useMemo(() => {
    const byTeam = new Map<string, { teamId: string; teamName: string; count: number }>();
    for (const item of unansweredAttendances) {
      const current = byTeam.get(item.teamId);
      if (current) current.count += 1;
      else byTeam.set(item.teamId, { teamId: item.teamId, teamName: item.teamName, count: 1 });
    }
    return [...byTeam.values()];
  }, [unansweredAttendances]);

  const total = unansweredByTeam.length + unsubmittedEntries.length + unrecordedCompetitions.length;
  const itemKeys = useMemo(
    () => [
      ...unansweredAttendances.map((a) => actionItemKey.attendance(a.eventType, a.eventId)),
      ...unsubmittedEntries.map((e) => actionItemKey.entry(e.competitionId)),
      ...unrecordedCompetitions.map((c) => actionItemKey.record(c.competitionId)),
    ],
    [unansweredAttendances, unsubmittedEntries, unrecordedCompetitions],
  );

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

  if (total === 0) return null;

  const expanded = isActionItemsExpanded(saved, itemKeys);

  const toggle = () => {
    const next: ActionItemsCollapseState = { collapsed: expanded, keys: itemKeys };
    setSaved(next);
    if (user?.id) {
      void AsyncStorage.setItem(actionItemsCollapseStorageKey(user.id), JSON.stringify(next));
    }
  };

  return (
    <View style={styles.container} testID="dashboard-action-items">
      <Pressable
        onPress={toggle}
        style={styles.header}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        testID="dashboard-action-items-toggle"
      >
        <Feather name="alert-triangle" size={16} color="#B45309" />
        <Text style={styles.title}>{t("dashboard.actionItems.title")}</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{t("dashboard.actionItems.count", { count: total })}</Text>
        </View>
        <Feather
          name={expanded ? "chevron-up" : "chevron-down"}
          size={18}
          color="#B45309"
          style={styles.chevron}
        />
      </Pressable>

      {expanded && (
        <View style={styles.list}>
          {unansweredByTeam.map((item) => (
            <ActionItem
              key={`attendance-${item.teamId}`}
              label={t("dashboard.actionItems.unansweredAttendance", {
                count: item.count,
                teamName: item.teamName,
              })}
              onPress={() =>
                navigation.navigate("MainTabs", {
                  screen: "Teams",
                  params: { teamId: item.teamId, initialTab: "attendance", asMember: true },
                })
              }
            />
          ))}
          {unsubmittedEntries.map((entry) => (
            <ActionItem
              key={`entry-${entry.competitionId}`}
              label={t("dashboard.actionItems.entryOpen", {
                name: entry.competitionName,
                date: formatDate(entry.competitionDate, "short", locale),
              })}
              onPress={() =>
                navigation.navigate("CompetitionTabForm", {
                  competitionId: entry.competitionId,
                  date: entry.competitionDate,
                  initialTab: "entry",
                })
              }
            />
          ))}
          {unrecordedCompetitions.map((competition) => (
            <ActionItem
              key={`record-${competition.competitionId}`}
              label={t("dashboard.actionItems.unrecorded", {
                name: competition.competitionName,
                date: formatDate(competition.competitionDate, "short", locale),
              })}
              onPress={() =>
                navigation.navigate("CompetitionTabForm", {
                  competitionId: competition.competitionId,
                  date: competition.competitionDate,
                  initialTab: "record",
                })
              }
            />
          ))}
        </View>
      )}
    </View>
  );
};

const ActionItem: React.FC<{ label: string; onPress: () => void }> = ({ label, onPress }) => (
  <Pressable style={styles.item} onPress={onPress} accessibilityRole="button">
    <Text style={styles.itemText} numberOfLines={1}>
      {label}
    </Text>
    <Feather name="chevron-right" size={16} color="#D97706" />
  </Pressable>
);

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FDE68A",
    backgroundColor: "#FFFBEB",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 28,
  },
  title: {
    fontSize: 14,
    fontWeight: "700",
    color: "#92400E",
  },
  countBadge: {
    backgroundColor: "#F59E0B",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 1,
  },
  countText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  chevron: {
    marginLeft: "auto",
  },
  list: {
    marginTop: 8,
    gap: 6,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#FDE68A",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  itemText: {
    flex: 1,
    fontSize: 14,
    color: "#1F2937",
  },
});
