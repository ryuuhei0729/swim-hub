// =============================================================================
// RankingList - チームランキングの一覧表示
// =============================================================================
//
// 1行1カード。web のテーブル (順位/名前/タイム/大会/日付の5列) を幅 ~360dp に
// そのまま持ち込むと潰れるため、
// 「1行目: 順位バッジ + 名前 + タイム / 2行目: 大会名 + 日付」の
// カードレイアウトに作り直す。
//
// プロフィール画像は表示しない (ユーザー要望)。RelayRankingList も同様に表示しないため
// ランキング系の一覧は web/mobile ともアバターなしで揃う。
//
// 空状態は2種類に分ける (Sprint Contract)。どちらを出すかは呼び出し側が
// `useTeamHasAnyRecordQuery` の結果から決める:
// - noMatch   … 絞り込み条件に一致する記録がない
// - noRecords … チームにそもそも大会記録が1件もない

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  FlatList,
  StyleSheet,
  type ListRenderItemInfo,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import type { TeamRankingRow } from "@apps/shared/types";
import { formatTimeBest } from "@apps/shared/utils/time";
import { formatDate, type SupportedLocale } from "@apps/shared/utils/date";
import { useDateLocale } from "@/hooks/useDateLocale";
import {
  RANK_BADGE_WIDTH,
  ROW_BOTTOM_LINE_INDENT,
  ROW_TOP_LINE_GAP,
} from "./rowMetrics";
import { getRankBadgeColor } from "./rankBadgeColor";

/**
 * 1回に表示する行数。「もっと見る」でこの単位ずつ追加表示する。
 * RelayRankingList の同名定数とは**意図的に別々**にしている (カードの高さも
 * 1件あたりの重さも違うため、片方だけ調整できる方が正しい。値が一致している
 * ことに依存した挙動は無い)。
 */
const PAGE_SIZE = 20;

interface RankingRowLabels {
  rank: string;
  name: string;
  time: string;
  competition: string;
  date: string;
  /** competitionTitle が null (一括登録記録) のときに大会名の代わりに表示する文言 */
  noCompetition: string;
}

interface RankingRowItemProps {
  row: TeamRankingRow;
  labels: RankingRowLabels;
  dateLocale: SupportedLocale;
}

/** ランキング1行分の表示。 */
const RankingRowItem: React.FC<RankingRowItemProps> = React.memo(
  ({ row, labels, dateLocale }) => {
    const badgeColor = getRankBadgeColor(row.rank);
    const timeLabel = formatTimeBest(row.time);
    const competitionLabel = row.competitionTitle ?? labels.noCompetition;
    // 大会に紐づかない記録 (ベストタイムの一括登録) は competitionDate が null なので
    // 記録行の作成日を表示フォールバックにする (型契約 teamRanking.ts の
    // recordCreatedAt の定義どおり。web の日付列と同じ値になる)。
    // recordCreatedAt も null なら formatDate が "-" を返す
    const dateLabel = formatDate(row.competitionDate ?? row.recordCreatedAt, "numeric", dateLocale);

    return (
      <View
        style={styles.row}
        accessible
        accessibilityLabel={[
          `${labels.rank} ${row.rank}`,
          `${labels.name} ${row.displayName}`,
          `${labels.time} ${timeLabel}`,
          `${labels.competition} ${competitionLabel}`,
          `${labels.date} ${dateLabel}`,
        ].join(". ")}
      >
        <View style={styles.rowTopLine}>
          <View style={[styles.rankBadge, { backgroundColor: badgeColor.bg }]}>
            <Text style={[styles.rankBadgeText, { color: badgeColor.text }]}>{row.rank}</Text>
          </View>
          <Text style={styles.displayName} numberOfLines={1}>
            {row.displayName}
          </Text>
          <Text style={styles.time}>{timeLabel}</Text>
        </View>
        <View style={styles.rowBottomLine}>
          <Text style={styles.competition} numberOfLines={1}>
            {competitionLabel}
          </Text>
          <Text style={styles.date}>{dateLabel}</Text>
        </View>
      </View>
    );
  },
);
RankingRowItem.displayName = "RankingRowItem";

export interface RankingListProps {
  rows: TeamRankingRow[];
  /**
   * 0件のときに出す文言の種類。
   * - noMatch: 絞り込み条件に一致する記録が無い (チームには記録がある)
   * - noRecords: チームにそもそも大会記録が1件も無い
   *
   * 判定は `useTeamHasAnyRecordQuery` の結果に基づいて呼び出し側が決める
   * (絞り込みの内容から推測しない)。
   */
  emptyVariant: "noMatch" | "noRecords";
}

/**
 * ランキング一覧。並び順は RPC + 順位付与 (assignCompetitionRanks) の結果を
 * そのまま使うため、この層では並べ替えない。
 */
export const RankingList: React.FC<RankingListProps> = ({ rows, emptyVariant }) => {
  const { t } = useTranslation();
  const dateLocale = useDateLocale();
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // 絞り込み変更などで行データが差し替わったら表示件数を先頭ページに戻す
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [rows]);

  // React.memo した行に毎レンダー新しいオブジェクトを渡さないようメモ化する
  // (言語が変わると t の同一性が変わるので追随する)
  const labels = useMemo<RankingRowLabels>(
    () => ({
      rank: t("teams.waPointsCompare.rankLabel"),
      name: t("teams.ranking.col.name"),
      time: t("teams.ranking.col.time"),
      competition: t("teams.ranking.col.competition"),
      date: t("teams.ranking.col.date"),
      noCompetition: t("common.none"),
    }),
    [t],
  );

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<TeamRankingRow>) => (
      <RankingRowItem row={item} labels={labels} dateLocale={dateLocale} />
    ),
    [labels, dateLocale],
  );

  const keyExtractor = useCallback((item: TeamRankingRow) => item.recordId, []);

  const handleShowMore = useCallback(() => {
    setVisibleCount((prev) => prev + PAGE_SIZE);
  }, []);

  if (rows.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Feather name="bar-chart-2" size={40} color="#D1D5DB" />
        <Text style={styles.emptyTitle}>
          {emptyVariant === "noRecords"
            ? t("teams.ranking.empty.noRecordsTitle")
            : t("teams.ranking.empty.noMatchTitle")}
        </Text>
        <Text style={styles.emptyBody}>
          {emptyVariant === "noRecords"
            ? t("teams.ranking.empty.noRecordsBody")
            : t("teams.ranking.empty.noMatchBody")}
        </Text>
      </View>
    );
  }

  const visibleRows = rows.slice(0, visibleCount);
  const hasMore = visibleCount < rows.length;

  return (
    <View style={styles.container}>
      <FlatList
        data={visibleRows}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
      {/* 「もっと見る」は FlatList の ListFooterComponent ではなく兄弟として置く。
          リストのスクロール位置に関わらず操作でき、リスト末尾まで
          スクロールしなくても追加読み込みできる */}
      {hasMore && (
        <Pressable
          style={styles.showMoreButton}
          onPress={handleShowMore}
          accessibilityRole="button"
          accessibilityLabel={t("teams.ranking.showMore")}
        >
          <Text style={styles.showMoreButtonText}>{t("teams.ranking.showMore")}</Text>
        </Pressable>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    padding: 12,
    gap: 8,
  },
  emptyContainer: {
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#374151",
    textAlign: "center",
  },
  emptyBody: {
    fontSize: 13,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 20,
  },
  row: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 12,
    gap: 6,
  },
  rowTopLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: ROW_TOP_LINE_GAP,
  },
  rankBadge: {
    minWidth: RANK_BADGE_WIDTH,
    height: 28,
    paddingHorizontal: 4,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  rankBadgeText: {
    fontSize: 13,
    fontWeight: "700",
  },
  displayName: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  time: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1D4ED8",
    fontVariant: ["tabular-nums"],
  },
  rowBottomLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    // アバター撤去後は 1行目の名前の開始位置と一致するので 2行目が名前の真下に揃う。
    // 即値ではなく rowMetrics の和で持つ (片方だけ変えると静かにズレる)
    paddingLeft: ROW_BOTTOM_LINE_INDENT,
  },
  competition: {
    flex: 1,
    fontSize: 12,
    color: "#374151",
  },
  date: {
    fontSize: 12,
    color: "#6B7280",
  },
  showMoreButton: {
    marginHorizontal: 12,
    marginBottom: 12,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
  },
  showMoreButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#2563EB",
  },
});
