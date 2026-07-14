import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet, StyleProp, ViewStyle } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";

export interface TimeInputHelpProps {
  /**
   * true の場合、前セルからの引き継ぎ (十の位・分) の説明も表示する。
   * クイック入力コンテキストを共有する画面 (練習タイム・チーム一括入力) のみ true。
   */
  showCarryOver?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * タイム入力欄の「タイム入力のコツ」ヘルプ (i アイコン + 開閉パネル)。
 * PracticeTimeFormScreen のインライン実装を全タイム入力画面向けに共通化したもの。
 */
export const TimeInputHelp: React.FC<TimeInputHelpProps> = ({ showCarryOver = false, style }) => {
  const { t } = useTranslation();
  const [showHelp, setShowHelp] = useState(false);

  return (
    <View style={style}>
      <Pressable
        onPress={() => setShowHelp((prev) => !prev)}
        style={styles.hintRow}
        accessibilityRole="button"
        accessibilityState={{ expanded: showHelp }}
        accessibilityLabel={t("forms.timeInput.helpTitle")}
      >
        <Feather name="info" size={14} color={showHelp ? "#2563EB" : "#6B7280"} />
        <Text style={[styles.hintLabel, showHelp && styles.hintLabelActive]}>
          {t("forms.timeInput.helpTitle")}
        </Text>
      </Pressable>
      {showHelp && (
        <View style={styles.helpPanel}>
          <Text style={styles.helpBody}>
            {showCarryOver ? t("forms.timeInput.helpBody") : t("forms.timeInput.helpBodyBasic")}
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  hintRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
  },
  hintLabel: {
    fontSize: 13,
    color: "#6B7280",
  },
  hintLabelActive: {
    color: "#2563EB",
  },
  helpPanel: {
    backgroundColor: "#EFF6FF",
    borderWidth: 1,
    borderColor: "#BFDBFE",
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  helpBody: {
    fontSize: 13,
    color: "#374151",
    lineHeight: 20,
  },
});
