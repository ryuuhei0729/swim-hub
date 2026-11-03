// =============================================================================
// ユーザー提示用エラー - Swim Hub 共通パッケージ
// =============================================================================

/**
 * ユーザーに表示してよいメッセージであることを型で表明するエラー。
 *
 * `@supabase/postgrest-js` の `PostgrestError` は `extends Error` であるため、
 * `error instanceof Error` では「i18n 済みでユーザー提示前提のメッセージ」と
 * 「テーブル名・カラム名・RLS ポリシー詳細を含む生の Postgres/RLS エラー」を
 * 区別できない。後者をそのままフォームに表示すると情報露出になる。
 *
 * ユーザーに見せてよいメッセージを投げる箇所は `Error` ではなくこのクラスを
 * 使うことで、UI 側は `instanceof UserFacingError` で安全に判定できる。
 */
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserFacingError";
  }
}

/**
 * catch した error からユーザー提示用メッセージを取り出す。
 *
 * `error instanceof UserFacingError` の場合のみそのメッセージを返す。
 * それ以外 (生の `PostgrestError` を含む通常の `Error` や未知の値) は
 * 詳細を一切表示せず `fallback` を返す。
 *
 * @param error - catch ブロックで受け取った値
 * @param fallback - ユーザー提示用メッセージが無い場合に表示する汎用メッセージ
 */
export function toUserFacingMessage(error: unknown, fallback: string): string {
  if (error instanceof UserFacingError) return error.message;
  const networkMessage = networkMessageResolver?.(error);
  if (networkMessage) return networkMessage;
  return fallback;
}

/**
 * 通信起因のエラーに対して表示する文言を返す関数。文言を返さない (null) ときは
 * 通常どおり fallback を使う。
 */
export type NetworkErrorMessageResolver = (error: unknown) => string | null;

let networkMessageResolver: NetworkErrorMessageResolver | null = null;

/**
 * 通信起因のエラーを「保存に失敗しました」のような汎用文言で済ませず、
 * 「通信できませんでした」と分かる文言に差し替えるための設定。
 *
 * 文言の翻訳やオフライン判定はアプリごとに持つため、共通パッケージは判定関数を
 * 受け取るだけにしている。アプリ起動時に1回呼ぶ (未設定なら従来どおり fallback)。
 */
export function configureNetworkErrorMessage(
  resolver: NetworkErrorMessageResolver | null,
): void {
  networkMessageResolver = resolver;
}
