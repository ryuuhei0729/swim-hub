// =============================================================================
// 通信エラーの表示文言
// =============================================================================
//
// 「保存に失敗しました」のような汎用文言では、圏外・低速回線が原因だと利用者に伝わらず、
// 電波の良い場所で再試行すればよいことに気付けない。通信起因のエラーだけを見分けて
// 専用の文言に差し替える。
//
// toUserFacingMessage (共通パッケージ) からも使えるよう、App.tsx で
// configureNetworkErrorMessage(getNetworkErrorMessage) として登録している。

import { onlineManager } from "@tanstack/react-query";
import { getNetworkErrorKind } from "@apps/shared/utils/networkError";
import { UserFacingError } from "@apps/shared/utils/userFacingError";
import i18n from "@/i18n";

interface NetworkErrorMessageOptions {
  /**
   * 端末がオフラインのとき、エラーの中身に関係なく「オフラインのため」と表示するか。
   * 圏外ではサーバーに届かないので、失敗の原因はほぼ確実に通信。ただし画面側が
   * 自前で用意した固定文言 (エラーオブジェクトが無い) には適用しない。
   */
  assumeOfflineCause?: boolean;
}

/**
 * 通信起因のエラーなら表示用の文言を返す。そうでなければ null (呼び出し側の文言を使う)。
 */
export function getNetworkErrorMessage(
  error: unknown,
  { assumeOfflineCause = true }: NetworkErrorMessageOptions = {},
): string | null {
  if (error === null || error === undefined) return null;
  // 表示してよい固定文言 (権限なし等) はサーバーから届いた結果なので、そのまま見せる
  if (error instanceof UserFacingError) return null;

  if (assumeOfflineCause && !onlineManager.isOnline()) {
    return i18n.t("common.network.offline");
  }

  const kind = getNetworkErrorKind(error);
  if (kind === "timeout") return i18n.t("common.network.timeout");
  if (kind === "network") return i18n.t("common.network.failed");
  return null;
}
