import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { format, getDay, isToday } from "date-fns";
import { useTranslation } from "react-i18next";
import { formatDate } from "@apps/shared/utils/date";
import { useDateLocale } from "@/hooks/useDateLocale";
import {
  buildMonthCells,
  competitionEndDate,
  findDraftCovering,
  toDateKey,
  weekdayLabels,
  type CompetitionDraft,
  type ExistingScheduleMap,
} from "./bulkRegisterUtils";
import { BULK_COLORS } from "./bulkRegisterColors";

interface BulkRegisterCalendarProps {
  mode: "practice" | "competition";
  month: Date;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  existing: ExistingScheduleMap;
  /** 練習: 選択中の日付 */
  selectedDates: readonly string[];
  /** 大会: 追加予定の大会 (期間を帯で表示する) */
  drafts: readonly CompetitionDraft[];
  onPressDate: (date: string) => void;
  /** 練習のみ: 曜日見出しのタップ (その月の同じ曜日をまとめて選択) */
  onPressWeekday?: (weekday: number) => void;
}

/** 一括登録画面のカレンダー (練習: 複数日選択 / 大会: 期間の帯表示) */
export function BulkRegisterCalendar({
  mode,
  month,
  onPrevMonth,
  onNextMonth,
  existing,
  selectedDates,
  drafts,
  onPressDate,
  onPressWeekday,
}: BulkRegisterCalendarProps) {
  const { t } = useTranslation();
  const locale = useDateLocale();
  const weekdays = weekdayLabels(locale);
  const selected = new Set(selectedDates);
  const cells = buildMonthCells(month);
  const isPractice = mode === "practice";

  return (
    <View>
      <View style={styles.header}>
        <Pressable
          onPress={onPrevMonth}
          style={styles.navButton}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={t("common.datePicker.prevMonth")}
        >
          <Feather name="chevron-left" size={18} color="#374151" />
        </Pressable>
        <Text style={styles.monthLabel}>{formatDate(month, "yearMonth", locale)}</Text>
        <Pressable
          onPress={onNextMonth}
          style={styles.navButton}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={t("common.datePicker.nextMonth")}
        >
          <Feather name="chevron-right" size={18} color="#374151" />
        </Pressable>
      </View>

      <View style={styles.row}>
        {weekdays.map((w, i) => {
          const label = (
            <Text
              style={[
                styles.weekdayText,
                i === 0 && styles.sunday,
                i === 6 && styles.saturday,
                isPractice && styles.weekdayTappable,
              ]}
            >
              {w}
            </Text>
          );
          return isPractice && onPressWeekday ? (
            <Pressable
              key={i}
              style={styles.weekdayCell}
              onPress={() => onPressWeekday(i)}
              accessibilityRole="button"
              accessibilityLabel={t("teams.mobile.bulkRegister.selectWeekdayAria", { weekday: w })}
            >
              {label}
            </Pressable>
          ) : (
            <View key={i} style={styles.weekdayCell}>
              {label}
            </View>
          );
        })}
      </View>

      <View style={styles.grid}>
        {cells.map((day, index) => {
          if (!day) return <View key={`empty-${index}`} style={styles.cell} />;
          const key = toDateKey(day);
          const ex = existing[key];
          const isSelected = isPractice && selected.has(key);
          const draft = !isPractice ? findDraftCovering(drafts, key) : undefined;
          const isDraftStart = !!draft && draft.date === key;
          const isDraftEnd = !!draft && competitionEndDate(draft.date, draft.days) === key;
          const weekday = getDay(day);

          return (
            <Pressable
              key={key}
              style={styles.cell}
              onPress={() => onPressDate(key)}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected || !!draft }}
              accessibilityLabel={formatDate(day, "long", locale)}
            >
              <View
                style={[
                  styles.dayInner,
                  isSelected && styles.daySelected,
                  draft && styles.dayDraft,
                  draft && !isDraftStart && styles.dayDraftJoinLeft,
                  draft && !isDraftEnd && styles.dayDraftJoinRight,
                ]}
              >
                <View style={[styles.dayNumberWrap, isToday(day) && !isSelected && styles.todayRing]}>
                  <Text
                    style={[
                      styles.dayText,
                      weekday === 0 && styles.sunday,
                      weekday === 6 && styles.saturday,
                      isSelected && styles.dayTextSelected,
                      draft && styles.dayTextDraft,
                    ]}
                  >
                    {format(day, "d")}
                  </Text>
                </View>
                <View style={styles.dots}>
                  {ex?.practice && (
                    <View style={[styles.dot, { backgroundColor: BULK_COLORS.practice.dot }, isSelected && styles.dotOnFill]} />
                  )}
                  {ex?.competition && (
                    <View style={[styles.dot, { backgroundColor: BULK_COLORS.competition.dot }, isSelected && styles.dotOnFill]} />
                  )}
                </View>
              </View>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.legend}>
        <LegendItem color={BULK_COLORS.practice.dot} label={t("teams.mobile.bulkRegister.legendExistingPractice")} />
        <LegendItem color={BULK_COLORS.competition.dot} label={t("teams.mobile.bulkRegister.legendExistingCompetition")} />
        {isPractice ? (
          <LegendItem color={BULK_COLORS.practice.main} label={t("teams.mobile.bulkRegister.legendSelected")} />
        ) : (
          <LegendItem color={BULK_COLORS.competition.main} label={t("teams.mobile.bulkRegister.legendNewCompetition")} />
        )}
      </View>
    </View>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  navButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  monthLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827",
  },
  row: {
    flexDirection: "row",
  },
  weekdayCell: {
    width: `${100 / 7}%`,
    alignItems: "center",
    paddingVertical: 4,
  },
  weekdayText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#6B7280",
  },
  weekdayTappable: {
    textDecorationLine: "underline",
    textDecorationStyle: "dotted",
  },
  sunday: {
    color: "#EF4444",
  },
  saturday: {
    color: "#3B82F6",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  cell: {
    width: `${100 / 7}%`,
    height: 44,
    paddingVertical: 2,
  },
  dayInner: {
    flex: 1,
    marginHorizontal: 2,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  daySelected: {
    backgroundColor: BULK_COLORS.practice.main,
  },
  dayDraft: {
    backgroundColor: BULK_COLORS.competition.light,
  },
  dayDraftJoinLeft: {
    marginLeft: 0,
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
  },
  dayDraftJoinRight: {
    marginRight: 0,
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
  },
  dayNumberWrap: {
    minWidth: 24,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  todayRing: {
    borderWidth: 1.5,
    borderColor: "#111827",
  },
  dayText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  dayTextSelected: {
    color: "#FFFFFF",
  },
  dayTextDraft: {
    color: BULK_COLORS.competition.text,
  },
  dots: {
    flexDirection: "row",
    gap: 2,
    height: 5,
    marginTop: 1,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  dotOnFill: {
    borderWidth: 0.5,
    borderColor: "#FFFFFF",
  },
  legend: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 8,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  legendDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  legendText: {
    fontSize: 11,
    color: "#6B7280",
  },
});
