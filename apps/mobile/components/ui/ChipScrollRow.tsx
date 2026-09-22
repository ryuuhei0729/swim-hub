import React, { useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  type StyleProp,
  type ViewStyle,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";

/**
 * 右端フェードの幅 (px)。28px ではスクロールできることに気づきにくいという
 * フィードバックを受けて広げた。チーム詳細のタブ 1 個ぶん
 * (アイコン + ラベル 5 文字 + 左右 padding 12) に相当し、右端の項目が
 * 頭から霞み始める。フェードを使う行は全てこの 1 本の値で揃える
 */
const EDGE_FADE_WIDTH = 96;

/**
 * 右端フェードを出すか。スクロール可能で、かつ右端まで到達していないときだけ出す。
 * 計測値 (onLayout / onContentSizeChange / contentOffset) は端末により 1px 未満の
 * 丸め差が出るため、両判定に 1px の許容を置く
 */
export function shouldShowRightFade(params: {
  containerWidth: number;
  contentWidth: number;
  scrollX: number;
}): boolean {
  const { containerWidth, contentWidth, scrollX } = params;
  const isScrollable = contentWidth > containerWidth + 1;
  const isAtEnd = scrollX >= contentWidth - containerWidth - 1;
  return isScrollable && !isAtEnd;
}

export interface ChipScrollRowProps {
  children: React.ReactNode;
  /** ScrollView 自体のスタイル。下線などスクロールしても動かない装飾に使う */
  style?: StyleProp<ViewStyle>;
  /** 既定の chipRow (横並び + gap 6) にマージされる */
  contentContainerStyle?: StyleProp<ViewStyle>;
}

/** 横スクロール可能なチップ行。スクロール可能な間だけ右端にフェードを重ねてスクロール可能であることを示す */
export const ChipScrollRow: React.FC<ChipScrollRowProps> = ({
  children,
  style,
  contentContainerStyle,
}) => {
  const [containerWidth, setContainerWidth] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);
  const [scrollX, setScrollX] = useState(0);

  const showRightFade = shouldShowRightFade({ containerWidth, contentWidth, scrollX });

  return (
    <View
      style={styles.chipRowWrapper}
      onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={style}
        contentContainerStyle={[styles.chipRow, contentContainerStyle]}
        onContentSizeChange={(w) => setContentWidth(w)}
        onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) =>
          setScrollX(e.nativeEvent.contentOffset.x)
        }
        scrollEventThrottle={16}
      >
        {children}
      </ScrollView>
      {showRightFade && (
        <LinearGradient
          colors={["rgba(255,255,255,0)", "#FFFFFF"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.edgeFade}
          pointerEvents="none"
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  chipRowWrapper: {
    position: "relative",
  },
  chipRow: {
    flexDirection: "row",
    gap: 6,
  },
  edgeFade: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: EDGE_FADE_WIDTH,
  },
});
