import React from "react";
import { View, Text, Pressable, ScrollView, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";

export interface ItemTabsProps {
  count: number;
  activeIndex: number;
  onSelect: (i: number) => void;
  /** タブ末尾の + で項目を追加。未指定の場合は + を表示しない */
  onAdd?: () => void;
  /** タブ内の × で項目を削除。未指定の場合は × を表示しない */
  onRemove?: (i: number) => void;
  label: (i: number) => string;
  accent?: "blue" | "green";
  disabled?: boolean;
  testID?: string;
  /** アクティブタブと一体化して表示するコンテンツ */
  children: React.ReactNode;
}

const ACCENT_BLUE = "#2563EB";
const ACCENT_GREEN = "#065F46";
const ACCENT_BLUE_BG = "#EFF6FF";
const ACCENT_GREEN_BG = "#D1FAE5";

/**
 * Chrome 風フォルダタブ(サブタブ)コンポーネント。
 * 各セクション(エントリー/レースレコード/練習ログ)の内側で項目を切り替える。
 * タブ行はコンテンツパネルの上辺に密着し、アクティブタブはパネルと一体化する。
 * 各タブ右端に × 削除ボタン(onRemove 指定かつ count > 1 のとき)、末尾に + 追加ボタン。
 */
export function ItemTabs({
  count,
  activeIndex,
  onSelect,
  onAdd,
  onRemove,
  label,
  accent = "blue",
  disabled = false,
  testID,
  children,
}: ItemTabsProps): React.ReactElement {
  const accentColor = accent === "green" ? ACCENT_GREEN : ACCENT_BLUE;
  const accentBg = accent === "green" ? ACCENT_GREEN_BG : ACCENT_BLUE_BG;
  const showRemove = typeof onRemove === "function" && count > 1;
  const showAdd = typeof onAdd === "function";

  return (
    <View style={styles.container} testID={testID}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabList}
        keyboardShouldPersistTaps="handled"
      >
        {Array.from({ length: count }, (_, i) => {
          const isActive = i === activeIndex;
          return (
            <View
              key={i}
              style={[
                styles.tab,
                isActive
                  ? [styles.tabActive, { backgroundColor: accentBg, borderColor: accentColor }]
                  : styles.tabInactive,
                showRemove ? styles.tabWithRemove : null,
              ]}
            >
              <Pressable
                onPress={() => onSelect(i)}
                disabled={disabled}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
                accessibilityLabel={label(i)}
                testID={`item-tab-${i + 1}`}
                style={styles.tabLabelPressable}
              >
                <Text
                  style={[styles.tabText, isActive && { color: accentColor, fontWeight: "700" }]}
                  numberOfLines={1}
                >
                  {label(i)}
                </Text>
              </Pressable>
              {showRemove && (
                <Pressable
                  onPress={() => onRemove?.(i)}
                  disabled={disabled}
                  accessibilityRole="button"
                  accessibilityLabel="remove item"
                  testID={`item-tab-remove-${i + 1}`}
                  hitSlop={6}
                  style={styles.removeButton}
                >
                  <Feather name="x" size={14} color={isActive ? accentColor : "#9CA3AF"} />
                </Pressable>
              )}
            </View>
          );
        })}
        {showAdd && (
          <Pressable
            style={styles.addButton}
            onPress={onAdd}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel="add item"
            testID="item-tab-add"
          >
            <Feather name="plus" size={18} color={accentColor} />
          </Pressable>
        )}
      </ScrollView>

      {/* コンテンツパネル: アクティブタブと一体化(上辺枠でタブと接合) */}
      <View style={styles.panel}>{children}</View>
    </View>
  );
}

const TAB_INACTIVE_BG = "#F3F4F6";
const TAB_INACTIVE_TEXT = "#6B7280";
const PANEL_BORDER = "#D1D5DB";

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
  },
  tabList: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 3,
    paddingTop: 4,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 0,
    paddingLeft: 12,
    paddingRight: 12,
    minHeight: 36,
  },
  /** × を表示するタブは右側パディングを詰めて × 用の余白を確保 */
  tabWithRemove: {
    paddingRight: 4,
  },
  /** アクティブ: marginBottom:-1 でパネル上辺に1px重ねてタブ底辺の線を隠す */
  tabActive: {
    marginBottom: -1,
  },
  tabInactive: {
    backgroundColor: TAB_INACTIVE_BG,
    borderColor: "transparent",
  },
  tabLabelPressable: {
    paddingVertical: 8,
    justifyContent: "center",
  },
  tabText: {
    fontSize: 13,
    fontWeight: "500",
    color: TAB_INACTIVE_TEXT,
  },
  removeButton: {
    marginLeft: 4,
    padding: 2,
    borderRadius: 4,
  },
  addButton: {
    marginLeft: 2,
    marginBottom: 4,
    padding: 6,
    borderRadius: 8,
  },
  /** コンテンツパネル: 枠線+下角丸。アクティブタブの marginBottom:-1 がここに重なる */
  panel: {
    borderWidth: 1,
    borderColor: PANEL_BORDER,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    borderTopRightRadius: 10,
    backgroundColor: "#FFFFFF",
    padding: 12,
  },
});
