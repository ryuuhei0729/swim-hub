import React, { useState, useEffect, useCallback } from "react";
import { View, Text, Pressable, Alert } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "@/contexts/AuthProvider";
import { formatTime } from "@/utils/formatters";
import { EntryAPI } from "@apps/shared/api/entries";
import type { CalendarItem } from "@apps/shared/types/ui";
import { styles } from "../styles";
import type { EntryDetailProps, EntryData } from "../types";

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
  onEditCompetition,
  onDeleteCompetition,
  onEditEntry,
  onDeleteEntry,
  onAddRecord,
  onClose,
  onDeletingChange,
}) => {
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
          style:styles!inner(id, name_jp)
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
          style: { id: number; name_jp: string } | { id: number; name_jp: string }[];
        };

        const mapped = (entryData as EntryRow[]).map((row) => {
          const style = Array.isArray(row.style) ? row.style[0] : row.style;
          return {
            id: row.id,
            styleId: row.style_id,
            styleName: style?.name_jp || "",
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
              typeof style === "object" && style !== null && "name_jp" in style
                ? String(style.name_jp)
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
  }, [competitionId, supabase, entries]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const getPoolTypeText = (poolType: number) => {
    return poolType === 1 ? "長水路(50m)" : "短水路(25m)";
  };

  // エントリーが0件で読み込み完了した場合は、コンポーネント全体を非表示にする
  if (!loading && actualEntries.length === 0) {
    return null;
  }

  return (
    <View style={styles.competitionRecordContainer}>
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
        {place && <Text style={styles.competitionHeaderPlace}>📍 {place}</Text>}
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
      <View style={styles.entrySection}>
        <View style={styles.entrySectionHeader}>
          <Text style={styles.entrySectionHeaderEmoji}>📝</Text>
          <Text style={styles.entrySectionHeaderTitle}>エントリー済み（記録未登録）</Text>
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
          <Text style={styles.entryLoadingText}>読み込み中...</Text>
        ) : actualEntries.length === 0 ? (
          <Text style={styles.entryEmptyText}>エントリー情報が見つかりません</Text>
        ) : (
          <View style={styles.entryList}>
            {actualEntries.map((entry) => (
              <View key={entry.id} style={styles.entryCard}>
                <View style={styles.entryCardContent}>
                  <View style={styles.entryCardInfo}>
                    <View style={styles.entryCardInfoRow}>
                      <Text style={styles.entryCardInfoLabel}>種目:</Text>
                      <Text style={styles.entryCardInfoValue}>{entry.styleName}</Text>
                    </View>
                    {entry.entryTime && entry.entryTime > 0 && (
                      <View style={styles.entryCardInfoRow}>
                        <Text style={styles.entryCardInfoLabel}>エントリータイム:</Text>
                        <Text style={styles.entryCardInfoValueTime}>
                          {formatTime(entry.entryTime)}
                        </Text>
                      </View>
                    )}
                    {entry.note && entry.note.trim().length > 0 && (
                      <View style={styles.entryCardInfoRow}>
                        <Text style={styles.entryCardInfoLabel}>メモ:</Text>
                        <Text style={styles.entryCardInfoValue}>{entry.note}</Text>
                      </View>
                    )}
                  </View>
                  {onDeleteEntry && (
                    <Pressable
                      style={styles.entryCardDeleteButton}
                      onPress={async () => {
                        Alert.alert(
                          "削除確認",
                          "このエントリーを削除しますか？\nこの操作は取り消せません。",
                          [
                            {
                              text: "キャンセル",
                              style: "cancel",
                            },
                            {
                              text: "削除",
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
                                    "エラー",
                                    error instanceof Error ? error.message : "削除に失敗しました",
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
          <Text style={styles.addCompetitionRecordButtonText}>大会記録を追加</Text>
        </Pressable>
      )}
    </View>
  );
};
