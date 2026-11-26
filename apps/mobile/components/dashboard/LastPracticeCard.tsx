import React, { useMemo } from "react";
import { View, Text, Pressable, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { useTranslation } from "react-i18next";
import { formatDate } from "@apps/shared/utils/date";
import { formatCircle, formatTimeBest } from "@apps/shared/utils/time";
import {
  buildLastPracticeRows,
  formatLastPracticeMenu,
  type LastPractice,
  type LastPracticeRow,
} from "@apps/shared/utils/dashboardLastPractice";
import { ChipScrollRow } from "@/components/ui/ChipScrollRow";
import { useDateLocale } from "@/hooks/useDateLocale";
import { cardSurface } from "@/constants/theme";

interface LastPracticeCardProps {
  practice: LastPractice;
  /** カードを押したとき、その練習日の詳細を開く */
  onOpenDay: (date: string) => void;
  style?: StyleProp<ViewStyle>;
}

const STYLE_KEYS = ["Fr", "Ba", "Br", "Fly", "IM"] as const;

/**
 * ホームの「前回の練習」。次の大会のカードと横に並べてスワイプで切り替える。
 * 見出しは「前回の練習（日付）」と「タイトル @場所」の2行。
 * メニューごとに1行目へ種類・種目・距離×本数・サークル・平均、2行目へ1本ごとのタイムを並べ、
 * 最速の1本を緑にする。タイムが入りきらないときは横にスクロールでき、右端を薄くして示す。
 */
export const LastPracticeCard: React.FC<LastPracticeCardProps> = ({
  practice,
  onOpenDay,
  style,
}) => {
  const { t } = useTranslation();
  const locale = useDateLocale();
  const rows = useMemo(
    () => buildLastPracticeRows(practice.practice_logs),
    [practice.practice_logs],
  );
  const date = formatDate(practice.date, "numeric", locale);
  const title = practice.title || t("practice.client.practiceTitle");

  return (
    <Pressable
      style={[styles.card, style]}
      onPress={() => onOpenDay(practice.date)}
      accessibilityRole="button"
      accessibilityLabel={t("dashboard.lastPractice.openDay", { date })}
      testID="last-practice-card"
    >
      <Text style={styles.kicker}>{t("dashboard.lastPractice.titleWithDate", { date })}</Text>
      <Text style={styles.name} numberOfLines={1}>
        {title}
        {practice.place ? <Text style={styles.place}>{` @${practice.place}`}</Text> : null}
      </Text>
      <View style={styles.rows}>
        {rows.map((row) => (
          <MenuRow key={row.logId} row={row} />
        ))}
      </View>
    </Pressable>
  );
};

const MenuRow: React.FC<{ row: LastPracticeRow }> = ({ row }) => {
  const { t } = useTranslation();
  const styleKey = STYLE_KEYS.find((k) => k.toLowerCase() === row.style.toLowerCase());
  const styleName = styleKey ? t(`practice.styleAbbrev.${styleKey}`) : row.style;
  const tone = CATEGORY_TONE[row.category] ?? CATEGORY_TONE.Swim;

  return (
    <View style={styles.row}>
      <View style={styles.rowHead}>
        <Text style={[styles.category, tone]}>{t(`practice.categories.${row.category}`)}</Text>
        <Text style={styles.menu} numberOfLines={1}>
          {styleName} {formatLastPracticeMenu(row)}
          {row.circle ? <Text style={styles.circle}>{`  ${formatCircle(row.circle)}`}</Text> : null}
        </Text>
        {row.average !== null && (
          <Text style={styles.average}>
            {t("dashboard.lastPractice.average", {
              time: formatTimeBest(row.average),
            })}
          </Text>
        )}
      </View>
      {row.times.length > 0 && (
        <View style={styles.times}>
          <ChipScrollRow contentContainerStyle={styles.timesContent}>
            {row.times.map((time, i) => {
              const isFastest = time === row.fastest;
              return (
                <Text
                  // 同じタイムが複数あり得るので位置を key にする (並びは固定)
                  key={i}
                  style={[styles.time, isFastest && styles.fastest]}
                  testID={isFastest ? "last-practice-fastest" : undefined}
                >
                  {formatTimeBest(time)}
                </Text>
              );
            })}
          </ChipScrollRow>
        </View>
      )}
    </View>
  );
};

const CATEGORY_TONE: Record<
  LastPracticeRow["category"],
  { backgroundColor: string; color: string }
> = {
  Swim: { backgroundColor: "#DBEAFE", color: "#1D4ED8" },
  Pull: { backgroundColor: "#EDE9FE", color: "#6D28D9" },
  Kick: { backgroundColor: "#FFEDD5", color: "#C2410C" },
};

const styles = StyleSheet.create({
  card: {
    ...cardSurface,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 14,
  },
  kicker: {
    fontSize: 12,
    fontWeight: "600",
    color: "#0D9488",
  },
  name: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    marginTop: 1,
  },
  place: {
    fontSize: 12,
    fontWeight: "400",
    color: "#6B7280",
  },
  rows: {
    marginTop: 6,
  },
  row: {
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  rowHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  category: {
    fontSize: 10,
    fontWeight: "700",
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
    overflow: "hidden",
  },
  menu: {
    flex: 1,
    fontSize: 13,
    fontWeight: "600",
    color: "#111827",
  },
  circle: {
    fontSize: 11,
    fontWeight: "400",
    color: "#9CA3AF",
  },
  average: {
    fontSize: 11,
    color: "#6B7280",
    fontVariant: ["tabular-nums"],
  },
  times: {
    marginTop: 6,
  },
  timesContent: {
    gap: 4,
  },
  time: {
    fontSize: 12,
    color: "#374151",
    backgroundColor: "#F3F4F6",
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "#F3F4F6",
    paddingHorizontal: 6,
    paddingVertical: 2,
    overflow: "hidden",
    fontVariant: ["tabular-nums"],
  },
  fastest: {
    color: "#047857",
    fontWeight: "700",
    backgroundColor: "#ECFDF5",
    borderColor: "#A7F3D0",
  },
});
