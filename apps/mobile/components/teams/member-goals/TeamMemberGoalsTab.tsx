import React, { useMemo, useState } from "react";
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthProvider";
import { localizedStyleName } from "@/utils/styleName";
import { StyleAPI } from "@apps/shared/api/styles";
import { styleKeys } from "@apps/shared/hooks/queries/keys";
import { useTeamMemberGoalsQuery } from "@apps/shared/hooks/queries/teamMemberGoals";
import { sortTeamMemberGoals } from "@apps/shared/utils/teamMemberGoalSort";
import { isCompetitionDateInPast } from "@apps/shared/utils/date";
import { excludeNonSwimmers } from "@apps/shared/utils/swimmerFilter";
import { toUserFacingMessage } from "@apps/shared/utils/userFacingError";
import type { TeamMemberGoal, TeamMembershipWithUser } from "@swim-hub/shared/types";
import { TeamMemberGoalCard } from "./TeamMemberGoalCard";

interface TeamMemberGoalsTabProps {
  teamId: string;
  members: TeamMembershipWithUser[];
}

type SectionKey = "upcoming" | "past" | "noCompetition";

function sectionOf(goal: TeamMemberGoal): SectionKey {
  if (goal.competition_date === null) return "noCompetition";
  return isCompetitionDateInPast(goal.competition_date) ? "past" : "upcoming";
}

const SECTION_ORDER: readonly SectionKey[] = ["upcoming", "past", "noCompetition"];

/** 管理者ビュー専用: メンバーを1人選び、そのメンバーの目標とマイルストーンを読み取り専用で表示する */
export const TeamMemberGoalsTab: React.FC<TeamMemberGoalsTabProps> = ({ teamId, members }) => {
  const { t } = useTranslation();
  const { supabase } = useAuth();
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);

  // RPC は approved かつ is_active のメンバーのみ受理する。非泳者は候補提示の直前で除外
  const options = useMemo(
    () =>
      excludeNonSwimmers(members.filter((m) => m.status === "approved" && m.is_active === true)),
    [members],
  );
  // 選択中のメンバーが候補から消えた場合は未選択扱いにする
  const memberId = options.some((m) => m.user_id === selectedId) ? selectedId : undefined;

  const selectedMember = options.find((m) => m.user_id === memberId);

  const goalsQuery = useTeamMemberGoalsQuery(supabase, teamId, memberId);
  const stylesQuery = useQuery({
    queryKey: styleKeys.list(),
    queryFn: () => new StyleAPI(supabase).getStyles(),
    staleTime: 24 * 60 * 60 * 1000,
  });
  const stylesById = useMemo(
    () => new Map((stylesQuery.data ?? []).map((s) => [s.id, s])),
    [stylesQuery.data],
  );

  const sections = useMemo(() => {
    const sorted = sortTeamMemberGoals(goalsQuery.data ?? []);
    return SECTION_ORDER.map((key) => ({
      key,
      goals: sorted.filter((g) => sectionOf(g) === key),
    })).filter((s) => s.goals.length > 0);
  }, [goalsQuery.data]);

  const renderBody = () => {
    if (options.length === 0) {
      return <Text style={styles.hint}>{t("teamMemberGoals.noSelectableMembers")}</Text>;
    }
    if (memberId === undefined) {
      return <Text style={styles.hint}>{t("teamMemberGoals.selectMemberHint")}</Text>;
    }
    if (goalsQuery.isError) {
      return (
        <View style={styles.center}>
          <Feather name="alert-circle" size={40} color="#DC2626" />
          <Text style={styles.errorText}>
            {toUserFacingMessage(goalsQuery.error, t("teamMemberGoals.loadError"))}
          </Text>
          <Pressable
            style={styles.retryButton}
            onPress={() => goalsQuery.refetch()}
            accessibilityRole="button"
          >
            <Text style={styles.retryText}>{t("teamMemberGoals.retry")}</Text>
          </Pressable>
        </View>
      );
    }
    if (goalsQuery.data === undefined) {
      return (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.hint}>{t("common.loading")}</Text>
        </View>
      );
    }
    if (goalsQuery.data.length === 0) {
      return (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>{t("teamMemberGoals.empty")}</Text>
          <Text style={styles.hint}>{t("teamMemberGoals.emptyDesc")}</Text>
        </View>
      );
    }
    return (
      <View style={styles.sections}>
        {sections.map((section) => (
          <View key={section.key} style={styles.section}>
            <Text style={styles.sectionTitle}>{t(`teamMemberGoals.section.${section.key}`)}</Text>
            {section.goals.map((goal) => {
              const style = stylesById.get(goal.style_id);
              return (
                <TeamMemberGoalCard
                  key={goal.id}
                  goal={goal}
                  styleName={style ? localizedStyleName(style, t) : t("goals.list.styleFallback")}
                />
              );
            })}
          </View>
        ))}
      </View>
    );
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Text style={styles.memberLabel}>{t("teamMemberGoals.memberLabel")}</Text>
      {options.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {options.map((m) => {
            const selected = m.user_id === memberId;
            return (
              <Pressable
                key={m.user_id}
                style={[styles.chip, selected && styles.chipSelected]}
                onPress={() => setSelectedId(m.user_id)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]} numberOfLines={1}>
                  {m.users.name || t("teams.mobile.unnamedMember")}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
      {selectedMember && (
        <View style={styles.selectedBar}>
          <Text style={styles.selectedName} numberOfLines={1}>
            {selectedMember.users.name || t("teams.mobile.unnamedMember")}
          </Text>
          <Text style={styles.note}>{t("teamMemberGoals.snapshotNote")}</Text>
        </View>
      )}
      {renderBody()}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  memberLabel: { fontSize: 13, fontWeight: "600", color: "#374151" },
  chips: { gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    maxWidth: 200,
  },
  chipSelected: { backgroundColor: "#2563EB", borderColor: "#2563EB" },
  chipText: { fontSize: 13, color: "#374151" },
  chipTextSelected: { color: "#FFFFFF", fontWeight: "600" },
  hint: { fontSize: 13, color: "#6B7280", textAlign: "center" },
  center: { alignItems: "center", padding: 24, gap: 12 },
  errorText: { fontSize: 14, color: "#DC2626", textAlign: "center", lineHeight: 20 },
  retryButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#2563EB",
  },
  retryText: { fontSize: 14, fontWeight: "600", color: "#FFFFFF" },
  emptyTitle: { fontSize: 15, fontWeight: "600", color: "#374151" },
  selectedBar: { gap: 2, paddingVertical: 4 },
  selectedName: { fontSize: 17, fontWeight: "700", color: "#111827" },
  note: { fontSize: 12, color: "#6B7280" },
  sections: { gap: 16 },
  section: { gap: 10 },
  sectionTitle: { fontSize: 14, fontWeight: "700", color: "#111827" },
});
