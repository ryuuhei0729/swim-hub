"use client";

/**
 * チームタブ「予定」: チーム練習とチーム大会を 1 本の一覧にまとめて表示する。
 *
 * 絞り込みは 2 つの独立した条件の組み合わせ:
 *   - 種類: 全て / 練習 / 大会 (どれか 1 つ)
 *   - 過去: オン/オフのスイッチ。オフは今日以降を日付の近い順、オンは昨日以前を新しい順
 *     (種類とは別物なので、右端に別の見た目で置く)
 * 「今日」は大会カードと同じく isCompetitionDateInPast (端末のローカル日付) で判定する。
 *
 * カードと各操作 (編集・削除・記録入力・エントリー等) は既存の一覧
 * (TeamPracticeList / TeamCompetitionList) と同じものを使う。
 */
import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  ScrollView,
  Alert,
  ActivityIndicator,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthProvider";
import {
  useTeamPracticesQuery,
  useTeamCompetitionsQuery,
} from "@apps/shared/hooks/queries/teams";
import { colors } from "@/constants/theme";
import {
  buildScheduleItems,
  type ScheduleKind,
  type ScheduleItem,
} from "@/utils/teamSchedule";
import { PracticeItem, useTeamPracticeActions } from "./TeamPracticeList";
import { CompetitionItem, useTeamCompetitionActions } from "./TeamCompetitionList";

const KINDS: { id: ScheduleKind; labelKey: string }[] = [
  { id: "all", labelKey: "teams.mobile.schedule.filterAll" },
  { id: "practices", labelKey: "teams.mobile.schedule.filterPractices" },
  { id: "competitions", labelKey: "teams.mobile.schedule.filterCompetitions" },
];

const EMPTY_KEYS: Record<"upcoming" | "past", Record<ScheduleKind, string>> = {
  upcoming: {
    all: "teams.mobile.schedule.emptyUpcoming",
    practices: "teams.mobile.schedule.emptyPractices",
    competitions: "teams.mobile.schedule.emptyCompetitions",
  },
  past: {
    all: "teams.mobile.schedule.emptyPast",
    practices: "teams.mobile.schedule.emptyPastPractices",
    competitions: "teams.mobile.schedule.emptyPastCompetitions",
  },
};

interface TeamScheduleListProps {
  teamId: string;
  isAdmin: boolean;
}

export function TeamScheduleList({ teamId, isAdmin }: TeamScheduleListProps) {
  const { supabase } = useAuth();
  const { t } = useTranslation();
  const [kind, setKind] = useState<ScheduleKind>("all");
  const [showPast, setShowPast] = useState(false);

  const practicesQuery = useTeamPracticesQuery(supabase, teamId);
  const competitionsQuery = useTeamCompetitionsQuery(supabase, teamId);

  const practiceActions = useTeamPracticeActions(teamId, isAdmin);
  const competitionActions = useTeamCompetitionActions(teamId, isAdmin);

  const items = useMemo(
    () =>
      buildScheduleItems(practicesQuery.data ?? [], competitionsQuery.data ?? [], kind, showPast),
    [practicesQuery.data, competitionsQuery.data, kind, showPast],
  );

  // 追加は「練習を追加 / 大会を追加」を選んでもらう。
  // Android の Alert はボタン 3 つまでなので、一括登録は別ボタンにしている
  const handleAddPress = useCallback(() => {
    Alert.alert(t("teams.mobile.schedule.addMenuTitle"), undefined, [
      {
        text: t("teams.mobile.teamPracticeList.addButton"),
        onPress: practiceActions.handleAdd,
      },
      {
        text: t("teams.mobile.teamCompetitionList.addButton"),
        onPress: competitionActions.handleAdd,
      },
      { text: t("common.cancel"), style: "cancel" },
    ]);
  }, [t, practiceActions.handleAdd, competitionActions.handleAdd]);

  const renderItem = useCallback(
    ({ item }: { item: ScheduleItem }) =>
      item.kind === "practice" ? (
        <PracticeItem
          practice={item.practice}
          isAdmin={isAdmin}
          onEdit={practiceActions.handleEdit}
          onDelete={practiceActions.handleDelete}
          onAddLog={practiceActions.handleAddLog}
          isDeleting={practiceActions.deletingId === item.practice.id}
          deleteDisabled={practiceActions.isDeletePending}
        />
      ) : (
        <CompetitionItem
          competition={item.competition}
          teamId={teamId}
          isAdmin={isAdmin}
          onEdit={competitionActions.handleEdit}
          onDelete={competitionActions.handleDelete}
          onEntry={competitionActions.handleEntry}
          onRecord={competitionActions.handleRecord}
          onOpenRecords={competitionActions.handleOpenRecords}
          isDeleting={competitionActions.deletingId === item.competition.id}
          deleteDisabled={competitionActions.isDeletePending}
        />
      ),
    [
      isAdmin,
      teamId,
      practiceActions.handleEdit,
      practiceActions.handleDelete,
      practiceActions.handleAddLog,
      practiceActions.deletingId,
      practiceActions.isDeletePending,
      competitionActions.handleEdit,
      competitionActions.handleDelete,
      competitionActions.handleEntry,
      competitionActions.handleRecord,
      competitionActions.handleOpenRecords,
      competitionActions.deletingId,
      competitionActions.isDeletePending,
    ],
  );

  const keyExtractor = useCallback((item: ScheduleItem) => item.key, []);

  const isLoading = practicesQuery.isLoading || competitionsQuery.isLoading;
  const isError = practicesQuery.isError || competitionsQuery.isError;
  const refetchAll = useCallback(() => {
    void practicesQuery.refetch();
    void competitionsQuery.refetch();
  }, [practicesQuery, competitionsQuery]);

  const filterBar = (
    <View style={styles.filterBar}>
      <View style={styles.chipsWrapper}>
        {/* 背景がグレーなので、白いフェードを重ねる ChipScrollRow ではなく素の横スクロールにする
            (日本語なら 360dp 幅でも収まる。訳語が長い言語だけスクロールになる) */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsContent}
        >
          {KINDS.map(({ id, labelKey }) => {
            const isActive = kind === id;
            return (
              <Pressable
                key={id}
                style={[styles.chip, isActive && styles.chipActive]}
                onPress={() => setKind(id)}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
                testID={`team-schedule-kind-${id}`}
              >
                <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                  {t(labelKey)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
      {/* 「過去」は種類の択一とは別のオン/オフ。右端に寄せ、時計アイコンと塗りの色で区別する */}
      <Pressable
        style={[styles.pastToggle, showPast && styles.pastToggleOn]}
        onPress={() => setShowPast((prev) => !prev)}
        accessibilityRole="switch"
        accessibilityState={{ checked: showPast }}
        accessibilityLabel={t("teams.mobile.schedule.filterPast")}
        testID="team-schedule-past-toggle"
      >
        <Feather name="clock" size={13} color={showPast ? "#FFFFFF" : "#4B5563"} />
        <Text style={[styles.pastToggleText, showPast && styles.pastToggleTextOn]}>
          {t("teams.mobile.schedule.filterPast")}
        </Text>
      </Pressable>
      {isAdmin && (
        <View style={styles.adminActions}>
          <Pressable
            style={styles.bulkRegisterButton}
            onPress={practiceActions.handleBulkRegister}
            accessibilityRole="button"
            accessibilityLabel={t("teamsAdmin.tabs.bulkRegister")}
            hitSlop={4}
          >
            <Feather name="upload" size={16} color="#2563EB" />
          </Pressable>
          <Pressable
            style={styles.addButton}
            onPress={handleAddPress}
            accessibilityRole="button"
            testID="team-schedule-add"
          >
            <Feather name="plus" size={16} color="#FFFFFF" />
            <Text style={styles.addButtonText}>{t("teams.mobile.schedule.add")}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );

  let body: React.ReactNode;
  if (isLoading) {
    body = (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.loadingText}>{t("teams.mobile.loadingShort")}</Text>
      </View>
    );
  } else if (isError) {
    body = (
      <View style={styles.centerContainer}>
        <Feather name="alert-circle" size={40} color="#DC2626" />
        <Text style={styles.errorText}>{t("teams.mobile.schedule.fetchFailed")}</Text>
        <Pressable style={styles.retryButton} onPress={refetchAll}>
          <Text style={styles.retryButtonText}>{t("common.retry")}</Text>
        </Pressable>
      </View>
    );
  } else if (items.length === 0) {
    body = (
      <View style={styles.centerContainer}>
        <Feather name="calendar" size={40} color="#D1D5DB" />
        <Text style={styles.emptyText}>{t(EMPTY_KEYS[showPast ? "past" : "upcoming"][kind])}</Text>
      </View>
    );
  } else {
    body = (
      <FlatList
        // チームタブは OS のタブバーの上に出るので、末尾がタブバーに隠れないよう OS に下端の余白を足させる
        contentInsetAdjustmentBehavior="automatic"
        data={items}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        extraData={[practiceActions.deletingId, competitionActions.deletingId]}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    );
  }

  return (
    <View style={styles.container}>
      {filterBar}
      {body}
      {competitionActions.modals}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  filterBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingLeft: 12,
    paddingRight: 12,
    paddingTop: 4,
    paddingBottom: 4,
  },
  chipsWrapper: {
    flex: 1,
    minWidth: 0,
  },
  chipsContent: {
    flexDirection: "row",
    gap: 6,
    paddingVertical: 2,
  },
  // チームタブ内のピル (メンバー表のグループ表示) と同じ見た目に揃える
  chip: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#D1D5DB",
    backgroundColor: "#FFFFFF",
  },
  chipActive: {
    backgroundColor: "#DBEAFE",
    borderColor: "#93C5FD",
  },
  chipText: {
    fontSize: 12,
    color: "#374151",
  },
  chipTextActive: {
    color: "#1D4ED8",
    fontWeight: "600",
  },
  // 「過去」スイッチ。種類のチップ (青系) と見分けがつくよう、角を少し立てて
  // オンのときはグレーで塗る
  pastToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#9CA3AF",
    borderStyle: "dashed",
    backgroundColor: "#FFFFFF",
  },
  pastToggleOn: {
    backgroundColor: "#4B5563",
    borderColor: "#4B5563",
    borderStyle: "solid",
  },
  pastToggleText: {
    fontSize: 12,
    color: "#4B5563",
    fontWeight: "600",
  },
  pastToggleTextOn: {
    color: "#FFFFFF",
  },
  adminActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  bulkRegisterButton: {
    width: 34,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#2563EB",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#2563EB",
  },
  addButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  listContent: {
    padding: 12,
    paddingTop: 4,
    gap: 8,
  },
  centerContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 8,
  },
  loadingText: {
    fontSize: 14,
    color: "#6B7280",
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
  emptyText: {
    fontSize: 14,
    color: "#9CA3AF",
  },
});
