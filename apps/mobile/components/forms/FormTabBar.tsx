import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";

export interface FormTab<T extends string> {
  id: T;
  label: string;
  /** trueのときタブラベルに赤ドットのエラーバッジを表示 */
  hasError?: boolean;
}

/**
 * "practice"    — 薄緑背景 + 濃緑テキスト。アプリ既存トークンを使用。
 * "competition" — 薄青背景 + 濃青テキスト。アプリ既存トークンを使用。
 * 省略時は "competition" と同じ青系。
 */
export type FormTabVariant = "practice" | "competition";

export interface FormTabBarProps<T extends string> {
  tabs: FormTab<T>[];
  activeTab: T;
  onTabChange: (tab: T) => void;
  /** アクティブタブの配色 variant。省略時は competition(青系) */
  variant?: FormTabVariant;
}

interface AccentTokens {
  /** アクティブタブの背景色(薄色) */
  bg: string;
  /** アクティブタブの枠線・テキスト色(中間色〜濃色) */
  color: string;
}

/**
 * variant ごとの色トークン。全てアプリ既存のコードベース内使用色から採用。
 *
 * competition:
 *   bg    #EFF6FF  blue-50  — App.tsx/MainStack.tsx/screens 全般で使われる薄青背景
 *   color #2563EB  blue-600 — ブランドブルー、tab navigator active tint 等
 *
 * practice:
 *   bg    #D1FAE5  emerald-100 — CalendarDay/settings success カード背景
 *   color #065F46  green-800   — CalendarDay/BestTimesTable の練習テキスト色
 */
const ACCENT_TOKENS: Record<FormTabVariant, AccentTokens> = {
  competition: { bg: "#EFF6FF", color: "#2563EB" },
  practice:    { bg: "#D1FAE5", color: "#065F46" },
};

/**
 * Chrome風フォルダタブバーコンポーネント（フォーム用）
 *
 * アクティブタブ: variant 色の背景 + 白文字 + 角丸上部 + 上/左/右枠線。
 *   marginBottom: -1 で baseline ラインに密着し、コンテンツと一体化。
 * 非アクティブタブ: 薄グレー背景 + グレー文字で凹んで見える。
 * エラーバッジ(赤ドット)・アクセシビリティ維持。横スワイプ非対応(タップ切替)。
 */
export function FormTabBar<T extends string>({
  tabs,
  activeTab,
  onTabChange,
  variant = "competition",
}: FormTabBarProps<T>): React.ReactElement {
  const { bg: accentBg, color: accentColor } = ACCENT_TOKENS[variant];

  return (
    <View style={styles.container}>
      <View style={styles.tabList}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <Pressable
              key={tab.id}
              style={({ pressed }) => [
                styles.tab,
                isActive
                  ? [styles.tabActive, { backgroundColor: accentBg, borderColor: accentColor }]
                  : styles.tabInactive,
                pressed && !isActive && styles.tabPressed,
              ]}
              onPress={() => onTabChange(tab.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={tab.label}
            >
              <View style={styles.tabContent}>
                <Text
                  style={[
                    styles.tabText,
                    isActive && { color: accentColor, fontWeight: "700" },
                  ]}
                >
                  {tab.label}
                </Text>
                {tab.hasError && <View style={styles.errorBadge} />}
              </View>
            </Pressable>
          );
        })}
      </View>
      {/* タブとコンテンツエリアの接合ライン。アクティブタブの marginBottom:-1 が重なる。 */}
      <View style={styles.baseline} />
    </View>
  );
}

const TAB_INACTIVE_BG = "#F3F4F6";
const TAB_INACTIVE_TEXT = "#6B7280";
const BASELINE_COLOR = "#D1D5DB";

const styles = StyleSheet.create({
  /** タブバー全体のラッパー */
  container: {
    backgroundColor: TAB_INACTIVE_BG,
    paddingTop: 8,
    paddingHorizontal: 8,
    // gap は使わず tabList と baseline を直接隣接させて隙間0を保証
  },
  /** タブ行 */
  tabList: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 3,
  },
  /** 個別タブ共通スタイル */
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 0,
    minHeight: 42,
  },
  /**
   * アクティブ: backgroundColor と borderColor は variant から動的に注入。
   * marginBottom: -1 で baseline(1px)に1px重ねることでタブ底辺の線を隠し
   * コンテンツエリアと一体化する Chrome 風の視覚を実現。
   */
  tabActive: {
    // backgroundColor / borderColor はインラインで variant 色を上書き
    marginBottom: -1,
    paddingBottom: 11,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  /** 非アクティブ: グレー背景、境界なし */
  tabInactive: {
    backgroundColor: TAB_INACTIVE_BG,
    borderTopColor: "transparent",
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
  },
  /** 非アクティブをタップ中のフィードバック */
  tabPressed: {
    backgroundColor: "#E5E7EB",
  },
  /** ラベル+バッジの横並びコンテナ */
  tabContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  /** タブテキスト(非アクティブ) */
  tabText: {
    fontSize: 13,
    fontWeight: "500",
    color: TAB_INACTIVE_TEXT,
    letterSpacing: 0.1,
  },
  /** エラーバッジ(赤ドット): 薄色背景上で視認しやすい濃い赤 #EF4444(red-500) */
  errorBadge: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#EF4444",
    marginTop: -4,
    marginLeft: -1,
  },
  /**
   * タブとコンテンツの接合ライン。
   * container に gap を付けないことで tabList と直接隣接(隙間0)。
   * アクティブタブの marginBottom:-1 がここに重なり底枠が消える。
   */
  baseline: {
    height: 1,
    backgroundColor: BASELINE_COLOR,
  },
});
