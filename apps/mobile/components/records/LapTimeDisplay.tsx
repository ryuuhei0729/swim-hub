import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { useTranslation } from "react-i18next";
import {
  calculateAllLapTimes,
  calculateRaceLapTimesTable,
  getLapIntervalsForRace,
  type SplitTime,
} from "@/utils/lapTimeCalculator";
import { formatTimeBest } from "@/utils/formatters";

interface LapTimeDisplayProps {
  splitTimes: Array<{ distance: number | ""; splitTime: number }>;
  raceDistance?: number; // 種目の距離（m）
}

/**
 * ラップタイム表示（mobile 版）
 * web components/forms/LapTimeDisplay.tsx 相当。距離別 Lap / All Lap の2タブ表示。
 */
export const LapTimeDisplay: React.FC<LapTimeDisplayProps> = ({ splitTimes, raceDistance }) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<"all" | "race">("race");

  // split-timeを有効なものだけフィルタリングしてSplitTime型に変換
  const validSplitTimes: SplitTime[] = useMemo(() => {
    return splitTimes
      .filter((st) => typeof st.distance === "number" && st.distance > 0 && st.splitTime > 0)
      .map((st) => ({
        distance: st.distance as number,
        splitTime: st.splitTime,
      }));
  }, [splitTimes]);

  const allLapTimes = useMemo(() => calculateAllLapTimes(validSplitTimes), [validSplitTimes]);

  const raceLapTimesTable = useMemo(() => {
    if (!raceDistance || validSplitTimes.length === 0) return [];
    return calculateRaceLapTimesTable(validSplitTimes, raceDistance);
  }, [validSplitTimes, raceDistance]);

  const lapIntervals = useMemo(() => {
    if (!raceDistance) return [];
    return getLapIntervalsForRace(raceDistance);
  }, [raceDistance]);

  // データが1つもないintervalは列ごと非表示にする
  const visibleLapIntervals = useMemo(() => {
    return lapIntervals.filter((interval) =>
      raceLapTimesTable.some((row) => row.lapTimes[interval] != null),
    );
  }, [lapIntervals, raceLapTimesTable]);

  if (validSplitTimes.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>{t("recordMobile.lapTime.noSplits")}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* タブ */}
      <View style={styles.tabRow}>
        <Pressable
          style={[styles.tab, activeTab === "race" && styles.tabActive]}
          onPress={() => setActiveTab("race")}
          accessibilityRole="button"
          accessibilityState={{ selected: activeTab === "race" }}
        >
          <Text style={[styles.tabText, activeTab === "race" && styles.tabTextActive]}>
            {t("recordMobile.lapTime.raceLapTab")}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === "all" && styles.tabActive]}
          onPress={() => setActiveTab("all")}
          accessibilityRole="button"
          accessibilityState={{ selected: activeTab === "all" }}
        >
          <Text style={[styles.tabText, activeTab === "all" && styles.tabTextActive]}>
            {t("recordMobile.lapTime.allLapTab")}
          </Text>
        </Pressable>
      </View>

      <View style={styles.body}>
        {activeTab === "all" &&
          (allLapTimes.length === 0 ? (
            <Text style={styles.infoText}>{t("recordMobile.lapTime.noLap")}</Text>
          ) : (
            <View style={styles.allLapList}>
              {allLapTimes.map((lap, index) => (
                <View key={index} style={styles.allLapRow}>
                  <Text style={styles.allLapRange}>
                    {lap.fromDistance}m - {lap.toDistance}m
                  </Text>
                  <Text style={styles.allLapValue}>{formatTimeBest(lap.lapTime)}</Text>
                </View>
              ))}
            </View>
          ))}

        {activeTab === "race" &&
          (!raceDistance ? (
            <Text style={styles.infoText}>{t("recordMobile.lapTime.noStyle")}</Text>
          ) : raceLapTimesTable.length === 0 ? (
            <Text style={styles.infoText}>{t("recordMobile.lapTime.noLap")}</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.table}>
                {/* ヘッダー行 */}
                <View style={[styles.tableRow, styles.tableHeaderRow]}>
                  <Text style={[styles.cell, styles.headerCell]}>
                    {t("recordMobile.lapTime.distanceHeader")}
                  </Text>
                  <Text style={[styles.cell, styles.headerCell]}>
                    {t("recordMobile.lapTime.splitTimeHeader")}
                  </Text>
                  {visibleLapIntervals.map((interval) => (
                    <Text key={interval} style={[styles.cell, styles.headerCell]}>
                      {interval}m Lap
                    </Text>
                  ))}
                </View>
                {/* データ行 */}
                {raceLapTimesTable.map((row, index) => (
                  <View key={index} style={styles.tableRow}>
                    <Text style={[styles.cell, styles.distanceCell]}>{row.distance}m</Text>
                    <Text style={styles.cell}>
                      {row.splitTime !== null ? formatTimeBest(row.splitTime) : "-"}
                    </Text>
                    {visibleLapIntervals.map((interval) => (
                      <Text key={interval} style={styles.cell}>
                        {row.lapTimes[interval] != null
                          ? formatTimeBest(row.lapTimes[interval]!)
                          : "-"}
                      </Text>
                    ))}
                  </View>
                ))}
              </View>
            </ScrollView>
          ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: 12,
    backgroundColor: "#F9FAFB",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    overflow: "hidden",
  },
  emptyContainer: {
    marginTop: 12,
    padding: 16,
    backgroundColor: "#F9FAFB",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  emptyText: {
    fontSize: 13,
    color: "#6B7280",
    textAlign: "center",
  },
  tabRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: "#2563EB",
  },
  tabText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#6B7280",
  },
  tabTextActive: {
    color: "#2563EB",
    fontWeight: "600",
  },
  body: {
    padding: 12,
  },
  infoText: {
    fontSize: 13,
    color: "#6B7280",
  },
  allLapList: {
    gap: 4,
  },
  allLapRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: "#FFFFFF",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  allLapRange: {
    fontSize: 13,
    color: "#4B5563",
  },
  allLapValue: {
    fontSize: 13,
    fontWeight: "600",
    color: "#111827",
    fontVariant: ["tabular-nums"],
  },
  table: {
    minWidth: "100%",
  },
  tableRow: {
    flexDirection: "row",
  },
  tableHeaderRow: {
    backgroundColor: "#F3F4F6",
  },
  cell: {
    minWidth: 84,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: "#111827",
    fontVariant: ["tabular-nums"],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  headerCell: {
    fontSize: 11,
    fontWeight: "600",
    color: "#374151",
  },
  distanceCell: {
    fontWeight: "600",
  },
});
