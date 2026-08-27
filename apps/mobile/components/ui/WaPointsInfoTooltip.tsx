import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet, StyleProp, ViewStyle } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

export interface WaPointsInfoTooltipProps {
  /** タップ判定用の testID。呼び出し元(3画面)ごとに一意な値を渡すこと */
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * WAポイントの算出方法を説明する info アイコン + タップ開閉パネル。
 * web 版 (`apps/web/components/ui/WaPointsInfoTooltip.tsx`) の RN 移植だが、
 * hover/focus-within や絶対配置に依存する web の実装はそのまま持ち込めないため、
 * `TimeInputHelp.tsx` の「info アイコン + タップで開閉するインラインパネル」パターンに合わせている。
 * 表は横スクロール可能な ScrollView 内にあるため、絶対配置のフローティングボックスは使わない。
 *
 * 文言は `teams.waPointsCompare` 名前空間 (infoAriaLabel / infoTooltip) を単一ソースとして
 * マイページ・メンバー詳細・メンバー一覧の3画面から共用する。
 */
export const WaPointsInfoTooltip: React.FC<WaPointsInfoTooltipProps> = ({ testID, style }) => {
  const { t } = useTranslation();
  const [showInfo, setShowInfo] = useState(false);

  return (
    <View style={style}>
      <Pressable
        testID={testID}
        onPress={() => setShowInfo((prev) => !prev)}
        style={styles.iconButton}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityState={{ expanded: showInfo }}
        accessibilityLabel={t("teams.waPointsCompare.infoAriaLabel")}
      >
        <Feather name="info" size={14} color={showInfo ? "#2563EB" : "#6B7280"} />
      </Pressable>
      {showInfo && (
        <View style={styles.panel}>
          <Text style={styles.panelText}>{t("teams.waPointsCompare.infoTooltip")}</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  iconButton: {
    alignSelf: "flex-start",
  },
  panel: {
    width: 260,
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    borderRadius: 8,
    padding: 12,
    marginTop: 6,
  },
  panelText: {
    fontSize: 13,
    color: "#374151",
    lineHeight: 20,
  },
});
