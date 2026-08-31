import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthProvider";
import { formatTimeBest } from "@/utils/formatters";
import { SlideUpModal } from "@/components/ui/SlideUpModal";
import { LapTimeDisplay } from "@/components/records/LapTimeDisplay";
import {
  groupRecordsByStyle,
  buildDisplaySplits,
  getRecordUserName,
  type CompetitionDetail,
  type RecordEntry,
  type RankedRecordEntry,
  type SplitTimeEntry,
} from "@/utils/teamCompetitionRecords";

interface TeamCompetitionRecordsModalProps {
  visible: boolean;
  onClose: () => void;
  competitionId: string;
  competitionTitle: string;
}

function ExpandableSplitTimes({
  splitTimes,
  raceDistance,
  recordTime,
}: {
  splitTimes: SplitTimeEntry[];
  raceDistance: number;
  recordTime: number;
}) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  const formattedSplits = useMemo(
    () => buildDisplaySplits(splitTimes, raceDistance, recordTime),
    [splitTimes, raceDistance, recordTime],
  );

  if (formattedSplits.length === 0) return null;

  return (
    <View style={styles.splitToggleWrap}>
      <Pressable
        style={styles.splitToggleButton}
        onPress={() => setIsOpen((prev) => !prev)}
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen }}
      >
        <Feather name={isOpen ? "chevron-up" : "chevron-down"} size={12} color="#2563EB" />
        <Text style={styles.splitToggleText}>
          {t("teams.competitionRecordsModal.splitTimesLabel", { count: formattedSplits.length })}
        </Text>
      </Pressable>
      {isOpen && <LapTimeDisplay splitTimes={formattedSplits} raceDistance={raceDistance} />}
    </View>
  );
}

function RecordRow({
  record,
  raceDistance,
  highlight,
}: {
  record: RankedRecordEntry;
  raceDistance: number;
  highlight: boolean;
}) {
  const { t } = useTranslation();
  const userName = getRecordUserName(record.users, t("teams.competitionRecordsModal.unknownUser"));
  const hasSplits = record.split_times && record.split_times.length > 0;
  const subParts = [
    record.reaction_time != null
      ? `${t("teams.competitionRecordsModal.rtLabel")} ${record.reaction_time.toFixed(2)}`
      : null,
    record.note || null,
  ].filter((part): part is string => !!part);

  return (
    <View style={styles.recordRowWrap}>
      <View style={styles.recordRow}>
        <Text style={styles.recordRank}>{record.rank}</Text>
        <View style={styles.recordNameBlock}>
          <Text style={styles.recordName} numberOfLines={1}>
            {userName}
          </Text>
          {subParts.length > 0 && (
            <Text style={styles.recordSubText} numberOfLines={1}>
              {subParts.join(" · ")}
            </Text>
          )}
        </View>
        <Text style={[styles.recordTimeText, highlight && styles.recordTimeTextTop]}>
          {formatTimeBest(record.time)}
        </Text>
      </View>
      {hasSplits && (
        <ExpandableSplitTimes
          splitTimes={record.split_times}
          raceDistance={raceDistance}
          recordTime={record.time}
        />
      )}
    </View>
  );
}

/**
 * チーム大会の記録一覧モーダル (admin 専用)。
 * web `apps/web/components/team/TeamCompetitionRecordsModal.tsx` を仕様の正として移植。
 * competitions/records を2クエリ並列取得し、種目別グルーピング + 個人/リレー独立採番で表示する。
 */
export function TeamCompetitionRecordsModal({
  visible,
  onClose,
  competitionId,
  competitionTitle,
}: TeamCompetitionRecordsModalProps) {
  const { supabase } = useAuth();
  const { t } = useTranslation();

  const [competition, setCompetition] = useState<CompetitionDetail | null>(null);
  const [records, setRecords] = useState<RecordEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [compResult, recordsResult] = await Promise.all([
        supabase
          .from("competitions")
          .select("id, title, date, place, pool_type, note")
          .eq("id", competitionId)
          .single(),
        supabase
          .from("records")
          .select(
            `
            id,
            user_id,
            style_id,
            time,
            reaction_time,
            is_relaying,
            note,
            users!records_user_id_fkey (
              name
            ),
            styles (
              id,
              name_jp,
              name,
              style,
              distance
            ),
            split_times (
              id,
              distance,
              split_time
            )
          `,
          )
          .eq("competition_id", competitionId)
          .order("time", { ascending: true }),
      ]);

      if (compResult.error) throw compResult.error;
      if (recordsResult.error) throw recordsResult.error;

      setCompetition(compResult.data as CompetitionDetail);
      setRecords((recordsResult.data || []) as unknown as RecordEntry[]);
    } catch (err) {
      console.error("TeamCompetitionRecordsModal: failed to load records", err);
      setError(t("teams.competitionRecordsModal.loadError"));
    } finally {
      setLoading(false);
    }
  }, [supabase, competitionId, t]);

  useEffect(() => {
    if (visible) {
      loadData();
    }
  }, [visible, loadData]);

  const recordsByStyle = useMemo(() => groupRecordsByStyle(records), [records]);

  const poolTypeLabel =
    competition?.pool_type === 1
      ? t("teams.competitionRecordsModal.poolTypeLong")
      : t("teams.competitionRecordsModal.poolTypeShort");

  return (
    <SlideUpModal visible={visible} onClose={onClose} overlayColor="rgba(0,0,0,0.4)" sheetStyle={styles.sheet}>
      <View style={styles.header}>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {competitionTitle}
          {t("teams.competitionRecordsModal.titleSuffix")}
        </Text>
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t("common.close")}
          style={styles.closeIcon}
        >
          <Feather name="x" size={22} color="#6B7280" />
        </Pressable>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
      >
        {loading && (
          <View style={styles.centerBlock}>
            <ActivityIndicator size="large" color="#2563EB" />
            <Text style={styles.infoText}>{t("teams.competitionRecordsModal.loading")}</Text>
          </View>
        )}

        {!loading && error && (
          <View style={styles.errorBlock}>
            <Feather name="alert-circle" size={32} color="#DC2626" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {!loading && !error && (
          <>
            {competition && (
              <View style={styles.metaRow}>
                {competition.place && (
                  <View style={styles.metaItem}>
                    <Feather name="map-pin" size={14} color="#6B7280" />
                    <Text style={styles.metaText}>{competition.place}</Text>
                  </View>
                )}
                <Text style={styles.metaText}>{poolTypeLabel}</Text>
                {competition.note && (
                  <View style={styles.metaItem}>
                    <Feather name="edit-3" size={14} color="#6B7280" />
                    <Text style={styles.metaText} numberOfLines={2}>
                      {competition.note}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {records.length === 0 && (
              <View style={styles.emptyBlock}>
                <Feather name="inbox" size={36} color="#D1D5DB" />
                <Text style={styles.emptyText}>{t("teams.competitionRecordsModal.empty")}</Text>
              </View>
            )}

            {recordsByStyle.map((group) => (
              <View key={group.style.id} style={styles.styleGroup}>
                <View style={styles.styleGroupHeader}>
                  <View style={styles.styleGroupBar} />
                  <Text style={styles.styleGroupTitle}>{group.style.name_jp}</Text>
                  <Text style={styles.styleGroupCount}>
                    {t("common.listToolbar.itemCount", {
                      count: group.individual.length + group.relay.length,
                    })}
                  </Text>
                </View>

                <View style={styles.recordsTable}>
                  {group.individual.map((record) => (
                    <RecordRow
                      key={record.id}
                      record={record}
                      raceDistance={group.style.distance}
                      highlight={record.rank === 1}
                    />
                  ))}

                  {group.relay.length > 0 && (
                    <>
                      <View style={styles.relayHeaderRow}>
                        <Text style={styles.relayHeaderText}>
                          {t("teams.competitionRecordsModal.relay")}
                        </Text>
                      </View>
                      {group.relay.map((record) => (
                        <RecordRow
                          key={record.id}
                          record={record}
                          raceDistance={group.style.distance}
                          highlight={false}
                        />
                      ))}
                    </>
                  )}
                </View>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </SlideUpModal>
  );
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
  headerTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  closeIcon: {
    padding: 4,
  },
  // BottomSheet.tsx / WaPointsCompareModal.tsx と同様、ScrollView 自体はコンテンツサイズの
  // ままにする (flexGrow: 0)。挙動は変えず明示するだけ。
  scrollView: {
    flexGrow: 0,
  },
  body: {
    padding: 16,
    gap: 16,
  },
  centerBlock: {
    alignItems: "center",
    paddingVertical: 32,
    gap: 12,
  },
  infoText: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
  },
  errorBlock: {
    alignItems: "center",
    paddingVertical: 32,
    gap: 12,
  },
  errorText: {
    fontSize: 14,
    color: "#DC2626",
    textAlign: "center",
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 12,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 1,
  },
  metaText: {
    fontSize: 13,
    color: "#6B7280",
    flexShrink: 1,
  },
  emptyBlock: {
    alignItems: "center",
    paddingVertical: 32,
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    color: "#6B7280",
    textAlign: "center",
  },
  styleGroup: {
    backgroundColor: "#EFF6FF",
    borderRadius: 8,
    padding: 12,
    gap: 10,
  },
  styleGroupHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  styleGroupBar: {
    width: 3,
    height: 16,
    borderRadius: 2,
    backgroundColor: "#2563EB",
  },
  styleGroupTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#1E3A8A",
    flex: 1,
  },
  styleGroupCount: {
    fontSize: 12,
    color: "#2563EB",
  },
  recordsTable: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#DBEAFE",
    overflow: "hidden",
  },
  recordRowWrap: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#EFF6FF",
  },
  recordRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  recordRank: {
    width: 20,
    fontSize: 13,
    fontWeight: "600",
    color: "#374151",
    textAlign: "center",
  },
  recordNameBlock: {
    flex: 1,
    gap: 2,
  },
  recordName: {
    fontSize: 14,
    color: "#111827",
  },
  recordSubText: {
    fontSize: 12,
    color: "#9CA3AF",
  },
  recordTimeText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
    fontVariant: ["tabular-nums"],
  },
  recordTimeTextTop: {
    color: "#2563EB",
    fontWeight: "700",
  },
  relayHeaderRow: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#F9FAFB",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#EFF6FF",
  },
  relayHeaderText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#6B7280",
  },
  splitToggleWrap: {
    marginTop: 4,
    marginLeft: 30,
  },
  splitToggleButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
  },
  splitToggleText: {
    fontSize: 12,
    color: "#2563EB",
  },
});
