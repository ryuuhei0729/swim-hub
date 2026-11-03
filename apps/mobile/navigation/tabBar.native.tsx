import React from "react";
import {
  createNativeBottomTabNavigator,
  type NativeBottomTabNavigationOptions,
} from "@react-navigation/bottom-tabs/unstable";
import type {
  BottomTabNavigationOptions,
  createBottomTabNavigator,
} from "@react-navigation/bottom-tabs";
import type { TabParamList } from "./types";
import type { TabFeatherIcon, TabVisual } from "./tabBarTypes";

/**
 * OS 標準のタブバー (iOS / Android の実機・シミュレータ)
 *
 * react-native-screens のネイティブタブ (React Navigation 7 の
 * `@react-navigation/bottom-tabs/unstable`) を使う。
 * - iOS 26 以降: 半透明の Liquid Glass のバーになり、スクロールで小さくなる
 * - iOS 18 以前: 標準の UITabBar
 * - Android: Material 3 の BottomNavigationView (選択中はピルで示す)
 * アイコンは両 OS とも Feather と同じ形の PNG (assets/icons/tabs)。iOS の SF Symbols は
 * タブバーが太めに描き、太さを指定する API も無いため、線の細い PNG を template として
 * 渡し OS に色を塗らせる (JS 描画版の見た目とも揃う)。
 *
 * 型について: `TabNavigator` は JS 描画版 (`tabBar.tsx`) と同じ型で扱えるように、
 * ネイティブ版の navigator / options を JS 版の型にキャストして公開する。
 * option の中身は `satisfies NativeBottomTabNavigationOptions` でネイティブ側の型に
 * 合っていることを確認してからキャストしている。
 */
type JsTabNavigator = ReturnType<typeof createBottomTabNavigator<TabParamList>>;

/** タブのアイコン。OS が選択状態に応じて色を塗るので黒 1 色で用意する */
const TAB_ICONS: Record<TabFeatherIcon, number> = {
  home: require("../assets/icons/tabs/home.png"),
  clipboard: require("../assets/icons/tabs/clipboard.png"),
  "bar-chart-2": require("../assets/icons/tabs/bar-chart-2.png"),
  award: require("../assets/icons/tabs/award.png"),
  users: require("../assets/icons/tabs/users.png"),
  target: require("../assets/icons/tabs/target.png"),
  user: require("../assets/icons/tabs/user.png"),
};

export const createTabNavigator = () =>
  createNativeBottomTabNavigator<TabParamList>() as unknown as JsTabNavigator;

/** ネイティブのタブバーは下部インセットを自分で扱うので、JS 版のような SafeAreaView は要らない */
export const TabBarShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <>{children}</>
);

export const tabNavigatorScreenOptions = {
  headerShown: false,
  tabBarActiveTintColor: "#2563EB",
  tabBarInactiveTintColor: "#6B7280",
  // 既定 (iOS は medium) だとラベルが太く見えるので通常の太さにする
  tabBarLabelStyle: { fontWeight: "400", fontSize: 10 },
  // iOS 26: 下へスクロールしている間はバーを小さくして、一覧を広く見せる
  tabBarMinimizeBehavior: "onScrollDown",
  // Android (Material 3): 選択中のタブの背後に出るピルの色
  tabBarActiveIndicatorColor: "#DBEAFE",
  // Android (Material 3): 既定 (auto) は 4 タブ以上だと選択中しかラベルを出さないので、常に出す
  tabBarLabelVisibilityMode: "labeled",
  // iOS 18 以前と Android のバー背景 (iOS 26 の Liquid Glass では無視される)
  tabBarStyle: { backgroundColor: "#FFFFFF" },
} satisfies NativeBottomTabNavigationOptions as unknown as BottomTabNavigationOptions;

export const tabScreenOptions = (tab: TabVisual): BottomTabNavigationOptions =>
  ({
    title: tab.label,
    tabBarIcon: { type: "image", source: TAB_ICONS[tab.feather] },
  }) satisfies NativeBottomTabNavigationOptions as unknown as BottomTabNavigationOptions;
