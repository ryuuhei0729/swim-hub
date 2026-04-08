import React from "react";
import { View, Text, StyleSheet } from "react-native";
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

const FEATURE_ROWS: FeatureRow[] = [
  { label: "スプリットタイム", free: "3個/レコード", premium: "無制限" },
  { label: "練習タイム", free: "18個/ログ", premium: "無制限" },
  { label: "画像アップロード", free: false, premium: true },
  { label: "動画アップロード", free: false, premium: true },
  { label: "AI メニュー分析", free: "1回/日", premium: "無制限" },
  { label: "広告", free: true, premium: false },
];

function CellContent({ value }: { value: CellValue }) {
  if (typeof value === "boolean") {
    return (
      <Text style={[styles.cellIcon, value ? styles.cellIconCheck : styles.cellIconX]}>
        {value ? "✓" : "✗"}
      </Text>
    );
  }
  return <Text style={styles.cellText}>{value}</Text>;
}

export function PlanComparisonTable({ currentPlan }: PlanComparisonTableProps) {
  const columns = [
    { key: "free" as const, label: "Free" },
    { key: "premium" as const, label: "Premium" },
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
                <Text style={styles.currentBadgeText}>現在</Text>
              </View>
            )}
          </View>
        ))}
      </View>

      {/* Feature rows */}
      {FEATURE_ROWS.map((row, index) => (
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
  cellIcon: {
    fontSize: 16,
    fontWeight: "bold",
  },
  cellIconCheck: {
    color: "#059669",
  },
  cellIconX: {
    color: "#D1D5DB",
  },
});
