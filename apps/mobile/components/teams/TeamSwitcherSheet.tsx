import React from "react";
import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import type { TeamMembershipWithUser } from "@swim-hub/shared/types";
import { SlideUpModal } from "@/components/ui/SlideUpModal";
import { useSafeInsets } from "@/hooks/useSafeInsets";
import { getSafeFooterPadding } from "@/utils/safeFooterPadding";

interface TeamSwitcherSheetProps {
  visible: boolean;
  onClose: () => void;
  /** シートが閉じ終わったとき。次のモーダル (作成・参加) はここから開く */
  onClosed?: () => void;
  approvedTeams: TeamMembershipWithUser[];
  pendingTeams: TeamMembershipWithUser[];
  selectedTeamId: string | null;
  onSelect: (teamId: string) => void;
  onCreate: () => void;
  onJoin: () => void;
}

/** チームタブのヘッダーから開く、所属チームの切替シート。チームの作成・参加もここから行う */
export const TeamSwitcherSheet: React.FC<TeamSwitcherSheetProps> = ({
  visible,
  onClose,
  onClosed,
  approvedTeams,
  pendingTeams,
  selectedTeamId,
  onSelect,
  onCreate,
  onJoin,
}) => {
  const { t } = useTranslation();
  const insets = useSafeInsets();

  const renderTeam = (membership: TeamMembershipWithUser) => {
    const selected = membership.team_id === selectedTeamId;
    const isPending = membership.status === "pending";
    const name = membership.teams?.name || t("teams.mobile.fallbackTeamName");
    return (
      <Pressable
        key={membership.id}
        style={[styles.option, selected && styles.optionSelected]}
        onPress={() => onSelect(membership.team_id)}
        accessibilityRole="button"
        accessibilityState={{ selected }}
        testID={`team-switcher-option-${membership.team_id}`}
      >
        <Text
          style={[styles.optionText, selected && styles.optionTextSelected]}
          numberOfLines={1}
        >
          {name}
        </Text>
        {isPending ? (
          <View style={styles.pendingBadge}>
            <Text style={styles.pendingBadgeText}>{t("teams.mobile.statusPending")}</Text>
          </View>
        ) : (
          membership.role === "admin" && (
            <Text style={styles.roleBadge}>{t("teams.mobile.roleAdmin")}</Text>
          )
        )}
        {selected && <Feather name="check" size={18} color="#2563EB" />}
      </Pressable>
    );
  };

  return (
    <SlideUpModal
      visible={visible}
      onClose={onClose}
      onClosed={onClosed}
      backdropAccessibilityLabel={t("common.close")}
      overlayColor="rgba(0,0,0,0.4)"
      sheetStyle={[styles.sheet, { paddingBottom: getSafeFooterPadding(16, insets.bottom) }]}
    >
      <View style={styles.sheetHeader}>
        <Text style={styles.sheetTitle}>{t("teams.mobile.switcher.title")}</Text>
        <Pressable
          onPress={onClose}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t("common.close")}
        >
          <Feather name="x" size={22} color="#6B7280" />
        </Pressable>
      </View>
      <ScrollView style={styles.list}>
        {approvedTeams.map(renderTeam)}
        {pendingTeams.length > 0 && (
          <Text style={styles.groupLabel}>{t("teams.mobile.switcher.pendingGroup")}</Text>
        )}
        {pendingTeams.map(renderTeam)}
      </ScrollView>
      <View style={styles.actions}>
        <Pressable
          style={[styles.actionButton, styles.createButton]}
          onPress={onCreate}
          accessibilityRole="button"
          testID="team-switcher-create"
        >
          <Text style={styles.actionButtonText}>{t("teams.mobile.createTeamAction")}</Text>
        </Pressable>
        <Pressable
          style={[styles.actionButton, styles.joinButton]}
          onPress={onJoin}
          accessibilityRole="button"
          testID="team-switcher-join"
        >
          <Text style={styles.actionButtonText}>{t("teams.mobile.joinByInviteCodeAction")}</Text>
        </Pressable>
      </View>
    </SlideUpModal>
  );
};

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: "70%",
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  list: {
    flexGrow: 0,
    flexShrink: 1,
  },
  groupLabel: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  optionSelected: {
    backgroundColor: "#EFF6FF",
  },
  optionText: {
    flex: 1,
    fontSize: 16,
    color: "#111827",
  },
  optionTextSelected: {
    fontWeight: "600",
    color: "#2563EB",
  },
  roleBadge: {
    fontSize: 12,
    color: "#6B7280",
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    overflow: "hidden",
  },
  pendingBadge: {
    backgroundColor: "#FEF3C7",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  pendingBadgeText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#92400E",
  },
  actions: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  actionButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  createButton: {
    backgroundColor: "#2563EB",
  },
  joinButton: {
    backgroundColor: "#10B981",
  },
  actionButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});
