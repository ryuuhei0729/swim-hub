import React, { useMemo, useCallback } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { parseISO } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { formatDate } from "@apps/shared/utils/date";
import type { PracticeWithLogs, PracticeLogWithTags } from "@swim-hub/shared/types";
import { formatCircleTime } from "@/utils/formatters";
import { useDateLocale } from "@/hooks/useDateLocale";

interface PracticeItemProps {
  practice: PracticeWithLogs;
  /** このカードが表示する練習ログ。ログ未登録の練習は null(ヘッダー行のみのカードになる) */
  log?: PracticeLogWithTags | null;
  onPress?: (practice: PracticeWithLogs) => void;
}

// 種目の略称をローカライズ。t を引数で受け取り pure に保つ
const getStyleName = (t: TFunction, style: string): string => {
  const styleKeyMap: Record<string, string> = {
    fr: "practice.styles.Fr",
    ba: "practice.styles.Ba",
    br: "practice.styles.Br",
    fly: "practice.styles.Fly",
    im: "practice.styles.IM",
  };
  const key = styleKeyMap[style.toLowerCase()];
  return key ? t(key) : style;
};

/**
 * 練習記録アイテムコンポーネント
 *
 * 1枚 = 1練習ログ(2026-08-01)。1つの練習に複数ログがある場合は、同じヘッダー
 * (日付/タイトル/場所)を持つカードがログの数だけ並ぶ。大会タブ (RecordItem: 1記録
 * =1カード) と同じ粒度。タップ先は従来どおり練習全体(その日の DayDetailModal)で、
 * どのログのカードから開いても同じ練習の全ログが載ったモーダルが開く。
 */
const PracticeItemComponent: React.FC<PracticeItemProps> = ({ practice, log, onPress }) => {
  const { t } = useTranslation();
  const locale = useDateLocale();

  // 日付をフォーマット（大会記録カードと同じ流儀: ゾーン変換 + numeric スタイル・ロケール依存）
  const formattedDate = useMemo(() => {
    const parsed = parseISO(practice.date);
    const zoned = toZonedTime(parsed, Intl.DateTimeFormat().resolvedOptions().timeZone);
    return formatDate(zoned, "numeric", locale);
  }, [practice.date, locale]);

  // タイトル（null の場合は既存 client.practiceTitle = "練習" を流用）
  const title = useMemo(
    () => practice.title || t("practice.client.practiceTitle"),
    [practice.title, t],
  );

  // この練習に紐づくメニュー(ログ)数。2件以上のときだけヘッダーにバッジを出し、
  // 一覧上で「このカードの後ろにも同じ練習のログが続く」ことを視認できるようにする
  const menuCount = practice.practice_logs.length;

  // このカードが担当する1ログ分の表示情報（距離×本数×セット / サークル / 種目、タグ）
  const logRow = useMemo(() => {
    if (!log) return null;

    const parts: string[] = [];

    // 距離・本数・セット
    if (log.distance && log.rep_count && log.set_count) {
      parts.push(
        t("practice.page.distanceFormat", {
          distance: log.distance,
          reps: log.rep_count,
          sets: log.set_count,
        }),
      );
    }

    // サークル
    if (log.circle) {
      const circleTime = formatCircleTime(log.circle);
      // 共有実装は null の場合に '-' を返すため、'-' の場合は除外
      if (circleTime && circleTime !== "-") {
        parts.push(circleTime);
      }
    }

    // 種目
    if (log.style) {
      parts.push(getStyleName(t, log.style));
    }

    const tags =
      log.practice_log_tags
        ?.map((lt) => lt.practice_tags)
        .filter((tag): tag is NonNullable<typeof tag> => tag != null) || [];

    return {
      secondLineInfo: parts.join(" / "),
      tags,
    };
  }, [log, t]);

  const handlePress = useCallback(() => {
    onPress?.(practice);
  }, [onPress, practice]);

  return (
    <Pressable
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
      onPress={handlePress}
    >
      <View style={styles.content}>
        {/* 1行目: 日付、練習タイトル、場所 */}
        <View style={styles.row}>
          <Text style={styles.date}>{formattedDate}</Text>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {practice.place && (
            <View style={styles.placeContainer}>
              <Feather name="map-pin" size={12} color="#6B7280" />
              <Text style={styles.place} numberOfLines={1}>
                {practice.place}
              </Text>
            </View>
          )}
          {menuCount >= 2 && (
            <View style={styles.menuCountBadge}>
              <Text style={styles.menuCountText}>
                {t("practice.client.menuCount", { count: menuCount })}
              </Text>
            </View>
          )}
        </View>

        {/* 2行目: このカードのログの距離・本数・セット、サークル、種目、タグ */}
        {logRow && (logRow.secondLineInfo || logRow.tags.length > 0) && (
          <View style={styles.secondRow}>
            {logRow.secondLineInfo && (
              <Text style={styles.secondLine} numberOfLines={1}>
                {logRow.secondLineInfo}
              </Text>
            )}
            {logRow.tags.length > 0 && (
              <View style={styles.tagsContainer}>
                {logRow.tags.map((tag) => (
                  <View
                    key={tag.id}
                    style={[styles.tag, { backgroundColor: tag.color || "#6B7280" }]}
                  >
                    <Text style={styles.tagText}>{tag.name}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}
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
    paddingVertical: 10,
    paddingHorizontal: 12,
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
    gap: 5,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 20,
    gap: 8,
  },
  date: {
    fontSize: 13,
    fontWeight: "600",
    color: "#111827",
    lineHeight: 18,
    minWidth: 35,
  },
  title: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
    flex: 1,
    lineHeight: 20,
  },
  placeContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    flexShrink: 1,
  },
  place: {
    fontSize: 12,
    color: "#6B7280",
    lineHeight: 16,
  },
  menuCountBadge: {
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    flexShrink: 0,
  },
  menuCountText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#374151",
  },
  secondRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    minHeight: 20,
  },
  secondLine: {
    fontSize: 12,
    color: "#6B7280",
    lineHeight: 18,
    flex: 1,
  },
  tagsContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexWrap: "wrap",
  },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    minHeight: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  tagText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#FFFFFF",
    lineHeight: 16,
  },
});

// メモ化して再レンダリングを最適化
export const PracticeItem = React.memo(PracticeItemComponent, (prevProps, nextProps) => {
  // カードのヘッダーが依存する practice の表示プロパティ
  const prev = prevProps.practice;
  const next = nextProps.practice;

  if (
    prev.id !== next.id ||
    prev.date !== next.date ||
    prev.title !== next.title ||
    prev.place !== next.place
  ) {
    return false;
  }

  // カード本文が依存するのは自分の1ログのみ(兄弟ログの変化は自分のカードに影響しない)
  const prevLog = prevProps.log ?? null;
  const nextLog = nextProps.log ?? null;

  if (prevLog === nextLog) {
    return prevProps.onPress === nextProps.onPress;
  }
  if (!prevLog || !nextLog) {
    return false;
  }
  if (prevLog.id !== nextLog.id || prevLog.updated_at !== nextLog.updated_at) {
    return false;
  }

  return prevProps.onPress === nextProps.onPress;
});
