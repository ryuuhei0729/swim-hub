import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { ChipScrollRow } from "@/components/ui/ChipScrollRow";
import { TEAM_TAB_DEFS, type TeamTabType } from "./teamTabDefs";

// タブの定義元は ./teamTabDefs.ts の 1 本。ここは描画だけを担う。
// 既存の import 経路 (navigation/types.ts・TeamDetailScreen.tsx・
// components/teams/index.ts) を維持するため型は再 export する
export type { TeamTabType };

export interface TeamTabsProps {
  activeTab: TeamTabType;
  onTabChange: (tab: TeamTabType) => void;
  isAdmin?: boolean;
  /** 承認待ちメンバー数（メンバータブにバッジ表示。web TeamAdminTabs の pendingCount 相当） */
  pendingCount?: number;
}

/**
 * チームタブコンポーネント
 * メンバー、練習、大会、出欠、ランキング、お知らせ、設定のタブ切り替え
 * お知らせ・グループタブは管理者ビュー時のみ表示
 *
 * タブは横スクロールさせる。非管理者6タブ/管理者8タブを幅 360dp の端末に
 * 均等割り (flex:1) で詰め込むと1タブ約51dp になりラベルが読めなくなるため、
 * 各タブは内容に応じた幅にして溢れた分は横スクロールで見せる
 * (web の components/team/TeamTabs.tsx が `overflow-x-auto` + `whitespace-nowrap`
 * で解決しているのと同じ方針)。
 *
 * 横スクロールできること自体が気づかれにくいため、記録入力の種目チップ
 * (components/forms/StyleChipSelector.tsx) と同じ ChipScrollRow に載せ、
 * 右端に隠れたタブがある間だけ右端フェードを重ねる。
 */
export const TeamTabs: React.FC<TeamTabsProps> = ({
  activeTab,
  onTabChange,
  isAdmin = false,
  pendingCount = 0,
}) => {
  const { t } = useTranslation();
  const visibleTabs = TEAM_TAB_DEFS.filter((tab) => !tab.adminOnly || isAdmin);

  return (
    <View style={styles.container}>
      {/* 下線 (borderBottom) はスクロールする中身ではなく container 側に付ける。
          こうするとスクロール位置に関わらず可視領域の全幅に線が引かれ
          (web が `overflow-x-auto` の親 div 側に `border-b` を置いているのと同じ)、
          かつ右端フェードは線の上ではなく内側に重なるので線が途切れない */}
      <ChipScrollRow contentContainerStyle={styles.tabListContent}>
        {visibleTabs.map((tab) => {
          const isActive = activeTab === tab.id;
          const showBadge = tab.id === "members" && pendingCount > 0;

          return (
            <Pressable
              key={tab.id}
              style={[styles.tab, isActive && styles.tabActive]}
              onPress={() => onTabChange(tab.id)}
            >
              <Feather name={tab.icon} size={14} color={isActive ? "#2563EB" : "#6B7280"} />
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{t(tab.nameKey)}</Text>
              {showBadge && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{pendingCount > 99 ? "99+" : pendingCount}</Text>
                </View>
              )}
              {isActive && <View style={styles.tabIndicator} />}
            </Pressable>
          );
        })}
      </ChipScrollRow>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    marginHorizontal: 12,
    marginTop: 4,
    marginBottom: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 1,
    elevation: 1,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  tabListContent: {
    // タブが画面幅に収まる場合 (非管理者・大画面) に左へ寄って詰まって見えないよう、
    // 中身を可視領域まで伸ばして等間隔に配置する。溢れる場合は中身が可視領域より
    // 大きくなるため justifyContent は効かず、各タブは自然幅のまま横スクロールになる
    flexGrow: 1,
    justifyContent: "space-between",
    // ChipScrollRow 既定の gap 6 を打ち消す。タブは paddingHorizontal 12 で
    // 間隔を持っており、gap を足すとタブ数の多い管理者ビューで更に溢れる
    gap: 0,
  },
  tab: {
    // flex:1 の均等割りは廃止。タブ数が増えるとラベルが潰れるため、
    // 内容に応じた幅にして溢れた分を横スクロールで見せる
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    gap: 4,
    position: "relative",
  },
  tabActive: {
    backgroundColor: "#EFF6FF",
  },
  tabText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#6B7280",
  },
  tabTextActive: {
    color: "#2563EB",
    fontWeight: "600",
  },
  badge: {
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    backgroundColor: "#DC2626",
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  tabIndicator: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: "#2563EB",
  },
});
