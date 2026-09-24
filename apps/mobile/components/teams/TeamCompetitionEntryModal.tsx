import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  Alert,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useAuth } from "@/contexts/AuthProvider";
import { EntryAPI } from "@apps/shared/api/entries";
import type { EntryWithDetails } from "@swim-hub/shared/types";
import { formatTimeBest } from "@apps/shared/utils/time";
import { toUserFacingMessage } from "@apps/shared/utils/userFacingError";
import { canEditOrDeleteEntryRow } from "@/utils/entryRowPermissions";
import { SlideUpModal } from "@/components/ui/SlideUpModal";

/** 背面タップでは閉じない (元実装どおり、背面タップ用の Pressable が存在しない) */
const NOOP_BACKDROP_PRESS = () => {};

type EntryStatus = "before" | "open" | "closed";

interface TeamCompetitionEntryModalProps {
  visible: boolean;
  onClose: () => void;
  competitionId: string;
  competitionTitle: string;
  entryStatus: EntryStatus;
  isAdmin: boolean;
  // R5 でステータス変更 (楽観的更新) はこのモーダルから削除済みで、status はもう書き換わらない
  // (親から渡された entryStatus をそのまま保持するだけの値)。それでも呼び出し側 (親コンポーネント)
  // が持つ prop の competition.entry_status は再フェッチ前は stale な場合があるため、
  // 同一ソース (このモーダルが表示している値) で判定させる目的で引数として渡す（dead-click 防止）。
  onSelfEntry: (currentStatus: EntryStatus) => void;
  // Sprint Contract R6/D9: 編集はモーダル内にインラインフォームを作らず、既存の
  // CompetitionTabFormScreen (entry タブ) へ遷移する。D9 により、押した行の entry.id を
  // CompetitionTabForm の targetEntryId route param に渡し、対応する項目タブを開いた状態で
  // 表示する必要があるため、対象の行 (EntryWithDetails) を丸ごと渡す。
  onEditEntry: (entry: EntryWithDetails) => void;
  // Sprint Contract R3: admin のカードボタンは「エントリー」(このモーダルを開く) に統一され、
  // 代理入力への導線はこのモーダル内のボタンに移動した。
  onAdminBulkEntry: () => void;
}

interface EntryGroup {
  style: { id: number; name_jp: string; distance: number } | null;
  entries: EntryWithDetails[];
}

// 種目別にエントリーをグルーピング（Web の loadEntries 相当）
function groupEntriesByStyle(
  entries: EntryWithDetails[],
): Record<number, EntryGroup> {
  return entries.reduce<Record<number, EntryGroup>>((acc, entry) => {
    const styleId = entry.style_id;
    if (!acc[styleId]) {
      acc[styleId] = {
        style: entry.style
          ? {
              id: entry.style.id,
              name_jp: entry.style.name_jp,
              distance: entry.style.distance,
            }
          : null,
        entries: [],
      };
    }
    acc[styleId].entries.push(entry);
    return acc;
  }, {});
}

export function TeamCompetitionEntryModal({
  visible,
  onClose,
  competitionId,
  competitionTitle,
  entryStatus,
  isAdmin,
  onSelfEntry,
  onEditEntry,
  onAdminBulkEntry,
}: TeamCompetitionEntryModalProps) {
  const { supabase, user } = useAuth();
  const { t } = useTranslation();
  const entryApi = useMemo(
    () => new EntryAPI(supabase as SupabaseClient),
    [supabase],
  );

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<EntryWithDetails[]>([]);
  // 受付状況は resolveEntryStatus (isPastDate 込みの実効ステータス) を親から受け取った
  // 値をそのまま保持する。ステータス変更はカード上プルダウンに一本化済み(R5)のため、
  // このモーダル内で楽観的に書き換えることはない。
  const [status, setStatus] = useState<EntryStatus>(entryStatus);
  // 削除処理中のエントリー行 (二重タップ防止)
  const [deletingEntryId, setDeletingEntryId] = useState<string | null>(null);

  const loadEntries = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await entryApi.getEntriesByCompetition(competitionId);
      setEntries(data);
    } catch (err) {
      console.error("TeamCompetitionEntryModal: failed to load entries", err);
      setError(t("teams.mobile.teamCompetitionEntryModal.fetchFailed"));
    } finally {
      setLoading(false);
    }
  }, [entryApi, competitionId, t]);

  useEffect(() => {
    if (visible) {
      setStatus(entryStatus);
      loadEntries();
    }
  }, [visible, entryStatus, loadEntries]);

  const getStatusLabel = useCallback(
    (s: EntryStatus) =>
      t(`teams.mobile.teamCompetitionEntryModal.status${capitalize(s)}`),
    [t],
  );

  // Sprint Contract D1: 確認 Alert → EntryAPI.deleteEntry(entry.id) → loadEntries() 再取得。
  // R2: 行単位のみの削除であり、他選手のレグ行には触れない。確認文言は種目非依存の
  // 汎用文言 (deleteConfirmMessage) を使い、追加の警告文言は出さない。
  const handleDeleteEntry = useCallback(
    (entry: EntryWithDetails) => {
      Alert.alert(
        t("teams.mobile.teamCompetitionEntryModal.deleteConfirmTitle"),
        t("teams.mobile.teamCompetitionEntryModal.deleteConfirmMessage"),
        [
          { text: t("common.cancel"), style: "cancel" },
          {
            text: t("common.delete"),
            style: "destructive",
            onPress: async () => {
              setDeletingEntryId(entry.id);
              try {
                await entryApi.deleteEntry(entry.id);
                await loadEntries();
              } catch (err) {
                console.error(
                  "TeamCompetitionEntryModal: failed to delete entry",
                  err,
                );
                const msg = toUserFacingMessage(
                  err,
                  t("teams.mobile.teamCompetitionEntryModal.deleteFailed"),
                );
                Alert.alert(t("common.error"), msg, [{ text: t("common.ok") }]);
              } finally {
                setDeletingEntryId(null);
              }
            },
          },
        ],
      );
    },
    [entryApi, loadEntries, t],
  );

  const grouped = useMemo(() => groupEntriesByStyle(entries), [entries]);
  const groupedEntries = useMemo(() => Object.entries(grouped), [grouped]);

  return (
    <SlideUpModal
      visible={visible}
      // 背面タップで閉じない (NOOP) ため、"閉じる" ではなく動作を約束しない
      // 中立的なラベルを読み上げさせる。
      backdropAccessibilityLabel={t("common.aria.modalOverlay")}
      onClose={onClose}
      onBackdropPress={NOOP_BACKDROP_PRESS}
      overlayColor="rgba(0,0,0,0.4)"
      sheetStyle={styles.sheet}
    >
      {/* ヘッダー */}
      <View style={styles.header}>
        <View style={styles.headerTextWrap}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {t("teams.mobile.teamCompetitionEntryModal.title", {
              title: competitionTitle,
            })}
          </Text>
          {!loading && !error && (
            <Text style={styles.headerSubtitle}>
              {t("teams.mobile.teamCompetitionEntryModal.totalEntries", {
                count: entries.length,
              })}
            </Text>
          )}
        </View>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t("teams.mobile.teamCompetitionEntryModal.close")}
          style={styles.closeIcon}
        >
          <Feather name="x" size={22} color="#6B7280" />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
      >
        {/* 受付状況表示。PM 裁定 R5: ステータス変更セグメントは削除し、
            TeamCompetitionList.tsx のカード上プルダウンに一本化する。admin も
            このモーダル内では read-only バッジのみを見る (両者で分岐しない)。 */}
        <View style={styles.statusSection}>
          <Text style={styles.sectionLabel}>
            {t("teams.mobile.teamCompetitionEntryModal.entryStatusLabel")}
          </Text>
          <View style={[styles.readBadge, badgeStyle(status)]}>
            <Text style={[styles.readBadgeText, badgeTextStyle(status)]}>
              {getStatusLabel(status)}
            </Text>
          </View>
        </View>

        {/* 種目エントリー導線。非admin は自分のエントリー入力へ、admin は代理入力へ (要件B後半)。
            web (apps/web/components/team/TeamCompetitionEntryModal.tsx の canEditOrDeleteEntry)
            も受付中(open)の大会でのみ自分のエントリー導線を表示する方針であり、これに揃えて
            受付中以外では導線を表示しない (admin の代理入力ボタンも同じ条件に揃える)。
            D10 改訂: 「自分のエントリー0件で非表示」ルールはユーザーが撤回したため、
            自分のエントリー件数に関係なく status === "open" のみで表示する
            (admin/非admin ともに、この条件だけで分岐しない)。 */}
        {status === "open" &&
          (isAdmin ? (
            <Pressable
              style={styles.selfEntryButton}
              onPress={onAdminBulkEntry}
              accessibilityRole="button"
              accessibilityLabel={t(
                "teams.mobile.teamCompetitionEntryModal.adminBulkEntryButton",
              )}
            >
              <Feather name="users" size={15} color="#2563EB" />
              <Text style={styles.selfEntryButtonText}>
                {t(
                  "teams.mobile.teamCompetitionEntryModal.adminBulkEntryButton",
                )}
              </Text>
            </Pressable>
          ) : (
            <Pressable
              style={styles.selfEntryButton}
              onPress={() => onSelfEntry(status)}
              accessibilityRole="button"
              accessibilityLabel={t(
                "teams.mobile.teamCompetitionEntryModal.selfEntryButton",
              )}
            >
              <Feather name="edit-3" size={15} color="#2563EB" />
              <Text style={styles.selfEntryButtonText}>
                {t("teams.mobile.teamCompetitionEntryModal.selfEntryButton")}
              </Text>
            </Pressable>
          ))}

        {/* エントリー一覧 */}
        {loading && (
          <View style={styles.centerBlock}>
            <ActivityIndicator size="large" color="#2563EB" />
            <Text style={styles.infoText}>
              {t("teams.mobile.teamCompetitionEntryModal.loading")}
            </Text>
          </View>
        )}

        {!loading && error && (
          <View style={styles.errorBlock}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable style={styles.retryButton} onPress={loadEntries}>
              <Feather name="refresh-cw" size={14} color="#FFFFFF" />
              <Text style={styles.retryButtonText}>{t("common.retry")}</Text>
            </Pressable>
          </View>
        )}

        {!loading && !error && groupedEntries.length === 0 && (
          <View style={styles.emptyBlock}>
            <Text style={styles.infoText}>
              {t("teams.mobile.teamCompetitionEntryModal.emptyNoEntry")}
            </Text>
            {status === "open" && (
              <Text style={styles.emptyHint}>
                {t("teams.mobile.teamCompetitionEntryModal.emptyOpenHint")}
              </Text>
            )}
          </View>
        )}

        {!loading &&
          !error &&
          groupedEntries.map(([styleId, group]) => {
            const styleLabel =
              group.style?.name_jp ??
              t("teams.mobile.teamCompetitionEntryModal.unknownStyle");
            return (
              <View key={styleId} style={styles.styleGroup}>
                <View style={styles.styleHeader}>
                  <Text style={styles.styleHeaderText}>
                    {t("teams.mobile.teamCompetitionEntryModal.styleGroupHeader", {
                      style: styleLabel,
                      count: group.entries.length,
                    })}
                  </Text>
                </View>
                {group.entries.map((entry, index) => {
                  // Sprint Contract R1: 生の entry_status ではなく、大会日が過去かを
                  // 織り込んだ実効ステータス (このモーダルの status state) で判定する。
                  // SC3/SC8: 他ユーザーの行には出さず、admin 自身の行には出す
                  // (isAdmin では分岐しない)。
                  const canManage = canEditOrDeleteEntryRow(
                    entry.user_id,
                    user?.id,
                    status,
                  );
                  return (
                    <View key={entry.id} style={styles.entryRow}>
                      <View style={styles.entryRowContent}>
                        <View style={styles.entryInfo}>
                          <Text style={styles.entryName} numberOfLines={1}>
                            {index + 1}.{" "}
                            {entry.user?.name ??
                              t(
                                "teams.mobile.teamCompetitionEntryModal.unknownUser",
                              )}
                          </Text>
                          {entry.entry_time != null && (
                            <Text style={styles.entryTime}>
                              {t(
                                "teams.mobile.teamCompetitionEntryModal.entryTimeLabel",
                              )}{" "}
                              <Text style={styles.entryTimeValue}>
                                {formatTimeBest(entry.entry_time)}
                              </Text>
                            </Text>
                          )}
                          {entry.note && (
                            <Text style={styles.entryNote}>{entry.note}</Text>
                          )}
                        </View>
                        {canManage && (
                          <View style={styles.entryRowActions}>
                            <Pressable
                              style={styles.entryActionButton}
                              onPress={() => onEditEntry(entry)}
                              accessibilityRole="button"
                              accessibilityLabel={t(
                                "teams.mobile.teamCompetitionEntryModal.editEntryAria",
                                { style: styleLabel },
                              )}
                            >
                              <Feather name="edit" size={16} color="#2563EB" />
                            </Pressable>
                            <Pressable
                              style={[
                                styles.entryActionButton,
                                deletingEntryId === entry.id &&
                                  styles.entryActionButtonDisabled,
                              ]}
                              onPress={() => handleDeleteEntry(entry)}
                              disabled={deletingEntryId === entry.id}
                              accessibilityRole="button"
                              accessibilityState={{
                                disabled: deletingEntryId === entry.id,
                              }}
                              accessibilityLabel={t(
                                "teams.mobile.teamCompetitionEntryModal.deleteEntryAria",
                                { style: styleLabel },
                              )}
                            >
                              <Feather name="trash-2" size={16} color="#DC2626" />
                            </Pressable>
                          </View>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            );
          })}
      </ScrollView>

      {/* フッター */}
      <SafeAreaView edges={["bottom"]} style={styles.footer}>
        <Pressable
          style={styles.footerButton}
          onPress={onClose}
          accessibilityRole="button"
        >
          <Text style={styles.footerButtonText}>
            {t("teams.mobile.teamCompetitionEntryModal.close")}
          </Text>
        </Pressable>
      </SafeAreaView>
    </SlideUpModal>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Web 配色: before=灰 / open=緑 / closed=赤
function badgeStyle(s: EntryStatus) {
  switch (s) {
    case "open":
      return styles.badgeOpen;
    case "closed":
      return styles.badgeClosed;
    default:
      return styles.badgeBefore;
  }
}
function badgeTextStyle(s: EntryStatus) {
  switch (s) {
    case "open":
      return styles.badgeTextOpen;
    case "closed":
      return styles.badgeTextClosed;
    default:
      return styles.badgeTextBefore;
  }
}
const styles = StyleSheet.create({
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: "88%",
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    gap: 8,
  },
  headerTextWrap: {
    flex: 1,
    gap: 2,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  headerSubtitle: {
    fontSize: 12,
    color: "#6B7280",
  },
  closeIcon: {
    padding: 4,
  },
  body: {
    padding: 16,
    gap: 16,
  },
  statusSection: {
    backgroundColor: "#F9FAFB",
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
  },
  readBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  readBadgeText: {
    fontSize: 13,
    fontWeight: "600",
  },
  badgeBefore: {
    backgroundColor: "#F3F4F6",
  },
  badgeTextBefore: {
    color: "#374151",
  },
  badgeOpen: {
    backgroundColor: "#DCFCE7",
  },
  badgeTextOpen: {
    color: "#166534",
  },
  badgeClosed: {
    backgroundColor: "#FEE2E2",
  },
  badgeTextClosed: {
    color: "#991B1B",
  },
  selfEntryButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2563EB",
    backgroundColor: "#EFF6FF",
  },
  selfEntryButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#2563EB",
  },
  centerBlock: {
    alignItems: "center",
    paddingVertical: 32,
    gap: 12,
  },
  errorBlock: {
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
    gap: 12,
  },
  errorText: {
    color: "#DC2626",
    fontSize: 14,
    textAlign: "center",
  },
  retryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#EF4444",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  retryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  emptyBlock: {
    alignItems: "center",
    paddingVertical: 32,
    gap: 6,
  },
  infoText: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
  },
  emptyHint: {
    fontSize: 13,
    color: "#16A34A",
  },
  styleGroup: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    overflow: "hidden",
  },
  styleHeader: {
    backgroundColor: "#EFF6FF",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#DBEAFE",
  },
  styleHeaderText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1E3A8A",
  },
  entryRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#F3F4F6",
  },
  entryRowContent: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  entryInfo: {
    flex: 1,
    gap: 2,
  },
  entryName: {
    fontSize: 14,
    fontWeight: "500",
    color: "#111827",
  },
  entryTime: {
    fontSize: 13,
    color: "#4B5563",
  },
  entryTimeValue: {
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  entryNote: {
    fontSize: 12,
    color: "#9CA3AF",
  },
  // D1: 自分のエントリー行の編集/削除アイコン列
  entryRowActions: {
    flexDirection: "row",
    gap: 4,
    flexShrink: 0,
  },
  entryActionButton: {
    padding: 4,
  },
  entryActionButtonDisabled: {
    opacity: 0.5,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    padding: 12,
  },
  footerButton: {
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
  },
  footerButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#374151",
  },
});
