import React, { useState, useCallback, useMemo } from "react";
import { View, Text, Modal, Pressable, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { format, isValid } from "date-fns";
import { useTranslation } from "react-i18next";
import { formatDate } from "@apps/shared/utils/date";
import { useDateLocale } from "@/hooks/useDateLocale";
import type { CalendarItem } from "@apps/shared/types/ui";
import type { CalendarColorSettings } from "@apps/shared/types/calendarColors";
import { resolveCalendarItemColor, getDefaultColorForType } from "@apps/shared/utils/calendarColorResolver";
import { styles } from "./styles";
import { MemoizedPracticeLogDetail, RecordDetail, EntryDetail } from "./components";
import { LoadingSpinner } from "@/components/layout/LoadingSpinner";
import { ErrorView } from "@/components/layout/ErrorView";
import { computeDayDetailMinHeight } from "./minHeight";
import { filterEntriesByScope } from "./domainFilter";
import type { DayDetailModalProps } from "./types";

/**
 * エントリーのタイトルを生成
 */
const buildEntryTitle = (
  item: CalendarItem,
  fallbackTeamName: string,
  fallbackCompetitionName: string,
): string => {
  let displayTitle = item.title;

  if (item.type === "team_practice") {
    const teamName = item.metadata?.team?.name || fallbackTeamName;
    displayTitle = `${teamName} - ${item.title}`;
  } else if (item.type === "entry" || item.type === "record") {
    displayTitle = item.metadata?.competition?.title || item.title || fallbackCompetitionName;
  }

  return displayTitle;
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
  onDeletingChange,
}) => {
  const { t } = useTranslation();
  const locale = useDateLocale();
  const formattedDate = formatDate(date, "shortWithWeekday", locale);
  const fallbackTeamName = t("teams.mobile.fallbackTeamName");
  const fallbackCompetitionName = t("teams.mobile.fallbackCompetitionName");

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

  // PracticeLogのPracticeTimeの有無を追跡
  const [practiceLogsWithTimes, setPracticeLogsWithTimes] = useState<Set<string>>(new Set());
  // エントリーの画像/動画メディアの有無を追跡
  const [entriesWithMedia, setEntriesWithMedia] = useState<Set<string>>(new Set());

  // PracticeTimeの有無を更新するコールバック
  const handlePracticeTimeLoaded = useCallback((practiceLogId: string, hasTimes: boolean) => {
    setPracticeLogsWithTimes((prev) => {
      const next = new Set(prev);
      if (hasTimes) {
        next.add(practiceLogId);
      } else {
        next.delete(practiceLogId);
      }
      return next;
    });
  }, []);

  // メディア（画像/動画）の有無を更新するコールバック
  const handleMediaLoaded = useCallback((entryId: string, hasMedia: boolean) => {
    setEntriesWithMedia((prev) => {
      const next = new Set(prev);
      if (hasMedia) {
        next.add(entryId);
      } else {
        next.delete(entryId);
      }
      return next;
    });
  }, []);

  // scope に応じて表示対象のエントリーを絞り込む(scope="day"は非破壊でそのまま)
  const scopedEntries = useMemo(() => filterEntriesByScope(entries, scope), [entries, scope]);

  // エントリー数と種類、メディアの有無に応じて最小高さを動的に計算
  const minHeight = useMemo(
    () => computeDayDetailMinHeight(scopedEntries, practiceLogsWithTimes, entriesWithMedia),
    [scopedEntries, practiceLogsWithTimes, entriesWithMedia],
  );

  // 動的なスタイルを生成
  const modalContentStyle = useMemo(() => [styles.modalContent, { minHeight }], [minHeight]);

  // エントリータイプをフィルタリング・グループ化
  const { otherItems, entriesByCompetition, recordsByCompetition } = useMemo(() => {
    const recordItems = scopedEntries.filter((e) => e.type === "record");
    const entryItems = scopedEntries.filter((e) => e.type === "entry");

    // 記録を大会IDでグループ化
    const recordsByComp = new Map<string, CalendarItem[]>();
    recordItems.forEach((record) => {
      const competitionId =
        record.metadata?.competition?.id || record.metadata?.record?.competition_id || record.id;
      if (!recordsByComp.has(competitionId)) {
        recordsByComp.set(competitionId, []);
      }
      recordsByComp.get(competitionId)!.push(record);
    });

    // エントリーを大会IDでグループ化
    const entriesByComp = new Map<string, CalendarItem[]>();
    entryItems.forEach((entry) => {
      const competitionId =
        entry.metadata?.competition?.id || entry.metadata?.entry?.competition_id;
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
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <SafeAreaView edges={["bottom"]} style={styles.safeAreaContainer} pointerEvents="box-none">
          <View style={modalContentStyle}>
            {/* ヘッダー */}
            <View style={styles.header}>
              <Text style={styles.title}>{formattedDate}{t("dashboard.dayDetail.headerTitleSuffix")}</Text>
              <Pressable style={styles.closeButton} onPress={onClose}>
                <Feather name="x" size={24} color="#6B7280" />
              </Pressable>
            </View>

            <ScrollView
              style={styles.body}
              contentContainerStyle={styles.bodyContent}
              nestedScrollEnabled={true}
            >
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
                      const title = buildEntryTitle(item, fallbackTeamName, fallbackCompetitionName);
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
                                (e.metadata?.competition?.id === competitionId ||
                                  e.metadata?.entry?.competition_id === competitionId ||
                                  e.metadata?.record?.competition_id === competitionId),
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
                          onPracticeTimeLoaded={handlePracticeTimeLoaded}
                          onMediaLoaded={handleMediaLoaded}
                        />
                      );
                    })}

                    {/* エントリー済み（記録未登録）を大会ごとに表示 */}
                    {Array.from(entriesByCompetition.entries()).map(
                      ([competitionId, entryList]) => {
                        if (recordsByCompetition.has(competitionId)) return null;

                        const firstEntry = entryList[0];
                        const competitionName =
                          firstEntry.metadata?.competition?.title || firstEntry.title || fallbackCompetitionName;
                        const place =
                          firstEntry.place || firstEntry.metadata?.competition?.place || "";
                        const poolType = firstEntry.metadata?.competition?.pool_type ?? 0;
                        const note = firstEntry.note || undefined;

                        return (
                          <EntryDetail
                            key={`entry-competition-${competitionId}`}
                            competitionId={competitionId}
                            competitionName={competitionName}
                            place={place}
                            poolType={poolType}
                            note={note}
                            entries={entryList}
                            color={getEntryDisplayColor(firstEntry, colorSettings)}
                            onEditCompetition={(item) => {
                              if (onEditCompetition) {
                                onEditCompetition(item);
                                onClose();
                              }
                            }}
                            onDeleteCompetition={() => {
                              if (onDeleteCompetition) {
                                onDeleteCompetition(competitionId);
                              }
                            }}
                            onEditEntry={onEditEntry}
                            onDeleteEntry={onDeleteEntry}
                            onAddRecord={(compId: string, dateParam: string) => {
                              if (onAddRecord) {
                                onAddRecord(compId, dateParam);
                                onClose();
                              }
                            }}
                            onClose={onClose}
                            onDeletingChange={onDeletingChange}
                          />
                        );
                      },
                    )}

                    {/* 記録を大会ごとに表示 */}
                    {Array.from(recordsByCompetition.entries()).map(([competitionId, records]) => {
                      const firstRecord = records[0];
                      const competitionName =
                        firstRecord.metadata?.competition?.title || firstRecord.title || fallbackCompetitionName;
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
                              onDeleteCompetition(competitionId);
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
                          onMediaLoaded={handleMediaLoaded}
                        />
                      );
                    })}
                  </View>

                  {/* 記録追加セクション */}
                  {scope === "day" && (
                    <View style={styles.addRecordSection}>
                      <Text style={styles.addRecordSectionTitle}>{t("dashboard.dayDetail.addSection")}</Text>
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
                            <Text style={styles.addRecordButtonText}>{t("dashboard.dayDetail.addRecordShort")}</Text>
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
                            <Text style={styles.addRecordButtonText}>{t("dashboard.dayDetail.addPracticeShort")}</Text>
                          </Pressable>
                        )}
                      </View>
                    </View>
                  )}
                </>
              )}
            </ScrollView>
            {isDeleting && <LoadingSpinner fullScreen message={t("dashboard.dayDetail.deletingMessage")} />}
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
};
