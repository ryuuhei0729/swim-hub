import React from "react";
import { View, StyleSheet, type DimensionValue, type StyleProp, type ViewStyle } from "react-native";
import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  getDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { Skeleton, SkeletonBlock } from "./Skeleton";
import { cardSurface, colors, sectionSurface } from "@/constants/theme";

/**
 * 各画面の初回読み込み中に出すスケルトン
 *
 * 寸法・余白は読み込み後に出る本物の部品 (ListToolbar / PracticeItem / RecordItem / GoalCard /
 * TeamDetailView / ProfileDisplay / AccountList / NextCompetitionCard / CalendarView /
 * DashboardBestTimesSection 等) の StyleSheet に合わせてある。データが届いたときに部品が
 * 同じ位置へ差し替わり、画面が組み替わって見えないようにするため。
 * 本物の部品の寸法を変えたら、ここも合わせること。
 * 文字幅は index ごとに少し変え、同じ形の繰り返しに見えないようにしている。
 */

/** 行ごとに文字幅を揺らすための候補。`index % length` で選ぶ */
const TITLE_WIDTHS = ["52%", "40%", "60%", "46%"] as const;
const BODY_WIDTHS = ["44%", "58%", "36%", "50%"] as const;
const NAME_WIDTHS = [48, 40, 56, 44] as const;
const BADGE_WIDTHS = [80, 32, 32, 72] as const;

const pick = <T,>(candidates: readonly [T, ...T[]], index: number): T =>
  candidates[index % candidates.length] ?? candidates[0];

const range = (count: number): number[] => Array.from({ length: count }, (_, i) => i);

/** 表の罫線 (DashboardBestTimesSection / TeamMemberList の BORDER_COLOR) */
const TABLE_BORDER = "#D1D5DB";

interface LineProps {
  width: DimensionValue;
  /** 置き換える文字の fontSize */
  size: number;
  /** 置き換える文字の行の高さ。lineHeight 未指定の文字は fontSize の約 1.2 倍になる */
  lineHeight?: number;
  style?: StyleProp<ViewStyle>;
}

/** 1行の文字の代わり。行の高さは本物の文字と同じにし、ブロックは縦中央に置く */
const Line: React.FC<LineProps> = ({ width, size, lineHeight, style }) => (
  <View style={[{ height: lineHeight ?? Math.round(size * 1.2), justifyContent: "center" }, style]}>
    <SkeletonBlock width={width} height={size} radius={4} />
  </View>
);

// =============================================================================
// 練習・大会 (記録タブ)
// =============================================================================

/** 一覧の上の「件数 / 並べ替え / 絞り込み」バー (ListToolbar) */
const ListToolbarSkeleton: React.FC = () => (
  <View style={styles.toolbar}>
    <Line width={36} size={13} />
    <View style={styles.toolbarActions}>
      {range(2).map((i) => (
        <View key={i} style={styles.toolbarButton}>
          <SkeletonBlock width={14} height={14} radius={4} />
          <Line width={48} size={12} />
        </View>
      ))}
    </View>
  </View>
);

/** 練習: 1枚 = 1練習ログ (日付 / タイトル / 場所、2行目に距離・サークル・種目とタグ) */
export const PracticeListSkeleton: React.FC = () => (
  <Skeleton>
    <ListToolbarSkeleton />
    <View style={styles.list}>
      {range(8).map((i) => (
        <View key={i} style={styles.practiceCard}>
          <View style={styles.practiceRow}>
            <Line width={72} size={13} lineHeight={18} />
            <Line width={pick(TITLE_WIDTHS, i)} size={14} lineHeight={20} style={styles.flex} />
            <View style={styles.place}>
              <SkeletonBlock width={12} height={12} radius={6} />
              <Line width={48} size={12} lineHeight={16} />
            </View>
          </View>
          <View style={styles.practiceSecondRow}>
            <Line width={pick(BODY_WIDTHS, i)} size={12} lineHeight={18} style={styles.flex} />
            <SkeletonBlock width={44} height={20} radius={10} />
            {i % 2 === 0 && <SkeletonBlock width={36} height={20} radius={10} />}
          </View>
        </View>
      ))}
    </View>
  </Skeleton>
);

/** 大会: 1枚 = 1記録 (日付 / 大会名 / ベストとの差、2行目に場所と水路・種目・タイム) */
export const RecordListSkeleton: React.FC = () => (
  <Skeleton>
    <ListToolbarSkeleton />
    <View style={styles.list}>
      {range(7).map((i) => (
        <View key={i} style={styles.recordCard}>
          <View style={styles.row}>
            <Line width={76} size={14} />
            <Line width={pick(TITLE_WIDTHS, i)} size={16} style={styles.flex} />
            {/* BestTimeBadge (角丸 6 の四角。「初」や「Best+0.39」) */}
            <SkeletonBlock width={pick(BADGE_WIDTHS, i)} height={20} radius={6} />
          </View>
          <View style={styles.rowSpaceBetween}>
            <View style={styles.place}>
              <SkeletonBlock width={12} height={12} radius={6} />
              <Line width={72} size={13} />
            </View>
            <View style={styles.row}>
              {/* 水路はピル (padding 8/4・角丸 12) */}
              <SkeletonBlock width={52} height={22} radius={11} />
              <Line width={56} size={18} />
              <Line width={64} size={18} />
            </View>
          </View>
        </View>
      ))}
    </View>
  </Skeleton>
);

// =============================================================================
// 目標
// =============================================================================

/** 目標: 日付 + 大会名 / 種目名と目標タイム・ベストとの差、最後に「新規目標作成」 */
export const GoalListSkeleton: React.FC = () => (
  <Skeleton style={styles.goalList}>
    {range(4).map((i) => (
      <View key={i} style={styles.goalCard}>
        <View style={styles.row}>
          <Line width={78} size={14} />
          <Line width={pick(TITLE_WIDTHS, i)} size={14} style={styles.flex} />
        </View>
        <View style={styles.goalStyleRow}>
          <Line width={84} size={16} />
          <View style={styles.goalTimeBlock}>
            <Line width={72} size={18} />
            <Line width={76} size={12} />
          </View>
        </View>
      </View>
    ))}
    <View style={styles.goalCreateButton}>
      <SkeletonBlock width={18} height={18} radius={9} />
      <Line width={96} size={14} />
    </View>
  </Skeleton>
);

// =============================================================================
// チーム
// =============================================================================

/**
 * チーム詳細のヘッダーより下 (タブ + 既定のメンバータブのベストタイム表)。
 * チーム名が分かっていてチーム詳細だけ読み込み中のとき (TeamDetailView) は、本物のヘッダーの下にこれを出す
 */
export const TeamBodySkeleton: React.FC = () => (
  <Skeleton style={styles.flex}>
    <TeamBodySkeletonContent />
  </Skeleton>
);

const TeamBodySkeletonContent: React.FC = () => (
  <>
    {/* TeamTabs: メンバー・予定・出欠・その他 の 4 タブを均等割り */}
    <View style={styles.teamTabs}>
      {range(4).map((i) => (
        <View key={i} style={styles.teamTab}>
          <SkeletonBlock width={14} height={14} radius={4} />
          <Line width={36} size={12} />
        </View>
      ))}
    </View>
    {/* TeamMemberList: 引き継ぎトグルの行 + ベストタイム表 */}
    <View style={styles.teamMembers}>
      <View style={styles.teamFilterRow}>
        <View style={styles.flex} />
        <Line width={64} size={11} />
        <SkeletonBlock width={51} height={31} radius={16} />
      </View>
      <View style={styles.teamTable}>
        <View style={styles.teamTableHeader}>
          <View style={[styles.teamNameCell, styles.teamNameHeaderCell]}>
            <Line width={44} size={11} />
          </View>
          <View style={styles.teamTableHeaderRight}>
            <View style={styles.teamTableHeaderStyles}>
              <Line width="60%" size={11} />
            </View>
            <View style={styles.teamTableHeaderDistances}>
              {range(6).map((d) => (
                <View key={d} style={styles.teamTimeCell}>
                  <Line width={24} size={10} />
                </View>
              ))}
            </View>
          </View>
        </View>
        {range(10).map((r) => (
          <View key={r} style={styles.teamTableRow}>
            <View style={styles.teamNameCell}>
              <Line width={pick(NAME_WIDTHS, r)} size={11} />
            </View>
            {range(6).map((d) => (
              <View key={d} style={styles.teamTimeCell}>
                <Line width={36} size={11} />
              </View>
            ))}
          </View>
        ))}
      </View>
    </View>
  </>
);

/** チーム: チーム名のヘッダー (切替・お知らせ・設定) / 4 つのタブ / メンバーのベストタイム表 (既定のタブ) */
export const TeamSkeleton: React.FC = () => (
  <Skeleton style={styles.flex}>
    <View style={styles.teamHeader}>
      <View style={styles.teamHeaderName}>
        <Line width={140} size={20} />
        <SkeletonBlock width={20} height={20} radius={10} />
      </View>
      {/* お知らせ・チーム設定のアイコン */}
      <View style={styles.teamHeaderActions}>
        <SkeletonBlock width={25} height={25} radius={8} />
        <SkeletonBlock width={25} height={25} radius={8} />
      </View>
    </View>
    <TeamBodySkeletonContent />
  </Skeleton>
);

// =============================================================================
// アカウント
// =============================================================================

/** 設定の一覧 (AccountList) のまとまりごとの行数と、行の形 */
const ACCOUNT_GROUPS: {
  rows: number;
  kind: "icon" | "link" | "center";
  /** 行の右に出る値の幅 (null は値なし) */
  values?: (number | null)[];
}[] = [
  { rows: 1, kind: "icon", values: [64] }, // プラン (Free / Premium)
  { rows: 3, kind: "icon", values: [40, 16, null] }, // カレンダー / 練習ログテンプレート / ログインとセキュリティ
  { rows: 2, kind: "link" }, // 利用規約 / プライバシーポリシー
  { rows: 1, kind: "center" }, // ログアウト
];

/**
 * アカウント: プロフィール (アバター・名前・生年月日と性別・チーム・編集ボタンを中央に縦積み) と設定の一覧。
 * 自己紹介は書いていない人が多いので置かない。
 * ページヘッダー (「アカウント」) は読み込み中も MyPageScreen が本物を出すので、ここには含めない
 */
export const AccountSkeleton: React.FC = () => (
  <Skeleton style={styles.accountRoot}>
    <View style={styles.profileSection}>
      <View style={styles.profileInner}>
        <SkeletonBlock width={80} height={80} radius={40} />
        <Line width={120} size={20} style={styles.profileName} />
        {/* 生年月日・性別 (ProfileDisplay.meta) */}
        <Line width={140} size={13} style={styles.profileMeta} />
        <View style={styles.profileChips}>
          <SkeletonBlock width={88} height={27} radius={14} />
          <SkeletonBlock width={36} height={27} radius={14} />
        </View>
        <View style={styles.profileEditButton}>
          <Line width={112} size={14} />
        </View>
      </View>
    </View>
    {ACCOUNT_GROUPS.map((group, g) => (
      <View key={g} style={styles.accountGroup}>
        {range(group.rows).map((r) => (
          <View
            key={r}
            style={[
              styles.accountRow,
              group.kind === "center" && styles.accountRowCenter,
              r > 0 && styles.accountRowDivider,
            ]}
          >
            {group.kind === "center" ? (
              <Line width={80} size={15} />
            ) : (
              <>
                {group.kind === "icon" && <SkeletonBlock width={28} height={28} radius={7} />}
                <Line width={pick(BODY_WIDTHS, g + r)} size={15} style={styles.flex} />
                {group.values?.[r] != null && <Line width={group.values[r]} size={14} />}
                <SkeletonBlock width={14} height={14} radius={4} />
              </>
            )}
          </View>
        ))}
      </View>
    ))}
  </Skeleton>
);

// =============================================================================
// ホーム
// =============================================================================

/** ホームの初回表示は今月なので、今月の週数 (4〜6週) と前後の月の日を本物と同じに並べる */
const buildCalendarWeeks = (today: Date): { date: Date; inMonth: boolean }[][] => {
  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(today)),
    end: endOfWeek(endOfMonth(today)),
  });
  return range(days.length / 7).map((w) =>
    days.slice(w * 7, w * 7 + 7).map((date) => ({ date, inMonth: isSameMonth(date, today) })),
  );
};

/** Best Time 表の距離の行数 (50/100/200/400/800m) と種目の列数 */
const BEST_TIME_DISTANCES = 5;
const BEST_TIME_STYLES = 5;

interface DashboardSkeletonProps {
  /**
   * お知らせ欄 (DashboardNoticesSection) の場所を取るか。お知らせ欄は所属チームのお知らせ・やることが
   * 無ければ出ないので、チームに所属している (承認済み) と分かっているときだけ見出しの分を取る
   */
  showNotices?: boolean;
}

/** ホーム: お知らせ (見出しのみ) / 次の大会のカード / 月カレンダー / Best Time 表 */
export const DashboardSkeleton: React.FC<DashboardSkeletonProps> = ({ showNotices = false }) => {
  const weeks = buildCalendarWeeks(new Date());
  return (
    <Skeleton style={styles.dashboardRoot}>
      {/* DashboardNoticesSection: 開閉の状態と件数で中身の高さが変わるので、見出しの行だけを置く */}
      {showNotices && (
        <View style={styles.noticesCard}>
          <View style={styles.noticesHeader}>
            <SkeletonBlock width={16} height={16} radius={8} />
            <Line width={64} size={15} />
            <View style={styles.flex} />
            <SkeletonBlock width={18} height={18} radius={4} />
          </View>
        </View>
      )}
      {/* NextCompetitionCard: 大会名・場所 + 残り日数の箱、下にエントリー2件 */}
      <View style={styles.nextCompetitionCard}>
        <View style={styles.nextCompetitionTop}>
          <View style={styles.flex}>
            <Line width={120} size={12} />
            <Line width="70%" size={16} style={styles.nextCompetitionLine} />
            <Line width={96} size={12} style={styles.nextCompetitionLine} />
          </View>
          <SkeletonBlock width={52} height={48} radius={10} />
        </View>
        {range(2).map((e) => (
          <View key={e} style={styles.nextCompetitionEntry}>
            <Line width={e === 0 ? 72 : 88} size={14} style={styles.flex} />
            <Line width={72} size={12} />
            <View style={styles.nextCompetitionGoal}>
              <SkeletonBlock width={e === 0 ? 64 : 104} height={22} radius={11} />
            </View>
          </View>
        ))}
      </View>

      {/* CalendarView */}
      <View style={styles.calendar}>
        <View style={styles.calendarHeader}>
          <View style={styles.calendarHeaderLeft}>
            <View style={styles.calendarNavButton}>
              <SkeletonBlock width={10} height={16} radius={3} />
            </View>
            <View style={styles.calendarMonthButton}>
              <Line width={84} size={16} />
            </View>
            <View style={styles.calendarNavButton}>
              <SkeletonBlock width={10} height={16} radius={3} />
            </View>
          </View>
          <View style={styles.calendarTodayButton}>
            <Line width={28} size={14} />
          </View>
        </View>
        <View style={styles.weekdayRow}>
          {range(7).map((d) => (
            <View key={d} style={styles.weekdayCell}>
              <Line width={12} size={12} />
            </View>
          ))}
        </View>
        {weeks.map((week, w) => (
          <View key={w} style={styles.weekRow}>
            {week.map(({ date, inMonth }) => (
              <View
                key={date.toISOString()}
                style={[
                  styles.dayCell,
                  getDay(date) === 6 && styles.dayCellLastColumn,
                  !inMonth && styles.dayCellOtherMonth,
                ]}
              >
                <Line width={10} size={10} />
              </View>
            ))}
          </View>
        ))}
      </View>

      {/* DashboardBestTimesSection (BestTimesTable) */}
      <View style={styles.bestTimes}>
        {/* 見出し / 水路の切替 (ALL・短水路・長水路) / 「引き継ぎ含む」 */}
        <View style={styles.bestTimesControls}>
          <Line width={104} size={20} />
          <SkeletonBlock width={148} height={26} radius={8} />
          <View style={styles.bestTimesRelay}>
            <SkeletonBlock width={16} height={16} radius={3} />
            <Line width={60} size={12} />
          </View>
        </View>
        <View style={styles.bestTimesTable}>
          <View style={styles.bestTimesHeaderRow}>
            <View style={[styles.bestTimesDistanceCell, styles.bestTimesHeaderCell]}>
              <Line width={24} size={11} />
            </View>
            {range(BEST_TIME_STYLES).map((s) => (
              <View key={s} style={[styles.bestTimesStyleCell, styles.bestTimesHeaderCell]}>
                <Line width={32} size={11} />
              </View>
            ))}
          </View>
          {range(BEST_TIME_DISTANCES).map((r) => (
            <View
              key={r}
              style={[styles.bestTimesRow, r === BEST_TIME_DISTANCES - 1 && styles.bestTimesRowLast]}
            >
              <View style={[styles.bestTimesDistanceCell, styles.bestTimesBodyCell]}>
                <Line width={26} size={11} />
              </View>
              {range(BEST_TIME_STYLES).map((s) => (
                <View key={s} style={[styles.bestTimesStyleCell, styles.bestTimesBodyCell]}>
                  <Line width={36} size={11} />
                </View>
              ))}
            </View>
          ))}
        </View>
        <Line width={150} size={11} style={styles.bestTimesNote} />
        <View style={styles.bestTimesFooter}>
          <SkeletonBlock width={112} height={26} radius={8} />
          <Line width={64} size={12} />
        </View>
      </View>
    </Skeleton>
  );
};

const styles = StyleSheet.create({
  flex: {
    flex: 1,
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
  // PracticeItem.placeContainer / RecordItem.placeRow (ピンのアイコン + 場所)
  place: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },

  // ---- 練習・大会 ----
  // ListToolbar.container / actions / button
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  toolbarActions: {
    flexDirection: "row",
    gap: 8,
  },
  toolbarButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: TABLE_BORDER,
    backgroundColor: colors.surface,
  },
  // PracticesScreen / RecordsScreen の FlashList contentContainerStyle
  list: {
    paddingVertical: 8,
  },
  // PracticeItem.container + content
  practiceCard: {
    ...cardSurface,
    marginHorizontal: 16,
    marginVertical: 3,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 5,
  },
  // PracticeItem.row
  practiceRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 20,
    gap: 8,
  },
  // PracticeItem.secondRow
  practiceSecondRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 20,
    gap: 6,
  },
  // RecordItem.container + content
  recordCard: {
    ...cardSurface,
    marginHorizontal: 16,
    marginVertical: 3,
    padding: 16,
    gap: 8,
  },

  // ---- 目標 ----
  // GoalsScreen.scrollContent
  goalList: {
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 6,
  },
  // GoalCard.card
  goalCard: {
    ...cardSurface,
    padding: 16,
  },
  // GoalCard.styleRow
  goalStyleRow: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    columnGap: 8,
  },
  // GoalCard.timeBlock
  goalTimeBlock: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 4,
  },
  // GoalsScreen.createButton
  goalCreateButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: TABLE_BORDER,
  },

  // ---- チーム ----
  // TeamDetailView.header / switcherButton / headerActions
  teamHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  teamHeaderName: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  teamHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  // TeamTabs.container / tab
  teamTabs: {
    ...cardSurface,
    flexDirection: "row",
    overflow: "hidden",
    marginHorizontal: 12,
    marginTop: 4,
    marginBottom: 4,
  },
  teamTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 9,
    paddingHorizontal: 4,
  },
  // TeamMemberList.container / fixedTop / groupFilterRow
  teamMembers: {
    flex: 1,
    backgroundColor: "#F9FAFB",
  },
  teamFilterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingTop: 8,
    marginBottom: 8,
  },
  // TeamMemberList.tableWrapper
  teamTable: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TABLE_BORDER,
    overflow: "hidden",
  },
  teamTableHeader: {
    flexDirection: "row",
    height: 46,
    borderBottomWidth: 1,
    borderBottomColor: TABLE_BORDER,
  },
  teamTableHeaderRight: {
    flex: 1,
    overflow: "hidden",
  },
  teamTableHeaderStyles: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  teamTableHeaderDistances: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderTopColor: TABLE_BORDER,
  },
  teamTableRow: {
    flexDirection: "row",
    height: 30,
    borderTopWidth: 1,
    borderTopColor: TABLE_BORDER,
  },
  // NAME_COL_WIDTH = 76
  teamNameCell: {
    width: 76,
    justifyContent: "center",
    paddingHorizontal: 5,
    backgroundColor: "#F9FAFB",
    borderRightWidth: 1,
    borderRightColor: TABLE_BORDER,
  },
  teamNameHeaderCell: {
    paddingHorizontal: 6,
  },
  // TIME_CELL_WIDTH = 58
  teamTimeCell: {
    width: 58,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 2,
  },

  // ---- アカウント ----
  // MyPageScreen.scrollContent
  accountRoot: {
    paddingTop: 16,
    gap: 16,
  },
  // MyPageScreen.profileCard + ProfileDisplay.container
  profileSection: {
    ...sectionSurface,
    paddingVertical: 20,
  },
  profileInner: {
    alignItems: "center",
    paddingHorizontal: 16,
  },
  // ProfileDisplay.name
  profileName: {
    marginTop: 10,
  },
  // ProfileDisplay.meta
  profileMeta: {
    marginTop: 2,
  },
  // ProfileDisplay.teamsContainer
  profileChips: {
    marginTop: 12,
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  // ProfileDisplay.editButton
  profileEditButton: {
    alignSelf: "stretch",
    alignItems: "center",
    marginTop: 14,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TABLE_BORDER,
    backgroundColor: colors.surface,
  },
  // AccountList の group / row
  accountGroup: {
    ...cardSurface,
    marginHorizontal: 16,
    overflow: "hidden",
  },
  accountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  accountRowCenter: {
    justifyContent: "center",
  },
  accountRowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },

  // ---- ホーム ----
  // DashboardScreen.scrollContent
  dashboardRoot: {
    paddingTop: 8,
  },
  // DashboardNoticesSection.container / header
  noticesCard: {
    ...cardSurface,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
  },
  noticesHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 28,
  },
  // NextCompetitionCard.card / top / row / rowGoal
  nextCompetitionCard: {
    ...cardSurface,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 14,
  },
  nextCompetitionTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 6,
  },
  nextCompetitionLine: {
    marginTop: 1,
  },
  nextCompetitionEntry: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: "#F3F4F6",
  },
  nextCompetitionGoal: {
    width: 120,
    alignItems: "flex-end",
  },
  // DashboardScreen.calendar + CalendarView.container
  calendar: {
    marginTop: 12,
    backgroundColor: colors.surface,
  },
  // CalendarHeader.container / leftSection / navButton / monthYearButton / todayButton
  calendarHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  calendarHeaderLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  calendarNavButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  calendarMonthButton: {
    minWidth: 100,
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  calendarTodayButton: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  // CalendarView.weekdayHeader / weekdayCell
  weekdayRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: "#F9FAFB",
  },
  weekdayCell: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 3,
  },
  weekRow: {
    flexDirection: "row",
  },
  // CalendarDay.container (日付は左上)
  dayCell: {
    flex: 1,
    minHeight: 56,
    padding: 4,
    borderRightWidth: 0.5,
    borderBottomWidth: 0.5,
    borderColor: colors.border,
  },
  dayCellLastColumn: {
    borderRightWidth: 0,
  },
  dayCellOtherMonth: {
    backgroundColor: "#F3F4F6",
  },
  // DashboardScreen.bestTimes + DashboardBestTimesSection.section + BestTimesTable.container
  bestTimes: {
    ...sectionSurface,
    marginTop: 12,
    paddingVertical: 16,
    gap: 12,
  },
  // BestTimesTable の操作行 (タイトル + 水路の切替 + 引き継ぎ含む)。幅が足りなければ折り返す
  bestTimesControls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    columnGap: 8,
    rowGap: 8,
    paddingHorizontal: 16,
  },
  bestTimesRelay: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  // BestTimesTable.tableContainer / headerRow / row / cell
  bestTimesTable: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: TABLE_BORDER,
  },
  bestTimesHeaderRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: TABLE_BORDER,
  },
  bestTimesRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: TABLE_BORDER,
  },
  bestTimesRowLast: {
    borderBottomWidth: 0,
  },
  bestTimesDistanceCell: {
    width: 40,
    backgroundColor: "#F9FAFB",
  },
  bestTimesStyleCell: {
    flex: 1,
  },
  bestTimesHeaderCell: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    paddingHorizontal: 2,
    borderRightWidth: 1,
    borderRightColor: TABLE_BORDER,
  },
  bestTimesBodyCell: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 30,
    paddingVertical: 4,
    paddingHorizontal: 2,
    borderRightWidth: 1,
    borderRightColor: TABLE_BORDER,
  },
  // BestTimesTable の注記 (marginTop -4 で表との間を 8 にしている)
  bestTimesNote: {
    marginTop: -4,
    paddingHorizontal: 16,
  },
  // BestTimesTable のフッター (タイム/点数の切替 + 一括入力)
  bestTimesFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },
});
