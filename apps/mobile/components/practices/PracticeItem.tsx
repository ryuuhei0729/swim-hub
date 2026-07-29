import React, { useMemo, useCallback } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { parseISO } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { formatDate } from "@apps/shared/utils/date";
import type { PracticeWithLogs } from "@swim-hub/shared/types";
import { formatCircleTime } from "@/utils/formatters";
import { useDateLocale } from "@/hooks/useDateLocale";

interface PracticeItemProps {
  practice: PracticeWithLogs;
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
 * 練習記録の1件を表示
 */
const PracticeItemComponent: React.FC<PracticeItemProps> = ({ practice, onPress }) => {
  const { t } = useTranslation();
  const locale = useDateLocale();

  // 日付をフォーマット（大会記録カードと同じ流儀: ゾーン変換 + long スタイル・ロケール依存）
  const formattedDate = useMemo(() => {
    const parsed = parseISO(practice.date);
    const zoned = toZonedTime(parsed, Intl.DateTimeFormat().resolvedOptions().timeZone);
    return formatDate(zoned, "long", locale);
  }, [practice.date, locale]);

  // タイトル（null の場合は既存 client.practiceTitle = "練習" を流用）
  const title = useMemo(
    () => practice.title || t("practice.client.practiceTitle"),
    [practice.title, t],
  );

  // 練習に属する全ログをそれぞれ1行分の表示情報に変換する（1件のみの練習でも
  // 従来通り1行だけになり、退行なし）。ユーザー指示により、以前の firstLog のみの
  // 表示（2件目以降が一覧から見えない）から全ログ列挙へ一般化した。
  const logRows = useMemo(() => {
    return (practice.practice_logs || []).map((log) => {
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
        id: log.id,
        secondLineInfo: parts.join(" / "),
        tags,
      };
    });
  }, [practice.practice_logs, t]);

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
        </View>

        {/* 2行目以降: ログごとに距離・本数・セット、サークル、種目、タグを列挙 */}
        {logRows.map(
          (row) =>
            (row.secondLineInfo || row.tags.length > 0) && (
              <View key={row.id} style={styles.secondRow}>
                {row.secondLineInfo && (
                  <Text style={styles.secondLine} numberOfLines={1}>
                    {row.secondLineInfo}
                  </Text>
                )}
                {row.tags.length > 0 && (
                  <View style={styles.tagsContainer}>
                    {row.tags.map((tag) => (
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
            ),
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
  // カスタム比較関数：practice.idが同じで、practiceの主要プロパティが変更されていない場合は再レンダリングしない
  const prev = prevProps.practice;
  const next = nextProps.practice;

  if (
    prev.id !== next.id ||
    prev.date !== next.date ||
    prev.title !== next.title ||
    prev.place !== next.place ||
    prev.note !== next.note
  ) {
    return false;
  }

  const prevLogs = prev.practice_logs;
  const nextLogs = next.practice_logs;

  // 参照が同一なら変更なしとみなす
  if (prevLogs === nextLogs) {
    return true;
  }

  // どちらかが未定義の場合の判定
  if (!prevLogs || !nextLogs) {
    return prevLogs === nextLogs;
  }

  // 長さが異なれば変更あり
  if (prevLogs.length !== nextLogs.length) {
    return false;
  }

  // シャロー比較（id または updated_at が変われば再レンダリング）
  for (let i = 0; i < prevLogs.length; i++) {
    const prevLog = prevLogs[i];
    const nextLog = nextLogs[i];
    if (prevLog.id !== nextLog.id || prevLog.updated_at !== nextLog.updated_at) {
      return false;
    }
  }

  return true;
});
