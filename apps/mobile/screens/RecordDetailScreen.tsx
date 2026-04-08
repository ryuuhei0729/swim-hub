import React, { useMemo, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable, Alert, Platform } from "react-native";
import { useRoute, useNavigation, RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { Feather } from "@expo/vector-icons";
import { format } from "date-fns";
import { ja } from "date-fns/locale";
import { useAuth } from "@/contexts/AuthProvider";
import { useRecordsQuery, useDeleteRecordMutation } from "@apps/shared/hooks/queries/records";
import { formatTime } from "@/utils/formatters";
import { LoadingSpinner } from "@/components/layout/LoadingSpinner";
import { ErrorView } from "@/components/layout/ErrorView";
import { VideoPlayer } from "@/components/shared/VideoPlayer";
import type { MainStackParamList } from "@/navigation/types";

type RecordDetailScreenRouteProp = RouteProp<MainStackParamList, "RecordDetail">;
type RecordDetailScreenNavigationProp = NativeStackNavigationProp<MainStackParamList>;

/**
 * 大会記録詳細画面
 */
export const RecordDetailScreen: React.FC = () => {
  const route = useRoute<RecordDetailScreenRouteProp>();
  const navigation = useNavigation<RecordDetailScreenNavigationProp>();
  const { recordId } = route.params;
  const { supabase } = useAuth();

  const deleteMutation = useDeleteRecordMutation(supabase);
  const [isDeleting, setIsDeleting] = useState(false);
  const [splitTab, setSplitTab] = useState<"race" | "all">("race");

  const handleEdit = () => {
    if (record?.competition_id && record?.competition?.date) {
      navigation.navigate("RecordLogForm", {
        competitionId: record.competition_id,
        recordId,
        date: record.competition.date,
      });
    } else {
      navigation.navigate("RecordForm", { recordId });
    }
  };

  const handleDelete = () => {
    if (Platform.OS === "web") {
      const confirmed = window.confirm("この大会記録を削除しますか？\nこの操作は取り消せません。");
      if (!confirmed) return;
      executeDelete();
    } else {
      Alert.alert(
        "削除確認",
        "この大会記録を削除しますか？\nこの操作は取り消せません。",
        [
          { text: "キャンセル", style: "cancel" },
          { text: "削除", style: "destructive", onPress: executeDelete },
        ],
        { cancelable: true },
      );
    }
  };

  const executeDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteMutation.mutateAsync(recordId);
      navigation.goBack();
    } catch (error) {
      console.error("削除エラー:", error);
      if (Platform.OS === "web") {
        window.alert(error instanceof Error ? error.message : "削除に失敗しました");
      } else {
        Alert.alert("エラー", error instanceof Error ? error.message : "削除に失敗しました", [
          { text: "OK" },
        ]);
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const {
    records = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useRecordsQuery(supabase, {
    page: 1,
    pageSize: 1000,
    enableRealtime: true,
  });

  const record = useMemo(() => {
    return records.find((r) => r.id === recordId);
  }, [records, recordId]);

  // スプリットタイムを距離順にソート
  const sortedSplitTimes = useMemo(() => {
    if (!record) return [];
    return [...(record.split_times || [])].sort((a, b) => a.distance - b.distance);
  }, [record]);

  // ゴールタイムを含む表示用スプリットデータ
  const displaySplitTimes = useMemo(() => {
    if (!record) return [];
    const base = sortedSplitTimes.map((st) => ({
      distance: st.distance,
      split_time: st.split_time,
      id: st.id,
    }));
    const raceDistance = record.style?.distance;
    if (raceDistance && record.time > 0) {
      const hasGoal = base.some((st) => st.distance === raceDistance);
      if (!hasGoal) {
        base.push({ distance: raceDistance, split_time: record.time, id: "goal" });
      }
    }
    return base;
  }, [sortedSplitTimes, record]);

  // 距離別Lap用: 25m刻みのみフィルタ
  const raceSplitTimes = useMemo(() => {
    return displaySplitTimes.filter((st) => st.distance % 25 === 0 && st.split_time > 0);
  }, [displaySplitTimes]);

  // 距離別Lapのカラム間隔を決定
  const lapIntervals = useMemo(() => {
    const raceDistance = record?.style?.distance;
    if (!raceDistance) return [];
    const intervals: number[] = [];
    if (raceDistance >= 25 && raceDistance !== 25) intervals.push(25);
    if (raceDistance >= 50 && raceDistance !== 50) intervals.push(50);
    return intervals;
  }, [record?.style?.distance]);

  // データが1つもないintervalは列ごと非表示にする
  const visibleLapIntervals = useMemo(() => {
    return lapIntervals.filter((interval) =>
      raceSplitTimes.some((st) => {
        if (st.distance % interval !== 0) return false;
        const prevDistance = st.distance - interval;
        if (prevDistance === 0) return true;
        const prevSplit = raceSplitTimes.find((s) => s.distance === prevDistance);
        return prevSplit != null && prevSplit.split_time > 0;
      }),
    );
  }, [lapIntervals, raceSplitTimes]);

  // 距離別Lapの各行のラップタイム計算
  const raceLapData = useMemo(() => {
    return raceSplitTimes.map((st) => {
      const lapTimes: Record<number, number | null> = {};
      for (const interval of lapIntervals) {
        if (st.distance % interval === 0) {
          const prevDistance = st.distance - interval;
          if (prevDistance === 0) {
            lapTimes[interval] = st.split_time;
          } else {
            const prevSplit = raceSplitTimes.find((s) => s.distance === prevDistance);
            lapTimes[interval] =
              prevSplit && prevSplit.split_time > 0 ? st.split_time - prevSplit.split_time : null;
          }
        } else {
          lapTimes[interval] = null;
        }
      }
      return { ...st, lapTimes };
    });
  }, [raceSplitTimes, lapIntervals]);

  // All Lap計算（各区間のラップ）
  const allLapTimes = useMemo(() => {
    if (displaySplitTimes.length === 0) return [];
    const laps: { fromDistance: number; toDistance: number; lapTime: number }[] = [];
    if (displaySplitTimes[0].distance > 0) {
      laps.push({
        fromDistance: 0,
        toDistance: displaySplitTimes[0].distance,
        lapTime: displaySplitTimes[0].split_time,
      });
    }
    for (let i = 1; i < displaySplitTimes.length; i++) {
      const prev = displaySplitTimes[i - 1];
      const curr = displaySplitTimes[i];
      if (prev.split_time > 0 && curr.split_time > 0) {
        laps.push({
          fromDistance: prev.distance,
          toDistance: curr.distance,
          lapTime: curr.split_time - prev.split_time,
        });
      }
    }
    return laps;
  }, [displaySplitTimes]);

  if (isError && error) {
    return (
      <View style={styles.container}>
        <ErrorView
          message={error.message || "大会記録の取得に失敗しました"}
          onRetry={() => refetch()}
          fullScreen
        />
      </View>
    );
  }

  if (isLoading && !record) {
    return (
      <View style={styles.container}>
        <LoadingSpinner fullScreen message="大会記録を読み込み中..." />
      </View>
    );
  }

  if (!record) {
    return (
      <View style={styles.container}>
        <ErrorView message="大会記録が見つかりませんでした" onRetry={() => refetch()} fullScreen />
      </View>
    );
  }

  const competitionName = record.competition?.title || "大会";
  const recordDate = record.competition?.date || record.created_at;
  const formattedDate = format(new Date(recordDate), "yyyy年M月d日(E)", { locale: ja });
  const styleName = record.style?.name || record.style?.name_jp || "不明";
  const formattedTime = formatTime(record.time);
  const poolType = record.competition?.pool_type === 0 ? "短水路(25m)" : "長水路(50m)";

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* 大会ヘッダー */}
      <View style={styles.competitionHeader}>
        <View style={styles.competitionTitleRow}>
          <Text style={styles.trophyIcon}>🏆</Text>
          <Text style={styles.competitionName} numberOfLines={2}>
            {competitionName}
          </Text>
        </View>
        <Text style={styles.date}>{formattedDate}</Text>
        <View style={styles.metaRow}>
          {record.competition?.place && (
            <View style={styles.metaItem}>
              <Text style={styles.metaText}>📍 {record.competition.place}</Text>
            </View>
          )}
          <View style={styles.metaItem}>
            <Text style={styles.metaText}>🏊‍♀️ {poolType}</Text>
          </View>
        </View>
      </View>

      {/* 記録カード */}
      <View style={styles.recordCard}>
        {/* ラベル行 */}
        <View style={styles.recordLabelRow}>
          <Text style={styles.recordLabel}>種目</Text>
          <Text style={styles.recordLabel}>タイム</Text>
          <Text style={[styles.recordLabel, { textAlign: "right" }]}>RT</Text>
        </View>
        {/* 値行 */}
        <View style={styles.recordValueRow}>
          <Text style={styles.styleValue}>{styleName}</Text>
          <Text style={styles.timeValue}>{formattedTime}</Text>
          <Text style={styles.reactionTime}>
            {record.reaction_time != null ? record.reaction_time.toFixed(2) : "-"}
          </Text>
        </View>
      </View>

      {/* スプリットタイム */}
      {displaySplitTimes.length > 0 && (
        <View style={styles.splitSection}>
          {/* タブ */}
          <View style={styles.tabRow}>
            <Pressable
              style={[styles.tab, splitTab === "race" && styles.tabActive]}
              onPress={() => setSplitTab("race")}
            >
              <Text style={[styles.tabText, splitTab === "race" && styles.tabTextActive]}>
                距離別 Lap
              </Text>
            </Pressable>
            <Pressable
              style={[styles.tab, splitTab === "all" && styles.tabActive]}
              onPress={() => setSplitTab("all")}
            >
              <Text style={[styles.tabText, splitTab === "all" && styles.tabTextActive]}>
                All Lap
              </Text>
            </Pressable>
          </View>

          {splitTab === "race" ? (
            <>
              {/* 距離別 Lap テーブル */}
              <View style={styles.splitHeaderRow}>
                <Text style={[styles.splitHeaderCell, styles.splitDistanceCol]}>距離</Text>
                <Text style={[styles.splitHeaderCell, styles.splitTimeCol]}>Split</Text>
                {visibleLapIntervals.map((interval) => (
                  <Text key={interval} style={[styles.splitHeaderCell, styles.splitLapCol]}>
                    {interval}m Lap
                  </Text>
                ))}
              </View>
              {raceLapData.map((st, index) => (
                <View
                  key={st.id || index}
                  style={[styles.splitRow, index % 2 === 0 && styles.splitRowEven]}
                >
                  <Text
                    style={[styles.splitCell, styles.splitDistanceCol, styles.splitDistanceText]}
                  >
                    {st.distance}m
                  </Text>
                  <Text style={[styles.splitCell, styles.splitTimeCol, styles.splitTimeText]}>
                    {formatTime(st.split_time)}
                  </Text>
                  {visibleLapIntervals.map((interval) => (
                    <Text
                      key={interval}
                      style={[styles.splitCell, styles.splitLapCol, styles.splitLapText]}
                    >
                      {st.lapTimes[interval] != null ? formatTime(st.lapTimes[interval]!) : "-"}
                    </Text>
                  ))}
                </View>
              ))}
            </>
          ) : (
            <>
              {/* All Lap テーブル */}
              <View style={styles.splitHeaderRow}>
                <Text style={[styles.splitHeaderCell, styles.splitDistanceCol]}>区間</Text>
                <Text style={[styles.splitHeaderCell, { flex: 2 }]}>Lap Time</Text>
              </View>
              {allLapTimes.map((lap, index) => (
                <View key={index} style={[styles.splitRow, index % 2 === 0 && styles.splitRowEven]}>
                  <Text
                    style={[styles.splitCell, styles.splitDistanceCol, styles.splitDistanceText]}
                  >
                    {lap.fromDistance}m → {lap.toDistance}m
                  </Text>
                  <Text style={[styles.splitCell, { flex: 2 }, styles.splitTimeText]}>
                    {formatTime(lap.lapTime)}
                  </Text>
                </View>
              ))}
            </>
          )}
        </View>
      )}

      {/* メモ */}
      {record.note && (
        <View style={styles.noteCard}>
          <Text style={styles.noteLabel}>📝 メモ</Text>
          <Text style={styles.noteText}>{record.note}</Text>
        </View>
      )}

      {/* 動画 */}
      {record.video_path && (
        <View style={styles.noteCard}>
          <VideoPlayer
            videoPath={record.video_path}
            thumbnailPath={record.video_thumbnail_path}
          />
        </View>
      )}

      {/* アクションボタン */}
      <View style={styles.actionContainer}>
        <Pressable
          style={[styles.actionButton, styles.editButton]}
          onPress={handleEdit}
          disabled={isDeleting}
        >
          <Feather name="edit-2" size={16} color="#FFFFFF" />
          <Text style={styles.editButtonText}>編集</Text>
        </Pressable>
        <Pressable
          style={[styles.actionButton, styles.deleteButton]}
          onPress={handleDelete}
          disabled={isDeleting}
        >
          <Feather name="trash-2" size={16} color="#DC2626" />
          <Text style={styles.deleteButtonText}>{isDeleting ? "削除中..." : "削除"}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#EFF6FF",
  },
  content: {
    padding: 16,
    gap: 12,
  },

  // 大会ヘッダー
  competitionHeader: {
    backgroundColor: "#DBEAFE",
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  competitionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  trophyIcon: {
    fontSize: 20,
  },
  competitionName: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1E40AF",
    flexShrink: 1,
  },
  date: {
    fontSize: 14,
    color: "#374151",
    fontWeight: "500",
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  metaText: {
    fontSize: 13,
    color: "#4B5563",
  },

  // 記録カード
  recordCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#93C5FD",
  },
  recordLabelRow: {
    flexDirection: "row",
    marginBottom: 4,
  },
  recordLabel: {
    flex: 1,
    fontSize: 12,
    fontWeight: "500",
    color: "#6B7280",
  },
  recordValueRow: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  styleValue: {
    flex: 1,
    fontSize: 22,
    fontWeight: "700",
    color: "#1D4ED8",
  },
  timeValue: {
    flex: 1,
    fontSize: 28,
    fontWeight: "700",
    color: "#1D4ED8",
  },
  reactionTime: {
    flex: 1,
    fontSize: 14,
    color: "#6B7280",
    textAlign: "right",
  },

  // スプリットタイム
  splitSection: {
    backgroundColor: "#F9FAFB",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    overflow: "hidden",
  },
  tabRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: "#2563EB",
  },
  tabText: {
    fontSize: 13,
    fontWeight: "500",
    color: "#6B7280",
  },
  tabTextActive: {
    color: "#2563EB",
    fontWeight: "600",
  },
  splitHeaderRow: {
    flexDirection: "row",
    backgroundColor: "#F3F4F6",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  splitHeaderCell: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
    textTransform: "uppercase",
  },
  splitRow: {
    flexDirection: "row",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  splitRowEven: {
    backgroundColor: "#FFFFFF",
  },
  splitCell: {
    fontSize: 14,
  },
  splitDistanceCol: {
    flex: 1,
  },
  splitTimeCol: {
    flex: 1.5,
  },
  splitLapCol: {
    flex: 1.5,
  },
  splitDistanceText: {
    fontWeight: "600",
    color: "#111827",
  },
  splitTimeText: {
    color: "#111827",
  },
  splitLapText: {
    color: "#111827",
  },
  // メモ
  noteCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    gap: 4,
  },
  noteLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6B7280",
  },
  noteText: {
    fontSize: 14,
    color: "#374151",
    lineHeight: 20,
  },

  // アクションボタン
  actionContainer: {
    flexDirection: "row",
    gap: 12,
    marginTop: 4,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 8,
    gap: 6,
  },
  editButton: {
    backgroundColor: "#2563EB",
  },
  editButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  deleteButton: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#FCA5A5",
  },
  deleteButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#DC2626",
  },
});
