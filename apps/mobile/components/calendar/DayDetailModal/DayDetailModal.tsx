import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  Animated,
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { format, isValid } from "date-fns";
import { useTranslation } from "react-i18next";
import { formatDate } from "@apps/shared/utils/date";
import { useDateLocale } from "@/hooks/useDateLocale";
import { useSafeInsets } from "@/hooks/useSafeInsets";
import type { CalendarItem } from "@apps/shared/types/ui";
import type { CalendarColorSettings } from "@apps/shared/types/calendarColors";
import { resolveCalendarItemColor, getDefaultColorForType } from "@apps/shared/utils/calendarColorResolver";
import {
  localizeCalendarItemTitle,
  type CalendarItemTitleLabels,
} from "@apps/shared/utils/calendarItemTitle";
import { styles } from "./styles";
import { MemoizedPracticeLogDetail, RecordDetail, EntryDetail } from "./components";
import { LoadingSpinner } from "@/components/layout/LoadingSpinner";
import { ErrorView } from "@/components/layout/ErrorView";
import { filterEntriesByScope, filterEntriesByTargetId, getCompetitionId } from "./domainFilter";
import type { DayDetailModalProps } from "./types";

/** カードとシステムバー(または画面端)の間に空ける上下の余白。 */
const OVERLAY_VERTICAL_MARGIN = 20;

/** 本文の高さが変わるときの伸縮にかける時間(ms)。 */
const BODY_RESIZE_DURATION = 200;

/**
 * 本文のスクロール領域。高さは中身なりで、カードの上限に達したら中だけスクロールする。
 *
 * 各カードの詳細は開いた後に非同期で読み込まれ、そのたびに中身の高さが変わる。
 * 何もしないと中央寄せのカードが上下に一瞬で跳ねるので、中身の実測高さ
 * (onContentSizeChange) を枠の高さとして与え、その値をアニメーションさせる。
 * 最初の採寸だけは即時反映する(開いた瞬間に 0 から伸びて見えるのを防ぐ)。
 *
 * RN の Modal は閉じると子をアンマウントするので、開くたびに採寸し直される。
 */
const FittedScrollBody: React.FC<{ maxHeight: number; children: React.ReactNode }> = ({
  maxHeight,
  children,
}) => {
  const [height] = useState(() => new Animated.Value(0));
  const lastTargetRef = useRef<number | null>(null);
  const [measured, setMeasured] = useState(false);

  const handleContentSizeChange = useCallback(
    (_width: number, contentHeight: number) => {
      // 上限より先は枠が flexShrink で止まるので、そこまでを目標にする
      // (見えない範囲まで伸ばすと、伸縮が途中で打ち切られたように見える)。
      const target = Math.min(contentHeight, maxHeight);
      if (lastTargetRef.current === target) return;
      if (lastTargetRef.current === null) {
        height.setValue(target);
        setMeasured(true);
      } else {
        Animated.timing(height, {
          toValue: target,
          duration: BODY_RESIZE_DURATION,
          useNativeDriver: false,
        }).start();
      }
      lastTargetRef.current = target;
    },
    [height, maxHeight],
  );

  return (
    <Animated.View style={[styles.bodyFrame, measured && { height }]}>
      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        nestedScrollEnabled={true}
        onContentSizeChange={handleContentSizeChange}
      >
        {children}
      </ScrollView>
    </Animated.View>
  );
};

/**
 * エントリーのタイトルを生成。DB のビューは「練習」「大会」「100m × 4本」を日本語で返すので、
 * 表示言語の文言で組み立て直してから使う (英語などで日本語が残らないように)
 */
const buildEntryTitle = (
  item: CalendarItem,
  fallbackTeamName: string,
  labels: CalendarItemTitleLabels,
): string => {
  const baseTitle = localizeCalendarItemTitle(item, labels);
  if (item.type === "team_practice") {
    const teamName = item.metadata?.team?.name || fallbackTeamName;
    return `${teamName} - ${baseTitle}`;
  }
  return baseTitle;
};

// 未設定(resolver がデフォルト色を返した)ユーザーの見た目を維持するための、
// 旧来のエントリー識別色(バッジ・左枠線・カード外枠のアクセント)。
// NOTE: この2色 (#10B981 / #2563EB) はタグ/記録色パレット (TAG_COLORS) に含まれない値
// なので、カスタム色との衝突判定に安全に使える。
const LEGACY_PRACTICE_ACCENT = "#10B981"; // 緑色 (green-500)
const LEGACY_COMPETITION_ACCENT = "#2563EB"; // 青色 (blue-600)

/**
 * 未カスタマイズ時のフォールバック色。practice 系/competition 系の判定は
 * getDefaultColorForType の分類(resolveCategory)と揃える。
 */
const getLegacyAccentColor = (type: CalendarItem["type"]): string => {
  switch (type) {
    case "practice":
    case "team_practice":
    case "practice_log":
      return LEGACY_PRACTICE_ACCENT;
    case "competition":
    case "team_competition":
    case "entry":
    case "record":
      return LEGACY_COMPETITION_ACCENT;
    default:
      return "#6B7280"; // グレー
  }
};

const EMPTY_COLOR_SETTINGS: CalendarColorSettings = {
  personal: { practice_color: null, competition_color: null },
  byTeam: {},
};

/**
 * エントリーの種類に応じた表示色を取得する。
 * 未カスタマイズ(resolver 戻り値がデフォルト色と一致)の場合は、旧来のバッジ/枠線色を
 * そのまま返して既存ユーザーの見た目をピクセル一致で維持する。カスタム色時のみ
 * resolveCalendarItemColor の戻り値(ユーザー設定色)を返す。
 */
const getEntryDisplayColor = (
  item: CalendarItem,
  colorSettings: CalendarColorSettings,
): string => {
  const resolved = resolveCalendarItemColor(item.type, item.metadata, colorSettings);
  const isDefault = resolved === getDefaultColorForType(item.type);
  return isDefault ? getLegacyAccentColor(item.type) : resolved;
};

/**
 * エントリーの種類に応じたラベルキー (i18n) を取得
 */
const getEntryTypeLabelKey = (type: CalendarItem["type"]): string => {
  switch (type) {
    case "practice":
      return "dashboard.dayDetail.entryTypeLabel.practice";
    case "team_practice":
      return "dashboard.dayDetail.entryTypeLabel.teamPractice";
    case "practice_log":
      return "dashboard.dayDetail.entryTypeLabel.practiceLog";
    case "competition":
      return "dashboard.dayDetail.entryTypeLabel.competition";
    case "team_competition":
      return "dashboard.dayDetail.entryTypeLabel.teamCompetition";
    case "entry":
      return "dashboard.dayDetail.entryTypeLabel.entry";
    case "record":
      return "dashboard.dayDetail.entryTypeLabel.record";
    default:
      return "dashboard.dayDetail.entryTypeLabel.other";
  }
};

/**
 * 日付詳細モーダルコンポーネント
 * 選択した日付のエントリー一覧を表示
 */
export const DayDetailModal: React.FC<DayDetailModalProps> = ({
  visible,
  date,
  entries,
  scope = "day",
  targetId,
  titleOverride,
  targetRecordId,
  isLoading = false,
  isError = false,
  onRetry,
  colorSettings = EMPTY_COLOR_SETTINGS,
  onClose,
  onEntryPress,
  onAddPractice,
  onAddRecord,
  onEditPractice,
  onDeletePractice,
  onAddPracticeLog,
  onEditPracticeLog,
  onDeletePracticeLog,
  onEditRecord,
  onDeleteRecord,
  onEditEntry,
  onDeleteEntry,
  onAddEntry,
  onEditCompetition,
  onDeleteCompetition,
  isDeleting = false,
}) => {
  const { t } = useTranslation();
  const locale = useDateLocale();
  // カードの上限 = 画面 − システムバー − 上下の余白。% 指定だと高さを持たない親に対して
  // 解決されず、RN Modal は insets も自動で避けないので、px で自分で計算する。
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeInsets();
  const maxCardHeight =
    windowHeight - insets.top - insets.bottom - OVERLAY_VERTICAL_MARGIN * 2;
  const formattedDate = formatDate(date, "shortWithWeekday", locale);
  const fallbackTeamName = t("teams.mobile.fallbackTeamName");
  const fallbackCompetitionName = t("competition.client.competitionFallback");
  const titleLabels: CalendarItemTitleLabels = {
    practice: t("dashboard.calendarGrid.practiceDefault"),
    teamPractice: t("dashboard.calendarGrid.teamPracticeDefault"),
    competition: fallbackCompetitionName,
    practiceLog: ({ distance, reps, sets }) =>
      sets === 1
        ? t("dashboard.calendarGrid.practiceLogTitle", { distance, reps })
        : t("dashboard.calendarGrid.practiceLogTitleWithSets", { distance, reps, sets }),
  };

  // 「記録を追加」チューザー(空状態の大きい2ボタン)のアイコン色。
  // 個人の練習/大会色を resolver で解決し、未カスタマイズ(デフォルト色)ならピクセル一致で
  // 現状のアイコン色を維持、カスタム色時のみ選択色そのままアイコンを塗る。
  const resolvedPersonalCompetitionColor = resolveCalendarItemColor("competition", null, colorSettings);
  const chooserRecordIconColor =
    resolvedPersonalCompetitionColor === getDefaultColorForType("competition")
      ? "#3B82F6"
      : resolvedPersonalCompetitionColor;
  const resolvedPersonalPracticeColor = resolveCalendarItemColor("practice", null, colorSettings);
  const chooserPracticeIconColor =
    resolvedPersonalPracticeColor === getDefaultColorForType("practice")
      ? "#10B981"
      : resolvedPersonalPracticeColor;

  // scope に応じて表示対象のエントリーを絞り込む(scope="day"は非破壊でそのまま)。
  // 練習タブ/大会タブ経由(targetId 指定時)はさらに、タップした1件(または1大会)のみに絞る
  const scopedEntries = useMemo(
    () => filterEntriesByTargetId(filterEntriesByScope(entries, scope), scope, targetId),
    [entries, scope, targetId],
  );

  // エントリータイプをフィルタリング・グループ化
  const { otherItems, entriesByCompetition, recordsByCompetition } = useMemo(() => {
    const recordItems = scopedEntries.filter((e) => e.type === "record");
    const entryItems = scopedEntries.filter((e) => e.type === "entry");

    // 記録を大会IDでグループ化
    const recordsByComp = new Map<string, CalendarItem[]>();
    recordItems.forEach((record) => {
      const competitionId = getCompetitionId(record) ?? record.id;
      if (!recordsByComp.has(competitionId)) {
        recordsByComp.set(competitionId, []);
      }
      recordsByComp.get(competitionId)!.push(record);
    });

    // エントリーを大会IDでグループ化
    const entriesByComp = new Map<string, CalendarItem[]>();
    entryItems.forEach((entry) => {
      const competitionId = getCompetitionId(entry);
      if (competitionId) {
        if (!entriesByComp.has(competitionId)) {
          entriesByComp.set(competitionId, []);
        }
        entriesByComp.get(competitionId)!.push(entry);
      }
    });

    // エントリーや記録を持っていないcompetitionタイプのIDを取得
    const competitionsWithEntriesOrRecords = new Set<string>();
    recordsByComp.forEach((_, competitionId) => {
      competitionsWithEntriesOrRecords.add(competitionId);
    });
    entriesByComp.forEach((_, competitionId) => {
      competitionsWithEntriesOrRecords.add(competitionId);
    });

    // その他のアイテム
    const others = scopedEntries.filter((e) => {
      if (e.type === "record" || e.type === "entry") return false;
      if (e.type === "competition" || e.type === "team_competition") {
        return !competitionsWithEntriesOrRecords.has(e.id);
      }
      return true;
    });

    return {
      otherItems: others,
      entriesByCompetition: entriesByComp,
      recordsByCompetition: recordsByComp,
    };
  }, [scopedEntries]);

  return (
    <Modal visible={visible} transparent onRequestClose={onClose}>
      <View
        style={[
          styles.overlay,
          {
            paddingTop: insets.top + OVERLAY_VERTICAL_MARGIN,
            paddingBottom: insets.bottom + OVERLAY_VERTICAL_MARGIN,
          },
        ]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.cardContainer} pointerEvents="box-none">
          <View style={[styles.modalContent, { maxHeight: maxCardHeight }]}>
            {/* ヘッダー */}
            <View style={styles.header}>
              <Text style={styles.title} numberOfLines={titleOverride ? 1 : undefined}>
                {titleOverride ?? `${formattedDate}${t("dashboard.dayDetail.headerTitleSuffix")}`}
              </Text>
              <Pressable style={styles.closeButton} onPress={onClose}>
                <Feather name="x" size={24} color="#6B7280" />
              </Pressable>
            </View>

            <FittedScrollBody maxHeight={maxCardHeight}>
              {/* エントリーがない場合(ロード中/エラー中を含む) */}
              {scopedEntries.length === 0 ? (
                <View style={styles.emptyContainer}>
                  {isLoading ? (
                    <LoadingSpinner message={t("common.loading")} />
                  ) : isError ? (
                    <ErrorView message={t("common.error")} onRetry={onRetry} />
                  ) : scope === "day" ? (
                    <View style={styles.addButtonContainer}>
                      {onAddRecord && (
                        <Pressable
                          style={[styles.addButton, styles.addRecordCardButton]}
                          onPress={() => {
                            onAddRecord(date);
                            onClose();
                          }}
                        >
                          <Feather
                            name="droplet"
                            size={28}
                            color={chooserRecordIconColor}
                            style={styles.addButtonCardIcon}
                          />
                          <Text style={styles.addButtonCardText}>{t("dashboard.dayDetail.addRecord")}</Text>
                        </Pressable>
                      )}
                      {onAddPractice && (
                        <Pressable
                          style={[styles.addButton, styles.addPracticeCardButton]}
                          onPress={() => {
                            onAddPractice(date);
                            onClose();
                          }}
                        >
                          <Feather
                            name="activity"
                            size={28}
                            color={chooserPracticeIconColor}
                            style={styles.addButtonCardIcon}
                          />
                          <Text style={styles.addButtonCardText}>{t("dashboard.dayDetail.addPractice")}</Text>
                        </Pressable>
                      )}
                    </View>
                  ) : (
                    <Text style={styles.emptyTextMain}>{t("dashboard.dayDetail.entryEmptyText")}</Text>
                  )}
                </View>
              ) : (
                <>
                  <View style={styles.entriesContainer}>
                    {/* 記録以外のエントリー */}
                    {otherItems.map((item) => {
                      const title = buildEntryTitle(item, fallbackTeamName, titleLabels);
                      const color = getEntryDisplayColor(item, colorSettings);
                      const typeLabel = t(getEntryTypeLabelKey(item.type));
                      const isPractice = item.type === "practice" || item.type === "team_practice";
                      const isPracticeLog = item.type === "practice_log";
                      const practiceId = item.metadata?.practice_id || item.id;

                      const isCompetition =
                        item.type === "competition" || item.type === "team_competition";
                      const competitionId = isCompetition ? item.id : null;
                      const hasEntriesOrRecords =
                        isCompetition && competitionId
                          ? scopedEntries.some(
                              (e) =>
                                (e.type === "entry" || e.type === "record") &&
                                getCompetitionId(e) === competitionId,
                            )
                          : false;

                      return (
                        <MemoizedPracticeLogDetail
                          key={`${item.type}-${item.id}`}
                          item={item}
                          title={title}
                          color={color}
                          typeLabel={typeLabel}
                          isPractice={isPractice}
                          isPracticeLog={isPracticeLog}
                          practiceId={practiceId}
                          hasEntriesOrRecords={hasEntriesOrRecords}
                          onEntryPress={onEntryPress}
                          onClose={onClose}
                          onEditPractice={onEditPractice}
                          onDeletePractice={onDeletePractice}
                          onAddPracticeLog={onAddPracticeLog}
                          onEditPracticeLog={onEditPracticeLog}
                          onDeletePracticeLog={onDeletePracticeLog}
                          onEditRecord={onEditRecord}
                          onDeleteRecord={onDeleteRecord}
                          onEditEntry={onEditEntry}
                          onDeleteEntry={onDeleteEntry}
                          onAddEntry={onAddEntry}
                          onEditCompetition={onEditCompetition}
                          onDeleteCompetition={onDeleteCompetition}
                        />
                      );
                    })}

                    {/* エントリー済み（記録未登録）を大会ごとに表示 */}
                    {Array.from(entriesByCompetition.entries()).map(
                      ([competitionId, entryList]) => {
                        if (recordsByCompetition.has(competitionId)) return null;

                        const firstEntry = entryList[0];
                        if (!firstEntry) return null; // entriesByCompetition は Map.entries() 由来で
                                                       // 各グループは構造的に空にならないが、TS は
                                                       // それを知らないため防御的に扱う
                        const competitionName =
                          localizeCalendarItemTitle(firstEntry, titleLabels);
                        const place =
                          firstEntry.place || firstEntry.metadata?.competition?.place || "";
                        // metadata は calendar_view の JSONB 列で未型付けだが、'entry' 型行は
                        // jsonb_build_object('competition', to_jsonb(c.*), ...) で competitions
                        // 行全体をそのまま埋め込むため、実データには pool_type (DB上NOT NULL)
                        // が必ず入っている。JSON型保証が無いための防御的フォールバック(web と同型)。
                        const poolType = firstEntry.metadata?.competition?.pool_type ?? 0;
                        const note = firstEntry.note || undefined;
                        const isTeamCompetition = !!firstEntry.metadata?.competition?.team_id;

                        return (
                          <EntryDetail
                            key={`entry-competition-${competitionId}`}
                            competitionId={competitionId}
                            competitionName={competitionName}
                            place={place}
                            poolType={poolType}
                            note={note}
                            entries={entryList}
                            isTeamCompetition={isTeamCompetition}
                            color={getEntryDisplayColor(firstEntry, colorSettings)}
                            onEditCompetition={(item) => {
                              if (onEditCompetition) {
                                onEditCompetition(item);
                                onClose();
                              }
                            }}
                            onDeleteCompetition={() => {
                              if (onDeleteCompetition) {
                                onDeleteCompetition(competitionId, isTeamCompetition);
                              }
                            }}
                            onEditEntry={onEditEntry}
                            onAddRecord={(compId: string, dateParam: string) => {
                              if (onAddRecord) {
                                onAddRecord(compId, dateParam);
                                onClose();
                              }
                            }}
                            onClose={onClose}
                          />
                        );
                      },
                    )}

                    {/* 記録を大会ごとに表示 */}
                    {Array.from(recordsByCompetition.entries()).map(([competitionId, records]) => {
                      const firstRecord = records[0];
                      if (!firstRecord) return null; // recordsByCompetition は Map.entries() 由来で
                                                       // 各グループは構造的に空にならないが、TS は
                                                       // それを知らないため防御的に扱う
                      const competitionName =
                        localizeCalendarItemTitle(firstRecord, titleLabels);
                      const place =
                        firstRecord.place || firstRecord.metadata?.competition?.place || "";
                      const poolType =
                        firstRecord.metadata?.competition?.pool_type ??
                        firstRecord.metadata?.pool_type ??
                        0;
                      const note = firstRecord.note || undefined;
                      const isTeamCompetition =
                        !!firstRecord.metadata?.team_id ||
                        !!firstRecord.metadata?.competition?.team_id;
                      const recordTeamId =
                        firstRecord.metadata?.team_id ??
                        firstRecord.metadata?.competition?.team_id ??
                        null;

                      return (
                        <RecordDetail
                          key={`competition-${competitionId}`}
                          competitionId={competitionId}
                          competitionName={competitionName}
                          place={place}
                          poolType={poolType}
                          note={note}
                          records={records}
                          isTeamCompetition={isTeamCompetition}
                          targetRecordId={targetRecordId}
                          teamId={recordTeamId}
                          color={getEntryDisplayColor(firstRecord, colorSettings)}
                          onEditCompetition={() => {
                            if (!onEditCompetition) return;
                            const firstRecord = records[0];
                            const teamId =
                              firstRecord?.metadata?.team_id ??
                              firstRecord?.metadata?.competition?.team_id ??
                              null;
                            const competitionItem: CalendarItem = {
                              id: competitionId,
                              type: teamId ? "team_competition" : "competition",
                              date:
                                firstRecord?.date ??
                                (isValid(date) ? format(date, "yyyy-MM-dd") : ""),
                              title: competitionName,
                              place,
                              note,
                              metadata: {
                                competition: firstRecord?.metadata?.competition,
                                team_id: teamId,
                                pool_type: poolType,
                              },
                            };
                            onEditCompetition(competitionItem);
                            onClose();
                          }}
                          onDeleteCompetition={() => {
                            if (onDeleteCompetition) {
                              onDeleteCompetition(competitionId, isTeamCompetition);
                            }
                          }}
                          onAddRecord={() => {
                            if (onAddRecord) {
                              const firstRecord = records[0];
                              const dateParam =
                                firstRecord?.date ||
                                (isValid(date) ? format(date, "yyyy-MM-dd") : "");
                              onAddRecord(competitionId, dateParam);
                              onClose();
                            }
                          }}
                          onEditRecord={onEditRecord}
                          onDeleteRecord={onDeleteRecord}
                          onClose={onClose}
                        />
                      );
                    })}
                  </View>

                </>
              )}
            </FittedScrollBody>
            {/* 記録追加セクション (固定): 記録が多い日でも、スクロールせずに追加できる */}
            {scopedEntries.length > 0 && scope === "day" && (
              <View style={styles.addRecordSection}>
                <View style={styles.addRecordButtonContainer}>
                  {onAddRecord && (
                    <Pressable
                      style={styles.addRecordButtonRow}
                      onPress={() => {
                        onAddRecord(date);
                        onClose();
                      }}
                    >
                      <Feather name="droplet" size={20} color={chooserRecordIconColor} />
                      <Text
                        style={styles.addRecordButtonText}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.8}
                      >
                        {t("dashboard.dayDetail.addRecord")}
                      </Text>
                    </Pressable>
                  )}
                  {onAddPractice && (
                    <Pressable
                      style={styles.addRecordButtonRow}
                      onPress={() => {
                        onAddPractice(date);
                        onClose();
                      }}
                    >
                      <Feather name="activity" size={20} color={chooserPracticeIconColor} />
                      <Text
                        style={styles.addRecordButtonText}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.8}
                      >
                        {t("dashboard.dayDetail.addPractice")}
                      </Text>
                    </Pressable>
                  )}
                </View>
              </View>
            )}
            {isDeleting && <LoadingSpinner fullScreen message={t("dashboard.dayDetail.deletingMessage")} />}
          </View>
        </View>
      </View>
    </Modal>
  );
};
