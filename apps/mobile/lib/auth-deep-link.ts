/**
 * メール確認ディープリンク判定ロジック
 * AuthProvider と QA テストの両方から import できるよう純粋関数として切り出す。
 * OAuth (Google) ディープリンクの処理は useGoogleAuth / IdentityLinkSettings が担う。
 */

/** メール確認コールバック URL のスキーム + パスの完全一致文字列 */
const EMAIL_CALLBACK_BASE = "swimhub://auth/callback";

/**
 * URL がメール確認コールバックであるかを判定する。
 *
 * 判定条件:
 *   1. フラグメント/クエリを除いたベース部分が `swimhub://auth/callback` と完全一致する
 *   2. フラグメントに `access_token` または `error` が含まれる
 *   3. フラグメントの `type` が `recovery` の場合は対象外
 *      (パスワードリセットのリカバリーリンク対応は別スプリントで実装する)
 */
export const isEmailAuthCallback = (url: string): boolean => {
  // フラグメント・クエリを除いたベース URL を抽出し完全一致チェック
  const base = url.split("#")[0].split("?")[0];
  if (base !== EMAIL_CALLBACK_BASE) return false;

  // フラグメント部分を解析
  const hash = url.split("#")[1] ?? "";
  const params = new URLSearchParams(hash);

  // recovery (パスワードリセット) リンクは対象外 — recovery の深リンク対応は別スプリント
  if (params.get("type") === "recovery") return false;

  return params.has("access_token") || params.has("error");
};
