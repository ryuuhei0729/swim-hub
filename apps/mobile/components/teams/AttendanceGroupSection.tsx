import React from "react";
import { View, Text, StyleSheet, type StyleProp, type TextStyle } from "react-native";

export interface AttendanceGroupMember {
  id: string;
  name: string;
}

export interface AttendanceGroupSectionProps {
  title: string;
  titleStyle: StyleProp<TextStyle>;
  members: AttendanceGroupMember[];
  emptyText: string;
}

/**
 * 出欠1グループ分の見出し + メンバー一覧（web AttendanceGroupingDisplay.tsx のグループ単位の
 * マークアップを移植）。
 *
 * 元は AdminMonthlyAttendance.tsx にのみ private 定義されていたが、一般メンバー向けの
 * 出欠閲覧(MyMonthlyAttendance / DayDetailModal の出欠確認)でも同じ4グループ表示を
 * 再利用するため切り出した。AdminMonthlyAttendance の既存表示・件数・挙動は変更しない
 * （呼び出し側で組み立てる title/emptyText/titleStyle はそのまま）。
 */
export const AttendanceGroupSection: React.FC<AttendanceGroupSectionProps> = ({
  title,
  titleStyle,
  members,
  emptyText,
}) => (
  <View style={styles.memberGroupSection}>
    <Text style={[styles.memberGroupTitle, titleStyle]}>{title}</Text>
    {members.length > 0 ? (
      <View style={styles.memberList}>
        {members.map((member) => (
          <View key={member.id} style={styles.memberRow}>
            <Text style={styles.memberName} numberOfLines={1}>
              {member.name}
            </Text>
          </View>
        ))}
      </View>
    ) : (
      <Text style={styles.memberAttendanceInfoText}>{emptyText}</Text>
    )}
  </View>
);

// 4グループ見出しの色（AdminMonthlyAttendance の既存配色と同一値）。
// 一般メンバー向け閲覧(MyMonthlyAttendance/DayDetailModal)でも同じ配色を使うための共有定数。
export const ATTENDANCE_GROUP_TITLE_COLORS: Record<
  "present" | "absent" | "other" | "unanswered",
  { color: string }
> = {
  present: { color: "#166534" },
  absent: { color: "#991B1B" },
  other: { color: "#92400E" },
  unanswered: { color: "#6B7280" },
};

const styles = StyleSheet.create({
  memberGroupSection: {
    gap: 4,
  },
  memberGroupTitle: {
    fontSize: 13,
    fontWeight: "600",
  },
  memberList: {
    gap: 6,
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  memberName: {
    flex: 1,
    fontSize: 13,
    color: "#111827",
  },
  memberAttendanceInfoText: {
    fontSize: 13,
    color: "#6B7280",
  },
});
