import React from "react";
import {
  Pressable,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * 押下時の縮小率。0.97 は「触れた手応え」が出る最小限で、レイアウトのズレとしては
 * 意識されない。アイコンだけの小さなボタンは 0.9 程度まで下げた方が分かりやすい。
 */
const DEFAULT_PRESSED_SCALE = 0.97;
/** 縮小と同時にわずかに薄くする。従来の `pressed && { opacity: 0.7 }` より控えめにする */
const PRESSED_OPACITY = 0.9;
/** 押した瞬間は速く (指に追従している感覚)、離したときは少しゆっくり戻す */
const PRESS_IN_MS = 90;
const PRESS_OUT_MS = 160;

export interface PressableScaleProps extends Omit<PressableProps, "style"> {
  /**
   * 静的なスタイルのみ。`({ pressed }) => ...` の関数形式は受け付けない
   * (押下時の見た目はこのコンポーネントが scale/opacity で担うため)。
   */
  style?: StyleProp<ViewStyle>;
  /** 押下時の縮小率 (既定 0.97) */
  scaleTo?: number;
}

/**
 * 押すとわずかに縮む Pressable
 *
 * 一覧のカードや主要ボタンに使い、タップした手応えを揃える。アニメーションは
 * UI スレッド (reanimated) で動くので、JS が重い場面でも押下の反応は途切れない。
 * OS の「視差効果を減らす」設定が有効なときは reanimated が自動で動きを省略し、
 * 終端の状態だけが反映される。
 * shared value の読み書きは `.get()` / `.set()` で行う (`.value` への代入は
 * React Compiler の lint (react-hooks/immutability) に弾かれる)。
 */
export const PressableScale: React.FC<PressableScaleProps> = ({
  style,
  scaleTo = DEFAULT_PRESSED_SCALE,
  onPressIn,
  onPressOut,
  children,
  ...rest
}) => {
  // 0 = 通常、1 = 押下中。scale/opacity はこの値から導出する
  const pressed = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => {
    const progress = pressed.get();
    return {
      transform: [{ scale: 1 - (1 - scaleTo) * progress }],
      opacity: 1 - (1 - PRESSED_OPACITY) * progress,
    };
  });

  const handlePressIn = (event: GestureResponderEvent) => {
    pressed.set(withTiming(1, { duration: PRESS_IN_MS, easing: Easing.out(Easing.quad) }));
    onPressIn?.(event);
  };

  const handlePressOut = (event: GestureResponderEvent) => {
    pressed.set(withTiming(0, { duration: PRESS_OUT_MS, easing: Easing.out(Easing.quad) }));
    onPressOut?.(event);
  };

  return (
    <AnimatedPressable
      {...rest}
      style={[style, animatedStyle]}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      {children}
    </AnimatedPressable>
  );
};
