import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import type { TFunction } from "i18next";
import { formatTimeBest } from "@/utils/formatters";
import { getBadgeState } from "@/components/records/BestTimeBadge";
import {
  calculateRaceLapTimesTable,
  getLapIntervalsForRace,
  type SplitTime,
} from "@/utils/lapTimeCalculator";
import type { CompetitionShareData } from "./types";

// CompetitionShareData は types.ts に集約済み。後方互換のため re-export する。
export type { CompetitionShareData } from "./types";

/** キャプチャ時の固定幅（web の 480px 相当をモバイル向けに縮小） */
export const SHARE_CARD_WIDTH = 360;

/** 自己ベスト3状態バッジ（web share/BestBadge のモバイル版） */
function ShareBestBadge({ state, t }: { state: ReturnType<typeof getBadgeState>; t: TFunction }) {
  if (state.kind === "none") return null;

  if (state.kind === "first") {
    return (
      <View style={[styles.badge, styles.badgeFirst]}>
        <Text style={styles.badgeFirstText}>{t("recordMobile.bestBadge.first")}</Text>
      </View>
    );
  }

  const isBest = state.kind === "best";
  return (
    <View style={[styles.badge, isBest ? styles.badgeBest : styles.badgeSlower]}>
      <Text style={styles.badgeLabel}>{t("recordMobile.bestBadge.personalBest")}</Text>
      <Text style={[styles.badgeValue, isBest ? styles.badgeValueBest : styles.badgeValueSlower]}>
        {state.label}
      </Text>
    </View>
  );
}

interface CompetitionShareCardProps {
  data: CompetitionShareData;
  t: TFunction;
}

/**
 * 大会記録シェアカード（白背景・SNS シェア用）。
 * web apps/web/components/share/CompetitionShareCard.tsx のレイアウトを RN に移植。
 */
export const CompetitionShareCard: React.FC<CompetitionShareCardProps> = ({ data, t }) => {
  const validSplitTimes: SplitTime[] = useMemo(() => {
    if (!data.splitTimes) return [];
    return data.splitTimes
      .filter((st) => st.distance > 0 && st.split_time > 0)
      .map((st) => ({ distance: st.distance, splitTime: st.split_time }));
  }, [data.splitTimes]);

  // 種目別 Lap テーブル（最終タイム行を必要なら追加）— web と同一ロジック
  const raceLapTimesTable = useMemo(() => {
    if (!data.raceDistance || validSplitTimes.length === 0) return [];
    const table = calculateRaceLapTimesTable(validSplitTimes, data.raceDistance);
    const lastRow = table[table.length - 1];
    if (lastRow && lastRow.distance < data.raceDistance && data.time > 0) {
      const intervals = getLapIntervalsForRace(data.raceDistance);
      const lapTimes: Record<number, number | null> = {};
      for (const interval of intervals) {
        if (data.raceDistance % interval === 0) {
          const prevDistance = data.raceDistance - interval;
          const prevRow = table.find((row) => row.distance === prevDistance);
          if (prevRow && prevRow.splitTime !== null) {
            lapTimes[interval] = data.time - prevRow.splitTime;
          } else if (prevDistance === 0) {
            lapTimes[interval] = data.time;
          } else {
            lapTimes[interval] = null;
          }
        } else {
          lapTimes[interval] = null;
        }
      }
      table.push({ distance: data.raceDistance, splitTime: data.time, lapTimes });
    }
    return table;
  }, [validSplitTimes, data.raceDistance, data.time]);

  const lapIntervals = useMemo(
    () => (data.raceDistance ? getLapIntervalsForRace(data.raceDistance) : []),
    [data.raceDistance],
  );
  const visibleLapIntervals = useMemo(
    () =>
      lapIntervals.filter((interval) =>
        raceLapTimesTable.some((row) => row.lapTimes[interval] != null),
      ),
    [lapIntervals, raceLapTimesTable],
  );

  const badge = getBadgeState(data.time, data.previousBest, data.isFirstRecord);

  return (
    <View style={styles.card}>
      {/* メタ: 日付 ・ 場所 (プール種別) */}
      <Text style={styles.meta}>
        {data.date}
        {data.place ? ` ・ ${data.place}` : ""}
        {` (${data.poolType === "short" ? "25m" : "50m"})`}
      </Text>

      {/* 大会名 */}
      <Text style={styles.competitionName}>{data.competitionName}</Text>

      {/* 種目名 */}
      <Text style={styles.eventName}>{data.eventName}</Text>

      {/* 記録行: RT(左) / タイム(大)+自己ベストバッジ(右) */}
      <View style={styles.timeRow}>
        {data.reactionTime != null && (
          <Text style={styles.rt}>RT {data.reactionTime.toFixed(2)}</Text>
        )}
        <View style={styles.timeRight}>
          <Text style={styles.time}>{formatTimeBest(data.time)}</Text>
          <ShareBestBadge state={badge} t={t} />
        </View>
      </View>

      {/* スプリットテーブル */}
      {raceLapTimesTable.length > 0 && (
        <View style={styles.table}>
          <View style={[styles.row, styles.headRow]}>
            <Text style={[styles.headCell, styles.colDist]}>
              {t("recordMobile.tableHeaderDistance")}
            </Text>
            <Text style={[styles.headCell, styles.colSplit]}>
              {t("recordMobile.tableHeaderSplit")}
            </Text>
            {visibleLapIntervals.map((interval) => (
              <Text key={interval} style={[styles.headCell, styles.colLap]}>
                {t("recordMobile.tableHeaderLapColumn", { interval })}
              </Text>
            ))}
          </View>
          {raceLapTimesTable.map((r, index) => (
            <View
              key={index}
              style={[styles.row, index < raceLapTimesTable.length - 1 && styles.rowBorder]}
            >
              <Text style={[styles.cell, styles.colDist, styles.cellStrong]}>
                {t("recordMobile.distanceDisplay", { distance: r.distance })}
              </Text>
              <Text style={[styles.cell, styles.colSplit, styles.cellStrong]}>
                {r.splitTime !== null ? formatTimeBest(r.splitTime) : "–"}
              </Text>
              {visibleLapIntervals.map((interval) => (
                <Text key={interval} style={[styles.cell, styles.colLap, styles.cellMuted]}>
                  {r.lapTimes[interval] != null ? formatTimeBest(r.lapTimes[interval]!) : "–"}
                </Text>
              ))}
            </View>
          ))}
        </View>
      )}

      {/* フッター: ブランディング */}
      <View style={styles.footer}>
        <Text style={styles.brand}>🏊 SwimHub</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    width: SHARE_CARD_WIDTH,
    backgroundColor: "#FFFFFF",
    padding: 20,
  },
  meta: {
    fontSize: 12,
    color: "#6B7280",
  },
  competitionName: {
    marginTop: 8,
    fontSize: 12,
    color: "#6B7280",
  },
  eventName: {
    marginTop: 2,
    fontSize: 24,
    fontWeight: "700",
    color: "#111827",
  },
  timeRow: {
    marginTop: 16,
    flexDirection: "row",
    alignItems: "flex-end",
  },
  rt: {
    fontSize: 12,
    color: "#9CA3AF",
    paddingBottom: 6,
  },
  timeRight: {
    marginLeft: "auto",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  time: {
    fontSize: 44,
    fontWeight: "700",
    color: "#2563EB",
    letterSpacing: -1,
  },
  badge: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: "center",
  },
  badgeFirst: {
    backgroundColor: "#FFFBEB",
  },
  badgeFirstText: {
    color: "#D97706",
    fontSize: 16,
    fontWeight: "700",
  },
  badgeBest: {
    backgroundColor: "#EFF6FF",
  },
  badgeSlower: {
    backgroundColor: "#FEF2F2",
  },
  badgeLabel: {
    fontSize: 10,
    color: "#6B7280",
  },
  badgeValue: {
    fontSize: 16,
    fontWeight: "700",
  },
  badgeValueBest: {
    color: "#2563EB",
  },
  badgeValueSlower: {
    color: "#DC2626",
  },
  table: {
    marginTop: 20,
    backgroundColor: "#F9FAFB",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
  },
  headRow: {
    borderBottomWidth: 2,
    borderBottomColor: "#1F2937",
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  headCell: {
    fontSize: 11,
    fontWeight: "500",
    color: "#9CA3AF",
  },
  cell: {
    fontSize: 13,
  },
  cellStrong: {
    fontWeight: "700",
    color: "#111827",
  },
  cellMuted: {
    color: "#9CA3AF",
  },
  colDist: {
    width: 56,
  },
  colSplit: {
    width: 78,
  },
  colLap: {
    flex: 1,
  },
  footer: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    alignItems: "center",
  },
  brand: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    letterSpacing: 1,
  },
});
