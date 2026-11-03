// =============================================================================
// 認証・権限チェック共通ユーティリティ
// =============================================================================

import { SupabaseClient } from "@supabase/supabase-js";
import { UserFacingError } from "../utils/userFacingError";
import { isNetworkError } from "../utils/networkError";

/**
 * `auth.getUser()` でユーザーが取れなかったときに投げるエラーを決める。
 *
 * `getUser()` はサーバーに問い合わせるため、通信できないときも user が null になる。
 * そのまま「認証が必要です」にすると、圏外や低速回線での失敗が「ログインしていない」
 * ように見えてしまい、利用者は再試行すればよいことに気付けない。通信起因のときは
 * 元のエラーをそのまま投げ、表示側で「通信できませんでした」と出せるようにする。
 */
export function authRequiredError(
  authError: unknown,
  message = "認証が必要です",
): Error {
  if (isNetworkError(authError)) {
    return authError instanceof Error
      ? authError
      : new Error(String(authError));
  }
  return new Error(message);
}

/**
 * 認証必須ガード
 * @throws {UserFacingError} 認証されていない場合 (表示してよい固定文言)
 * @throws 通信できなかった場合は auth-js の通信エラーをそのまま投げる
 */
export async function requireAuth(supabase: SupabaseClient): Promise<string> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (!user) {
    if (isNetworkError(authError)) throw authRequiredError(authError);
    throw new UserFacingError("認証が必要です");
  }
  return user.id;
}

/**
 * チームメンバーシップ必須ガード
 * @param userId 指定がない場合は現在の認証ユーザーを使用
 * @throws {UserFacingError} メンバーシップがない場合 (表示してよい固定文言)
 * @throws {Error} 確認クエリ自体が失敗した場合。生の PostgrestError をそのまま
 *   re-throw する (テーブル名・RLS詳細を含みうるため UserFacingError にしない。
 *   表示側は instanceof UserFacingError でないため汎用文言にフォールバックする)
 */
export async function requireTeamMembership(
  supabase: SupabaseClient,
  teamId: string,
  userId?: string,
): Promise<void> {
  const uid = userId ?? (await requireAuth(supabase));
  const { data: membership, error } = await supabase
    .from("team_memberships")
    .select("id")
    .eq("team_id", teamId)
    .eq("user_id", uid)
    .eq("is_active", true)
    .single();

  if (error && error.code !== "PGRST116") {
    // PGRST116 = "no rows returned" - this is expected when membership doesn't exist
    // 生の PostgrestError (テーブル名・RLS詳細を含みうる) をそのまま re-throw する。
    // メッセージに詳細を埋め込まない (情報露出防止)。
    throw error;
  }
  if (!membership) {
    // is_active=true のメンバーシップがない場合、承認待ちかどうかを確認
    const { data: pendingMembership } = await supabase
      .from("team_memberships")
      .select("id, status")
      .eq("team_id", teamId)
      .eq("user_id", uid)
      .eq("status", "pending")
      .single();

    if (pendingMembership) {
      // ユーザー表示用メッセージではなく、呼び出し元 (mobile TeamDetailScreen) が
      // error.message === "PENDING_APPROVAL" で分岐する内部センチネル。
      // UserFacingError にすると未翻訳のコード文字列がそのまま画面に出うるため
      // 通常の Error のまま維持する。
      throw new Error("PENDING_APPROVAL");
    }
    throw new UserFacingError("チームへのアクセス権限がありません");
  }
}

/**
 * チーム管理者権限必須ガード
 * @param userId 指定がない場合は現在の認証ユーザーを使用
 * @throws {UserFacingError} 管理者権限がない場合 (表示してよい固定文言)
 * @throws {Error} 確認クエリ自体が失敗した場合。生の PostgrestError をそのまま
 *   re-throw する (requireTeamMembership と同型)
 */
export async function requireTeamAdmin(
  supabase: SupabaseClient,
  teamId: string,
  userId?: string,
): Promise<void> {
  const uid = userId ?? (await requireAuth(supabase));
  const { data: membership, error } = await supabase
    .from("team_memberships")
    .select("role")
    .eq("team_id", teamId)
    .eq("user_id", uid)
    .eq("is_active", true)
    .eq("role", "admin")
    .single();

  if (error && error.code !== "PGRST116") {
    // PGRST116 = "no rows returned" - this is expected when admin membership doesn't exist
    // 生の PostgrestError をそのまま re-throw する (情報露出防止)。
    throw error;
  }
  if (!membership) {
    throw new UserFacingError("管理者権限が必要です");
  }
}
