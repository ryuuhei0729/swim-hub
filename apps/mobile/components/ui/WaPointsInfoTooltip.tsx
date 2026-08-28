import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet, StyleProp, ViewStyle } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { CenterModal } from "./CenterModal";

export interface WaPointsInfoTooltipProps {
  /** タップ判定用の testID。呼び出し元(3画面)ごとに一意な値を渡すこと */
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * WAポイントの算出方法を説明する info アイコン + タップで開くポップアップモーダル。
 * web 版 (`apps/web/components/ui/WaPointsInfoTooltip.tsx`) の RN 移植だが、
 * hover/focus-within や絶対配置に依存する web の実装はそのまま持ち込めない。
 * ユーザーから「タップしたらポップアップ(モーダル)が出るようにしてほしい」との要望があったため、
 * 以前の「タップで開閉するインラインパネル」(`TimeInputHelp.tsx` 型) から、中央配置の
 * ポップアップモーダル (`CenterModal`) に変更している。`BestTimeDetailSheet` と同じ見た目・
 * 挙動になるよう共通の `CenterModal` を使う。
 *
 * 文言は `teams.waPointsCompare` 名前空間 (infoAriaLabel / infoTooltip) を単一ソースとして
 * マイページ・メンバー詳細・メンバー一覧の3画面から共用する。
 */
export const WaPointsInfoTooltip: React.FC<WaPointsInfoTooltipProps> = ({ testID, style }) => {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  return (
    <View style={style}>
      <Pressable
        testID={testID}
        onPress={() => setVisible(true)}
        style={styles.iconButton}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityState={{ expanded: visible }}
        accessibilityLabel={t("teams.waPointsCompare.infoAriaLabel")}
      >
        <Feather name="info" size={14} color={visible ? "#2563EB" : "#6B7280"} />
      </Pressable>
      <CenterModal
        visible={visible}
        onClose={() => setVisible(false)}
        closeAccessibilityLabel={t("common.close")}
      >
        <Text style={styles.title}>{t("teams.waPointsCompare.infoAriaLabel")}</Text>
        <Text style={styles.body}>{t("teams.waPointsCompare.infoTooltip")}</Text>
      </CenterModal>
    </View>
  );
};

const styles = StyleSheet.create({
  iconButton: {
    alignSelf: "flex-start",
  },
  title: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 8,
  },
  body: {
    fontSize: 13,
    color: "#374151",
    lineHeight: 20,
  },
});
