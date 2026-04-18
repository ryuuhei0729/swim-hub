import React, { useMemo, useCallback } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { format, parseISO } from "date-fns";
import { ja } from "date-fns/locale";
import { toZonedTime } from "date-fns-tz";
import { formatTime } from "@/utils/formatters";
import type { RecordWithDetails } from "@swim-hub/shared/types";

interface RecordItemProps {
  record: RecordWithDetails;
  onPress?: (record: RecordWithDetails) => void;
}

/**
 * 大会記録アイテムコンポーネント
 * 大会記録の1件を表示
 */
const RecordItemComponent: React.FC<RecordItemProps> = ({ record, onPress }) => {
  // 大会名（nullの場合は「大会」）
  const competitionName = useMemo(
    () => record.competition?.title || "大会",
    [record.competition?.title],
  );

  // 日付をフォーマット（大会の日付を使用）
  const recordDate = useMemo(
    () => record.competition?.date || record.created_at,
    [record.competition?.date, record.created_at],
  );
  const formattedDate = useMemo(() => {
    try {
      const parsed = typeof recordDate === "string" ? parseISO(recordDate) : new Date(recordDate);
      const zoned = toZonedTime(parsed, Intl.DateTimeFormat().resolvedOptions().timeZone);
      return format(zoned, "yyyy年M月d日", { locale: ja });
    } catch {
      return "日付不明";
    }
  }, [recordDate]);

  // 種目名 + 距離 (例: "自由形 100m"). memoize 比較も name_jp / distance を見ている
  const styleDisplay = useMemo(() => {
    const nameJp = record.style?.name_jp;
    const distance = record.style?.distance;
    if (!nameJp) return "不明";
    return distance ? `${nameJp} ${distance}m` : nameJp;
  }, [record.style?.name_jp, record.style?.distance]);

  // タイムをフォーマット
  const formattedTime = useMemo(() => formatTime(record.time), [record.time]);

  // プールタイプ
  const poolType = useMemo(
    () => (record.competition?.pool_type === 0 ? "短水路" : "長水路"),
    [record.competition?.pool_type],
  );

  const handlePress = useCallback(() => {
    onPress?.(record);
  }, [onPress, record]);

  return (
    <Pressable
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
      onPress={handlePress}
    >
      <View style={styles.content}>
        {/* 1行目: 日付 + 大会名 */}
        <View style={styles.row}>
          <Text style={styles.date}>{formattedDate}</Text>
          <Text style={styles.competitionName} numberOfLines={1}>
            {competitionName}
          </Text>
        </View>

        {/* 2行目: 場所(左) + 水路・種目・タイム(右) */}
        <View style={styles.rowSpaceBetween}>
          {record.competition?.place ? (
            <Text style={styles.place} numberOfLines={1}>
              📍{record.competition.place}
            </Text>
          ) : (
            <View />
          )}
          <View style={styles.row}>
            <Text style={styles.poolType}>{poolType}</Text>
            <Text style={styles.style}>{styleDisplay}</Text>
            <Text style={styles.time}>{formattedTime}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    marginHorizontal: 16,
    marginVertical: 3,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  pressed: {
    opacity: 0.7,
  },
  content: {
    gap: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rowSpaceBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  date: {
    fontSize: 14,
    color: "#6B7280",
  },
  competitionName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    flexShrink: 1,
  },
  place: {
    fontSize: 13,
    color: "#6B7280",
    flexShrink: 1,
  },
  poolType: {
    fontSize: 12,
    color: "#6B7280",
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  style: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#2563EB",
  },
  time: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#2563EB",
  },
});

// メモ化して再レンダリングを最適化
export const RecordItem = React.memo(RecordItemComponent, (prevProps, nextProps) => {
  // カスタム比較関数：record.idが同じで、recordの主要プロパティが変更されていない場合は再レンダリングしない
  const prevCompetition = prevProps.record.competition;
  const nextCompetition = nextProps.record.competition;
  const prevStyle = prevProps.record.style;
  const nextStyle = nextProps.record.style;

  return (
    prevProps.record.id === nextProps.record.id &&
    prevProps.record.time === nextProps.record.time &&
    prevCompetition?.id === nextCompetition?.id &&
    prevCompetition?.date === nextCompetition?.date &&
    prevCompetition?.title === nextCompetition?.title &&
    prevCompetition?.place === nextCompetition?.place &&
    prevCompetition?.pool_type === nextCompetition?.pool_type &&
    prevStyle?.id === nextStyle?.id &&
    prevStyle?.name_jp === nextStyle?.name_jp &&
    prevStyle?.distance === nextStyle?.distance &&
    prevProps.onPress === nextProps.onPress
  );
});
