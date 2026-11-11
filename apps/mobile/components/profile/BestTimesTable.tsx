import React, { useState, useMemo } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { formatTime } from "@/utils/formatters";
import { STYLES, DISTANCES, isInvalidCombination, STYLE_KEY_MAP } from "@apps/shared/utils/swimStyles";
import {
  getBestWaPointsForCandidates,
  type Gender,
  type PoolType,
  type WaPointsCellCandidate,
} from "@apps/shared/utils/waPoints";
import {
  getBestDomesticPointsForCandidates,
  type AgeCategory,
  type CompareMetric,
} from "@apps/shared/utils/domesticRecords";
import type { BestTime } from "@apps/shared/types/ui";
import { isNewRecord } from "@apps/shared/utils/bestTimeBadge";
import { BestTimeDetailSheet, type BestTimeDetail } from "@/components/shared/BestTimeDetailSheet";
import { WaPointsInfoTooltip } from "@/components/ui/WaPointsInfoTooltip";
import { AgeCategoryPickerModal } from "@/components/besttime";

interface BestTimesTableProps {
  bestTimes: BestTime[];
  /** 0: 男性, 1: 女性, undefined/その他: 不明 (WAポイントは常に「—」)。`?? 0` でフォールバックしないこと */
  gender?: number;
  /** WAポイント表示モード。トグルボタンは呼び出し元 (MyPageScreen) に移設済み */
  isWaPointsMode: boolean;
  /**
   * 呼び出し元が `resolveAgeCategory()` で判定済みの年齢区分。生の birthday は渡さない
   * (必要なのは区分だけ。生年月日は gender より機微度が高い)。null/undefined は「未設定」。
   */
  ageCategory?: AgeCategory | null;
  /** 水路タブ・「引き継ぎ含む」と同じ行の左端に置く見出し (ホームの「Best Time」) */
  title?: React.ReactNode;
  /** 表と注釈の下 (左寄せ) に置く操作ボタン群 (一括入力・点数化)。記録0件のときも出す */
  footer?: React.ReactNode;
  /**
   * 入力モード。渡すと表の代わりに render の結果を出す。
   * 水路タブは「ALL」を外して短水路/長水路だけにし (登録には水路が必ず要る)、
   * 「引き継ぎ」のチェックで引き継ぎタイムの入力に切り替える。見出しと切り替えの行はそのまま使う。
   */
  edit?: BestTimesTableEdit;
}

export interface BestTimesTableEdit {
  render: (ctx: { poolType: 0 | 1; isRelaying: boolean }) => React.ReactNode;
}

type TabType = "all" | "short" | "long";

// 種目ごとの色
const styleColors: Record<string, { bg: string; text: string }> = {
  自由形: { bg: "#FEF3C7", text: "#92400E" },
  平泳ぎ: { bg: "#D1FAE5", text: "#065F46" },
  背泳ぎ: { bg: "#FEE2E2", text: "#991B1B" },
  バタフライ: { bg: "#DBEAFE", text: "#1E40AF" },
  個人メドレー: { bg: "#FCE7F3", text: "#9F1239" },
};

/**
 * ベストタイム表コンポーネント
 */
export const BestTimesTable: React.FC<BestTimesTableProps> = ({
  bestTimes,
  gender,
  isWaPointsMode,
  ageCategory,
  title,
  footer,
  edit,
}) => {
  const { t, i18n } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabType>("all");
  const [includeRelaying, setIncludeRelaying] = useState<boolean>(false);
  const [selectedCellKey, setSelectedCellKey] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<BestTimeDetail | null>(null);
  // ja ロケールのときだけ比較指標ピッカーを出す。ja 以外は現行の WA のみ
  const showCompareMetricPicker = i18n.language === "ja";
  // 比較指標の初期選択は常に WA (既存テストの点数アサーションを壊さないための必須制約)
  const [compareMetric, setCompareMetric] = useState<CompareMetric>("wa");
  // 年齢区分の手動上書き。
  // undefined = ユーザーがまだ操作していない (prop の自動判定結果に追従し続ける)
  // null      = ユーザーが明示的に「未設定」を選んだ (以後 prop が変わっても追従しない)
  // AgeCategory = ユーザーが明示的にいずれかの区分を選んだ
  // 2値 (`useState(ageCategory ?? null)`) にすると mount 時に一度しか prop を読まず、
  // 誕生日を後から設定・修正しても区分が固まってしまうため、3値で区別する。
  const [ageCategoryOverride, setAgeCategoryOverride] = useState<AgeCategory | null | undefined>(
    undefined,
  );
  const [isAgeCategoryModalVisible, setIsAgeCategoryModalVisible] = useState(false);
  // ユーザー未操作の間は prop (呼び出し元の自動判定結果) にそのまま追従する。
  const effectiveAgeCategory: AgeCategory | null =
    ageCategoryOverride === undefined ? (ageCategory ?? null) : ageCategoryOverride;

  // タブごとにフィルタリングされたベストタイムを取得
  const filteredBestTimes = useMemo(() => {
    if (activeTab === "short") {
      return bestTimes.filter((bt) => bt.pool_type === 0);
    } else if (activeTab === "long") {
      return bestTimes.filter((bt) => bt.pool_type === 1);
    } else {
      return bestTimes;
    }
  }, [bestTimes, activeTab]);

  const getBestTime = (style: string, distance: number): BestTime | null => {
    // データベースの種目名形式（例：50m自由形）で検索
    const dbStyleName = `${distance}m${style}`;

    const extractCandidates = (times: BestTime[], allowRelaying: boolean): BestTime[] => {
      const candidates: BestTime[] = [];
      times.forEach((bt) => {
        if (!bt.is_relaying) {
          candidates.push(bt);
          if (allowRelaying && bt.relayingTime) {
            candidates.push({
              ...bt,
              id: bt.relayingTime.id,
              time: bt.relayingTime.time,
              created_at: bt.relayingTime.created_at,
              is_relaying: true,
              competition: bt.relayingTime.competition,
              note: bt.relayingTime.note,
            });
          }
        } else if (allowRelaying) {
          candidates.push(bt);
        }
      });
      return candidates;
    };

    if (activeTab === "all") {
      // ALLタブ: 短水路と長水路の速い方を選択
      const candidates: BestTime[] = [];

      // 短水路のタイムを取得
      const shortCourseTimes = bestTimes.filter(
        (bt) => bt.style.name_jp === dbStyleName && bt.pool_type === 0,
      );
      candidates.push(...extractCandidates(shortCourseTimes, includeRelaying));

      // 長水路のタイムを取得
      const longCourseTimes = bestTimes.filter(
        (bt) => bt.style.name_jp === dbStyleName && bt.pool_type === 1,
      );
      candidates.push(...extractCandidates(longCourseTimes, includeRelaying));

      if (candidates.length === 0) return null;

      // 最速のタイムを選択
      return candidates.reduce((best, current) => (current.time < best.time ? current : best));
    } else {
      // 短水路/長水路タブ: フィルタリング済みのデータから取得
      const matchingTimes = filteredBestTimes.filter((bt) => bt.style.name_jp === dbStyleName);
      const candidates = extractCandidates(matchingTimes, includeRelaying);

      if (candidates.length === 0) return null;

      // 最速のタイムを選択
      return candidates.reduce((best, current) => (current.time < best.time ? current : best));
    }
  };

  // ポイント表示用のセル取得関数 (WA / 日本記録 / 区分記録の3指標に対応)
  // 候補は「非リレー記録のみ」とし、includeRelaying の状態から完全に独立させる
  // (getBestTime とは意図的に別関数にし、既存のタイム表示アルゴリズムへの回帰を避ける)
  const getPointsCell = (
    style: string,
    distance: number,
  ): { points: number; poolType: PoolType } | null => {
    // gender が男女いずれでもない (undefined 含む) 場合は常に「—」。0 にフォールバックしない
    if (gender !== 0 && gender !== 1) return null;

    const dbStyleName = `${distance}m${style}`;
    // ALLタブは短水路/長水路の両方から候補を集める。短水路/長水路タブは既にpool_typeで絞られている
    const source = activeTab === "all" ? bestTimes : filteredBestTimes;

    const candidates: WaPointsCellCandidate[] = source
      .filter((bt) => bt.style.name_jp === dbStyleName && !bt.is_relaying)
      .map((bt) => ({ time: bt.time, poolType: bt.pool_type === 1 ? 1 : 0 }));

    const styleKey = STYLE_KEY_MAP[style as keyof typeof STYLE_KEY_MAP];

    if (compareMetric === "nr") {
      // 「日本記録基準」= category="general" のショートカット (別テーブル・別経路は無い)
      return getBestDomesticPointsForCandidates(candidates, "general", gender as Gender, styleKey, distance);
    }

    if (compareMetric === "age") {
      // 区分「未設定」(birthday 未設定・未選択) は既存の「gender undefined なら常に—」と対称に「—」
      if (effectiveAgeCategory === null) return null;
      return getBestDomesticPointsForCandidates(
        candidates,
        effectiveAgeCategory,
        gender as Gender,
        styleKey,
        distance,
      );
    }

    return getBestWaPointsForCandidates(candidates, gender as Gender, styleKey, distance);
  };

  const getTimeDisplay = (bestTime: BestTime): { main: string; suffix: string } => {
    const timeStr = formatTime(bestTime.time);
    const suffixes: string[] = [];

    // ALLタブの場合、長水路ならLを追加
    if (activeTab === "all" && bestTime.pool_type === 1) {
      suffixes.push("L");
    }

    // 引き継ぎありのタイムの場合、Rを追加
    if (bestTime.is_relaying) {
      suffixes.push("R");
    }

    return {
      main: timeStr,
      suffix: suffixes.join(""),
    };
  };

  const closeDetail = () => {
    setSelectedCellKey(null);
    setSelectedDetail(null);
  };

  const handleCellPress = (cellKey: string, bestTime: BestTime) => {
    if (selectedCellKey === cellKey) {
      closeDetail();
      return;
    }
    setSelectedCellKey(cellKey);
    setSelectedDetail({
      date: bestTime.competition?.date ?? bestTime.created_at,
      competitionTitle: bestTime.competition?.title ?? null,
      note: bestTime.note ?? null,
    });
  };

  const footerRow = footer ? <View style={styles.footer}>{footer}</View> : null;

  if (edit) {
    // 「ALL」のまま入力モードに入ったら短水路から始める (activeTab 自体は書き換えず、戻ったら ALL のまま)
    const editTab: "short" | "long" = activeTab === "long" ? "long" : "short";
    return (
      <View style={styles.container}>
        <View style={styles.controls}>
          {title}
          <View style={styles.tabs}>
            {(
              [
                { id: "short", label: t("mypage.bestTimesTable.shortCourse") },
                { id: "long", label: t("mypage.bestTimesTable.longCourse") },
              ] as const
            ).map((tab) => (
              <Pressable
                key={tab.id}
                testID={`best-times-edit-pool-${tab.id}`}
                accessibilityRole="button"
                accessibilityState={{ selected: editTab === tab.id }}
                style={[styles.tab, editTab === tab.id && styles.tabActive]}
                onPress={() => setActiveTab(tab.id)}
              >
                <Text style={[styles.tabText, editTab === tab.id && styles.tabTextActive]}>
                  {tab.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Pressable
            testID="best-times-edit-relay-toggle"
            accessibilityRole="checkbox"
            accessibilityState={{ checked: includeRelaying }}
            style={styles.checkboxContainer}
            hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
            onPress={() => setIncludeRelaying(!includeRelaying)}
          >
            <View style={[styles.checkbox, includeRelaying && styles.checkboxChecked]}>
              {includeRelaying && <Feather name="check" size={10} color="#FFFFFF" />}
            </View>
            <Text style={styles.checkboxLabel}>
              {t("mypage.bestTimesTable.includeRelayCompact")}
            </Text>
          </Pressable>
        </View>
        {edit.render({ poolType: editTab === "long" ? 1 : 0, isRelaying: includeRelaying })}
        {footerRow}
      </View>
    );
  }

  if (bestTimes.length === 0) {
    return (
      <View style={styles.container}>
        {title ? <View style={styles.controls}>{title}</View> : null}
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>{t("mypage.bestTimesTable.noRecords")}</Text>
          <Text style={styles.emptySubtext}>{t("mypage.bestTimesTable.noRecordsDetail")}</Text>
        </View>
        {footerRow}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* 見出し・タブ・チェックボックス (1行) */}
      <View style={styles.controls}>
        {title}
        <View style={styles.tabs}>
          {[
            { id: "all" as TabType, label: "ALL" },
            { id: "short" as TabType, label: t("mypage.bestTimesTable.shortCourse") },
            { id: "long" as TabType, label: t("mypage.bestTimesTable.longCourse") },
          ].map((tab) => (
            <Pressable
              key={tab.id}
              style={[styles.tab, activeTab === tab.id && styles.tabActive]}
              onPress={() => setActiveTab(tab.id)}
            >
              <Text style={[styles.tabText, activeTab === tab.id && styles.tabTextActive]}>
                {tab.label}
              </Text>
            </Pressable>
          ))}
        </View>
        <Pressable
          style={styles.checkboxContainer}
          onPress={() => setIncludeRelaying(!includeRelaying)}
        >
          <View style={[styles.checkbox, includeRelaying && styles.checkboxChecked]}>
            {includeRelaying && <Feather name="check" size={10} color="#FFFFFF" />}
          </View>
          <Text style={styles.checkboxLabel}>{t("mypage.bestTimesTable.includeRelayShort")}</Text>
        </Pressable>
      </View>

      {/* テーブル */}
      <View style={styles.tableContainer}>
        <View style={styles.table}>
          {/* ヘッダー */}
          <View style={styles.tableHeader}>
            <View style={[styles.headerCell, styles.distanceCell]}>
              <Text style={styles.headerText}>{t("mypage.bestTimesTable.distanceHeader")}</Text>
            </View>
            {STYLES.map((style) => (
              <View
                key={style}
                style={[
                  styles.headerCell,
                  styles.styleCell,
                  { backgroundColor: styleColors[style]?.bg || "#F3F4F6" },
                ]}
              >
                <Text style={[styles.headerText, { color: styleColors[style]?.text || "#111827" }]}>
                  {t(`practice.styleAbbrev.${STYLE_KEY_MAP[style]}`)}
                </Text>
              </View>
            ))}
          </View>

          {/* ボディ */}
          {DISTANCES.map((distance) => (
            <View key={distance} style={styles.tableRow}>
              <View style={[styles.cell, styles.distanceCell]}>
                <Text style={styles.distanceText}>{distance}m</Text>
              </View>
              {STYLES.map((style) => {
                const isInvalid = isInvalidCombination(style, distance);
                const styleColor = styleColors[style] || { bg: "#F3F4F6", text: "#111827" };
                const cellKey = `${style}_${distance}`;

                const cellBackground = { backgroundColor: isInvalid ? "#E5E7EB" : styleColor.bg };

                if (isWaPointsMode) {
                  const waCell = getPointsCell(style, distance);
                  return (
                    <View key={style} style={[styles.cell, styles.styleCell, cellBackground]}>
                      {waCell ? (
                        <Text style={[styles.waPointsText, { color: styleColor.text }]}>
                          {waCell.points}
                          {activeTab === "all" && waCell.poolType === 1 && (
                            <Text style={styles.timeSuffix}>L</Text>
                          )}
                        </Text>
                      ) : (
                        <Text style={styles.emptyCellText}>—</Text>
                      )}
                    </View>
                  );
                }

                const bestTime = getBestTime(style, distance);

                return (
                  <View key={style} style={[styles.cell, styles.styleCell, cellBackground]}>
                    {bestTime ? (
                      <Pressable
                        onPress={() => handleCellPress(cellKey, bestTime)}
                        style={styles.timeContainer}
                      >
                        {(() => {
                          // New 判定は大会実施日が基準。一括登録 (competition なし) は対象外
                          const isNew = isNewRecord(bestTime.competition?.date);
                          const display = getTimeDisplay(bestTime);

                          return (
                            <>
                              {isNew && (
                                <View style={styles.newBadge}>
                                  <Text style={styles.newBadgeText}>New</Text>
                                </View>
                              )}
                              <Text
                                style={[
                                  styles.timeText,
                                  { color: styleColor.text },
                                  isNew && styles.timeTextNew,
                                ]}
                              >
                                {display.main}
                                {display.suffix && (
                                  <Text style={styles.timeSuffix}>{display.suffix}</Text>
                                )}
                              </Text>
                            </>
                          );
                        })()}
                      </Pressable>
                    ) : (
                      <Text style={styles.emptyCellText}>—</Text>
                    )}
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      </View>

      {/* 注釈 */}
      <View style={styles.annotation}>
        <Text style={styles.annotationText}>
          {isWaPointsMode
            ? `※ ${t("mypage.bestTimesTable.legend.longCourse")}, ${t("mypage.bestTimesTable.legend.relayingExcludedFromWaPoints")}`
            : `※ ${t("mypage.bestTimesTable.legend.longCourse")}, ${t("mypage.bestTimesTable.legend.relaying")}`}
        </Text>
      </View>

      {footerRow}

      {/* 比較指標 (WAポイント / 日本記録基準 / 区分記録基準)。ポイント表示モードONかつ ja ロケール限定。
          「タイム / 点数」の切り替え (footer) の下の行に出す (2026-11-11 ユーザー指定。以前は表の上) */}
      {isWaPointsMode && showCompareMetricPicker && (
        <View style={styles.compareMetricRow}>
          <View style={styles.compareMetricSegmentGroup}>
            <View style={styles.tabs} testID="best-times-compare-metric-segment">
              {(["wa", "nr", "age"] as const).map((metric) => (
                <Pressable
                  key={metric}
                  testID={`best-times-compare-metric-${metric}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: compareMetric === metric }}
                  style={[styles.tab, compareMetric === metric && styles.tabActive]}
                  onPress={() => setCompareMetric(metric)}
                >
                  <Text style={[styles.tabText, compareMetric === metric && styles.tabTextActive]}>
                    {t(`mypage.bestTimesTable.compareMetric.${metric}`)}
                  </Text>
                </Pressable>
              ))}
            </View>
            <WaPointsInfoTooltip
              testID="best-times-compare-metric-info"
              ariaLabel={t("mypage.bestTimesTable.compareMetricInfoAriaLabel")}
              tooltipText={t("mypage.bestTimesTable.compareMetricInfo")}
            />
          </View>
          {compareMetric === "age" && (
            <Pressable
              testID="best-times-age-category-button"
              style={styles.ageCategoryButton}
              onPress={() => setIsAgeCategoryModalVisible(true)}
              accessibilityRole="button"
              accessibilityLabel={t("mypage.bestTimesTable.ageCategoryLabel")}
            >
              <Text style={styles.ageCategoryButtonText}>
                {effectiveAgeCategory
                  ? t(`mypage.bestTimesTable.ageCategory.${effectiveAgeCategory}`)
                  : t("mypage.bestTimesTable.ageCategoryUnset")}
              </Text>
              <Feather name="chevron-down" size={14} color="#374151" />
            </Pressable>
          )}
        </View>
      )}

      <BestTimeDetailSheet
        detail={selectedDetail}
        onClose={closeDetail}
        noteFallbackLabel={t("mypage.bestTimesTable.bulkEntryNote")}
      />

      <AgeCategoryPickerModal
        visible={isAgeCategoryModalVisible}
        onClose={() => setIsAgeCategoryModalVisible(false)}
        onSelect={(category) => {
          setAgeCategoryOverride(category);
          setIsAgeCategoryModalVisible(false);
        }}
        t={t}
        messageNamespace="mypage.bestTimesTable"
        testIDPrefix="best-times-age-category-option"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  emptyContainer: {
    padding: 40,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 16,
    color: "#6B7280",
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: "#9CA3AF",
  },
  controls: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    columnGap: 8,
    rowGap: 8,
    paddingHorizontal: 16,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 16,
  },
  compareMetricRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 12,
    paddingHorizontal: 16,
  },
  compareMetricSegmentGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  ageCategoryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
  },
  ageCategoryButtonText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#374151",
  },
  tabs: {
    flexDirection: "row",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    overflow: "hidden",
  },
  tab: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    backgroundColor: "#FFFFFF",
  },
  tabActive: {
    backgroundColor: "#2563EB",
  },
  tabText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#6B7280",
  },
  tabTextActive: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  checkboxContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  checkbox: {
    width: 16,
    height: 16,
    borderWidth: 2,
    borderColor: "#D1D5DB",
    borderRadius: 3,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
  },
  checkboxChecked: {
    backgroundColor: "#2563EB",
    borderColor: "#2563EB",
  },
  checkboxLabel: {
    fontSize: 12,
    color: "#374151",
  },
  tableContainer: {
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#D1D5DB",
  },
  table: {
    width: "100%",
  },
  tableHeader: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#D1D5DB",
  },
  headerCell: {
    paddingVertical: 6,
    paddingHorizontal: 2,
    justifyContent: "center",
    alignItems: "center",
    borderRightWidth: 1,
    borderRightColor: "#D1D5DB",
  },
  distanceCell: {
    width: 40,
    backgroundColor: "#F9FAFB",
  },
  styleCell: {
    flex: 1,
  },
  headerText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#111827",
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#D1D5DB",
  },
  cell: {
    paddingVertical: 4,
    paddingHorizontal: 2,
    justifyContent: "center",
    alignItems: "center",
    borderRightWidth: 1,
    borderRightColor: "#D1D5DB",
    minHeight: 30,
  },
  distanceText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#374151",
  },
  timeContainer: {
    alignItems: "center",
    position: "relative",
  },
  newBadge: {
    position: "absolute",
    top: -10,
    right: -10,
    backgroundColor: "#DC2626",
    paddingHorizontal: 3,
    paddingVertical: 1,
    borderRadius: 6,
  },
  newBadgeText: {
    fontSize: 7,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  timeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  timeTextNew: {
    color: "#DC2626",
  },
  timeSuffix: {
    fontSize: 8,
    marginLeft: 1,
  },
  waPointsText: {
    fontSize: 12,
    fontWeight: "700",
  },
  emptyCellText: {
    fontSize: 11,
    color: "#D1D5DB",
  },
  // 凡例なので警告色にせず、表の左端にそろえて控えめに出す
  annotation: {
    alignItems: "flex-start",
    paddingHorizontal: 16,
    marginTop: -4,
  },
  annotationText: {
    fontSize: 11,
    color: "#6B7280",
  },
});
