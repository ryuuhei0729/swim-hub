import React from "react";
import { KeyboardAvoidingView, type KeyboardAvoidingViewProps } from "react-native";
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

/**
 * フォーム画面・モーダルで使う KeyboardAvoidingView の唯一の定義元。
 * `behavior`/`keyboardVerticalOffset` の判定ロジックは `useKeyboardAvoidingBehavior` に集約し、
 * 個々の画面・コンポーネントには一切コピペしない。
 */
export const FormKeyboardAvoidingView: React.FC<FormKeyboardAvoidingViewProps> = ({
  hasNativeHeader = true,
  children,
  ...rest
}) => {
  const { behavior, keyboardVerticalOffset } = useKeyboardAvoidingBehavior(hasNativeHeader);

  return (
    <KeyboardAvoidingView
      behavior={behavior}
      keyboardVerticalOffset={keyboardVerticalOffset}
      {...rest}
    >
      {children}
    </KeyboardAvoidingView>
  );
};
