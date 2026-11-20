import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  type KeyboardAvoidingViewProps,
  type LayoutChangeEvent,
  type View,
} from "react-native";
import { KeyboardAvoidingView as KeyboardControllerAvoidingView } from "react-native-keyboard-controller";
import { useKeyboardAvoidingBehavior } from "@/hooks/useKeyboardAvoidingBehavior";

export interface FormKeyboardAvoidingViewProps
  extends Omit<KeyboardAvoidingViewProps, "behavior" | "keyboardVerticalOffset"> {
  /**
   * この KeyboardAvoidingView がネイティブヘッダー (react-navigation の
   * `headerShown: true`) を持つ画面の直下にあるか。既定 true (フォーム画面は全て該当)。
   *
   * `<Modal>` 配下 (CenterModal/SlideUpModal 等) はネイティブヘッダーを持たない独立した
   * ウィンドウのため false を渡すこと。詳細は `useKeyboardAvoidingBehavior` を参照。
   */
  hasNativeHeader?: boolean;
}

/** 画面遷移のアニメーションが落ち着いてから測り直すまでの時間 (Android) */
const ANDROID_REMEASURE_DELAY_MS = 500;

/**
 * フォーム画面・モーダルで使う KeyboardAvoidingView の唯一の定義元。
 * `behavior`/`keyboardVerticalOffset` の判定ロジックは `useKeyboardAvoidingBehavior` に集約し、
 * 個々の画面・コンポーネントには一切コピペしない。
 *
 * - iOS: RN の KeyboardAvoidingView (ヘッダー高さの offset は useKeyboardAvoidingBehavior が計算)
 * - Android: react-native-keyboard-controller の KeyboardAvoidingView。RN 標準は Android で
 *   キーボードの高さを表示/非表示の切り替わりで 1 回だけ通知するため、タイミングで低い値のまま
 *   固まり、画面下のボタンがキーボードに隠れることがあった (AI テスターで確認)。
 *   keyboard-controller は表示中も高さを追いかけ、edge-to-edge ではナビゲーションバー込みの
 *   本当の高さを使う。
 *   `keyboardVerticalOffset` (親の上端の画面上の位置 = ヘッダー・ステータスバー) は機種で変わるため、
 *   「画面上の位置 (measureInWindow) − 親基準の位置」を実測して渡す。
 */
export const FormKeyboardAvoidingView: React.FC<FormKeyboardAvoidingViewProps> = ({
  hasNativeHeader = true,
  children,
  onLayout,
  ...rest
}) => {
  const { behavior, keyboardVerticalOffset } = useKeyboardAvoidingBehavior(hasNativeHeader);
  const androidViewRef = useRef<View>(null);
  const [androidOffset, setAndroidOffset] = useState(0);
  const remeasureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (remeasureTimerRef.current) clearTimeout(remeasureTimerRef.current);
    },
    [],
  );

  const measureAndroidOffset = useCallback((localY: number) => {
    androidViewRef.current?.measureInWindow?.((_x, windowY) => {
      const next = Math.max(0, Math.round(windowY - localY));
      setAndroidOffset((prev) => (prev === next ? prev : next));
    });
  }, []);

  const handleAndroidLayout = useCallback(
    (event: LayoutChangeEvent) => {
      onLayout?.(event);
      const localY = event.nativeEvent.layout.y;
      measureAndroidOffset(localY);
      // 画面遷移のアニメーション中は画面上の位置がずれて見えるため、落ち着いた後にもう一度測る
      if (remeasureTimerRef.current) clearTimeout(remeasureTimerRef.current);
      remeasureTimerRef.current = setTimeout(
        () => measureAndroidOffset(localY),
        ANDROID_REMEASURE_DELAY_MS,
      );
    },
    [onLayout, measureAndroidOffset],
  );

  if (Platform.OS === "android") {
    // contentContainerStyle は behavior="position" 専用 (padding では RN でも使われない)
    const { contentContainerStyle: _unused, ...androidRest } = rest;
    return (
      <KeyboardControllerAvoidingView
        ref={androidViewRef}
        behavior={behavior}
        keyboardVerticalOffset={androidOffset + keyboardVerticalOffset}
        onLayout={handleAndroidLayout}
        {...androidRest}
      >
        {children}
      </KeyboardControllerAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={behavior}
      keyboardVerticalOffset={keyboardVerticalOffset}
      onLayout={onLayout}
      {...rest}
    >
      {children}
    </KeyboardAvoidingView>
  );
};
