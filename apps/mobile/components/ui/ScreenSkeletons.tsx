import React from "react";
import { View, StyleSheet } from "react-native";
import { Skeleton, SkeletonBlock } from "./Skeleton";
import { cardSurface, sectionSurface } from "@/constants/theme";

/**
 * 各画面の初回読み込み中に出すスケルトン
 *
 * 寸法・余白は本物のカード (PracticeItem / RecordItem / TeamItem / GoalCard 等) の
 * StyleSheet に合わせてある。データが届いたときにカードが同じ位置へ差し替わり、
 * 「くるくる → 一覧」より画面の組み替えが小さく見えるようにするため。
 * 文字幅は index ごとに少し変え、同じ形の繰り返しに見えないようにしている。
 */

/** 行ごとに文字幅を揺らすための候補。`index % length` で選ぶ */
const TITLE_WIDTHS = ["52%", "40%", "60%", "46%"] as const;
const BODY_WIDTHS = ["44%", "58%", "36%", "50%"] as const;

const pick = <T,>(candidates: readonly [T, ...T[]], index: number): T =>
  candidates[index % candidates.length] ?? candidates[0];

const range = (count: number): number[] => Array.from({ length: count }, (_, i) => i);

/** 練習タブ: 1枚 = 1練習ログ (日付 / タイトル / 場所、2行目に距離・サークル・タグ) */
export const PracticeListSkeleton: React.FC = () => (
  <Skeleton style={styles.list}>
    {range(8).map((i) => (
      <View key={i} style={styles.practiceCard}>
        <View style={styles.row}>
          <SkeletonBlock width={36} height={14} />
          <SkeletonBlock width={pick(TITLE_WIDTHS, i)} height={14} />
          <SkeletonBlock width={56} height={12} />
        </View>
        <View style={styles.row}>
          <SkeletonBlock width={pick(BODY_WIDTHS, i)} height={12} />
          <SkeletonBlock width={44} height={18} radius={9} />
          {i % 2 === 0 && <SkeletonBlock width={36} height={18} radius={9} />}
        </View>
      </View>
    ))}
  </Skeleton>
);

/** 大会タブ: 1枚 = 1記録 (日付 / 大会名 / ベストバッジ、2行目に場所と水路・種目・タイム) */
export const RecordListSkeleton: React.FC = () => (
  <Skeleton style={styles.list}>
    {range(7).map((i) => (
      <View key={i} style={styles.recordCard}>
        <View style={styles.row}>
          <SkeletonBlock width={40} height={14} />
          <SkeletonBlock width={pick(TITLE_WIDTHS, i)} height={14} />
          <View style={styles.spacer} />
          <SkeletonBlock width={40} height={18} radius={9} />
        </View>
        <View style={styles.rowSpaceBetween}>
          <SkeletonBlock width={72} height={12} />
          <View style={styles.row}>
            <SkeletonBlock width={28} height={12} />
            <SkeletonBlock width={52} height={12} />
            <SkeletonBlock width={64} height={16} />
          </View>
        </View>
      </View>
    ))}
  </Skeleton>
);

/** チームタブ: チーム名 / 説明 2行 / 役割ピル */
export const TeamListSkeleton: React.FC = () => (
  <Skeleton style={styles.list}>
    {range(5).map((i) => (
      <View key={i} style={styles.teamCard}>
        <SkeletonBlock width={pick(TITLE_WIDTHS, i)} height={18} />
        <SkeletonBlock width="92%" height={14} />
        <SkeletonBlock width={pick(BODY_WIDTHS, i)} height={14} />
        <SkeletonBlock width={48} height={22} radius={11} style={styles.teamRolePill} />
      </View>
    ))}
  </Skeleton>
);

/** 目標タブ: 日付 + 大会名 / 種目名と目標タイム / ベストとの差 */
export const GoalListSkeleton: React.FC = () => (
  <Skeleton style={styles.goalList}>
    {range(4).map((i) => (
      <View key={i} style={styles.goalCard}>
        <View style={styles.row}>
          <SkeletonBlock width={44} height={12} />
          <SkeletonBlock width={pick(TITLE_WIDTHS, i)} height={14} />
        </View>
        <View style={styles.rowSpaceBetween}>
          <SkeletonBlock width={84} height={13} />
          <SkeletonBlock width={72} height={22} />
        </View>
        <SkeletonBlock width={100} height={12} />
      </View>
    ))}
  </Skeleton>
);

/** マイページ: プロフィール (アバター + 名前) とベストタイム表 */
export const ProfileSkeleton: React.FC = () => (
  <Skeleton style={styles.profileRoot}>
    <View style={styles.profileSection}>
      <View style={styles.rowSpaceBetween}>
        <SkeletonBlock width={90} height={16} />
        <SkeletonBlock width={48} height={24} radius={6} />
      </View>
      <View style={styles.profileIdentity}>
        <SkeletonBlock width={80} height={80} radius={40} />
        <View style={styles.profileIdentityText}>
          <SkeletonBlock width="55%" height={16} />
          <SkeletonBlock width="38%" height={13} />
        </View>
      </View>
    </View>
    <View style={styles.profileSection}>
      <View style={styles.rowSpaceBetween}>
        <SkeletonBlock width={80} height={16} />
        <View style={styles.row}>
          <SkeletonBlock width={72} height={26} radius={13} />
          <SkeletonBlock width={44} height={26} radius={13} />
        </View>
      </View>
      {range(6).map((i) => (
        <View key={i} style={styles.bestTimeRow}>
          <SkeletonBlock width={44} height={12} />
          <SkeletonBlock width={64} height={14} />
          <SkeletonBlock width={64} height={14} />
        </View>
      ))}
    </View>
  </Skeleton>
);

/** ホーム: お知らせカード + 月カレンダー (曜日行 + 5週) */
export const CalendarSkeleton: React.FC = () => (
  <Skeleton style={styles.calendarRoot}>
    <View style={styles.announcementCard}>
      <SkeletonBlock width="60%" height={18} />
      <SkeletonBlock width="40%" height={14} />
      <SkeletonBlock width="52%" height={14} />
    </View>
    <View style={styles.calendar}>
      <View style={styles.calendarHeader}>
        <SkeletonBlock width={24} height={24} radius={12} />
        <SkeletonBlock width={120} height={22} />
        <SkeletonBlock width={24} height={24} radius={12} />
        <View style={styles.spacer} />
        <SkeletonBlock width={64} height={36} radius={8} />
      </View>
      <View style={styles.weekdayRow}>
        {range(7).map((d) => (
          <View key={d} style={styles.weekdayCell}>
            <SkeletonBlock width={14} height={12} />
          </View>
        ))}
      </View>
      {range(5).map((w) => (
        <View key={w} style={styles.weekRow}>
          {range(7).map((d) => (
            <View key={d} style={styles.dayCell}>
              <SkeletonBlock width={16} height={12} />
            </View>
          ))}
        </View>
      ))}
    </View>
  </Skeleton>
);

const styles = StyleSheet.create({
  list: {
    paddingVertical: 8,
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
  spacer: {
    flex: 1,
  },
  // PracticeItem.container
  practiceCard: {
    ...cardSurface,
    marginHorizontal: 16,
    marginVertical: 3,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 8,
  },
  // RecordItem.container
  recordCard: {
    ...cardSurface,
    marginHorizontal: 16,
    marginVertical: 3,
    padding: 16,
    gap: 10,
  },
  // 旧 TeamItem.container (チーム一覧のカード) と同じ寸法
  teamCard: {
    ...cardSurface,
    marginHorizontal: 16,
    marginVertical: 6,
    padding: 16,
    gap: 8,
  },
  teamRolePill: {
    marginTop: 4,
  },
  // GoalsScreen.scrollContent + GoalCard.card
  goalList: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 12,
  },
  goalCard: {
    ...cardSurface,
    padding: 16,
    gap: 12,
  },
  // MyPageScreen.scrollContent / section
  profileRoot: {
    paddingVertical: 16,
    gap: 16,
  },
  profileSection: {
    ...sectionSurface,
    paddingVertical: 16,
    paddingHorizontal: 16,
    gap: 16,
  },
  profileIdentity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  profileIdentityText: {
    flex: 1,
    gap: 8,
  },
  bestTimeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  // DashboardScreen.scrollContent / TeamAnnouncementsSection.card / CalendarView
  calendarRoot: {
    paddingTop: 8,
  },
  announcementCard: {
    ...cardSurface,
    marginHorizontal: 16,
    padding: 16,
    marginTop: 16,
    marginBottom: 6,
    gap: 10,
  },
  calendar: {
    backgroundColor: "#FFFFFF",
  },
  calendarHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  weekdayRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    paddingVertical: 8,
  },
  weekdayCell: {
    flex: 1,
    alignItems: "center",
  },
  weekRow: {
    flexDirection: "row",
  },
  dayCell: {
    flex: 1,
    minHeight: 80,
    padding: 6,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#F3F4F6",
  },
});
