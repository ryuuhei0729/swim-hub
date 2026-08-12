import React, { useMemo } from "react";
import { View, Text, StyleSheet, Image } from "react-native";
import { Feather } from "@expo/vector-icons";
import type { TFunction } from "i18next";
import {
  formatTime,
  formatCircleTime,
  getStyleLabel,
  getTextColorForBackground,
} from "@/utils/formatters";
import { SHARE_CARD_WIDTH } from "./CompetitionShareCard";
import type { PracticeShareData, PracticeMenuItem } from "./types";

interface PracticeMenuCardProps {
  item: PracticeMenuItem;
  t: TFunction;
}

/** 練習メニュー1件分のカード（内容 + タグ + タイム表 + メモ）。web PracticeShareCard.tsx のメニュー行を移植 */
const PracticeMenuCard: React.FC<PracticeMenuCardProps> = ({ item, t }) => {
  const allTimes = useMemo(() => item.times || [], [item.times]);

  const setAverages = useMemo(() => {
    const map: Record<number, number> = {};
    for (let s = 1; s <= item.setCount; s++) {
      const setTimes = allTimes.filter((time) => time.setNumber === s && time.time > 0);
      if (setTimes.length > 0) {
        map[s] = setTimes.reduce((sum, time) => sum + time.time, 0) / setTimes.length;
      }
    }
    return map;
  }, [allTimes, item.setCount]);

  const overallStats = useMemo(() => {
    const validTimes = allTimes.filter((time) => time.time > 0);
    if (validTimes.length === 0) return { average: 0, fastest: 0 };
    return {
      average: validTimes.reduce((sum, time) => sum + time.time, 0) / validTimes.length,
      fastest: Math.min(...validTimes.map((time) => time.time)),
    };
  }, [allTimes]);

  return (
    <View style={styles.menuCard}>
      {/* タグ */}
      {item.tags && item.tags.length > 0 && (
        <View style={styles.tagsRow}>
          {item.tags.map((tag, index) => (
            <View key={index} style={[styles.tag, { backgroundColor: tag.color }]}>
              <Text style={[styles.tagText, { color: getTextColorForBackground(tag.color) }]}>
                {tag.name}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* 練習内容 */}
      <View style={styles.contentCard}>
        <Text style={styles.contentLabel}>{t("practice.modal.content")}</Text>
        <View style={styles.contentRow}>
          <Text style={styles.contentValue}>{item.distance}</Text>
          <Text style={styles.contentUnit}>m × </Text>
          <Text style={styles.contentValue}>{item.repCount}</Text>
          <Text style={styles.contentUnit}>{t("common.units.reps")}</Text>
          {item.setCount > 1 && (
            <>
              <Text style={styles.contentUnit}> × </Text>
              <Text style={styles.contentValue}>{item.setCount}</Text>
              <Text style={styles.contentUnit}>{t("common.units.sets")}</Text>
            </>
          )}
          {item.circle != null && (
            <>
              <Text style={styles.contentSpacer}>{"  "}</Text>
              <Text style={styles.contentValue}>{formatCircleTime(item.circle)}</Text>
            </>
          )}
          <Text style={styles.contentSpacer}>{"  "}</Text>
          <Text style={styles.contentValue}>{getStyleLabel(item.style, t)}</Text>
          {item.category && item.category !== "Swim" && (
            <>
              <Text style={styles.contentSpacer}>{"  "}</Text>
              <Text style={styles.contentValue}>{item.category}</Text>
            </>
          )}
        </View>
      </View>

      {/* タイム表示 */}
      {allTimes.length > 0 && (
        <View style={styles.timeSection}>
          <View style={styles.timeHeader}>
            <View style={styles.timeAccent} />
            <Text style={styles.timeTitle}>{t("practice.modal.time")}</Text>
          </View>
          <View style={styles.table}>
            {/* ヘッダー行 */}
            <View style={[styles.tableRow, styles.tableHeaderRow]}>
              <View style={styles.tableLabelCell} />
              {Array.from({ length: item.setCount }, (_, i) => (
                <View key={i + 1} style={styles.tableDataCell}>
                  <Text style={styles.tableHeaderText}>
                    {t("practice.modal.setLabel", { n: i + 1 })}
                  </Text>
                </View>
              ))}
            </View>

            {/* 本ごとのタイム */}
            {Array.from({ length: item.repCount }, (_, repIndex) => {
              const repNumber = repIndex + 1;
              return (
                <View key={repNumber} style={[styles.tableRow, styles.tableBodyRow]}>
                  <View style={styles.tableLabelCell}>
                    <Text style={styles.tableLabelText}>
                      {t("practice.modal.repLabel", { n: repNumber })}
                    </Text>
                  </View>
                  {Array.from({ length: item.setCount }, (_, setIndex) => {
                    const setNumber = setIndex + 1;
                    const time = allTimes.find(
                      (t2) => t2.setNumber === setNumber && t2.repNumber === repNumber,
                    );
                    return (
                      <View key={setNumber} style={styles.tableDataCell}>
                        <Text style={styles.timeText}>
                          {time && time.time > 0 ? formatTime(time.time) : "-"}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              );
            })}

            {/* セット平均行 */}
            <View style={[styles.tableRow, styles.setAverageRow]}>
              <View style={[styles.tableLabelCell, styles.setAverageCell]}>
                <Text style={styles.setAverageLabel}>{t("practice.modal.setAverage")}</Text>
              </View>
              {Array.from({ length: item.setCount }, (_, setIndex) => {
                const setNumber = setIndex + 1;
                const average = setAverages[setNumber];
                return (
                  <View key={setNumber} style={[styles.tableDataCell, styles.setAverageCell]}>
                    <Text style={styles.setAverageText}>
                      {average > 0 ? formatTime(average) : "-"}
                    </Text>
                  </View>
                );
              })}
            </View>

            {/* 全体平均行 */}
            <View style={[styles.tableRow, styles.overallRow, styles.overallRowTop]}>
              <View style={[styles.tableLabelCell, styles.overallCell]}>
                <Text style={styles.overallLabel}>{t("practice.modal.overallAverage")}</Text>
              </View>
              <View style={[styles.overallValueCell, { flex: item.setCount }]}>
                <Text style={styles.overallValue}>
                  {overallStats.average > 0 ? formatTime(overallStats.average) : "-"}
                </Text>
              </View>
            </View>

            {/* 全体最速行 */}
            <View style={[styles.tableRow, styles.overallRow]}>
              <View style={[styles.tableLabelCell, styles.overallCell]}>
                <Text style={styles.overallLabel}>{t("practice.modal.overallFastest")}</Text>
              </View>
              <View style={[styles.overallValueCell, { flex: item.setCount }]}>
                <Text style={styles.overallValue}>
                  {overallStats.fastest > 0 ? formatTime(overallStats.fastest) : "-"}
                </Text>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* メモ */}
      {item.note && (
        <View style={styles.noteCard}>
          <Text style={styles.noteLabel}>{t("practice.modal.memo")}</Text>
          <Text style={styles.noteText}>{item.note}</Text>
        </View>
      )}
    </View>
  );
};

interface PracticeShareCardProps {
  data: PracticeShareData;
  t: TFunction;
}

/**
 * 練習メニューシェアカード（白背景・SNS シェア用）。
 * web apps/web/components/share/PracticeShareCard.tsx のレイアウトを RN に移植。
 */
export const PracticeShareCard: React.FC<PracticeShareCardProps> = ({ data, t }) => {
  return (
    <View style={styles.card}>
      {/* ヘッダー: 日付と練習情報 */}
      <Text style={styles.date}>{data.date}</Text>
      <Text style={styles.title}>{data.title}</Text>
      {(data.place || data.note) && (
        <View style={styles.metaRow}>
          {data.place && (
            <View style={styles.metaItem}>
              <Feather name="map-pin" size={12} color="#94A3B8" />
              <Text style={styles.metaText}>{data.place}</Text>
            </View>
          )}
          {data.note && (
            <View style={styles.metaItem}>
              <Feather name="file-text" size={12} color="#94A3B8" />
              <Text style={styles.metaText}>{data.note}</Text>
            </View>
          )}
        </View>
      )}

      {/* メニュー一覧 */}
      <View style={styles.menuList}>
        {data.menuItems.map((item, index) => (
          <PracticeMenuCard key={index} item={item} t={t} />
        ))}
      </View>

      {/* フッター: ブランディング */}
      <View style={styles.footer}>
        {/* "@/" エイリアスだと vitest 側でアセットを解決できないため相対パスで参照する */}
        <Image source={require("../../assets/icons/app-icon.png")} style={styles.brandLogo} />
        <Text style={styles.brand}>SwimHub</Text>
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
  date: {
    fontSize: 12,
    color: "#64748B",
    marginBottom: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#0F172A",
  },
  metaRow: {
    marginTop: 4,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaText: {
    fontSize: 12,
    color: "#64748B",
  },
  menuList: {
    marginTop: 12,
    gap: 12,
  },
  menuCard: {
    backgroundColor: "#F0FDF4",
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
  },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  tagText: {
    fontSize: 11,
    fontWeight: "600",
  },
  contentCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: "#86EFAC",
  },
  contentLabel: {
    fontSize: 10,
    fontWeight: "500",
    color: "#6B7280",
    marginBottom: 4,
  },
  contentRow: {
    flexDirection: "row",
    alignItems: "baseline",
    flexWrap: "wrap",
  },
  contentValue: {
    fontSize: 15,
    fontWeight: "600",
    color: "#15803D",
  },
  contentUnit: {
    fontSize: 12,
    color: "#1F2937",
  },
  contentSpacer: {
    fontSize: 12,
    color: "#1F2937",
  },
  timeSection: {
    marginTop: 2,
  },
  timeHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  timeAccent: {
    width: 3,
    height: 14,
    backgroundColor: "#22C55E",
    borderRadius: 2,
  },
  timeTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#15803D",
  },
  table: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#86EFAC",
    overflow: "hidden",
  },
  tableRow: {
    flexDirection: "row",
  },
  tableHeaderRow: {
    borderBottomWidth: 1,
    borderBottomColor: "#86EFAC",
  },
  tableBodyRow: {
    borderBottomWidth: 1,
    borderBottomColor: "#D1FAE5",
  },
  tableLabelCell: {
    width: 52,
    paddingVertical: 6,
    paddingHorizontal: 6,
    justifyContent: "center",
  },
  tableDataCell: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 4,
    justifyContent: "center",
    alignItems: "center",
  },
  tableHeaderText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#166534",
    textAlign: "center",
  },
  tableLabelText: {
    fontSize: 11,
    fontWeight: "500",
    color: "#374151",
  },
  timeText: {
    fontSize: 12,
    color: "#1F2937",
  },
  setAverageRow: {
    borderBottomWidth: 1,
    borderBottomColor: "#D1FAE5",
  },
  setAverageCell: {
    backgroundColor: "#F0FDF4",
  },
  setAverageLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: "#166534",
  },
  setAverageText: {
    fontSize: 11,
    fontWeight: "500",
    color: "#166534",
  },
  overallRow: {
    borderBottomWidth: 0,
  },
  overallRowTop: {
    borderTopWidth: 2,
    borderTopColor: "#86EFAC",
  },
  overallCell: {
    backgroundColor: "#EFF6FF",
  },
  overallValueCell: {
    backgroundColor: "#EFF6FF",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  overallLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: "#1E40AF",
  },
  overallValue: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1E40AF",
  },
  noteCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  noteLabel: {
    fontSize: 10,
    fontWeight: "500",
    color: "#6B7280",
    marginBottom: 2,
  },
  noteText: {
    fontSize: 12,
    color: "#475569",
  },
  footer: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  brandLogo: {
    width: 18,
    height: 18,
    borderRadius: 4,
  },
  brand: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    letterSpacing: 1,
  },
});
