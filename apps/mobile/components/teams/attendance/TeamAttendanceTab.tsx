"use client";

/**
 * チームタブ「出欠」
 *
 * 今日以降の練習・大会を月ごとの見出しで区切った 1 本の一覧にする (1 イベント = 1 行)。過去のものは出さない。
 * - メンバー表示: 行の右の 出席 / 欠席 / その他 を押した時点で保存する。保存ボタンは無い。
 *   備考は行の「＋備考」から、その場で入力して保存できる
 * - 管理者表示: 行の右は受付状態 (受付中 / 締切) のプルダウン。「まとめて変更」で複数を一度に
 * - どちらも、行のそれ以外の部分を押すと全員の出欠のモーダル (AttendanceEventModal) を開く
 *
 * 受付状態は 受付中 / 締切 の 2 つ。締切後もメンバーは答えを変えられ、そのときは確認のうえ
 * 備考に「締切後編集」の印が付く (今までと同じ)。「未回答」は「受付中で未回答」に統一する。
 */
import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  SectionList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import type { AttendanceStatus, AttendanceStatusType } from "@swim-hub/shared/types";
import { formatDate } from "@swim-hub/shared/utils/date";
import { colors } from "@/constants/theme";
import { useDateLocale } from "@/hooks/useDateLocale";
import {
  useAttendanceStatusChanger,
  useMyAttendanceSaver,
  useTeamAttendanceList,
} from "@/hooks/useTeamAttendance";
import {
  effectiveAttendanceStatus,
  groupAttendanceByMonth,
  isUnansweredOpen,
  type AttendanceListItem,
} from "@/utils/teamAttendance";
import { AttendanceRow } from "./AttendanceRow";
import { AttendanceEventModal } from "./AttendanceEventModal";

interface TeamAttendanceTabProps {
  teamId: string;
  isAdminView: boolean;
}

export function TeamAttendanceTab({ teamId, isAdminView }: TeamAttendanceTabProps) {
  const { t } = useTranslation();
  const locale = useDateLocale();
  const listQuery = useTeamAttendanceList(teamId);
  const { saveAnswer } = useMyAttendanceSaver(teamId);
  const { changeStatus } = useAttendanceStatusChanger(teamId);

  const [openEventId, setOpenEventId] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);

  const items = useMemo(() => listQuery.data ?? [], [listQuery.data]);
  const sections = useMemo(
    () =>
      groupAttendanceByMonth(items).map((group) => ({
        key: group.key,
        title: formatDate(group.monthStart, "yearMonth", locale),
        data: group.items,
      })),
    [items, locale],
  );
  const unansweredCount = useMemo(() => items.filter(isUnansweredOpen).length, [items]);
  // モーダル・メニューには一覧のキャッシュの最新の値を渡す (保存後の答えや受付状態が反映される)
  const openItem = useMemo(
    () => items.find((item) => item.event.id === openEventId) ?? null,
    [items, openEventId],
  );

  // 管理者表示に切り替わったら / 戻ったら、まとめて変更の選択は捨てる
  const [prevAdminView, setPrevAdminView] = useState(isAdminView);
  if (prevAdminView !== isAdminView) {
    setPrevAdminView(isAdminView);
    setSelecting(false);
    setSelectedIds(new Set());
  }

  const handleRowPress = useCallback(
    (item: AttendanceListItem) => {
      if (selecting) {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          if (next.has(item.event.id)) next.delete(item.event.id);
          else next.add(item.event.id);
          return next;
        });
        return;
      }
      setOpenEventId(item.event.id);
    },
    [selecting],
  );

  const handleAnswer = useCallback(
    (item: AttendanceListItem, status: AttendanceStatus) => {
      if (item.myAttendance?.status === status) return;
      void saveAnswer(item, { status, note: item.myAttendance?.note ?? "" });
    },
    [saveAnswer],
  );

  const handleModalAnswer = useCallback(
    (item: AttendanceListItem, change: { status: AttendanceStatus | null; note: string }) => {
      const current = item.myAttendance;
      if ((current?.status ?? null) === change.status && (current?.note ?? "") === change.note) return;
      void saveAnswer(item, change);
    },
    [saveAnswer],
  );

  // 一覧の「＋備考」から備考だけを保存する (答えはそのまま)
  const handleNoteSave = useCallback(
    async (item: AttendanceListItem, note: string) => {
      if ((item.myAttendance?.note ?? "") === note) return true;
      return saveAnswer(item, { status: item.myAttendance?.status ?? null, note });
    },
    [saveAnswer],
  );

  // プルダウンで受付状態を選んだら、確認のうえ変える (大会のエントリー受付ステータスと同じ流れ)
  const handleStatusChange = useCallback(
    (item: AttendanceListItem, status: AttendanceStatusType) => {
      if (effectiveAttendanceStatus(item.event) === status) return;
      Alert.alert(
        t("teams.mobile.adminAttendance.confirmTitle"),
        t(
          status === "open"
            ? "teams.mobile.adminAttendance.confirmOpen"
            : "teams.mobile.adminAttendance.confirmClose",
        ),
        [
          { text: t("common.cancel"), style: "cancel" },
          { text: t("common.ok"), onPress: () => void changeStatus([item.event], status) },
        ],
      );
    },
    [changeStatus, t],
  );

  const handleBulkChange = useCallback(
    async (status: AttendanceStatusType) => {
      const targets = items.filter((item) => selectedIds.has(item.event.id)).map((item) => item.event);
      if (targets.length === 0) return;
      const ok = await changeStatus(targets, status);
      if (ok) {
        setSelecting(false);
        setSelectedIds(new Set());
      }
    },
    [items, selectedIds, changeStatus],
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await listQuery.refetch();
    } finally {
      setRefreshing(false);
    }
  }, [listQuery]);

  const renderItem = useCallback(
    ({ item, index, section }: { item: AttendanceListItem; index: number; section: { data: readonly AttendanceListItem[] } }) => (
      <View
        style={[
          styles.rowWrap,
          index === 0 && styles.rowFirst,
          index === section.data.length - 1 && styles.rowLast,
          index > 0 && styles.rowDivider,
        ]}
      >
        <AttendanceRow
          item={item}
          mode={isAdminView ? "admin" : "member"}
          selecting={selecting}
          selected={selectedIds.has(item.event.id)}
          onPress={handleRowPress}
          onAnswer={handleAnswer}
          onNoteSave={handleNoteSave}
          onStatusChange={handleStatusChange}
        />
      </View>
    ),
    [isAdminView, selecting, selectedIds, handleRowPress, handleAnswer, handleNoteSave, handleStatusChange],
  );

  // ---- 一覧の上 ----------------------------------------------------------------
  const header = (
    <View style={styles.header}>
      {isAdminView ? (
        selecting ? (
          <View style={styles.bulkBar}>
            <View style={styles.bulkBarTop}>
              <Text style={styles.bulkCount}>
                {t("teams.mobile.attendanceTab.bulkSelected", { count: selectedIds.size })}
              </Text>
              <Pressable
                onPress={() => {
                  setSelecting(false);
                  setSelectedIds(new Set());
                }}
                hitSlop={8}
                accessibilityRole="button"
                testID="attendance-bulk-cancel"
              >
                <Text style={styles.bulkCancel}>{t("common.cancel")}</Text>
              </Pressable>
            </View>
            <View style={styles.bulkButtons}>
              {(["open", "closed"] as const).map((status) => (
                <Pressable
                  key={status}
                  style={[
                    styles.bulkButton,
                    status === "open" ? styles.bulkButtonOpen : styles.bulkButtonClosed,
                    selectedIds.size === 0 && styles.bulkButtonDisabled,
                  ]}
                  disabled={selectedIds.size === 0}
                  onPress={() => void handleBulkChange(status)}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: selectedIds.size === 0 }}
                  testID={`attendance-bulk-${status}`}
                >
                  <Text style={styles.bulkButtonText}>
                    {t(
                      status === "open"
                        ? "teams.mobile.attendanceTab.bulkToOpen"
                        : "teams.mobile.attendanceTab.bulkToClosed",
                    )}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : (
          <View style={styles.adminToolbar}>
            <Text style={styles.adminToolbarText}>{t("teams.mobile.attendanceTab.adminHint")}</Text>
            <Pressable
              style={styles.bulkStart}
              onPress={() => setSelecting(true)}
              accessibilityRole="button"
              testID="attendance-bulk-start"
            >
              <Feather name="check-square" size={14} color="#2563EB" />
              <Text style={styles.bulkStartText}>{t("teams.mobile.attendanceTab.bulkChange")}</Text>
            </Pressable>
          </View>
        )
      ) : (
        <View style={styles.summary}>
          <Text style={styles.summaryTitle}>{t("teams.mobile.attendanceTab.summaryTitle")}</Text>
          <Text style={[styles.summaryCount, unansweredCount === 0 && styles.summaryCountDone]}>
            {unansweredCount > 0
              ? t("teams.mobile.attendanceTab.unansweredCount", { count: unansweredCount })
              : t("teams.mobile.attendanceTab.allAnswered")}
          </Text>
        </View>
      )}
    </View>
  );

  let body: React.ReactNode;
  if (listQuery.isLoading) {
    body = (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  } else if (listQuery.isError && !listQuery.data) {
    body = (
      <View style={styles.center}>
        <Feather name="alert-circle" size={40} color="#DC2626" />
        <Text style={styles.errorText}>{t("teams.mobile.attendanceFetchFailed")}</Text>
        <Pressable style={styles.retryButton} onPress={() => void listQuery.refetch()} accessibilityRole="button">
          <Text style={styles.retryButtonText}>{t("common.retry")}</Text>
        </Pressable>
      </View>
    );
  } else {
    body = (
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.event.id}
        renderItem={renderItem}
        renderSectionHeader={({ section }) => <Text style={styles.monthHeader}>{section.title}</Text>}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="calendar" size={36} color="#D1D5DB" />
            <Text style={styles.emptyText}>{t("teams.mobile.attendanceTab.empty")}</Text>
          </View>
        }
        stickySectionHeadersEnabled={false}
        // チームタブは OS のタブバーの上に出るので、末尾がタブバーに隠れないよう OS に下端の余白を足させる
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        // 「＋備考」の入力欄がキーボードに隠れないよう、キーボードの分だけ下に余白を足させる (iOS)
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
        extraData={[selecting, selectedIds, isAdminView]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#2563EB" colors={["#2563EB"]} />
        }
        testID="attendance-list"
      />
    );
  }

  return (
    <View style={styles.container}>
      {body}
      <AttendanceEventModal
        item={openItem}
        teamId={teamId}
        isAdminView={isAdminView}
        onClose={() => setOpenEventId(null)}
        onAnswer={handleModalAnswer}
        onChangeStatus={(item, status) => void changeStatus([item.event], status)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  listContent: {
    paddingHorizontal: 12,
    paddingBottom: 24,
  },
  header: {
    paddingTop: 4,
    gap: 8,
  },
  summary: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  summaryTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#111827",
  },
  summaryCount: {
    marginTop: 2,
    fontSize: 12,
    color: "#B45309",
    fontWeight: "600",
  },
  summaryCountDone: {
    color: "#15803D",
  },
  adminToolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  adminToolbarText: {
    flex: 1,
    fontSize: 12,
    color: "#6B7280",
  },
  bulkStart: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  bulkStartText: {
    fontSize: 12.5,
    fontWeight: "700",
    color: "#2563EB",
  },
  bulkBar: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    borderRadius: 12,
    padding: 10,
    gap: 8,
  },
  bulkBarTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  bulkCount: {
    fontSize: 13,
    fontWeight: "700",
    color: "#111827",
  },
  bulkCancel: {
    fontSize: 13,
    color: "#6B7280",
  },
  bulkButtons: {
    flexDirection: "row",
    gap: 8,
  },
  bulkButton: {
    flex: 1,
    alignItems: "center",
    borderRadius: 10,
    paddingVertical: 10,
  },
  bulkButtonOpen: {
    backgroundColor: "#2563EB",
  },
  bulkButtonClosed: {
    backgroundColor: "#6B7280",
  },
  bulkButtonDisabled: {
    opacity: 0.4,
  },
  bulkButtonText: {
    fontSize: 13.5,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  monthHeader: {
    fontSize: 12.5,
    fontWeight: "700",
    color: "#374151",
    paddingTop: 14,
    paddingBottom: 6,
    paddingHorizontal: 2,
  },
  // 月ごとの行をひと続きのカードに見せる (上下の角だけ丸め、行の間は細い線)
  rowWrap: {
    backgroundColor: "#FFFFFF",
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: "#E5E7EB",
    overflow: "hidden",
  },
  rowFirst: {
    borderTopWidth: 1,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  rowLast: {
    borderBottomWidth: 1,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 8,
  },
  errorText: {
    fontSize: 14,
    color: "#DC2626",
    textAlign: "center",
  },
  retryButton: {
    marginTop: 4,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#2563EB",
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  empty: {
    alignItems: "center",
    paddingVertical: 48,
    gap: 8,
  },
  emptyText: {
    fontSize: 14,
    color: "#9CA3AF",
  },
});
