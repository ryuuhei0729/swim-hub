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
import { useUpdateCompetitionMutation } from "@apps/shared/hooks/queries/records";
import { teamKeys } from "@apps/shared/hooks/queries/keys";
import { useQueryClient } from "@tanstack/react-query";
import type { EntryWithDetails } from "@swim-hub/shared/types";
import { formatTimeBest } from "@apps/shared/utils/time";
import { SlideUpModal } from "@/components/ui/SlideUpModal";

/** 背面タップでは閉じない (元実装どおり、背面タップ用の Pressable が存在しない) */
const NOOP_BACKDROP_PRESS = () => {};

type EntryStatus = "before" | "open" | "closed";

interface TeamCompetitionEntryModalProps {
  visible: boolean;
  onClose: () => void;
  competitionId: string;
  competitionTitle: string;
  teamId: string;
  entryStatus: EntryStatus;
  // 大会日が過去かどうか。true のときはステータス変更セグメントを disabled にし、
  // 「大会日を過ぎたため自動的に受付終了」の説明を表示する (DB 値は書き換えない)。
  // 既存呼び出し元との後方互換のため optional・デフォルト false。
  isPastDate?: boolean;
  isAdmin: boolean;
  // 現在のモーダル内 status（楽観的更新後の値）を渡し、呼び出し側ガードが
  // prop の stale な entry_status ではなく同一ソースで判定できるようにする（dead-click 防止）。
  onSelfEntry: (currentStatus: EntryStatus) => void;
}

interface EntryGroup {
  style: { id: number; name_jp: string; distance: number } | null;
  entries: EntryWithDetails[];
}

const STATUS_ORDER: EntryStatus[] = ["before", "open", "closed"];

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
  teamId,
  entryStatus,
  isPastDate = false,
  isAdmin,
  onSelfEntry,
}: TeamCompetitionEntryModalProps) {
  const { supabase } = useAuth();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const entryApi = useMemo(
    () => new EntryAPI(supabase as SupabaseClient),
    [supabase],
  );
  const updateMutation = useUpdateCompetitionMutation(
    supabase as SupabaseClient,
  );

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<EntryWithDetails[]>([]);
  // 受付状況は楽観的更新のためローカル state で保持（初期値は親から）
  const [status, setStatus] = useState<EntryStatus>(entryStatus);

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

  const performStatusChange = useCallback(
    async (next: EntryStatus) => {
      const previous = status;
      // 楽観的更新
      setStatus(next);
      try {
        await updateMutation.mutateAsync({
          id: competitionId,
          updates: { entry_status: next },
        });
        // 既存 mutation の onSuccess は recordKeys のみ更新するため、
        // チーム大会一覧キーを明示的に無効化してバッジを再表示させる
        queryClient.invalidateQueries({
          queryKey: teamKeys.competitions(teamId),
        });
        await loadEntries();
      } catch (err) {
        // 失敗時はロールバック
        setStatus(previous);
        console.error(
          "TeamCompetitionEntryModal: failed to update status",
          err,
        );
        const msg =
          err instanceof Error
            ? err.message
            : t("teams.mobile.teamCompetitionEntryModal.saveFailed");
        Alert.alert(t("common.error"), msg, [{ text: t("common.ok") }]);
      }
    },
    [
      status,
      updateMutation,
      competitionId,
      queryClient,
      teamId,
      loadEntries,
      t,
    ],
  );

  const handleStatusChange = useCallback(
    (next: EntryStatus) => {
      // 現在値と同値は no-op（Web パリティ）
      if (next === status) return;

      const confirmKey = `teams.mobile.teamCompetitionEntryModal.confirm${capitalize(next)}`;
      Alert.alert(
        t("teams.mobile.teamCompetitionEntryModal.confirmTitle"),
        t(confirmKey),
        [
          { text: t("common.cancel"), style: "cancel" },
          { text: t("common.ok"), onPress: () => performStatusChange(next) },
        ],
      );
    },
    [status, performStatusChange, t],
  );

  const grouped = useMemo(() => groupEntriesByStyle(entries), [entries]);
  const groupedEntries = useMemo(() => Object.entries(grouped), [grouped]);
  const isSaving = updateMutation.isPending;

  return (
    <SlideUpModal
      visible={visible}
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
        {/* 受付状況管理 */}
        <View style={styles.statusSection}>
          <Text style={styles.sectionLabel}>
            {t("teams.mobile.teamCompetitionEntryModal.entryStatusLabel")}
          </Text>
          {/*
            Sprint Contract (mobile 管理者ビュー チーム大会タブ改修) により、この分岐
            (isAdmin === true 側のセグメント UI) は現在到達不能なデッドコードになっている。
            このモーダルを開く唯一の経路は TeamCompetitionList.tsx の非 admin 用「エントリー」
            ボタン (isAdmin=false) のみになり、admin のステータス変更は同ファイルのカード上
            プルダウン (statusDropdownWrapper/statusMenuPanel) に移行済み。performStatusChange
            や確認ダイアログのロジックがコメント文言まで含めて2ファイルに重複しているが、
            未解決項目がある中でのリファクタを避けるため今回は共通化しない
            (次スプリントの課題とする)。
          */}
          {isAdmin ? (
            <>
              <View style={styles.segmentRow}>
                {STATUS_ORDER.map((s) => {
                  const active = s === status;
                  const segmentDisabled = isSaving || isPastDate;
                  return (
                    <Pressable
                      key={s}
                      style={[
                        styles.segment,
                        active && segmentActiveStyle(s),
                        segmentDisabled && styles.segmentDisabled,
                      ]}
                      onPress={() => handleStatusChange(s)}
                      disabled={segmentDisabled}
                      accessibilityRole="button"
                      accessibilityState={{
                        selected: active,
                        disabled: segmentDisabled,
                      }}
                      accessibilityLabel={t(
                        "teams.mobile.teamCompetitionEntryModal.changeStatusAria",
                        { status: getStatusLabel(s) },
                      )}
                    >
                      <Text
                        style={[
                          styles.segmentText,
                          active && segmentActiveTextStyle(s),
                        ]}
                      >
                        {getStatusLabel(s)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {isPastDate && (
                <Text style={styles.pastDateNotice}>
                  {t("teams.mobile.teamCompetitionEntryModal.pastDateNotice")}
                </Text>
              )}
            </>
          ) : (
            <View style={[styles.readBadge, badgeStyle(status)]}>
              <Text style={[styles.readBadgeText, badgeTextStyle(status)]}>
                {getStatusLabel(status)}
              </Text>
            </View>
          )}
        </View>

        {/* 選手のセルフエントリー導線（種目入力）。
                web は受付中(open)の大会のみセルフエントリー画面に到達するため(useTeamEntry.ts:59-64)、
                受付中以外では導線を表示しない。 */}
        {status === "open" && (
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
        )}

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
          groupedEntries.map(([styleId, group]) => (
            <View key={styleId} style={styles.styleGroup}>
              <View style={styles.styleHeader}>
                <Text style={styles.styleHeaderText}>
                  {group.style?.name_jp ??
                    t(
                      "teams.mobile.teamCompetitionEntryModal.unknownStyle",
                    )}{" "}
                  ({group.entries.length})
                </Text>
              </View>
              {group.entries.map((entry, index) => (
                <View key={entry.id} style={styles.entryRow}>
                  <View style={styles.entryInfo}>
                    <Text style={styles.entryName} numberOfLines={1}>
                      {index + 1}.{" "}
                      {entry.user?.name ??
                        t("teams.mobile.teamCompetitionEntryModal.unknownUser")}
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
                </View>
              ))}
            </View>
          ))}
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
function segmentActiveStyle(s: EntryStatus) {
  switch (s) {
    case "open":
      return styles.segmentActiveOpen;
    case "closed":
      return styles.segmentActiveClosed;
    default:
      return styles.segmentActiveBefore;
  }
}
function segmentActiveTextStyle(s: EntryStatus) {
  switch (s) {
    case "open":
      return styles.segmentActiveTextOpen;
    case "closed":
      return styles.segmentActiveTextClosed;
    default:
      return styles.segmentActiveTextBefore;
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
  segmentRow: {
    flexDirection: "row",
    gap: 8,
  },
  segment: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
  },
  segmentDisabled: {
    opacity: 0.5,
  },
  pastDateNotice: {
    fontSize: 12,
    color: "#6B7280",
  },
  segmentText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#6B7280",
  },
  segmentActiveBefore: {
    backgroundColor: "#F3F4F6",
    borderColor: "#9CA3AF",
  },
  segmentActiveTextBefore: {
    color: "#374151",
    fontWeight: "700",
  },
  segmentActiveOpen: {
    backgroundColor: "#DCFCE7",
    borderColor: "#16A34A",
  },
  segmentActiveTextOpen: {
    color: "#166534",
    fontWeight: "700",
  },
  segmentActiveClosed: {
    backgroundColor: "#FEE2E2",
    borderColor: "#DC2626",
  },
  segmentActiveTextClosed: {
    color: "#991B1B",
    fontWeight: "700",
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
  entryInfo: {
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
