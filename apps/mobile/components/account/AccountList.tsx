import React from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";
import { colors, cardSurface } from "@/constants/theme";

/**
 * アカウントタブとその詳細画面で使う、iOS の設定アプリ風のグループ化された一覧。
 * ListGroup の中に ListRow を並べると、行のあいだに区切り線が入る。
 */

interface ListGroupProps {
  /** グループの上に出す小さな見出し */
  header?: string;
  /** グループの下に出す補足 */
  footer?: string;
  children: React.ReactNode;
}

export const ListGroup: React.FC<ListGroupProps> = ({ header, footer, children }) => {
  const rows = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={styles.group}>
      {header ? <Text style={styles.groupHeader}>{header}</Text> : null}
      <View style={styles.groupBody}>
        {rows.map((row, index) => (
          <View key={index} style={index > 0 ? styles.rowDivider : undefined}>
            {row}
          </View>
        ))}
      </View>
      {footer ? <Text style={styles.groupFooter}>{footer}</Text> : null}
    </View>
  );
};

type FeatherName = React.ComponentProps<typeof Feather>["name"];

interface ListRowProps {
  label: string;
  /** 左に出すアイコン (色付きの角丸の中に白で描く) */
  icon?: FeatherName;
  iconColor?: string;
  /** 右に出す値 (プラン名・件数など) */
  value?: string;
  /** 右端の記号。chevron = 画面遷移、external = 外部へ、none = なし */
  accessory?: "chevron" | "external" | "none";
  /** 文字色の種類。action = 青 (ボタン的な行)、destructive = 赤 */
  tone?: "default" | "action" | "destructive";
  /** ラベルを中央寄せにする (ログアウトなど単独のボタン行) */
  centered?: boolean;
  loading?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  testID?: string;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /** value の代わりに右側へ置く任意の要素 (バッジなど) */
  right?: React.ReactNode;
}

export const ListRow: React.FC<ListRowProps> = ({
  label,
  icon,
  iconColor = colors.primary,
  value,
  accessory = "chevron",
  tone = "default",
  centered = false,
  loading = false,
  disabled = false,
  onPress,
  testID,
  accessibilityLabel,
  accessibilityHint,
  right,
}) => {
  const labelColor =
    tone === "destructive" ? "#DC2626" : tone === "action" ? colors.primary : colors.textPrimary;

  const content = (
    <>
      {icon ? (
        <View style={[styles.iconBox, { backgroundColor: iconColor }]}>
          <Feather name={icon} size={15} color="#FFFFFF" />
        </View>
      ) : null}
      <Text
        style={[styles.label, { color: labelColor }, centered && styles.labelCentered]}
        numberOfLines={1}
      >
        {label}
      </Text>
      {loading ? <ActivityIndicator size="small" color={colors.primary} /> : null}
      {!loading && right}
      {!loading && !right && value ? (
        <Text style={styles.value} numberOfLines={1}>
          {value}
        </Text>
      ) : null}
      {!centered && accessory === "chevron" ? (
        <Feather name="chevron-right" size={18} color="#9CA3AF" />
      ) : null}
      {!centered && accessory === "external" ? (
        <Feather name="external-link" size={15} color="#9CA3AF" />
      ) : null}
    </>
  );

  if (!onPress) {
    return (
      <View style={styles.row} testID={testID}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed, disabled && styles.rowDisabled]}
      onPress={onPress}
      disabled={disabled || loading}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: disabled || loading }}
    >
      {content}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  group: {
    marginHorizontal: 16,
  },
  groupHeader: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textSecondary,
    marginLeft: 12,
    marginBottom: 6,
  },
  groupBody: {
    ...cardSurface,
    overflow: "hidden",
  },
  groupFooter: {
    fontSize: 12,
    color: colors.textSecondary,
    marginLeft: 12,
    marginRight: 12,
    marginTop: 6,
    lineHeight: 17,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: colors.surface,
  },
  rowPressed: {
    backgroundColor: "#F3F4F6",
  },
  rowDisabled: {
    opacity: 0.5,
  },
  iconBox: {
    width: 28,
    height: 28,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
  },
  labelCentered: {
    textAlign: "center",
    fontWeight: "600",
  },
  value: {
    fontSize: 14,
    color: colors.textSecondary,
    maxWidth: "45%",
  },
});
