import { Platform } from "react-native";
import * as Clipboard from "expo-clipboard";

/**
 * テキストをクリップボードへコピーする。成功したら true、失敗したら false。
 *
 * Expo Go / ネイティブは expo-clipboard、web は Clipboard API を使い、
 * Clipboard API が使えない環境 (非 HTTPS 等) では非表示の textarea + execCommand に
 * フォールバックする。呼び出し元は false のときだけ失敗を通知すること
 * (通知の出し方は画面によって Alert / インライン文言と異なるためここでは行わない)。
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (Platform.OS !== "web") {
    try {
      await Clipboard.setStringAsync(text);
      return true;
    } catch {
      return false;
    }
  }

  if (navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";
  document.body.appendChild(textArea);
  textArea.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    document.body.removeChild(textArea);
  }
}
