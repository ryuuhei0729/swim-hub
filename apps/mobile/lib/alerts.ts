// =============================================================================
// Alert.alert ラッパー - i18n 対応の共通ヘルパー
// =============================================================================
//
// Plan の Phase M3 冒頭で導入予定だったが、auth は Alert を使わない実装だったため
// Phase M5 (practice) から導入。t() 関数を引数で受け取る pure な薄いラッパー。

import { Alert, type AlertButton } from "react-native";
import type { TFunction } from "i18next";

interface ConfirmOptions {
  /** 確認ボタンの style (default: "default") */
  confirmStyle?: AlertButton["style"];
  /** 確認ボタンのキー (default: "common.confirm" がなければ翻訳キーを直指定) */
  confirmKey?: string;
  /** キャンセルボタンのキー (default: "common.cancel") */
  cancelKey?: string;
}

/**
 * 確認ダイアログ。OK = onConfirm, Cancel = no-op。
 */
export function showConfirmAlert(
  t: TFunction,
  titleKey: string,
  messageKey: string,
  onConfirm: () => void | Promise<void>,
  options: ConfirmOptions = {},
): void {
  const {
    confirmStyle = "default",
    confirmKey = "common.submit",
    cancelKey = "common.cancel",
  } = options;

  Alert.alert(t(titleKey), t(messageKey), [
    { text: t(cancelKey), style: "cancel" },
    {
      text: t(confirmKey),
      style: confirmStyle,
      onPress: () => {
        void onConfirm();
      },
    },
  ]);
}

/**
 * エラーダイアログ。OK のみ。
 */
export function showErrorAlert(t: TFunction, messageKey: string, titleKey = "common.error"): void {
  Alert.alert(t(titleKey), t(messageKey));
}

/**
 * 情報ダイアログ。OK のみ。
 */
export function showInfoAlert(t: TFunction, titleKey: string, messageKey?: string): void {
  Alert.alert(t(titleKey), messageKey ? t(messageKey) : undefined);
}

/**
 * メッセージ文字列を直接渡すバリエーション (動的メッセージ用)。
 * 翻訳済み文字列 (error.message 等) を渡すケースで使う。
 */
export function showErrorAlertRaw(t: TFunction, message: string, titleKey = "common.error"): void {
  Alert.alert(t(titleKey), message);
}
