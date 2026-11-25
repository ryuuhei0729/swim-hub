// lib/supabase-auth/middleware.ts

import { extractLocale, stripLocale } from "@/i18n/routing";
import { getSafeRedirectUrl } from "@/utils/redirect";
import {
  isLoginMethod,
  LAST_LOGIN_METHOD_COOKIE,
  LOGIN_METHOD_QUERY_PARAM,
} from "@/lib/lastLoginMethod";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@swim-hub/shared/types";
import { NextResponse, type NextRequest } from "next/server";

/**
 * ログインしているユーザーのトークンの中身 (claims) を返す。未ログイン・検証失敗なら null。
 *
 * getClaims() は認証エラー以外 (通信エラーなど) を例外で投げる。従来の getUser() は
 * そうした場合も「未ログイン」として扱っていた (ログインへ送る) ので、それに合わせる。
 */
async function getAuthenticatedClaims(
  supabase: ReturnType<typeof createServerClient<Database>>,
): Promise<{ sub: string } | null> {
  try {
    const { data } = await supabase.auth.getClaims();
    const sub = data?.claims?.sub;
    return typeof sub === "string" && sub.length > 0 ? { sub } : null;
  } catch (error) {
    console.error("[middleware] 認証状態の確認に失敗しました:", error);
    return null;
  }
}

/**
 * セッションがサーバー側でまだ有効かを Auth サーバーに確かめる (getUser())。
 * 通信エラーなどで確かめられないときは「有効ではない」として扱う (ダッシュボードへは送らない)。
 */
async function isSessionStillValid(
  supabase: ReturnType<typeof createServerClient<Database>>,
): Promise<boolean> {
  try {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();
    return !error && !!user;
  } catch (error) {
    console.error("[middleware] セッションの確認に失敗しました:", error);
    return false;
  }
}

// 1. クッキー情報からUserデータを取得する
// 2. 未ログインの場合（Userデータが存在しない場合）
export async function updateSession(request: NextRequest) {
  // レスポンスを作成
  let response = NextResponse.next({ request });
  const pathname = request.nextUrl.pathname;
  response.headers.set("x-current-path", pathname); // パス情報をヘッダーに設定

  // locale を pathname から取得
  const locale = extractLocale(pathname);
  // locale プレフィックスを除いた正規化パス
  const normalizedPathname = stripLocale(pathname);

  // ---------------------------------------------
  // OAuthコールバック処理: /?code=... を /api/auth/callback?code=... にリダイレクト
  // これにより、Cookieが確実に送信される
  // 注意: OAuthコールバック時はauth.getUser()を実行する前にリダイレクトする
  // ---------------------------------------------
  if (normalizedPathname === "/" && request.nextUrl.searchParams.has("code")) {
    const code = request.nextUrl.searchParams.get("code");
    const rawRedirectTo = request.nextUrl.searchParams.get("redirect_to");
    const redirectTo = getSafeRedirectUrl(rawRedirectTo);
    if (!code) {
      // codeがない場合はログインページにリダイレクト
      return NextResponse.redirect(new URL(`/${locale}/login?error=missing_code`, request.url));
    }
    const callbackUrl = new URL("/api/auth/callback", request.url);
    callbackUrl.searchParams.set("code", code);
    callbackUrl.searchParams.set("redirect_to", redirectTo);
    // 「直近で利用」ラベル用。コールバックでセッションが確立したときだけ記録される
    const loginMethod = request.nextUrl.searchParams.get(LOGIN_METHOD_QUERY_PARAM);
    if (isLoginMethod(loginMethod)) {
      callbackUrl.searchParams.set(LOGIN_METHOD_QUERY_PARAM, loginMethod);
    }

    const oauthResponse = NextResponse.redirect(callbackUrl);
    // Cookieを設定（既存のCookieを保持）
    // OAuthコールバック時は、まだセッションが確立されていないため、リクエストのCookieをそのまま転送
    // 重要: PKCE code verifier Cookieを確実に転送するため、Cookie属性も明示的に設定
    // ホスト名ではなくプロトコルで判定する。http 配信なのに Secure を付けると
    // ブラウザが Cookie を破棄し、PKCE code verifier が失われる (lib/supabase.ts と同じ理由)。
    const isHttps = request.nextUrl.protocol === "https:";
    request.cookies.getAll().forEach((cookie) => {
      // ログイン画面の JS から読む Cookie のため、httpOnly で上書きしない
      if (cookie.name === LAST_LOGIN_METHOD_COOKIE) return;
      if (cookie.value) {
        // Cookie属性を明示的に設定
        oauthResponse.cookies.set(cookie.name, cookie.value, {
          path: "/",
          sameSite: "lax",
          secure: isHttps, // http 配信時は付けない (付くと Cookie が破棄される)
          httpOnly: true,
        });
      }
    });
    return oauthResponse;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase環境変数が設定されていません");
  }

  // ---------------------------------------------
  // Userデータを取得
  // ---------------------------------------------
  // クライアントを作成
  const supabase = createServerClient<Database>(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        const newResponse = NextResponse.next({ request });
        // 既存のヘッダーを保持
        response.headers.forEach((val, key) => {
          newResponse.headers.set(key, val);
        });
        cookiesToSet.forEach(({ name, value, options }) => {
          newResponse.cookies.set(name, value, options);
        });
        response = newResponse;
      },
    },
  });
  // ログインしているかを確かめる (期限切れのトークンはここで更新され、Cookie に書き戻される)
  //
  // getUser() は毎リクエスト Auth サーバーへ問い合わせるため、全ページの表示に往復が1回乗っていた。
  // getClaims() はトークンの署名を手元で検証する (公開鍵はプロセス内で10分キャッシュされる)。
  // ただし Supabase の JWT 署名鍵が共通鍵 (HS256) の間は、内部で getUser() と同じ問い合わせに
  // なるので速くはならない (遅くもならない)。
  //
  // ここでの判定は「ログイン画面へ送るかどうか」だけに使う。アカウント削除・利用停止は
  // トークンの期限 (最長1時間) まで見逃すが、認証後のページは layout の getServerUser()、
  // API は lib/api-helpers.ts がそれぞれ getUser() で改めて確かめるので、データは守られる。
  //
  // 重要: createServerClient と getClaims() の間にロジックを書かないでください。
  // 単純なミスでも、ユーザーがランダムにログアウトされる問題のデバッグが
  // 非常に困難になる可能性があります。
  const user = await getAuthenticatedClaims(supabase);

  // ---------------------------------------------
  // 認証が必要なルート (locale プレフィックスなしで定義)
  // normalizedPathname と照合する
  // ---------------------------------------------
  // ここに載せたルートだけが redirect_to 付きでログインへ飛ぶ。載せ忘れても後段の
  // default-deny フォールバックが認証自体は守るが、redirect_to が付かないため
  // ログイン後に元 URL へ戻れず dashboard 送りになる (共有されたチーム URL で顕在化する)。
  const protectedRoutes = [
    "/dashboard",
    "/practice",
    "/competition",
    "/goals",
    "/account",
    "/settings",
    "/mypage",
    "/onboarding",
    "/bulk-besttime",
    "/teams",
    "/teams-admin",
  ];

  // 認証が不要なルート（認証済みユーザーがアクセスした場合はリダイレクト）
  // /login/email・/signup/email を明示追加（isAuthRoute は startsWith で判定するため
  // /login・/signup だけでもカバーできるが、意図を明示するために列挙する）
  const authRoutes = ["/login/email", "/login", "/signup/email", "/signup", "/reset-password"];

  // パブリックルート（認証不要）
  const publicRoutes = [
    "/",
    "/login/email",
    "/login",
    "/signup/email",
    "/signup",
    "/reset-password",
    "/auth",
    "/contact",
    "/privacy",
    "/terms",
    "/support",
    "/about",
    "/tokushoho",
    "/pricing",
    "/time-level",
    "/api",
    "/_next",
  ];

  // 静的アセット拡張子
  const staticExtensions = [
    ".ico",
    ".png",
    ".jpg",
    ".jpeg",
    ".svg",
    ".css",
    ".js",
    ".txt",
    ".json",
    ".woff",
    ".woff2",
    ".ttf",
    ".eot",
    ".xml",
  ];

  // 静的アセットかどうかをチェックするヘルパー関数
  const isStaticAsset = (path: string): boolean => {
    return staticExtensions.some((ext) => path.endsWith(ext));
  };

  // パブリックルートかどうかをチェックするヘルパー関数 (正規化パスで比較)
  const isPublicRoute = (path: string): boolean => {
    return publicRoutes.some((route) => path === route || path.startsWith(route + "/"));
  };

  // 正規化パス (locale プレフィックス除去後) でルート判定
  const isProtectedRoute = protectedRoutes.some((route) =>
    normalizedPathname.startsWith(route),
  );
  const isAuthRoute = authRoutes.some((route) => normalizedPathname.startsWith(route));

  // ---------------------------------------------
  // 未ログインユーザーの場合: リダイレクト処理
  // ---------------------------------------------
  if (isProtectedRoute && !user) {
    const redirectUrl = new URL(`/${locale}/login`, request.url);
    redirectUrl.searchParams.set("redirect_to", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  // 認証済みユーザーが認証ページ・ランディングページにアクセスした場合はダッシュボードへ送る。
  //
  // ここだけは getUser() で Auth サーバーに確かめてから送る。getClaims() はトークンの署名だけを
  // 見るので、別の端末でのログアウト・パスワード変更・アカウント削除で無効になったセッションも
  // トークンの期限 (最長1時間) までは通してしまう。一方、認証後のページの layout は
  // getUser() で弾いてログインへ送るので、ここでダッシュボードへ送り返すと
  // ログイン ⇄ ダッシュボードのリダイレクトが無限に繰り返される。
  // (ログイン画面などを開くのはまれなので、ここで1回問い合わせても表示速度への影響は小さい)
  if ((isAuthRoute || normalizedPathname === "/") && user && (await isSessionStillValid(supabase))) {
    return NextResponse.redirect(new URL(`/${locale}/dashboard`, request.url));
  }

  // テンプレート通りの基本的な認証チェック（保護ルート以外の場合）
  if (!user && !isPublicRoute(normalizedPathname) && !isStaticAsset(normalizedPathname)) {
    const url = request.nextUrl.clone();
    url.pathname = `/${locale}/login`;
    return NextResponse.redirect(url);
  }

  // ---------------------------------------------
  // ログインユーザーの場合: レスポンスを返す
  // ---------------------------------------------
  response.headers.set("x-current-path", pathname);
  return response;
}
