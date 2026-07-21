/**
 * メール確認ディープリンク判定ロジック
 * AuthProvider と QA テストの両方から import できるよう純粋関数として切り出す。
 * OAuth (Google) ディープリンクの処理は useGoogleAuth / IdentityLinkSettings が担う。
 */

/** メール確認コールバック URL のスキーム + パスの完全一致文字列 */
const EMAIL_CALLBACK_BASE = "swimhub://auth/callback";

/**
 * Supabase メールテンプレートの `token_hash` 形式で使われる検証タイプ。
 * `invite` は本アプリのフローで使わないため対象外とする。
 */
export type EmailOtpLinkType = "signup" | "recovery" | "email_change" | "email" | "magiclink";

const EMAIL_OTP_LINK_TYPES: readonly EmailOtpLinkType[] = [
  "signup",
  "recovery",
  "email_change",
  "email",
  "magiclink",
];

const isEmailOtpLinkType = (value: string | null): value is EmailOtpLinkType =>
  value !== null && (EMAIL_OTP_LINK_TYPES as readonly string[]).includes(value);

/**
 * URL がメール確認コールバックであるかを判定する。
 *
 * 判定条件:
 *   1. フラグメント/クエリを除いたベース部分が `swimhub://auth/callback` と完全一致する
 *   2. (新形式) クエリに `token_hash` が含まれる。`type` が `recovery` の場合は対象外
 *   3. (旧形式) フラグメントに `access_token` または `error` が含まれる。
 *      フラグメントの `type` が `recovery` の場合は対象外
 *      (いずれの形式でもパスワードリセットのリカバリーリンク対応は別スプリントで実装する)
 */
export const isEmailAuthCallback = (url: string): boolean => {
  // フラグメント・クエリを除いたベース URL を抽出し完全一致チェック
  const base = url.split("#")[0].split("?")[0];
  if (base !== EMAIL_CALLBACK_BASE) return false;

  // 新形式: クエリの token_hash + type (Supabase メールテンプレート更新後)
  const query = url.split("#")[0].split("?")[1] ?? "";
  const queryParams = new URLSearchParams(query);
  if (queryParams.has("token_hash")) {
    // recovery (パスワードリセット) リンクは対象外 — recovery の深リンク対応は別スプリント
    return queryParams.get("type") !== "recovery";
  }

  // 旧形式: フラグメント部分を解析
  const hash = url.split("#")[1] ?? "";
  const params = new URLSearchParams(hash);

  // recovery (パスワードリセット) リンクは対象外 — recovery の深リンク対応は別スプリント
  if (params.get("type") === "recovery") return false;

  return params.has("access_token") || params.has("error");
};

/**
 * URL から Supabase メールテンプレートの `token_hash`/`type` を抽出する。
 * 抽出できない、または `type` が想定外の値の場合は `null` を返す。
 */
export const extractTokenHashFromUrl = (
  url: string,
): { tokenHash: string; type: EmailOtpLinkType } | null => {
  try {
    const urlObj = new URL(url);
    const tokenHash = urlObj.searchParams.get("token_hash");
    const type = urlObj.searchParams.get("type");
    if (!tokenHash || !isEmailOtpLinkType(type)) return null;
    return { tokenHash, type };
  } catch {
    return null;
  }
};

/**
 * URL が Googleカレンダー連携の OAuth コールバックであることを示す
 * `flow=calendar-connect` クエリパラメータを持つかを判定する。
 * `getRedirectUri({ forCalendarConnect: true })` が生成する redirectTo にのみ付与される。
 * コールドスタート復帰時、AsyncStorage の永続フラグと合わせて使うことで、
 * 無関係な認証コールバック（メール確認・通常のGoogleログイン）を
 * 誤ってカレンダー連携の復旧処理として扱わないようにする。
 */
export const hasCalendarConnectFlowFlag = (url: string): boolean => {
  try {
    return new URL(url).searchParams.get("flow") === "calendar-connect";
  } catch {
    return false;
  }
};
