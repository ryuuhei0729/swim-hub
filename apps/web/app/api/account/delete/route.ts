import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-server";

const DELETE_STORAGE_MAX_ATTEMPTS = 3;
const DELETE_STORAGE_RETRY_BASE_DELAY_MS = 500;

/**
 * Bearer tokenからユーザーを認証
 */
async function authenticateUser(request: NextRequest) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const accessToken = authHeader.substring(7);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase環境変数が設定されていません");
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(accessToken);
  if (error || !user) return null;
  return user;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * auth.admin.deleteUser() が「ユーザーが既に存在しない」ことを理由に失敗したかを判定する。
 *
 * GoTrue (Supabase Auth) はこの場合 HTTP 404 + code "user_not_found" を返す
 * (@supabase/auth-js の AuthApiError#status / #code)。同一ユーザーへの2重送信
 * (二重クリック・複数アプリからのほぼ同時退会) で2回目以降のリクエストがこれに該当する。
 * 削除の目的は「ユーザーが存在しないこと」であり、既に存在しないなら目的は達成済みのため、
 * これは失敗ではなく成功として扱う。メッセージの部分一致ではなく status/code で判定する
 * (メッセージ文言はローカライズ・バージョンで変わり得るため)。
 */
function isUserAlreadyDeletedError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { status, code } = error as { status?: unknown; code?: unknown };
  return status === 404 && code === "user_not_found";
}

/**
 * delete-user-storage Edge Function を呼び出す (指数バックオフで最大3回試行)。
 *
 * ストレージ削除は画像・動画あわせて多数のオブジェクトを対象にするため、
 * Edge Function のコールドスタートや一時的なネットワーク断で失敗する可能性がある。
 * 3アプリ共通で「孤児ストレージ（アカウントは消えたのにファイルが残る）」を防ぐため、
 * ここで最終的に失敗したら呼び出し元は auth.admin.deleteUser() を呼ばない。
 * リトライ間隔は 500ms → 1000ms → 2000ms (3回試行) とし、ユーザーを長時間待たせすぎない
 * 範囲でコールドスタート・瞬断を吸収する。
 */
async function invokeDeleteUserStorageWithRetry(
  adminClient: SupabaseClient,
  userId: string,
): Promise<{ success: boolean; errors?: string[] }> {
  let lastError: string | null = null;

  for (let attempt = 1; attempt <= DELETE_STORAGE_MAX_ATTEMPTS; attempt++) {
    try {
      const { data, error } = await adminClient.functions.invoke<{
        success: boolean;
        errors?: string[];
      }>("delete-user-storage", { body: { userId } });

      if (!error && data?.success) {
        return { success: true };
      }

      lastError = error ? error.message : JSON.stringify(data?.errors ?? data ?? "unknown error");
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }

    if (attempt < DELETE_STORAGE_MAX_ATTEMPTS) {
      await sleep(DELETE_STORAGE_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
    }
  }

  return { success: false, errors: lastError ? [lastError] : ["unknown error"] };
}

/**
 * DELETE /api/account/delete
 * アカウント削除API
 *
 * 削除フロー:
 * 1. 個人データ（team_id IS NULL の練習・大会）を手動削除
 * 2. delete-user-storage Edge Function でストレージ（画像・動画）を削除。
 *    リトライしても失敗したら中断し、auth user は削除しない（孤児ストレージ防止）
 * 3. 2 が成功して初めて auth user を削除する（CASCADE + SET NULLで残りを処理）
 */
export async function DELETE(request: NextRequest) {
  try {
    // 認証
    const user = await authenticateUser(request);
    if (!user) {
      return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
    }

    const userId = user.id;
    const adminClient = createAdminClient();

    // 個人の練習・大会を手動削除（team_id IS NULLのもの）
    // チームの練習・大会はSET NULLで保持される（マイグレーション済み）
    const { error: practiceDeleteError } = await adminClient
      .from("practices")
      .delete()
      .eq("user_id", userId)
      .is("team_id", null);

    if (practiceDeleteError) {
      console.error("個人練習の削除エラー:", practiceDeleteError);
    }

    const { error: competitionDeleteError } = await adminClient
      .from("competitions")
      .delete()
      .eq("user_id", userId)
      .is("team_id", null);

    if (competitionDeleteError) {
      console.error("個人大会の削除エラー:", competitionDeleteError);
    }

    // ストレージ（画像・動画）削除。失敗したら中断し、孤児ストレージを防ぐ
    const storageResult = await invokeDeleteUserStorageWithRetry(adminClient, userId);
    if (!storageResult.success) {
      console.error("ストレージ削除エラー(リトライ後も失敗):", storageResult.errors);
      return NextResponse.json(
        { error: "ストレージの削除に失敗しました。時間をおいて再度お試しください" },
        { status: 500 },
      );
    }

    // auth user削除（CASCADE + SET NULLで残りを処理）
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);

    if (deleteError && !isUserAlreadyDeletedError(deleteError)) {
      console.error("Auth user削除エラー:", deleteError);
      return NextResponse.json({ error: "アカウントの削除に失敗しました" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("アカウント削除エラー:", error);
    return NextResponse.json({ error: "予期しないエラーが発生しました" }, { status: 500 });
  }
}
