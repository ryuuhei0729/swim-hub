import React, { useState, useEffect, useCallback } from "react";
import { View, Text, Pressable, Alert } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthProvider";
import { formatTime } from "@/utils/formatters";
import { localizedStyleName } from "@/utils/styleName";
import { EntryAPI } from "@apps/shared/api/entries";
import type { CalendarItem } from "@apps/shared/types/ui";
import { hexToRgba, mixWithWhite, CALENDAR_COLOR_ALPHA } from "@apps/shared/utils/colorAlpha";
import { darkenHex } from "@/utils/colorTone";
import { styles } from "../styles";
import type { EntryDetailProps, EntryData } from "../types";

// DayDetailModal から渡ってくる未カスタマイズ時のフォールバック色 (旧デフォルト青)。
// RecordDetail と同一の判定・フォールバック値を使う(見た目のパリティのため)。
const LEGACY_COMPETITION_ACCENT = "#2563EB";
const LEGACY_WRAPPER_BACKGROUND = "#EFF6FF";
const LEGACY_WRAPPER_BORDER = "#DBEAFE";
// 「エントリー済み」ボックスの旧デフォルト値(オレンジ系)。
const LEGACY_ENTRY_BOX_BACKGROUND = "#FFF7ED";
const LEGACY_ENTRY_BOX_BORDER = "#FED7AA";
const LEGACY_ENTRY_BOX_TEXT = "#9A3412";

/**
 * エントリー詳細表示コンポーネント（大会ごとにグループ化、記録未登録）
 */
export const EntryDetail: React.FC<EntryDetailProps> = ({
  competitionId,
  competitionName,
  place,
  poolType,
  note,
  entries,
  color = LEGACY_COMPETITION_ACCENT,
  onEditCompetition,
  onDeleteCompetition,
  onEditEntry,
  onDeleteEntry,
  onAddRecord,
  onClose,
  onDeletingChange,
}) => {
  // 未カスタマイズなら旧来のカード外枠を維持。カスタム色時は「濃すぎる」フィードバックを
  // 受け、枠線はベタ塗りではなく淡いアルファ合成にする。
  // 外枠の背景ウォッシュは mixWithWhite(不透明の混色)を使い、入れ子背景との
  // アルファ合成による濃淡変化(2段階問題)を避ける(web と実装を揃える)。
  const isDefaultAccent = color === LEGACY_COMPETITION_ACCENT;
  const wrapperBackgroundColor = isDefaultAccent
    ? LEGACY_WRAPPER_BACKGROUND
    : mixWithWhite(color, CALENDAR_COLOR_ALPHA.DAY_DETAIL_WRAPPER_BACKGROUND);
  const wrapperBorderColor = isDefaultAccent
    ? LEGACY_WRAPPER_BORDER
    : hexToRgba(color, CALENDAR_COLOR_ALPHA.DAY_DETAIL_BORDER);
  // 「エントリー済み(記録未登録)」ボックスは元々オレンジ固定だったが、識別色に揃える
  // ユーザー要望により追従させる。デフォルト時はピクセル一致で従来のオレンジを維持。
  const entryBoxBackgroundColor = isDefaultAccent
    ? LEGACY_ENTRY_BOX_BACKGROUND
    : mixWithWhite(color, CALENDAR_COLOR_ALPHA.DAY_DETAIL_WRAPPER_BACKGROUND);
  const entryBoxBorderColor = isDefaultAccent
    ? LEGACY_ENTRY_BOX_BORDER
    : hexToRgba(color, CALENDAR_COLOR_ALPHA.DAY_DETAIL_BORDER);
  const entryBoxTextColor = isDefaultAccent ? LEGACY_ENTRY_BOX_TEXT : darkenHex(color, 0.65);
  const { t } = useTranslation();
  const { supabase } = useAuth();
  const [actualEntries, setActualEntries] = useState<EntryData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchEntries = useCallback(async () => {
    try {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const { data: entryData, error } = await supabase
        .from("entries")
        .select(
          `
          id,
          style_id,
          entry_time,
          note,
          style:styles!inner(id, name_jp, style)
        `,
        )
        .eq("competition_id", competitionId)
        .eq("user_id", user.id);

      if (error) throw error;

      if (entryData && entryData.length > 0) {
        type EntryRow = {
          id: string;
          style_id: number;
          entry_time: number | null;
          note: string | null;
          style:
            | { id: number; name_jp: string; style: string }
            | { id: number; name_jp: string; style: string }[];
        };

        const mapped = (entryData as EntryRow[]).map((row) => {
          const style = Array.isArray(row.style) ? row.style[0] : row.style;
          return {
            id: row.id,
            styleId: row.style_id,
            styleName: localizedStyleName(style, t),
            entryTime: row.entry_time,
            note: row.note,
          };
        });
        setActualEntries(mapped);
      } else {
        // カレンダーアイテムから初期データを構築
        const initialEntries = entries.map((entry) => {
          const style = entry.metadata?.style;
          return {
            id: entry.id,
            styleId:
              typeof style === "object" && style !== null && "id" in style ? Number(style.id) : 0,
            styleName:
              typeof style === "object" && style !== null
                ? localizedStyleName(style as { style?: string; name_jp?: string }, t)
                : "",
            entryTime: entry.metadata?.entry_time || null,
            note: entry.note || null,
          };
        });
        setActualEntries(initialEntries);
      }
    } catch (err) {
      console.error("エントリーデータの取得エラー:", err);
    } finally {
      setLoading(false);
    }
  }, [competitionId, supabase, entries, t]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const getPoolTypeText = (poolType: number) => {
    return poolType === 1
      ? t("dashboard.competition.poolTypeLong")
      : t("dashboard.competition.poolTypeShort");
  };

  // エントリーが0件で読み込み完了した場合は、コンポーネント全体を非表示にする
  if (!loading && actualEntries.length === 0) {
    return null;
  }

  return (
    <View
      style={[
        styles.competitionRecordContainer,
        { backgroundColor: wrapperBackgroundColor, borderColor: wrapperBorderColor },
      ]}
    >
      {/* 大会ヘッダー */}
      <View style={styles.competitionHeader}>
        <View style={styles.competitionHeaderTopRow}>
          <View style={styles.competitionHeaderLeft}>
            <Text style={styles.competitionHeaderTitle}>{competitionName}</Text>
          </View>
          <View style={styles.competitionHeaderActions}>
            {onEditCompetition && (
              <Pressable
                style={styles.competitionHeaderActionButton}
                onPress={() => {
                  // CalendarItemを構築して渡す
                  const firstEntry = entries[0];
                  if (firstEntry && onEditCompetition) {
                    const competitionItem: CalendarItem = {
                      id: competitionId,
                      type: firstEntry.metadata?.competition?.team_id
                        ? "team_competition"
                        : "competition",
                      title: competitionName,
                      date: firstEntry.date || "",
                      place: place || undefined,
                      note: note || undefined,
                      metadata: {
                        competition: {
                          id: competitionId,
                          title: competitionName,
                          date: firstEntry.date || "",
                          end_date: null,
                          place: place || null,
                          pool_type: poolType ?? 0,
                          team_id: firstEntry.metadata?.competition?.team_id || null,
                        },
                      },
                    };
                    onEditCompetition(competitionItem);
                    onClose?.();
                  }
                }}
              >
                <Feather name="edit" size={18} color="#2563EB" />
              </Pressable>
            )}
            {onDeleteCompetition && (
              <Pressable style={styles.competitionHeaderActionButton} onPress={onDeleteCompetition}>
                <Feather name="trash-2" size={18} color="#EF4444" />
              </Pressable>
            )}
          </View>
        </View>
        {place && (
          <View style={styles.competitionHeaderPlaceRow}>
            <Feather name="map-pin" size={12} color="#6B7280" />
            <Text style={styles.competitionHeaderPlace}>{place}</Text>
          </View>
        )}
        {poolType !== undefined && (
          <Text style={styles.competitionHeaderPoolType}>{getPoolTypeText(poolType)}</Text>
        )}
      </View>

      {note && (
        <View style={styles.competitionNoteContainer}>
          <Text style={styles.competitionNoteText}>{note}</Text>
        </View>
      )}

      {/* エントリー済み（記録未登録）セクション */}
      <View
        style={[
          styles.entrySection,
          { backgroundColor: entryBoxBackgroundColor, borderColor: entryBoxBorderColor },
        ]}
      >
        <View style={styles.entrySectionHeader}>
          <Feather name="edit-3" size={16} color="#9A3412" />
          <Text style={[styles.entrySectionHeaderTitle, { color: entryBoxTextColor }]}>
            {t("dashboard.dayDetail.entryAlreadyTitle")}
          </Text>
          {onEditEntry && (
            <Pressable
              style={styles.entrySectionHeaderActionButton}
              onPress={() => {
                // actualEntriesから最初のエントリーを取得して編集対象とする
                if (actualEntries.length > 0 && !loading) {
                  const firstActualEntry = actualEntries[0];
                  const firstCalendarEntry = entries[0];
                  if (firstCalendarEntry && onEditEntry) {
                    // 実際のエントリーIDを使用してCalendarItemを構築
                    const entryItem: CalendarItem = {
                      ...firstCalendarEntry,
                      id: firstActualEntry.id, // 実際のエントリーIDを使用
                    };
                    onEditEntry(entryItem);
                    onClose?.();
                  }
                } else if (entries.length > 0 && onEditEntry) {
                  // actualEntriesがまだ読み込まれていない場合は、CalendarItemをそのまま使用
                  onEditEntry(entries[0]);
                  onClose?.();
                }
              }}
            >
              <Feather name="edit" size={18} color="#2563EB" />
            </Pressable>
          )}
        </View>

        {loading ? (
          <Text style={styles.entryLoadingText}>{t("dashboard.dayDetail.entryLoadingText")}</Text>
        ) : actualEntries.length === 0 ? (
          <Text style={styles.entryEmptyText}>{t("dashboard.dayDetail.entryEmptyText")}</Text>
        ) : (
          <View style={styles.entryList}>
            {actualEntries.map((entry) => (
              <View key={entry.id} style={[styles.entryCard, { borderColor: entryBoxBorderColor }]}>
                <View style={styles.entryCardContent}>
                  <View style={styles.entryCardInfo}>
                    <View style={styles.entryCardInfoRow}>
                      <Text style={[styles.entryCardInfoLabel, { color: entryBoxTextColor }]}>
                        {t("dashboard.dayDetail.fieldStyle")}
                      </Text>
                      <Text style={styles.entryCardInfoValue}>{entry.styleName}</Text>
                    </View>
                    {entry.entryTime && entry.entryTime > 0 && (
                      <View style={styles.entryCardInfoRow}>
                        <Text style={[styles.entryCardInfoLabel, { color: entryBoxTextColor }]}>
                          {t("dashboard.dayDetail.fieldEntryTime")}
                        </Text>
                        <Text style={styles.entryCardInfoValueTime}>
                          {formatTime(entry.entryTime)}
                        </Text>
                      </View>
                    )}
                    {entry.note && entry.note.trim().length > 0 && (
                      <View style={styles.entryCardInfoRow}>
                        <Text style={[styles.entryCardInfoLabel, { color: entryBoxTextColor }]}>
                          {t("dashboard.dayDetail.fieldMemo")}
                        </Text>
                        <Text style={styles.entryCardInfoValue}>{entry.note}</Text>
                      </View>
                    )}
                  </View>
                  {onDeleteEntry && (
                    <Pressable
                      style={styles.entryCardDeleteButton}
                      onPress={async () => {
                        Alert.alert(
                          t("dashboard.dayDetail.entryDeleteConfirmTitle"),
                          t("dashboard.dayDetail.entryDeleteConfirmMessage"),
                          [
                            {
                              text: t("common.cancel"),
                              style: "cancel",
                            },
                            {
                              text: t("common.upload.removeChoice"),
                              style: "destructive",
                              onPress: async () => {
                                onDeletingChange?.(true);
                                try {
                                  const api = new EntryAPI(supabase);
                                  await api.deleteEntry(entry.id);
                                  // 削除後にエントリー一覧を再取得
                                  await fetchEntries();
                                  // 親コンポーネントに削除完了を通知
                                  if (onDeleteEntry) {
                                    onDeleteEntry(entry.id);
                                  }
                                } catch (error) {
                                  console.error("削除エラー:", error);
                                  Alert.alert(
                                    t("common.alertErrorTitle"),
                                    error instanceof Error
                                      ? error.message
                                      : t("dashboard.dayDetail.entryDeleteFailed"),
                                    [{ text: "OK" }],
                                  );
                                } finally {
                                  onDeletingChange?.(false);
                                }
                              },
                            },
                          ],
                        );
                      }}
                    >
                      <Feather name="trash-2" size={16} color="#EF4444" />
                    </Pressable>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* 大会記録を追加ボタン */}
      {onAddRecord && (
        <Pressable
          style={styles.addCompetitionRecordButton}
          onPress={() => {
            const firstEntry = entries[0];
            const dateParam = firstEntry?.date || "";
            if (competitionId && dateParam) {
              onAddRecord(competitionId, dateParam);
              onClose?.();
            }
          }}
        >
          <Feather name="plus" size={20} color="#FFFFFF" />
          <Text style={styles.addCompetitionRecordButtonText}>{t("dashboard.dayDetail.addCompetitionRecord")}</Text>
        </Pressable>
      )}
    </View>
  );
};
