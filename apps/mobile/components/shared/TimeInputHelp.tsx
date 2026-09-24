import React, { useState } from "react";
import { View, Text, Pressable, StyleSheet, StyleProp, ViewStyle } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import { CenterModal } from "@/components/ui/CenterModal";

export interface TimeInputHelpProps {
  /**
   * true の場合、前セルからの引き継ぎ (十の位・分) の説明も表示する。
   * クイック入力コンテキストを共有する画面 (練習タイム・チーム一括入力) のみ true。
   */
  showCarryOver?: boolean;
  /** タップ判定用の testID (省略可)。渡した場合はトリガー行の Pressable に配線される */
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * タイム入力欄の「タイム入力のコツ」ヘルプ (i アイコン + ラベル行、タップで中央ポップアップ)。
 *
 * 当初は「タップで開閉するインラインパネル」だったが、同じ info 系ヘルプである
 * `components/ui/WaPointsInfoTooltip.tsx` が先に中央ポップアップ (`CenterModal`) へ移行しており、
 * `CompetitionTabFormScreen` / `PracticeTimeFormScreen` は既にそちらでタイム入力のコツを
 * 出していたため、アプリ内に2種類の挙動が混在していた。ユーザー要望によりポップアップ側へ統一する。
 *
 * トリガーが「アイコンのみ」の `WaPointsInfoTooltip` と違い、こちらは
 * 「アイコン + 『タイム入力のコツ』ラベル」の行を保持する。呼び出し元 (一括入力系画面) では
 * 入力欄のラベルに隣接しておらず単独で置かれるため、ラベルを外すと何の説明か分からなくなる。
 * ポップアップの中身 (タイトル + 本文) は `WaPointsInfoTooltip` と同じ構成に揃えている。
 *
 * 挙動上の注意: `WaPointsInfoTooltip` と同様、再タップでは閉じない (開くだけ)。
 * 閉じるのは背面タップと閉じるボタン (×) のみ。
 */
export const TimeInputHelp: React.FC<TimeInputHelpProps> = ({
  showCarryOver = false,
  testID,
  style,
}) => {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const title = t("forms.timeInput.helpTitle");
  const body = showCarryOver
    ? t("forms.timeInput.helpBody")
    : t("forms.timeInput.helpBodyBasic");

  return (
    <View style={style}>
      <Pressable
        testID={testID}
        onPress={() => setVisible(true)}
        style={styles.hintRow}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityState={{ expanded: visible }}
        accessibilityLabel={title}
      >
        <Feather name="info" size={14} color={visible ? "#2563EB" : "#6B7280"} />
        <Text style={[styles.hintLabel, visible && styles.hintLabelActive]}>{title}</Text>
      </Pressable>
      <CenterModal
        visible={visible}
        onClose={() => setVisible(false)}
        closeAccessibilityLabel={t("common.close")}
      >
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>{body}</Text>
      </CenterModal>
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
