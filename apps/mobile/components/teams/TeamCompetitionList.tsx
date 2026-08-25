import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  Alert,
  ActivityIndicator,
} from "react-native";
import { format } from "date-fns";
import { Feather } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthProvider";
import {
  useTeamCompetitionsQuery,
  useDeleteTeamCompetitionMutation,
} from "@apps/shared/hooks/queries/teams";
import type { Competition } from "@swim-hub/shared/types";
import type { MainStackParamList } from "@/navigation/types";
import { useDateLocale } from "@/hooks/useDateLocale";
import { formatDate, isCompetitionDateInPast } from "@apps/shared/utils/date";
import { resolveEntryStatus } from "@apps/shared/utils/entryStatus";
import { TeamCompetitionEntryModal } from "./TeamCompetitionEntryModal";

type NavigationProp = NativeStackNavigationProp<MainStackParamList>;

type EntryStatus = "before" | "open" | "closed";

const ENTRY_STATUS_BADGE: Record<EntryStatus, { container: object; text: { color: string } }> = {
  before: { container: { backgroundColor: "#F3F4F6" }, text: { color: "#374151" } },
  open: { container: { backgroundColor: "#DCFCE7" }, text: { color: "#166534" } },
  closed: { container: { backgroundColor: "#FEE2E2" }, text: { color: "#991B1B" } },
};

interface TeamCompetitionListProps {
  teamId: string;
  isAdmin: boolean;
}

const CompetitionItem = React.memo(function CompetitionItem({
  competition,
  isAdmin,
  onEdit,
  onDelete,
  onEntry,
  onRecord,
  onEntryBulk,
}: {
  competition: Competition;
  isAdmin: boolean;
  onEdit: (competition: Competition) => void;
  onDelete: (competition: Competition) => void;
  onEntry: (competition: Competition) => void;
  onRecord: (competition: Competition) => void;
  onEntryBulk: (competition: Competition) => void;
}) {
  const { t } = useTranslation();
  const dateLocale = useDateLocale();
  const poolLabel =
    competition.pool_type === 1
      ? t("teams.mobile.poolTypeLong")
      : t("teams.mobile.poolTypeShort");
  const entryStatus = resolveEntryStatus(competition.date, competition.entry_status);
  const badge = ENTRY_STATUS_BADGE[entryStatus];
  const entryStatusLabel = t(`teams.competitions.entryStatus.${entryStatus}`);
  // 過去大会 (昨日以前) はエントリー導線を無効化する (web とのパリティ)。
  // 今日・未来日は表示/タップ可能のまま維持する。
  const isPastCompetition = isCompetitionDateInPast(competition.date);

  return (
    <View style={styles.item}>
      <Pressable
        onPress={isAdmin ? () => onEdit(competition) : undefined}
        disabled={!isAdmin}
        accessibilityRole={isAdmin ? "button" : undefined}
      >
        <View style={styles.itemHeader}>
          <View style={styles.itemTitleRow}>
            <Feather name="award" size={14} color="#2563EB" />
            <Text style={styles.itemTitle} numberOfLines={1}>
              {competition.title || t("teams.mobile.fallbackCompetitionTitle")}
            </Text>
          </View>
          {isAdmin && (
            <View style={styles.itemActions}>
              <Pressable
                style={styles.editButton}
                onPress={() => onEdit(competition)}
                accessibilityRole="button"
                accessibilityLabel={t("common.edit")}
              >
                <Feather name="edit-2" size={14} color="#2563EB" />
              </Pressable>
              <Pressable
                style={styles.deleteButton}
                onPress={() => onDelete(competition)}
                accessibilityRole="button"
                accessibilityLabel={t("common.delete")}
              >
                <Feather name="trash-2" size={14} color="#DC2626" />
              </Pressable>
            </View>
          )}
        </View>

        <View style={styles.itemRow}>
          <Feather name="calendar" size={12} color="#9CA3AF" />
          <Text style={styles.itemDate}>{formatDate(competition.date, "longWithWeekday", dateLocale)}</Text>
        </View>

        {competition.place && (
          <View style={styles.itemRow}>
            <Feather name="map-pin" size={12} color="#9CA3AF" />
            <Text style={styles.itemPlace}>{competition.place}</Text>
          </View>
        )}

        <View style={styles.itemRow}>
          <Feather name="droplet" size={12} color="#9CA3AF" />
          <Text style={styles.itemMeta}>{poolLabel}</Text>
        </View>

        {competition.note && (
          <Text style={styles.itemNote} numberOfLines={2}>{competition.note}</Text>
        )}
      </Pressable>
      <View style={styles.statusRow}>
        {isAdmin && !isPastCompetition ? (
          <Pressable
            style={[styles.entryStatusBadge, styles.entryStatusBadgeAdmin, badge.container]}
            onPress={() => onEntry(competition)}
            accessibilityRole="button"
            accessibilityLabel={t("teams.mobile.teamCompetitionList.entryStatusChangeAria", {
              status: entryStatusLabel,
            })}
            hitSlop={{ top: 16, bottom: 16, left: 8, right: 8 }}
          >
            <Text style={[styles.entryStatusBadgeText, badge.text]}>{entryStatusLabel}</Text>
            <Feather name="chevron-down" size={12} color={badge.text.color} />
          </Pressable>
        ) : (
          <View style={[styles.entryStatusBadge, badge.container]}>
            <Text style={[styles.entryStatusBadgeText, badge.text]}>{entryStatusLabel}</Text>
          </View>
        )}
      </View>
      <View style={styles.entryRecordRow}>
        {!isAdmin && (
          <>
            {!isPastCompetition && (
              <Pressable
                style={styles.entryButton}
                onPress={() => onEntry(competition)}
                accessibilityRole="button"
                accessibilityLabel={t("teams.mobile.teamCompetitionList.entryButton")}
              >
                <Feather name="log-in" size={13} color="#2563EB" />
                <Text style={styles.entryButtonText}>{t("teams.mobile.teamCompetitionList.entryButton")}</Text>
              </Pressable>
            )}
            <Pressable
              style={styles.recordButton}
              onPress={() => onRecord(competition)}
              accessibilityRole="button"
              accessibilityLabel={t("teams.mobile.teamCompetitionList.recordButton")}
            >
              <Feather name="clock" size={13} color="#059669" />
              <Text style={styles.recordButtonText}>{t("teams.mobile.teamCompetitionList.recordButton")}</Text>
            </Pressable>
          </>
        )}
        {isAdmin && (
          <>
            <Pressable
              style={styles.recordButton}
              onPress={() => onRecord(competition)}
              accessibilityRole="button"
              accessibilityLabel={t("teams.mobile.teamCompetitionList.recordBulkButton")}
            >
              <Feather name="clock" size={13} color="#059669" />
              <Text style={styles.recordButtonText}>
                {t("teams.mobile.teamCompetitionList.recordBulkButton")}
              </Text>
            </Pressable>
            <Pressable
              style={styles.entryBulkButton}
              onPress={() => onEntryBulk(competition)}
              accessibilityRole="button"
              accessibilityLabel={t("teams.mobile.teamCompetitionList.entryBulkButton")}
            >
              <Feather name="users" size={13} color="#7C3AED" />
              <Text style={styles.entryBulkButtonText}>
                {t("teams.mobile.teamCompetitionList.entryBulkButton")}
              </Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
});

export function TeamCompetitionList({ teamId, isAdmin }: TeamCompetitionListProps) {
  const { supabase } = useAuth();
  const navigation = useNavigation<NavigationProp>();
  const { t } = useTranslation();

  const { data: competitions, isLoading, isError, error, refetch } = useTeamCompetitionsQuery(supabase, teamId);
  const deleteMutation = useDeleteTeamCompetitionMutation(supabase);

  // エントリー受付状況モーダルの対象大会
  const [entryModalCompetition, setEntryModalCompetition] = useState<Competition | null>(null);

  const handleAdd = useCallback(() => {
    navigation.navigate("CompetitionForm", {
      teamId,
      date: format(new Date(), "yyyy-MM-dd"),
    });
  }, [navigation, teamId]);

  const handleEdit = useCallback((competition: Competition) => {
    navigation.navigate("CompetitionForm", {
      competitionId: competition.id,
      date: competition.date,
      teamId,
    });
  }, [navigation, teamId]);

  // 「エントリー」ボタン: Web パリティで受付状況管理モーダルを開く
  const handleEntry = useCallback((competition: Competition) => {
    setEntryModalCompetition(competition);
  }, []);

  // モーダル内の「種目をエントリー」: 既存の選手セルフエントリー画面へ遷移（機能維持）。
  // web は受付中(open)の大会のみセルフエントリーに到達するため(useTeamEntry.ts:59-64)、
  // 受付中以外では導線を出さない（モーダル側で非表示だが二重ガード）。
  const handleSelfEntry = useCallback((competition: Competition, currentStatus: EntryStatus) => {
    // モーダル内の現在 status（楽観的更新後の値）でガードする。
    // prop の competition.entry_status は再フェッチ前は stale なため使わない（dead-click 防止）。
    if (currentStatus !== "open") return;
    setEntryModalCompetition(null);
    navigation.navigate("EntryForm", {
      competitionId: competition.id,
      date: competition.date,
      teamId,
    });
  }, [navigation, teamId]);

  // 「エントリー代理入力」ボタン: admin 専用。管理者代理一括入力画面へ遷移する。
  // handleEntry（受付状況管理モーダル）/ handleSelfEntry（本人用エントリー導線）とは
  // 独立した新規ボタンであり、それらの既存動作には影響しない。
  const handleEntryBulk = useCallback((competition: Competition) => {
    if (isAdmin) {
      navigation.navigate("TeamEntryBulkForm", {
        competitionId: competition.id,
        teamId,
      });
    }
  }, [navigation, teamId, isAdmin]);

  const handleRecord = useCallback((competition: Competition) => {
    // admin は一括代理入力画面へ、非 admin は個人フロー(CompetitionTabForm)へ分岐。
    // team_id の有無に関わらず既存レコードを読み込む CompetitionTabForm に統一する
    // (useDayDetailHandlers.handleEditRecord と同じ方針。RecordLogForm は recordId 未指定だと
    // 既存レコードを検索せず重複作成を招くため使わない)。
    if (isAdmin) {
      navigation.navigate("TeamRecordBulkForm", {
        competitionId: competition.id,
        teamId,
      });
      return;
    }
    navigation.navigate("CompetitionTabForm", {
      competitionId: competition.id,
      date: competition.date,
      teamId,
      initialTab: "record",
    });
  }, [navigation, teamId, isAdmin]);

  const handleDelete = useCallback((competition: Competition) => {
    Alert.alert(
      t("teams.mobile.deleteConfirmTitle"),
      t("teams.mobile.teamCompetitionList.deleteConfirm"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: async () => {
            try {
              await deleteMutation.mutateAsync({ id: competition.id, teamId });
            } catch {
              Alert.alert(t("common.error"), t("teams.mobile.teamCompetitionList.deleteFailed"), [
                { text: "OK" },
              ]);
            }
          },
        },
      ],
    );
  }, [deleteMutation, teamId, t]);

  const renderItem = useCallback(({ item }: { item: Competition }) => (
    <CompetitionItem
      competition={item}
      isAdmin={isAdmin}
      onEdit={handleEdit}
      onDelete={handleDelete}
      onEntry={handleEntry}
      onRecord={handleRecord}
      onEntryBulk={handleEntryBulk}
    />
  ), [isAdmin, handleEdit, handleDelete, handleEntry, handleRecord, handleEntryBulk]);

  const keyExtractor = useCallback((item: Competition) => item.id, []);

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.loadingText}>{t("teams.mobile.loadingShort")}</Text>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={styles.centerContainer}>
        <Feather name="alert-circle" size={40} color="#DC2626" />
        <Text style={styles.errorText}>
          {error?.message || t("teams.mobile.teamCompetitionList.fetchFailed")}
        </Text>
        <Pressable style={styles.retryButton} onPress={() => refetch()}>
          <Text style={styles.retryButtonText}>{t("common.retry")}</Text>
        </Pressable>
      </View>
    );
  }

  const items = competitions ?? [];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>
          {t("teams.mobile.teamCompetitionList.title", { count: items.length })}
        </Text>
        {isAdmin && (
          <Pressable style={styles.addButton} onPress={handleAdd} accessibilityRole="button">
            <Feather name="plus" size={16} color="#FFFFFF" />
            <Text style={styles.addButtonText}>
              {t("teams.mobile.teamCompetitionList.addButton")}
            </Text>
          </Pressable>
        )}
      </View>

      {items.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Feather name="award" size={40} color="#D1D5DB" />
          <Text style={styles.emptyText}>{t("teams.mobile.teamCompetitionList.empty")}</Text>
          {isAdmin && (
            <Pressable style={styles.emptyAddButton} onPress={handleAdd}>
              <Text style={styles.emptyAddButtonText}>
                {t("teams.mobile.teamCompetitionList.addButton")}
              </Text>
            </Pressable>
          )}
        </View>
      ) : (
        <FlatList
          data={items}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      {entryModalCompetition && (
        <TeamCompetitionEntryModal
          visible={entryModalCompetition !== null}
          onClose={() => setEntryModalCompetition(null)}
          competitionId={entryModalCompetition.id}
          competitionTitle={
            entryModalCompetition.title || t("teams.mobile.fallbackCompetitionTitle")
          }
          teamId={teamId}
          entryStatus={resolveEntryStatus(
            entryModalCompetition.date,
            entryModalCompetition.entry_status,
          )}
          // 現在の導線は過去日で isPastCompetition によりゲート済みのため true にはならないが、
          // 直接呼び出し（テスト等）に対する保険として渡し続ける。
          isPastDate={isCompetitionDateInPast(entryModalCompetition.date)}
          isAdmin={isAdmin}
          onSelfEntry={(currentStatus) => handleSelfEntry(entryModalCompetition, currentStatus)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#EFF6FF",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  title: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#2563EB",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  addButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  listContent: {
    padding: 12,
    gap: 8,
  },
  item: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    padding: 12,
    gap: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 1,
    elevation: 1,
  },
  itemHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  itemTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  itemTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
    flex: 1,
  },
  entryStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    flexShrink: 0,
  },
  entryStatusBadgeAdmin: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  entryStatusBadgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  itemActions: {
    flexDirection: "row",
    gap: 8,
  },
  editButton: {
    padding: 4,
  },
  deleteButton: {
    padding: 4,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  itemDate: {
    fontSize: 13,
    color: "#374151",
  },
  itemPlace: {
    fontSize: 12,
    color: "#6B7280",
  },
  itemMeta: {
    fontSize: 12,
    color: "#6B7280",
  },
  itemNote: {
    fontSize: 12,
    color: "#9CA3AF",
    marginTop: 4,
  },
  statusRow: {
    flexDirection: "row",
    marginTop: 8,
  },
  entryRecordRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
  },
  entryButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#2563EB",
  },
  entryButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#2563EB",
  },
  recordButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#059669",
  },
  recordButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#059669",
  },
  entryBulkButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#7C3AED",
  },
  entryBulkButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#7C3AED",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
    gap: 12,
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
    backgroundColor: "#2563EB",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    color: "#9CA3AF",
    textAlign: "center",
  },
  emptyAddButton: {
    backgroundColor: "#2563EB",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 4,
  },
  emptyAddButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});
