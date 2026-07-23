import React, { useMemo, useCallback } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { parseISO } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { useTranslation } from "react-i18next";
import { formatDate } from "@apps/shared/utils/date";
import { formatStyleAbbrev } from "@apps/shared/utils/swimStyles";
import { formatTime } from "@/utils/formatters";
import { useDateLocale } from "@/hooks/useDateLocale";
import type { RecordWithDetails } from "@swim-hub/shared/types";
import BestTimeBadge from "./BestTimeBadge";

interface RecordItemProps {
  record: RecordWithDetails;
  onPress?: (record: RecordWithDetails) => void;
}

/**
 * 大会記録アイテムコンポーネント
 * 大会記録の1件を表示
 */
const RecordItemComponent: React.FC<RecordItemProps> = ({ record, onPress }) => {
  const { t } = useTranslation();
  const locale = useDateLocale();
  // 大会未紐付けレコード（一括入力）かどうか
  const isStandalone = !record.competition;
  // 大会名（大会未紐付けの場合は「(一括入力)」、それ以外で null の場合は「大会」フォールバック）
  const competitionName = useMemo(
    () =>
      isStandalone
        ? `(${t("competition.client.bulkInputLabel")})`
        : record.competition?.title || t("recordMobile.fallbackTitle"),
    [isStandalone, record.competition?.title, t],
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
      return formatDate(zoned, "long", locale);
    } catch {
      return t("recordMobile.dateUnknown");
    }
  }, [recordDate, t, locale]);

  // mobile はスマホ幅のため常に略称（例: "200mIM"）で表示。ロケール非依存
  const styleDisplay = useMemo(() => {
    const abbrev = formatStyleAbbrev(record.style);
    return abbrev === "-" ? t("recordMobile.unknownValue") : abbrev;
  }, [record.style, t]);

  // タイムをフォーマット
  const formattedTime = useMemo(() => formatTime(record.time), [record.time]);

  // プールタイプ（大会未紐付け=standaloneレコードでは competition が無いため、
  // BestTimeBadge と同じソースである record.pool_type を参照する）
  const poolType = useMemo(
    () =>
      record.pool_type === 0 ? t("recordMobile.poolTypeShort") : t("recordMobile.poolTypeLong"),
    [record.pool_type, t],
  );

  const handlePress = useCallback(() => {
    onPress?.(record);
  }, [onPress, record]);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.container,
        isStandalone && styles.containerStandalone,
        pressed && styles.pressed,
      ]}
      onPress={handlePress}
    >
      <View style={styles.content}>
        {/* 1行目: 日付 + 大会名（大会未紐付けは「(一括入力)」） */}
        <View style={styles.row}>
          <Text style={styles.date}>{formattedDate}</Text>
          <Text
            style={[styles.competitionName, isStandalone && styles.competitionNameStandalone]}
            numberOfLines={1}
          >
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
            <BestTimeBadge
              recordId={record.id}
              styleId={record.style_id}
              currentTime={record.time}
              recordDate={record.competition?.date ?? record.created_at}
              poolType={record.pool_type}
              isRelaying={record.is_relaying}
              showDiff={false}
            />
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
  containerStandalone: {
    backgroundColor: "#F3F4F6",
  },
  competitionNameStandalone: {
    color: "#9CA3AF",
    fontWeight: "500",
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

export const RecordItem = React.memo(RecordItemComponent, (prevProps, nextProps) => {
  const prevCompetition = prevProps.record.competition;
  const nextCompetition = nextProps.record.competition;
  const prevStyle = prevProps.record.style;
  const nextStyle = nextProps.record.style;

  return (
    prevProps.record.id === nextProps.record.id &&
    prevProps.record.time === nextProps.record.time &&
    prevProps.record.pool_type === nextProps.record.pool_type &&
    prevProps.record.is_relaying === nextProps.record.is_relaying &&
    prevProps.record.style_id === nextProps.record.style_id &&
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
