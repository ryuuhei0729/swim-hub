import React, { useMemo } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { SlideUpModal } from "@/components/ui/SlideUpModal";
import { useDateLocale } from "@/hooks/useDateLocale";
import { useSafeInsets } from "@/hooks/useSafeInsets";
import { getSafeFooterPadding } from "@/utils/safeFooterPadding";
import type { Competition } from "@apps/shared/types";
import { formatDate } from "@apps/shared/utils/date";

interface CompetitionPickerSheetProps {
  visible: boolean;
  onClose: () => void;
  competitions: Competition[];
  /** team_id -> チーム名 */
  teamNames: Record<string, string>;
  selectedId: string;
  onSelect: (competitionId: string) => void;
}

/** 目標の対象大会を選ぶシート。個人大会とチーム大会 (チームごと) にグルーピングして表示する */
export const CompetitionPickerSheet: React.FC<CompetitionPickerSheetProps> = ({
  visible,
  onClose,
  competitions,
  teamNames,
  selectedId,
  onSelect,
}) => {
  const { t } = useTranslation();
  const locale = useDateLocale();
  const insets = useSafeInsets();

  const groups = useMemo(() => {
    const personal: Competition[] = [];
    const byTeam = new Map<string, Competition[]>();
    for (const competition of competitions) {
      if (!competition.team_id) {
        personal.push(competition);
        continue;
      }
      const list = byTeam.get(competition.team_id) ?? [];
      list.push(competition);
      byTeam.set(competition.team_id, list);
    }
    return [
      ...(personal.length > 0
        ? [{ key: "personal", label: t("goals.form.personalCompetitionGroup"), items: personal }]
        : []),
      ...Array.from(byTeam.entries()).map(([teamId, items]) => ({
        key: teamId,
        label: teamNames[teamId] ?? t("goals.form.teamCompetitionGroupFallback"),
        items,
      })),
    ];
  }, [competitions, teamNames, t]);

  return (
    <SlideUpModal
      visible={visible}
      onClose={onClose}
      backdropAccessibilityLabel={t("common.close")}
      overlayColor="rgba(0,0,0,0.4)"
      sheetStyle={[styles.sheet, { paddingBottom: getSafeFooterPadding(16, insets.bottom) }]}
    >
      <View style={styles.sheetHeader}>
        <Text style={styles.sheetTitle}>{t("goals.form.selectCompetitionPlaceholder")}</Text>
        <Pressable
          onPress={onClose}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t("common.close")}
        >
          <Feather name="x" size={22} color="#6B7280" />
        </Pressable>
      </View>
      {groups.length === 0 ? (
        <Text style={styles.emptyText}>{t("goals.mobile.noSelectableCompetitions")}</Text>
      ) : (
        <ScrollView style={styles.list}>
          {groups.map((group) => (
            <View key={group.key}>
              <Text style={styles.groupLabel}>{group.label}</Text>
              {group.items.map((competition) => {
                const selected = competition.id === selectedId;
                return (
                  <Pressable
                    key={competition.id}
                    style={[styles.option, selected && styles.optionSelected]}
                    onPress={() => onSelect(competition.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                  >
                    <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                      {competition.title || t("goals.form.competitionFallback")} -{" "}
                      {formatDate(competition.date, "numeric", locale)}
                    </Text>
                    {selected && <Feather name="check" size={18} color="#2563EB" />}
                  </Pressable>
                );
              })}
            </View>
          ))}
        </ScrollView>
      )}
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
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  optionSelected: {
    backgroundColor: "#EFF6FF",
  },
  optionText: {
    flex: 1,
    fontSize: 15,
    color: "#111827",
  },
  optionTextSelected: {
    fontWeight: "600",
    color: "#2563EB",
  },
  emptyText: {
    padding: 24,
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
  },
});
