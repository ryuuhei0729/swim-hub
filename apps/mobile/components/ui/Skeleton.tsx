import React, { useEffect } from "react";
import { View, StyleSheet, type DimensionValue, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useTranslation } from "react-i18next";

/** ブロックの色。カードの白地・画面の薄青 (#EFF6FF) のどちらの上でも輪郭が出る濃さ */
const BLOCK_COLOR = "#E5E7EB";
/** 明滅の片道時間 (ms)。往復 1.8 秒程度が「動いているが気にならない」速さ */
const PULSE_MS = 900;
const PULSE_MIN_OPACITY = 0.45;

interface SkeletonProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * スケルトン (読み込み中の骨組み) の土台
 *
 * 配下の `SkeletonBlock` をまとめて明滅させる。ブロックごとにアニメーションを持たせると
 * 1画面で数十本の無駄なアニメーションが走るため、明滅はこの土台 1 つだけで行う。
 * 画面リーダーには「読み込み中」であることを progressbar として伝える
 * (灰色のブロックだけでは何も読み上げられない)。
 * OS の「視差効果を減らす」設定が有効なときは明滅せず、静止したブロックだけを出す。
 */
export const Skeleton: React.FC<SkeletonProps> = ({ children, style, testID }) => {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(1);

  // shared value の読み書きは `.get()` / `.set()` で行う (`.value` への代入は
  // React Compiler の lint (react-hooks/immutability) に弾かれる)
  useEffect(() => {
    if (reduceMotion) {
      opacity.set(1);
      return;
    }
    opacity.set(
      withRepeat(
        withSequence(
          withTiming(PULSE_MIN_OPACITY, { duration: PULSE_MS, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: PULSE_MS, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      ),
    );
    return () => cancelAnimation(opacity);
  }, [opacity, reduceMotion]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.get() }));

  return (
    <Animated.View
      style={[style, animatedStyle]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t("common.loading")}
      testID={testID}
    >
      {children}
    </Animated.View>
  );
};

interface SkeletonBlockProps {
  width?: DimensionValue;
  height?: number;
  /** 角丸。高さの半分を渡すとピル (タグ・バッジ) になる */
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * 文字・画像・バッジの「場所」を示す灰色のブロック。`Skeleton` の配下で使う。
 */
export const SkeletonBlock: React.FC<SkeletonBlockProps> = ({
  width = "100%",
  height = 14,
  radius = 6,
  style,
}) => <View style={[styles.block, { width, height, borderRadius: radius }, style]} />;

const styles = StyleSheet.create({
  block: {
    backgroundColor: BLOCK_COLOR,
  },
});
