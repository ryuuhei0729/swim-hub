import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { format, isSameMonth, isToday, getDay } from "date-fns";
import { useTranslation } from "react-i18next";
import { isHoliday } from "@apps/shared/utils/holiday";
import type { CalendarItem } from "@apps/shared/types/ui";
import {
  resolveCalendarItemColor,
  getDefaultColorForType,
} from "@apps/shared/utils/calendarColorResolver";
import type { CalendarColorSettings } from "@apps/shared/types/calendarColors";
import type { CalendarItemType } from "@apps/shared/types/common";
import { darkenHex } from "@/utils/colorTone";

interface CalendarDayProps {
  date: Date;
  currentDate: Date;
  entries: CalendarItem[];
  onPress: (date: Date) => void;
  isFirstColumn?: boolean;
  isLastColumn?: boolean;
  colorSettings: CalendarColorSettings;
}

// 未カスタマイズ(resolver がデフォルト色を返した)ユーザーの見た目をピクセル一致で維持する
// ための旧来のハードコード値。背景色・枠線色・文字色の3点セットで従来の見た目を再現する。
const LEGACY_PRACTICE = {
  bg: "#D1FAE5", // 黄緑色 (green-100)
  border: "#10B981", // 緑色 (green-500)
  text: "#065F46", // 濃い緑色のテキスト (green-800)
};
const LEGACY_COMPETITION = {
  bg: "#DBEAFE", // 水色 (blue-100)
  border: "#2563EB", // 青色 (blue-600)
  text: "#1E40AF", // 濃い青色のテキスト (blue-800)
};

/**
 * resolver の戻り値から、背景色・枠線色・文字色の3点を決める。
 * 未カスタマイズ(resolveCalendarItemColor の戻り値がその type のデフォルト色と一致)なら
 * 背景色も含めて旧来のハードコード値をそのまま使い、既存ユーザーの見た目を完全に維持する
 * (C1 対応: 従来は枠線・文字色のみガードしており背景色が resolver の生値に変わっていた)。
 * カスタム色時のみ、resolver の戻り値を背景色として使い、枠線・文字色は暗くした派生色にする。
 */
const getResolvedStyle = (
  itemType: CalendarItemType,
  metadata: CalendarItem["metadata"],
  colorSettings: CalendarColorSettings,
  legacy: { bg: string; border: string; text: string },
): { backgroundColor: string; borderColor: string; textColor: string } => {
  const resolvedColor = resolveCalendarItemColor(itemType, metadata, colorSettings);
  const isDefaultColor = resolvedColor === getDefaultColorForType(itemType);

  if (isDefaultColor) {
    return { backgroundColor: legacy.bg, borderColor: legacy.border, textColor: legacy.text };
  }
  return {
    backgroundColor: resolvedColor,
    borderColor: darkenHex(resolvedColor, 0.35),
    textColor: darkenHex(resolvedColor, 0.65),
  };
};

/**
 * カレンダーの1日を表示するコンポーネント
 */
export const CalendarDay: React.FC<CalendarDayProps> = ({
  date,
  currentDate,
  entries,
  onPress,
  isFirstColumn = false,
  isLastColumn = false,
  colorSettings,
}) => {
  const { t } = useTranslation();
  const isCurrentMonth = isSameMonth(date, currentDate);
  const isTodayDate = isToday(date);
  const dayNumber = format(date, "d");
  const displayDateKey = format(date, "yyyy-MM-dd");
  const dayOfWeek = getDay(date); // 0 = 日曜日, 6 = 土曜日
  const isSunday = dayOfWeek === 0;
  const isSaturday = dayOfWeek === 6;
  const isHolidayDate = isHoliday(date);

  // 同じ日付にPractice_LogやRecordがあるかチェック
  const hasPracticeLog = entries.some((e) => e.type === "practice_log");
  const hasRecord = entries.some((e) => e.type === "record");

  // エントリーの色とスタイルを取得
  const getItemStyle = (item: CalendarItem) => {
    const isPracticeType =
      item.type === "practice" || item.type === "team_practice" || item.type === "practice_log";
    const isCompetitionType =
      item.type === "competition" ||
      item.type === "team_competition" ||
      item.type === "entry" ||
      item.type === "record";

    if (isPracticeType) {
      // Practice系: ユーザー設定色 (未設定なら旧来の黄緑をピクセル一致で維持)
      const { backgroundColor, borderColor, textColor } = getResolvedStyle(
        item.type,
        item.metadata,
        colorSettings,
        LEGACY_PRACTICE,
      );
      // 同日に Practice_Log がある場合のみ枠線を付ける独自ロジックは維持
      const highlighted = item.type === "practice_log" || hasPracticeLog;
      return {
        backgroundColor,
        borderWidth: highlighted ? 1 : 0,
        borderColor: highlighted ? borderColor : "transparent",
        textColor,
      };
    } else if (isCompetitionType) {
      // Competition/Entry/Record系: ユーザー設定色 (未設定なら旧来の水色をピクセル一致で維持)
      const { backgroundColor, borderColor, textColor } = getResolvedStyle(
        item.type,
        item.metadata,
        colorSettings,
        LEGACY_COMPETITION,
      );
      // 同日に Record がある場合のみ枠線を付ける独自ロジックは維持
      const highlighted = item.type === "record" || hasRecord;
      return {
        backgroundColor,
        borderWidth: highlighted ? 1 : 0,
        borderColor: highlighted ? borderColor : "transparent",
        textColor,
      };
    } else {
      // その他
      return {
        backgroundColor: "#F3F4F6", // グレー
        borderWidth: 0,
        borderColor: "transparent",
        textColor: "#374151", // グレーのテキスト
      };
    }
  };

  // エントリーのタイトルを生成
  const getEntryTitle = (item: CalendarItem): string => {
    let displayTitle = item.title;

    if (item.type === "team_practice") {
      const teamName = item.metadata?.team?.name || t("teams.mobile.fallbackTeamName");
      displayTitle = `${teamName} - ${item.title}`;
    } else if (item.type === "entry" || item.type === "record") {
      displayTitle = item.metadata?.competition?.title || item.title || t("teams.mobile.fallbackCompetitionName");
    }

    return displayTitle;
  };

  // 表示するエントリー（最大2件）
  const displayEntries = entries.slice(0, 2);
  const remainingCount = entries.length - 2;

  return (
    <Pressable
      style={[
        styles.dayContainer,
        !isCurrentMonth && styles.dayContainerOtherMonth,
        isTodayDate && styles.dayContainerToday,
        entries.length > 0 && isCurrentMonth && styles.dayContainerWithEntries,
        isFirstColumn && styles.dayContainerFirstColumn,
        isLastColumn && styles.dayContainerLastColumn,
      ]}
      onPress={() => onPress(date)}
      disabled={!isCurrentMonth}
    >
      {/* 今日の枠線(グリッド線と独立した内側インセット・オーバーレイ) */}
      {isTodayDate && <View pointerEvents="none" style={styles.todayBorderOverlay} />}

      {/* 日付 */}
      <View style={styles.dayHeader}>
        <Text
          style={[
            styles.dayNumber,
            isTodayDate && styles.dayNumberToday,
            !isCurrentMonth && styles.dayNumberOtherMonth,
            (isSunday || isHolidayDate) && isCurrentMonth && styles.dayNumberSunday,
            isSaturday && isCurrentMonth && !isHolidayDate && styles.dayNumberSaturday,
          ]}
        >
          {dayNumber}
        </Text>
      </View>

      {/* エントリー表示 */}
      {isCurrentMonth && (
        <View style={styles.entriesContainer}>
          {displayEntries.map((item) => {
            const itemStyle = getItemStyle(item);
            const title = getEntryTitle(item);
            const isRelay = item.type === "record" && item.metadata?.record?.is_relaying;

            return (
              <View
                key={`${item.id}-${displayDateKey}`}
                style={[
                  styles.entryItem,
                  {
                    backgroundColor: itemStyle.backgroundColor,
                    borderWidth: itemStyle.borderWidth,
                    borderColor: itemStyle.borderColor,
                  },
                ]}
              >
                <Text style={[styles.entryText, { color: itemStyle.textColor }]} numberOfLines={1}>
                  {title}
                  {isRelay && <Text style={styles.relayMark}> R</Text>}
                </Text>
              </View>
            );
          })}
          {remainingCount > 0 && (
            <Text style={styles.moreEntriesText}>
              +{remainingCount}{t("common.units.items")}
            </Text>
          )}
        </View>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  dayContainer: {
    width: "100%",
    minHeight: 80,
    padding: 4,
    borderRightWidth: 0.5,
    borderBottomWidth: 0.5,
    borderColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
  },
  dayContainerFirstColumn: {
    borderLeftWidth: 0,
  },
  dayContainerLastColumn: {
    borderRightWidth: 0,
  },
  dayContainerOtherMonth: {
    backgroundColor: "#F3F4F6",
  },
  dayContainerToday: {
    backgroundColor: "#EFF6FF",
  },
  todayBorderOverlay: {
    position: "absolute",
    top: 2,
    left: 2,
    right: 2,
    bottom: 2,
    borderWidth: 2,
    borderColor: "#2563EB",
    borderRadius: 4,
  },
  dayContainerWithEntries: {
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  dayHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  dayNumber: {
    fontSize: 10,
    fontWeight: "500",
    color: "#111827",
  },
  dayNumberToday: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#2563EB",
  },
  dayNumberOtherMonth: {
    color: "#D1D5DB",
  },
  dayNumberSunday: {
    color: "#DC2626", // 赤色
  },
  dayNumberSaturday: {
    color: "#2563EB", // 青色
  },
  entriesContainer: {
    gap: 2,
  },
  entryItem: {
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },
  entryText: {
    fontSize: 8,
    fontWeight: "500",
  },
  relayMark: {
    fontWeight: "bold",
    color: "#DC2626",
  },
  moreEntriesText: {
    fontSize: 8,
    color: "#6B7280",
    marginTop: 2,
  },
});
