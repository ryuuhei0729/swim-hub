import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { TEAM_TAB_DEFS, type TeamTabType } from "./teamTabDefs";
import { cardSurface } from "@/constants/theme";

// タブの定義元は ./teamTabDefs.ts の 1 本。ここは描画だけを担う。
// 既存の import 経路 (navigation/types.ts・TeamDetailView.tsx・
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
 * メンバー・予定・出欠・その他 の 4 タブを均等幅で並べる。
 *
 * タブの数・位置は管理者ビューでも変えない (以前は管理者ビューで 7→9 タブに増え、
 * 横スクロールしないと右端のタブが見えなかった)。管理者向け機能はタブの中や
 * ヘッダーのアイコンから開くので、ここでは数を増やさない。
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
    <View style={styles.container} accessibilityRole="tablist">
      {visibleTabs.map((tab) => {
        const isActive = activeTab === tab.id;
        const showBadge = tab.id === "members" && pendingCount > 0;

        return (
          <Pressable
            key={tab.id}
            style={[styles.tab, isActive && styles.tabActive]}
            onPress={() => onTabChange(tab.id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
          >
            <Feather name={tab.icon} size={14} color={isActive ? "#2563EB" : "#6B7280"} />
            <Text style={[styles.tabText, isActive && styles.tabTextActive]} numberOfLines={1}>
              {t(tab.nameKey)}
            </Text>
            {showBadge && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{pendingCount > 99 ? "99+" : pendingCount}</Text>
              </View>
            )}
            {isActive && <View style={styles.tabIndicator} />}
          </Pressable>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...cardSurface,
    marginHorizontal: 12,
    marginTop: 4,
    marginBottom: 4,
    flexDirection: "row",
    overflow: "hidden",
  },
  tab: {
    // 4 タブを均等割りにする (タブ数は固定なので横スクロールは不要)
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 9,
    paddingHorizontal: 4,
    gap: 4,
    position: "relative",
  },
  tabActive: {
    backgroundColor: "#EFF6FF",
  },
  tabText: {
    flexShrink: 1,
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
