import React from "react";
import { StyleSheet, Text } from "react-native";

/**
 * OS のフォント拡大は尊重しつつ、タブバー高さ (64 固定: 上下 padding 8 + アイコン 28 + ラベル)
 * に収まる上限を設ける。ラベル領域は 64-16-28(アイコン+margin) = 約 20dp で、10px の行高
 * (約 12dp) が 1.5 倍 (15px → 約 18dp) まで収まる。それを超える拡大は幅方向も
 * adjustsFontSizeToFit が縮めるので、上限は 1.5 とした。
 */
const MAX_FONT_SIZE_MULTIPLIER = 1.5;

interface TabBarLabelProps {
  color: string;
  children: string;
}

/**
 * 6タブ化で1タブあたりの幅が狭くなったため、既定ラベル (numberOfLines=1 で末尾が「…」に
 * 切れる) の代わりに使う。幅に収まらない言語 (en "Competitions" / de "Wettkämpfe" 等) は
 * adjustsFontSizeToFit で縮めて、切れも折り返しもさせない。
 */
export const TabBarLabel: React.FC<TabBarLabelProps> = ({ color, children }) => (
  <Text
    numberOfLines={1}
    adjustsFontSizeToFit
    minimumFontScale={0.7}
    maxFontSizeMultiplier={MAX_FONT_SIZE_MULTIPLIER}
    style={[styles.label, { color }]}
  >
    {children}
  </Text>
);

const styles = StyleSheet.create({
  label: {
    alignSelf: "stretch",
    textAlign: "center",
    fontSize: 10,
    fontWeight: "500",
    marginTop: 2,
  },
});
