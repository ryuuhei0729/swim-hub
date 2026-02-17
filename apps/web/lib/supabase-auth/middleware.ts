// lib/supabase-auth/middleware.ts

import { getSafeRedirectUrl } from "@/utils/redirect"
import { CookieOptions, createServerClient } from "@supabase/ssr"
import type { Database } from '@swim-hub/shared/types'
import { NextResponse, type NextRequest } from "next/server"

// 1. クッキー情報からUserデータを取得する
// 2. 未ログインの場合（Userデータが存在しない場合）
export async function updateSession(request: NextRequest) {
    // レスポンスを作成
    let response = NextResponse.next({ request });
    const pathname = request.nextUrl.pathname;
    response.headers.set("x-current-path", pathname); // パス情報をヘッダーに設定

    // ---------------------------------------------
    // OAuthコールバック処理: /?code=... を /api/auth/callback?code=... にリダイレクト
    // これにより、Cookieが確実に送信される
    // 注意: OAuthコールバック時はauth.getUser()を実行する前にリダイレクトする
    // ---------------------------------------------
    if (pathname === '/' && request.nextUrl.searchParams.has('code')) {
        const code = request.nextUrl.searchParams.get('code')
        const rawRedirectTo = request.nextUrl.searchParams.get('redirect_to')
        const redirectTo = getSafeRedirectUrl(rawRedirectTo)
        if (!code) {
            // codeがない場合はログインページにリダイレクト
            return NextResponse.redirect(new URL('/login?error=missing_code', request.url))
        }
        const callbackUrl = new URL('/api/auth/callback', request.url)
        callbackUrl.searchParams.set('code', code)
        callbackUrl.searchParams.set('redirect_to', redirectTo)
        
        const oauthResponse = NextResponse.redirect(callbackUrl)
        // Cookieを設定（既存のCookieを保持）
        // OAuthコールバック時は、まだセッションが確立されていないため、リクエストのCookieをそのまま転送
        // 重要: PKCE code verifier Cookieを確実に転送するため、Cookie属性も明示的に設定
        const isLocal = request.nextUrl.hostname === 'localhost' || request.nextUrl.hostname === '127.0.0.1'
        request.cookies.getAll().forEach((cookie) => {
            if (cookie.value) {
                // Cookie属性を明示的に設定（PKCE code verifierが確実に転送されるように）
                oauthResponse.cookies.set(cookie.name, cookie.value, {
                    path: '/',
                    sameSite: 'lax',
                    secure: !isLocal, // ローカルはHTTP、本番はHTTPS
                    httpOnly: cookie.name.includes('code-verifier') ? false : true,
                })
            }
        })
        return oauthResponse
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error('Supabase環境変数が設定されていません')
    }

    // ---------------------------------------------
    // Userデータを取得
    // ---------------------------------------------
    // クライアントを作成
    const supabase = createServerClient<Database>(
        supabaseUrl,
        supabaseAnonKey,
        {
            cookies: {
                get(name: string) {
                    return request.cookies.get(name)?.value;
                },
                set(name: string, value: string, options: CookieOptions) {
                    // リクエストとレスポンスの両方にCookieを設定
                    request.cookies.set({
                        name,
                        value,
                        ...options,
                    });
                    const newResponse = NextResponse.next({
                        request: {
                            headers: request.headers,
                        },
                    });
                    // 既存のヘッダーを保持
                    response.headers.forEach((value, key) => {
                        newResponse.headers.set(key, value);
                    });
                    newResponse.cookies.set({
                        name,
                        value,
                        ...options,
                    });
                    response = newResponse;
                },
                remove(name: string, options: CookieOptions) {
                    // Cookieを削除
                    request.cookies.set({
                        name,
                        value: '',
                        ...options,
                    });
                    const newResponse = NextResponse.next({
                        request: {
                            headers: request.headers,
                        },
                    });
                    // 既存のヘッダーを保持
                    response.headers.forEach((value, key) => {
                        newResponse.headers.set(key, value);
                    });
                    newResponse.cookies.set({
                        name,
                        value: '',
                        ...options,
                    });
                    response = newResponse;
                },
            },
        }
    );
    // ユーザーを取得
    const { data: { user } } = await supabase.auth.getUser();
    // 重要: createServerClient と supabase.auth.getUser() の間にロジックを
    // 書かないでください。単純なミスでも、ユーザーがランダムにログアウトされる
    // 問題のデバッグが非常に困難になる可能性があります。

    // ---------------------------------------------
    // 認証が必要なルート
    // ---------------------------------------------
    const protectedRoutes = [
        '/dashboard',
        '/members',
        '/practice',
        '/competitions',
        '/records',
        '/goals',
        '/schedule',
        '/attendance',
        '/announcements',
        '/settings',
        '/profile',
        '/mypage'
    ]

    // 認証が不要なルート（認証済みユーザーがアクセスした場合はリダイレクト）
    const authRoutes = [
        '/login',
        '/signup',
        '/reset-password'
    ]

    // パブリックルート（認証不要）
    const publicRoutes = [
        '/',
        '/login',
        '/signup',
        '/reset-password',
        '/auth',
        '/contact',
        '/privacy',
        '/terms',
        '/support',
        '/api',
        '/_next'
    ]

    // 静的アセット拡張子
    const staticExtensions = ['.ico', '.png', '.jpg', '.jpeg', '.svg', '.css', '.js', '.txt', '.json', '.woff', '.woff2', '.ttf', '.eot']

    // 静的アセットかどうかをチェックするヘルパー関数
    const isStaticAsset = (path: string): boolean => {
        return staticExtensions.some(ext => path.endsWith(ext))
    }

    // パブリックルートかどうかをチェックするヘルパー関数
    const isPublicRoute = (path: string): boolean => {
        return publicRoutes.some(route => path === route || path.startsWith(route + '/'))
    }

    const isProtectedRoute = protectedRoutes.some(route => pathname.startsWith(route))
    const isAuthRoute = authRoutes.some(route => pathname.startsWith(route))

    // ---------------------------------------------
    // 未ログインユーザーの場合: リダイレクト処理
    // ---------------------------------------------
    if (isProtectedRoute && !user) {
        const redirectUrl = new URL('/login', request.url)
        redirectUrl.searchParams.set('redirect_to', pathname)
        return NextResponse.redirect(redirectUrl)
    }

    // 認証済みユーザーが認証ページにアクセスした場合
    if (isAuthRoute && user) {
        return NextResponse.redirect(new URL('/dashboard', request.url))
    }

    // 認証済みユーザーがランディングページにアクセスした場合はダッシュボードにリダイレクト
    if (pathname === '/' && user) {
        return NextResponse.redirect(new URL('/dashboard', request.url))
    }

    // テンプレート通りの基本的な認証チェック（保護ルート以外の場合）
    if (!user && !isPublicRoute(pathname) && !isStaticAsset(pathname)) {
        const url = request.nextUrl.clone();
        url.pathname = '/login';
        return NextResponse.redirect(url);
    }

    // ---------------------------------------------
    // ログインユーザーの場合: レスポンスを返す
    // ---------------------------------------------
    response.headers.set("x-current-path", pathname);
    return response;
}
