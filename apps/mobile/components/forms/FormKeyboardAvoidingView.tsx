import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  type KeyboardAvoidingViewProps,
  type LayoutChangeEvent,
} from "react-native";
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

type MeasurableView = {
  measureInWindow?: (callback: (x: number, y: number, width: number, height: number) => void) => void;
};

/**
 * フォーム画面・モーダルで使う KeyboardAvoidingView の唯一の定義元。
 * `behavior`/`keyboardVerticalOffset` の判定ロジックは `useKeyboardAvoidingBehavior` に集約し、
 * 個々の画面・コンポーネントには一切コピペしない。
 *
 * Android の `keyboardVerticalOffset` だけはここで実測する。KeyboardAvoidingView は
 * 「自分の位置 (親基準) + 高さ − キーボード上端 (画面基準)」で隠れる量を計算するため、
 * 親の上端の画面上の位置 (ヘッダー・ステータスバーの高さ) を offset で補う必要がある。
 * Android のヘッダー高さは機種・設定で変わり固定値にできないため、
 * 「画面上の位置 (measureInWindow) − 親基準の位置」で求める。
 */
export const FormKeyboardAvoidingView: React.FC<FormKeyboardAvoidingViewProps> = ({
  hasNativeHeader = true,
  children,
  onLayout,
  ...rest
}) => {
  const { behavior, keyboardVerticalOffset } = useKeyboardAvoidingBehavior(hasNativeHeader);
  const kavRef = useRef<KeyboardAvoidingView>(null);
  const [androidOffset, setAndroidOffset] = useState(0);
  const remeasureTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (remeasureTimerRef.current) clearTimeout(remeasureTimerRef.current);
    },
    [],
  );

  const measureAndroidOffset = useCallback((localY: number) => {
    // KeyboardAvoidingView が内側の View に付けている viewRef を使う (onLayout は内部で
    // await した後に呼ばれるため、イベントの currentTarget はもう使えない)
    const view = (kavRef.current as unknown as { viewRef?: { current?: MeasurableView | null } } | null)
      ?.viewRef?.current;
    view?.measureInWindow?.((_x, windowY) => {
      const next = Math.max(0, Math.round(windowY - localY));
      setAndroidOffset((prev) => (prev === next ? prev : next));
    });
  }, []);

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      onLayout?.(event);
      if (Platform.OS !== "android") return;
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

  return (
    <KeyboardAvoidingView
      ref={kavRef}
      behavior={behavior}
      keyboardVerticalOffset={Platform.OS === "android" ? androidOffset : keyboardVerticalOffset}
      onLayout={handleLayout}
      {...rest}
    >
      {children}
    </KeyboardAvoidingView>
  );
};
