import React from "react";
import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  createBottomTabNavigator,
  type BottomTabNavigationOptions,
} from "@react-navigation/bottom-tabs";
import { Feather } from "@expo/vector-icons";
import { TabBarLabel } from "./TabBarLabel";
import type { TabParamList } from "./types";
import type { TabVisual } from "./tabBarTypes";

/**
 * JS 描画のタブバー (web とテスト用のフォールバック)
 *
 * iOS / Android の実機では Metro が `tabBar.native.tsx` を優先して解決し、
 * OS 標準のタブバーが使われる。こちらは react-native-web で動くナビゲーション
 * 統合テスト (`__tests__/navigation-integration`) と web 向けに残している。
 * 公開する API (createTabNavigator / TabBarShell / tabNavigatorScreenOptions /
 * tabScreenOptions) は native 側と同じ形にしてある。
 */
export const createTabNavigator = () => createBottomTabNavigator<TabParamList>();

/**
 * Android のシステムナビゲーションバー(3ボタン)ぶんの下部インセットは、
 * JS の useSafeAreaInsets フックが一部端末で 0 を返す既知不具合
 * (safe-area-context #546) があるため使わない。代わりにネイティブ経路で
 * 信頼できる SafeAreaView(edges=["bottom"]) でナビゲーター全体を包み、
 * タブバーはその上端に固定させる。
 */
export const TabBarShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
    {children}
  </SafeAreaView>
);

export const tabNavigatorScreenOptions: BottomTabNavigationOptions = {
  headerShown: false,
  // タブ切替時に左右へ少しずらしながらフェードさせる。
  // 移動方向(左右のタブ)に応じて入ってくる向きが変わる
  animation: "shift",
  tabBarActiveTintColor: "#2563EB",
  tabBarInactiveTintColor: "#6B7280",
  tabBarStyle: {
    backgroundColor: "#FFFFFF",
    borderTopColor: "#E5E7EB",
    borderTopWidth: 1,
    paddingTop: 8,
    paddingBottom: 8,
    // 6タブで360dp幅でも各ラベルの幅を確保するため左右の余白は取らない
    paddingHorizontal: 0,
    height: 64,
  },
  tabBarIconStyle: {
    marginTop: 4,
  },
};

/**
 * JS 描画版は `animation: "shift"` で切り替えが動くので、画面を包む必要はない
 * (ネイティブ版は tabBar.native.tsx でフェードインの部品を差し込む)
 */
export const tabNavigatorScreenLayout = undefined;

/** カスタムラベルは accessibilityLabel を自動導出しないため、表示文言を明示的に渡す */
export const tabScreenOptions = (tab: TabVisual): BottomTabNavigationOptions => ({
  tabBarLabel: ({ color }) => <TabBarLabel color={color}>{tab.label}</TabBarLabel>,
  tabBarAccessibilityLabel: tab.label,
  tabBarButtonTestID: tab.testID,
  tabBarIcon: ({ color }) => <Feather name={tab.feather} size={20} color={color} />,
  tabBarBadge: tab.badge,
});

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    // タブバーと下部インセット帯を同色にしてシステムナビゲーションバー
    // 上端までを白で埋め、タブバーが浮いて見えないようにする。
    backgroundColor: "#FFFFFF",
  },
});
