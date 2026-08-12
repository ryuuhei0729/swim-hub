import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import type { UserPlan } from "@swim-hub/shared/types/auth";

type PlanComparisonTableProps = {
  currentPlan: UserPlan;
};

type CellValue = string | boolean;

type FeatureRow = {
  label: string;
  free: CellValue;
  premium: CellValue;
};

function CellContent({ value }: { value: CellValue }) {
  if (typeof value === "boolean") {
    return (
      <Feather
        name={value ? "check" : "x"}
        size={16}
        color={value ? "#059669" : "#D1D5DB"}
      />
    );
  }
  return <Text style={styles.cellText}>{value}</Text>;
}

export function PlanComparisonTable({ currentPlan }: PlanComparisonTableProps) {
  const { t } = useTranslation();

  const featureRows: FeatureRow[] = [
    {
      label: t("pricing.planTable.rowSplitTime"),
      free: t("pricing.planTable.valueSplit3PerRecord"),
      premium: t("pricing.planTable.valueUnlimited"),
    },
    {
      label: t("pricing.planTable.rowPracticeTime"),
      free: t("pricing.planTable.value18PerLog"),
      premium: t("pricing.planTable.valueUnlimited"),
    },
    {
      label: t("pricing.planTable.rowImageUpload"),
      free: true,
      premium: true,
    },
    {
      label: t("pricing.planTable.rowVideoUpload"),
      free: false,
      premium: true,
    },
    {
      label: t("pricing.planTable.rowAiAnalysis"),
      free: t("pricing.planTable.valueOncePerDay"),
      premium: t("pricing.planTable.valueUnlimited"),
    },
    {
      label: t("pricing.planTable.rowAds"),
      free: true,
      premium: false,
    },
  ];

  const columns = [
    { key: "free" as const, label: t("pricing.planTable.free") },
    { key: "premium" as const, label: t("pricing.planTable.premium") },
  ];

  return (
    <View style={styles.table}>
      {/* Header */}
      <View style={styles.headerRow}>
        <View style={styles.featureCell} />
        {columns.map((col) => (
          <View
            key={col.key}
            style={[
              styles.headerCell,
              currentPlan === col.key && styles.headerCellHighlighted,
            ]}
          >
            <Text
              style={[
                styles.headerText,
                currentPlan === col.key && styles.headerTextHighlighted,
              ]}
            >
              {col.label}
            </Text>
            {currentPlan === col.key && (
              <View style={styles.currentBadge}>
                <Text style={styles.currentBadgeText}>{t("pricing.planTable.current")}</Text>
              </View>
            )}
          </View>
        ))}
      </View>

      {/* Feature rows */}
      {featureRows.map((row, index) => (
        <View
          key={row.label}
          style={[styles.row, index % 2 === 1 && styles.rowAlternate]}
        >
          <View style={styles.featureCell}>
            <Text style={styles.featureLabel}>{row.label}</Text>
          </View>
          {columns.map((col) => (
            <View
              key={col.key}
              style={[
                styles.dataCell,
                currentPlan === col.key && styles.dataCellHighlighted,
              ]}
            >
              <CellContent value={row[col.key]} />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  table: {
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    backgroundColor: "#ffffff",
  },
  headerRow: {
    flexDirection: "row",
    backgroundColor: "#F3F4F6",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  featureCell: {
    flex: 2,
    paddingVertical: 10,
    paddingHorizontal: 12,
    justifyContent: "center",
  },
  headerCell: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  headerCellHighlighted: {
    backgroundColor: "#2563EB",
  },
  headerText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#6B7280",
    textAlign: "center",
  },
  headerTextHighlighted: {
    color: "#ffffff",
  },
  currentBadge: {
    backgroundColor: "rgba(255,255,255,0.25)",
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  currentBadgeText: {
    fontSize: 9,
    color: "#ffffff",
    fontWeight: "600",
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  rowAlternate: {
    backgroundColor: "#F9FAFB",
  },
  featureLabel: {
    fontSize: 13,
    color: "#374151",
    fontWeight: "500",
  },
  dataCell: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  dataCellHighlighted: {
    backgroundColor: "rgba(37,99,235,0.05)",
  },
  cellText: {
    fontSize: 12,
    color: "#374151",
    textAlign: "center",
    fontWeight: "500",
  },
});
