// =============================================================================
// RelayRankingList - リレーランキングの一覧表示
// =============================================================================
//
// 1本のリレー = 1カード。web のテーブル (順位/種目/総合タイム/大会/日付/展開) を
// 幅 ~360dp にそのまま持ち込むと潰れるため、個人種目版 (`./RankingList.tsx`) と
// 同じ「1行目: 順位バッジ + 種目 + タイム / 2行目: 大会名 + 日付」のカードに
// 作り直し、右端の展開ボタンでレグ (ラップ) を開く。
//
// レグの通算タイムは **`calcCumulativeTimes()` で導出する**。DB にも RPC の
// 戻り値にも通算は持たない (二重に持つと leg_time との整合を別途保つ必要が出る。
// 過去に通算値が混入して lap 表示が崩れた前科がある)。
//
// 空状態は2種類に分ける。どちらを出すかは呼び出し側が
// `useTeamHasAnyRelayRecordQuery` の結果から決める:
// - noMatch   … 絞り込み条件に一致するリレー記録がない
// - noRecords … チームにそもそもリレー記録が1件もない

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
import type { TeamRelayRankingRow } from "@apps/shared/types";
import { formatTimeBest } from "@apps/shared/utils/time";
import { formatDate, type SupportedLocale } from "@apps/shared/utils/date";
import { calcCumulativeTimes } from "@apps/shared/utils/relayEvents";
import { toStyleCode } from "@apps/shared/utils/swimStyles";
import { useDateLocale } from "@/hooks/useDateLocale";
import {
  RANK_BADGE_WIDTH,
  ROW_BOTTOM_LINE_INDENT,
  ROW_TOP_LINE_GAP,
} from "./rowMetrics";
import { getRankBadgeColor } from "./rankBadgeColor";

/**
 * 1回に表示する行数。「さらに表示」でこの単位ずつ追加表示する。
 * RankingList の同名定数とは**意図的に別々**にしている (リレーのカードは展開で
 * レグ表を持つぶん重いので、片方だけ調整できる方が正しい。値が一致している
 * ことに依存した挙動は無い)。
 */
const PAGE_SIZE = 20;

/** 行を跨いで同じ文言を使うラベル群。`t` の同一性が変わったときだけ作り直す。 */
interface RelayRankingLabels {
  rank: string;
  time: string;
  competition: string;
  date: string;
  /** competitionTitle が null (大会に紐づかないリレー記録) のときの代替文言 */
  noCompetition: string;
  expand: string;
  collapse: string;
  retiredMember: string;
  noLegs: string;
  legHeaderSwimmer: string;
  legHeaderStyle: string;
  legHeaderLegTime: string;
  legHeaderCumulative: string;
}

interface RelayRankingRowItemProps {
  row: TeamRelayRankingRow;
  labels: RelayRankingLabels;
  dateLocale: SupportedLocale;
  /** 種目ラベル。`relay.eventLabel` の補間を親で解決して渡す */
  eventLabel: string;
  /** レグの泳法ラベル解決。`styles.style` (canonical) → 翻訳済み泳法名 */
  legStyleLabel: (style: string) => string;
  /** 第N泳者ラベル。`relay.legLabel` の補間を親で解決して渡す */
  legNumberLabel: (legIndex: number) => string;
  isExpanded: boolean;
  onToggle: (relayRecordId: string) => void;
}

/**
 * リレー1本のカード。展開するとレグごとに
 * 「第N泳者 / 泳者名 / 泳法 / 区間タイム / 通算タイム」を出す。
 */
const RelayRankingRowItem: React.FC<RelayRankingRowItemProps> = React.memo(
  ({
    row,
    labels,
    dateLocale,
    eventLabel,
    legStyleLabel,
    legNumberLabel,
    isExpanded,
    onToggle,
  }) => {
    const badgeColor = getRankBadgeColor(row.rank);
    const timeLabel = formatTimeBest(row.totalTime);
    const competitionLabel = row.competitionTitle ?? labels.noCompetition;
    // 大会に紐づかないリレー記録は competitionDate が null なので、リレー記録行の
    // 作成日時を表示フォールバックにする (型契約 teamRelayRanking.ts の
    // relayCreatedAt の定義どおり。web の日付列と同じ値になる)。
    // 両方 null なら formatDate が "-" を返す
    const dateLabel = formatDate(
      row.competitionDate ?? row.relayCreatedAt,
      "numeric",
      dateLocale,
    );

    // 通算タイムはレグの区間タイムから導出する (配列順に完全に依存するので、
    // API 境界の toRankingLegs が legIndex 昇順を確定させている)
    const cumulatives = calcCumulativeTimes(row.legs.map((leg) => leg.legTime));

    return (
      <View style={styles.card}>
        <View
          style={styles.cardMain}
          accessible
          accessibilityLabel={[
            `${labels.rank} ${row.rank}`,
            eventLabel,
            `${labels.time} ${timeLabel}`,
            `${labels.competition} ${competitionLabel}`,
            `${labels.date} ${dateLabel}`,
          ].join(". ")}
        >
          <View style={styles.rowTopLine}>
            <View style={[styles.rankBadge, { backgroundColor: badgeColor.bg }]}>
              <Text style={[styles.rankBadgeText, { color: badgeColor.text }]}>{row.rank}</Text>
            </View>
            <Text style={styles.eventLabel} numberOfLines={1}>
              {eventLabel}
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

        <Pressable
          style={styles.toggleRow}
          onPress={() => onToggle(row.relayRecordId)}
          accessibilityRole="button"
          accessibilityState={{ expanded: isExpanded }}
          accessibilityLabel={isExpanded ? labels.collapse : labels.expand}
        >
          <Feather
            name={isExpanded ? "chevron-up" : "chevron-down"}
            size={14}
            color="#2563EB"
          />
          <Text style={styles.toggleText}>{isExpanded ? labels.collapse : labels.expand}</Text>
        </Pressable>

        {isExpanded &&
          (row.legs.length === 0 ? (
            // レグが1件も無いリレー記録 (親だけ残った異常データ)。行そのものは
            // 順位の母集団なので落とさず、ラップだけ空状態にする
            <Text style={styles.noLegs}>{labels.noLegs}</Text>
          ) : (
            <View style={styles.legsContainer}>
              <View style={styles.legHeaderRow}>
                <Text style={[styles.legHeaderText, styles.legSwimmerCol]}>
                  {labels.legHeaderSwimmer}
                </Text>
                <Text style={[styles.legHeaderText, styles.legStyleCol]}>
                  {labels.legHeaderStyle}
                </Text>
                <Text style={[styles.legHeaderText, styles.legTimeCol]}>
                  {labels.legHeaderLegTime}
                </Text>
                <Text style={[styles.legHeaderText, styles.legTimeCol]}>
                  {labels.legHeaderCumulative}
                </Text>
              </View>
              {row.legs.map((leg, index) => {
                // index は row.legs.map の添字なので cumulatives (同じ配列から
                // 1:1 生成) の範囲内。型上は保証されないので undefined を明示的に扱う
                const cumulative = cumulatives[index];
                return (
                  <View key={leg.legId} style={styles.legRow}>
                    <View style={styles.legSwimmerCol}>
                      <Text style={styles.legNumber}>{legNumberLabel(leg.legIndex)}</Text>
                      {/* 退会した泳者は userId / displayName が null になるが
                          行は欠けない (レグが欠けると通算の積み上げがずれる) */}
                      <Text style={styles.legSwimmer} numberOfLines={1}>
                        {leg.displayName ?? labels.retiredMember}
                      </Text>
                    </View>
                    <Text style={[styles.legStyle, styles.legStyleCol]} numberOfLines={1}>
                      {legStyleLabel(leg.style)}
                    </Text>
                    <Text style={[styles.legTime, styles.legTimeCol]}>
                      {formatTimeBest(leg.legTime)}
                    </Text>
                    <Text style={[styles.legCumulative, styles.legTimeCol]}>
                      {cumulative === undefined ? "-" : formatTimeBest(cumulative)}
                    </Text>
                  </View>
                );
              })}
            </View>
          ))}
      </View>
    );
  },
);
RelayRankingRowItem.displayName = "RelayRankingRowItem";

export interface RelayRankingListProps {
  rows: TeamRelayRankingRow[];
  /**
   * 0件のときに出す文言の種類。
   * - noMatch: 絞り込み条件に一致するリレー記録が無い (チームには記録がある)
   * - noRecords: チームにそもそもリレー記録が1件も無い
   *
   * 判定は `useTeamHasAnyRelayRecordQuery` の結果に基づいて呼び出し側が決める
   * (絞り込みの内容から推測しない)。
   */
  emptyVariant: "noMatch" | "noRecords";
}

/**
 * リレーランキング一覧。並び順は RPC (`ORDER BY total_time ASC`) + 順位付与
 * (`assignCompetitionRanks`) の結果をそのまま使うため、この層では並べ替えない。
 */
export const RelayRankingList: React.FC<RelayRankingListProps> = ({ rows, emptyVariant }) => {
  const { t } = useTranslation();
  const dateLocale = useDateLocale();
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string>>(() => new Set<string>());

  // 絞り込み変更などで行データが差し替わったら表示件数と展開状態を初期化する
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
    setExpandedIds(new Set<string>());
  }, [rows]);

  // React.memo した行に毎レンダー新しいオブジェクトを渡さないようメモ化する
  // (言語が変わると t の同一性が変わるので追随する)
  const labels = useMemo<RelayRankingLabels>(
    () => ({
      rank: t("teams.waPointsCompare.rankLabel"),
      time: t("teams.ranking.relay.col.time"),
      competition: t("teams.ranking.relay.col.competition"),
      date: t("teams.ranking.relay.col.date"),
      noCompetition: t("common.none"),
      expand: t("teams.ranking.relay.expand"),
      collapse: t("teams.ranking.relay.collapse"),
      retiredMember: t("teams.ranking.relay.retiredMember"),
      noLegs: t("teams.ranking.relay.noLegs"),
      legHeaderSwimmer: t("teams.ranking.relay.legHeader.swimmer"),
      legHeaderStyle: t("teams.ranking.relay.legHeader.style"),
      legHeaderLegTime: t("teams.ranking.relay.legHeader.legTime"),
      legHeaderCumulative: t("teams.ranking.relay.legHeader.cumulative"),
    }),
    [t],
  );

  /**
   * レグの泳法ラベル。`styles.style` は canonical なタイトルケースだが、
   * 旧ケーシング (小文字) の行が DB に残っていても拾えるよう `toStyleCode()` で
   * 正規化する。正規化できない値は生の文字列をそのまま出す
   * (`as SwimStyle` のキャストで検証を迂回しない)。
   *
   * **`practice.styles.*` (正式名) ではなく `practice.styleAbbrev.*` (略称) を使う。**
   * 幅の狭い表の泳法列で略称を使うのは mobile の既存規約で、
   * `components/profile/BestTimesTable.tsx` /
   * `components/teams/member-detail/BestTimesTable.tsx` が同じ用途で同じキーを
   * 引いている (CLAUDE.md の「種目名は公式略称に準拠」にも沿う)。
   *
   * 正式名だと en `Breaststroke` (12字) / de `Schmetterling` (13字) が
   * 泳法列に収まらず "Breaststro…" に省略される。リレーでは泳法がレグの
   * 識別情報なので、省略されると情報価値が落ちる。略称なら最長でも
   * ja `バタフライ` (5 CJK) で、全5ロケールが列幅に収まる
   * (`styleAbbrev` は ja/en/de/ko/zh すべてに5キー揃っていることを実測確認済み)。
   */
  const legStyleLabel = useCallback(
    (style: string): string => {
      const code = toStyleCode(style);
      return code ? t(`practice.styleAbbrev.${code}`) : style;
    },
    [t],
  );

  const legNumberLabel = useCallback(
    (legIndex: number): string => t("teams.ranking.relay.legLabel", { num: legIndex + 1 }),
    [t],
  );

  const handleToggle = useCallback((relayRecordId: string) => {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(relayRecordId)) {
        next.delete(relayRecordId);
      } else {
        next.add(relayRecordId);
      }
      return next;
    });
  }, []);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<TeamRelayRankingRow>) => (
      <RelayRankingRowItem
        row={item}
        labels={labels}
        dateLocale={dateLocale}
        eventLabel={t("teams.ranking.relay.eventLabel", {
          distance: item.legDistance,
          legCount: item.legCount,
          kind: t(`teams.ranking.relay.kind.${item.relayKind}`),
        })}
        legStyleLabel={legStyleLabel}
        legNumberLabel={legNumberLabel}
        isExpanded={expandedIds.has(item.relayRecordId)}
        onToggle={handleToggle}
      />
    ),
    [labels, dateLocale, t, legStyleLabel, legNumberLabel, expandedIds, handleToggle],
  );

  const keyExtractor = useCallback((item: TeamRelayRankingRow) => item.relayRecordId, []);

  const handleShowMore = useCallback(() => {
    setVisibleCount((prev) => prev + PAGE_SIZE);
  }, []);

  if (rows.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Feather name="bar-chart-2" size={40} color="#D1D5DB" />
        <Text style={styles.emptyTitle}>
          {emptyVariant === "noRecords"
            ? t("teams.ranking.relay.empty.noRecordsTitle")
            : t("teams.ranking.relay.empty.noMatchTitle")}
        </Text>
        <Text style={styles.emptyBody}>
          {emptyVariant === "noRecords"
            ? t("teams.ranking.relay.empty.noRecordsBody")
            : t("teams.ranking.relay.empty.noMatchBody")}
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
      {/* 「さらに表示」は FlatList の ListFooterComponent ではなく兄弟として置く
          (個人種目版と同じ。リストの末尾までスクロールしなくても追加できる) */}
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
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 12,
    gap: 6,
  },
  cardMain: {
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
  eventLabel: {
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
    // 1行目の種目名の開始位置と一致させる。即値ではなく rowMetrics の和で持つ
    // (バッジ幅か gap の片方だけ変えると2行目のインデントが静かにズレる)
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
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  toggleText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#2563EB",
  },
  noLegs: {
    fontSize: 12,
    color: "#6B7280",
    lineHeight: 18,
  },
  legsContainer: {
    gap: 6,
  },
  legHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  legHeaderText: {
    fontSize: 10,
    fontWeight: "600",
    color: "#9CA3AF",
  },
  legRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  // レグの4列 (泳者 / 泳法 / 区間 / 通算) の幅配分。
  //
  // 狭幅端末 (360dp) では カード内幅 ≈ 312dp しか無く、
  // 固定列 64 + 62 + 62 + gap 8×3 = 212dp を引いた残り ≈100dp が泳者名になる。
  // **縮む余地を持つのは泳者名の列だけ**にしてある (flex:1 + minWidth:0)。
  // 泳法・区間・通算に flexShrink:0 を置くのがこの構造の要で、これが無いと
  // 長い泳者名が入ったときに RN が固定幅列まで圧縮して数値やラベルを削る。
  // 泳者名の省略は許容できる (第N泳者ラベルが併記されるので行の識別は保てる) が、
  // タイムと泳法が削れると情報として壊れる。
  legSwimmerCol: {
    flex: 1,
    minWidth: 0,
  },
  // 泳法列は固定幅を保つ。内容に合わせた自動幅にすると見出し ("種目"/"Event") と
  // 本文 (略称) で幅が変わり、RN には表の列を揃える仕組みが無いため
  // 行ごとに列がずれる。幅は略称の最長値 ja `バタフライ` (5 CJK ≈60dp) が
  // 収まる値。正式名を使うと en/de がここに収まらない (legStyleLabel の docstring)
  legStyleCol: {
    width: 64,
    flexShrink: 0,
  },
  // formatTimeBest の最長表示は "1:47.60" (7字) で fontSize 12 の tabular なら
  // 約46dp。62dp は右寄せの余白込みで足りる
  legTimeCol: {
    width: 62,
    flexShrink: 0,
    textAlign: "right",
  },
  legNumber: {
    fontSize: 10,
    color: "#9CA3AF",
  },
  legSwimmer: {
    fontSize: 12,
    color: "#111827",
  },
  legStyle: {
    fontSize: 12,
    color: "#374151",
  },
  legTime: {
    fontSize: 12,
    color: "#374151",
    fontVariant: ["tabular-nums"],
  },
  legCumulative: {
    fontSize: 12,
    fontWeight: "600",
    color: "#111827",
    fontVariant: ["tabular-nums"],
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
