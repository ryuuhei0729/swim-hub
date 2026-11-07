import React, { useEffect } from "react";
import { StyleSheet } from "react-native";
import { useNavigationState } from "@react-navigation/native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
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
 * - iOS 26 以降: 半透明の Liquid Glass のバーになる (スクロールでは小さくしない)
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
  // iOS 26: スクロールしてもバーを小さくしない (2026-11-07 ユーザー指定。以前は onScrollDown)
  tabBarMinimizeBehavior: "never",
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
    tabBarBadge: tab.badge,
  }) satisfies NativeBottomTabNavigationOptions as unknown as BottomTabNavigationOptions;

/** タブを切り替えたときに中身をふわっと出す時間 (ms) */
const TAB_FADE_MS = 150;

/**
 * タブの中身のフェードイン
 *
 * OS 標準のタブバーは切り替えアニメーションを持たない (一瞬で切り替わる) ので、
 * 画面の中身の方を reanimated でふわっと出す。
 * 「選ばれているか」は useIsFocused ではなくタブナビゲーター自身の state で見る。
 * useIsFocused だと、上にスタックの画面 (チーム詳細など) を積んだだけでも false になり、
 * 戻るときのスライドの間に中身が透明のまま見えてしまうため。
 * 選ばれていない間は透明にしておき、選ばれた瞬間から不透明へ動かす
 * (先に不透明のまま一瞬見えてから消える、というちらつきを防ぐ)。
 * OS の「視差効果を減らす」設定が有効なときは動かさない。
 */
const TabFadeIn: React.FC<{ routeKey: string; children: React.ReactNode }> = ({
  routeKey,
  children,
}) => {
  const selected = useNavigationState((state) => state.routes[state.index]?.key === routeKey);
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(selected ? 0 : 1);

  // shared value の読み書きは `.get()` / `.set()` で行う (React Compiler の lint の都合)
  useEffect(() => {
    if (reduceMotion) {
      opacity.set(1);
      return;
    }
    opacity.set(
      selected ? withTiming(1, { duration: TAB_FADE_MS, easing: Easing.out(Easing.quad) }) : 0,
    );
  }, [opacity, reduceMotion, selected]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.get() }));

  return <Animated.View style={[styles.fill, animatedStyle]}>{children}</Animated.View>;
};

/** Tab.Navigator の screenLayout。各タブ画面を TabFadeIn で包む */
export const tabNavigatorScreenLayout: NonNullable<
  React.ComponentProps<JsTabNavigator["Navigator"]>["screenLayout"]
> = ({ route, children }) => <TabFadeIn routeKey={route.key}>{children}</TabFadeIn>;

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});
