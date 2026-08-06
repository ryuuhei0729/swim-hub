import type { Session } from "@supabase/supabase-js";
import { cookies } from "next/headers.js";
import { NextResponse } from "next/server.js";
import type { NextRequest } from "next/server.js";
import { applyCookies } from "./applyCookies.js";
import type { CallbackSupabaseClient, CookieToSet } from "./createCallbackSupabaseClient.js";
import { createCallbackSupabaseClient } from "./createCallbackSupabaseClient.js";
import { validateRedirectPath } from "./validateRedirectPath.js";

/**
 * メール確認 (signup / recovery / email_change 等) の token_hash + type で
 * 使用可能な OTP 種別。Supabase の EmailOtpType のサブセット (invite は対象外)。
 */
type OtpType = "signup" | "recovery" | "email_change" | "email" | "magiclink";

const OTP_TYPES: readonly OtpType[] = ["signup", "recovery", "email_change", "email", "magiclink"];

function isOtpType(value: string | null): value is OtpType {
  return value !== null && (OTP_TYPES as readonly string[]).includes(value);
}

export interface HandleAuthCallbackConfig {
  request: NextRequest;
  defaultRedirectPath: string;
  loginPath: string;
  getDefaultRedirectForOtpType?: (type: OtpType) => string;
  onSessionEstablished?: (
    session: Session,
    // createCallbackSupabaseClient() が実際に返す型 (CallbackSupabaseClient["supabase"])
    // をそのまま流用する。@supabase/supabase-js から独自に SupabaseClient を
    // import すると、moduleResolution の設定によっては @supabase/ssr
    // (createServerClient) 経由で解決される SupabaseClient と別の宣言インスタンス
    // として扱われ代入不能になることがあるため (createCallbackSupabaseClient.ts
    // 参照)、常にこちらを単一の情報源にする。
    context: { supabase: CallbackSupabaseClient["supabase"]; flow: "otp" | "code"; request: NextRequest },
  ) => Promise<void> | void;
}

/**
 * OAuth (PKCE の code) / メール確認 (token_hash + type) の両コールバックフローを
 * 1つの Route Handler ロジックに統合する。
 *
 * 制御フロー:
 * 1. token_hash があり type が OtpType のいずれかに一致すれば token_hash 経路 (verifyOtp)。
 *    type が不正なら loginPath?error=invalid_request。
 * 2. token_hash が無い (空文字を含む) 場合は code 経路 (exchangeCodeForSession)。
 *    code も無ければ loginPath?error=missing_code。
 * 3. createCallbackSupabaseClient が null を返す場合は両経路とも
 *    loginPath?error=config_error。
 * 4. token_hash 経路: verifyOtp のエラーは error.code (無ければ "auth_failed") を
 *    error クエリに反映する。session が無ければ session_creation_failed。
 * 5. code 経路: exchangeCodeForSession のエラーは auth_failed。session が無い場合も
 *    session_creation_failed にする (scanner/timer の既存 route.ts にはこのチェックが
 *    無かったが、共有パッケージのデフォルト挙動として両経路で統一する)。
 * 6. 成功時の遷移先は redirect_to クエリがあれば validateRedirectPath で検証した値を
 *    優先し、無ければ (token_hash 経路は getDefaultRedirectForOtpType の戻り値、
 *    無ければ defaultRedirectPath / code 経路は常に defaultRedirectPath) を使う。
 * 7. 成功時、onSessionEstablished があれば session とコンテキストを渡して呼ぶ。
 * 8. try 節内の例外 (onSessionEstablished の例外を含む) は全て catch で auth_failed に丸める。
 * 9. cookiesToSet が空でなければ、成功・エラー問わず最終レスポンスに applyCookies する。
 *
 * 移植元: swimhub-scanner / swimhub-timer の
 * apps/web/src/app/api/auth/callback/route.ts の GET ハンドラ本体
 * (ロケール引き回しは呼び出し側の責務のため取り込まない)。session 存在チェックの
 * 統一は swim-hub 自身の同ファイルを参考にした。
 */
export async function handleAuthCallback(config: HandleAuthCallbackConfig): Promise<NextResponse> {
  const { request, defaultRedirectPath, loginPath, getDefaultRedirectForOtpType, onSessionEstablished } =
    config;
  const { nextUrl } = request;
  const origin = nextUrl.origin;

  // try の外で宣言し、catch でも Cookie 反映 (applyCookies) できるようにする
  let cookiesToSet: CookieToSet[] = [];

  const redirect = (path: string): NextResponse => {
    const response = NextResponse.redirect(`${origin}${path}`);
    if (cookiesToSet.length > 0) {
      applyCookies(response, cookiesToSet);
    }
    return response;
  };

  try {
    const tokenHash = nextUrl.searchParams.get("token_hash");

    if (tokenHash) {
      const typeParam = nextUrl.searchParams.get("type");
      if (!isOtpType(typeParam)) {
        console.error("メール確認コールバックエラー: 不明なtypeパラメータ", { typeParam });
        return redirect(`${loginPath}?error=invalid_request`);
      }

      const clientResult = createCallbackSupabaseClient(request, await cookies());
      if (!clientResult) {
        return redirect(`${loginPath}?error=config_error`);
      }
      cookiesToSet = clientResult.cookiesToSet;
      const { supabase } = clientResult;

      const { data, error } = await supabase.auth.verifyOtp({
        type: typeParam,
        token_hash: tokenHash,
      });

      if (error) {
        console.error("メール確認コールバックエラー:", error);
        return redirect(`${loginPath}?error=${encodeURIComponent(error.code ?? "auth_failed")}`);
      }

      if (!data.session) {
        console.error("メール確認コールバックエラー: セッションが作成されませんでした");
        return redirect(`${loginPath}?error=session_creation_failed`);
      }

      const defaultForType = getDefaultRedirectForOtpType
        ? getDefaultRedirectForOtpType(typeParam)
        : defaultRedirectPath;
      const redirectToParam = nextUrl.searchParams.get("redirect_to");
      const redirectTo = redirectToParam
        ? validateRedirectPath(redirectToParam, defaultRedirectPath, origin)
        : defaultForType;

      if (onSessionEstablished) {
        await onSessionEstablished(data.session, { supabase, flow: "otp", request });
      }

      return redirect(redirectTo);
    }

    const code = nextUrl.searchParams.get("code");
    if (!code) {
      return redirect(`${loginPath}?error=missing_code`);
    }

    const clientResult = createCallbackSupabaseClient(request, await cookies());
    if (!clientResult) {
      return redirect(`${loginPath}?error=config_error`);
    }
    cookiesToSet = clientResult.cookiesToSet;
    const { supabase } = clientResult;

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error("OAuthコールバックエラー:", error);
      return redirect(`${loginPath}?error=auth_failed`);
    }

    if (!data.session) {
      console.error("OAuthコールバックエラー: セッションが作成されませんでした");
      return redirect(`${loginPath}?error=session_creation_failed`);
    }

    const redirectToParam = nextUrl.searchParams.get("redirect_to");
    const redirectTo = redirectToParam
      ? validateRedirectPath(redirectToParam, defaultRedirectPath, origin)
      : defaultRedirectPath;

    if (onSessionEstablished) {
      await onSessionEstablished(data.session, { supabase, flow: "code", request });
    }

    return redirect(redirectTo);
  } catch (error) {
    console.error("認証コールバックエラー:", error);
    return redirect(`${loginPath}?error=auth_failed`);
  }
}
