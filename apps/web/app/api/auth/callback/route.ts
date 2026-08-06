import { handleAuthCallback } from "@ryuuhei0729/swimhub-oauth/web";
import { encrypt, isEncrypted } from "@/lib/encryption";
import { NextRequest } from "next/server";
import type { SupabaseClient, User, Session } from "@supabase/supabase-js";
import type { Database } from "@apps/shared/types/supabase-schema";

/**
 * メール確認 (signup / recovery / email_change 等) の token_hash + type で
 * 使用可能な OTP 種別。共有パッケージ側の型と同じサブセット（invite は対象外）。
 */
type OtpType = "signup" | "recovery" | "email_change" | "email" | "magiclink";

/**
 * OTP種別からデフォルトの遷移先パスを導出する
 * - signup: オンボーディングへ
 * - recovery: パスワード更新画面へ（resetPasswordForEmailの遷移先を維持）
 * - email_change / email: 設定画面へ（EmailChangeSettingsの遷移先を維持）
 * - magiclink: ダッシュボードへ
 */
function getDefaultRedirectForOtpType(type: OtpType): string {
  switch (type) {
    case "signup":
      return "/onboarding";
    case "recovery":
      return "/update-password";
    case "email_change":
    case "email":
      return "/settings";
    case "magiclink":
      return "/dashboard";
  }
}

/**
 * OAuth認証後のカレンダー連携を処理
 * Google: provider_refresh_tokenを暗号化保存 + google_calendar_enabled = true
 *
 * 戻り値の `connected` は「実際に Google Calendar 連携が完了したか」を表す。
 * Google 以外のプロバイダの場合は連携対象がないため error は null だが connected は false
 * (呼び出し元が calendar_connected=true を付与するかどうかの判定に使う)。
 */
async function handleCalendarConnection(
  supabase: SupabaseClient<Database>,
  user: User,
  session: Session,
): Promise<{ error: Error | null; connected: boolean }> {
  const providers = user.app_metadata?.providers as string[] | undefined;

  if (providers?.includes("google")) {
    // Google Calendar連携
    const refreshToken = session.provider_refresh_token || null;

    if (!refreshToken) {
      // refreshToken がない場合は何も更新しない
      return { error: new Error("No refresh token provided for Google Calendar"), connected: false };
    }

    // 暗号化キーの確認（apps/web/app/api/google-calendar/connect/route.ts と対称）
    if (!process.env.TOKEN_ENCRYPTION_KEY) {
      console.error("TOKEN_ENCRYPTION_KEY is not set");
      return { error: new Error("TOKEN_ENCRYPTION_KEY is not set"), connected: false };
    }

    // トークンを暗号化（二重暗号化を防ぐため、既に暗号化済みの場合はそのまま使う）
    // encrypt() は TOKEN_ENCRYPTION_KEY 未設定時などに例外を投げるが、カレンダー連携の
    // エラーは無視してログイン自体は成功させる設計のため、ここで捕捉してログに残す
    let tokenToStore: string;
    try {
      tokenToStore = isEncrypted(refreshToken) ? refreshToken : encrypt(refreshToken);
    } catch (encryptError) {
      console.error("Googleカレンダートークンの暗号化に失敗しました:", encryptError);
      return {
        error: encryptError instanceof Error ? encryptError : new Error(String(encryptError)),
        connected: false,
      };
    }

    const { error: tokenError } = await supabase.rpc("set_google_refresh_token", {
      p_user_id: user.id,
      p_token: tokenToStore,
    });

    if (tokenError) {
      // RPC エラーの場合は google_calendar_enabled を更新しない
      return { error: tokenError, connected: false };
    }

    // トークン保存成功時のみフラグを立てる
    const { error: updateError } = await supabase
      .from("users")
      .update({ google_calendar_enabled: true })
      .eq("id", user.id);

    return { error: updateError, connected: !updateError };
  }

  return { error: null, connected: false };
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const isCalendarConnect = requestUrl.searchParams.get("calendar_connect") === "true";

  // onSessionEstablished の戻り値は handleAuthCallback 側で無視されるため、
  // カレンダー連携が成功したかどうかをクロージャのローカル変数に記録し、
  // レスポンス確定後に route.ts 側で Location ヘッダーへ calendar_connected=true を追記する。
  // calendar_connected は連携の成否を反映する（handleCalendarConnection がエラーなく
  // 完了し、かつ実際に Google Calendar 連携が行われた (connected === true) 場合のみ
  // true にする。isCalendarConnect の指定だけでは付与しない）。
  let shouldAppendCalendarConnected = false;

  const response = await handleAuthCallback({
    request,
    defaultRedirectPath: "/dashboard",
    loginPath: "/login",
    getDefaultRedirectForOtpType,
    onSessionEstablished: async (session, { supabase, flow }) => {
      // カレンダー連携は code フロー (OAuth) の calendar_connect=true 指定時のみ行う。
      // token_hash (メール確認) フローでは対象外。
      if (flow !== "code" || !isCalendarConnect) {
        return;
      }

      // handleAuthCallback は onSessionEstablished が例外を投げると確立済みセッションを
      // 破棄して auth_failed にする。カレンダー連携のエラーは無視してログイン自体は
      // 成功させる既存設計を維持するため、ここで必ず例外を捕捉し外へ投げない。
      try {
        const { error: calendarError, connected } = await handleCalendarConnection(
          supabase as unknown as SupabaseClient<Database>,
          session.user,
          session,
        );

        if (calendarError) {
          console.error("カレンダー連携エラー:", calendarError);
          // エラーは無視（既に有効化されている可能性がある）。calendar_connected は付与しない。
        } else if (connected) {
          shouldAppendCalendarConnected = true;
        }
      } catch (calendarError) {
        console.error("カレンダー連携エラー:", calendarError);
      }
    },
  });

  if (shouldAppendCalendarConnected) {
    const location = response.headers.get("location");
    if (location) {
      // NextResponse の headers は可変な Headers インスタンスなので、
      // レスポンス本体・Cookie はそのままに Location だけを書き換える。
      const locationUrl = new URL(location);
      locationUrl.searchParams.set("calendar_connected", "true");
      response.headers.set("location", locationUrl.toString());
    }
  }

  return response;
}
