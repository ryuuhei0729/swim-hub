import { createServerClient } from '@supabase/ssr'
import type { Database } from '@swim-hub/shared/types/database'
import { NextResponse, type NextRequest } from 'next/server'

// Next.js Middleware
export async function middleware(request: NextRequest) {
  // 環境変数のチェック
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // 環境変数が設定されていない場合は、認証チェックをスキップして通常のレスポンスを返す
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Middleware: Supabase環境変数が設定されていません')
    return NextResponse.next()
  }

  // Cookie操作を記録するための配列
  const cookiesToSet: Array<{
    name: string
    value: string
    options?: {
      domain?: string
      expires?: Date
      httpOnly?: boolean
      maxAge?: number
      path?: string
      sameSite?: boolean | 'lax' | 'strict' | 'none'
      secure?: boolean
    }
  }> = []

  try {
    // Supabaseクライアントを作成（middleware用）
    const supabase = createServerClient<Database>(
      supabaseUrl,
      supabaseAnonKey,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll().map((cookie) => ({
              name: cookie.name,
              value: cookie.value
            }))
          },
          setAll(cookies) {
            cookiesToSet.push(...cookies)
          }
        }
      }
    )

    // ユーザー認証状態を取得
    const { data: { user } } = await supabase.auth.getUser()

    const { pathname } = request.nextUrl

    // 認証が必要なルート
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

    const isProtectedRoute = protectedRoutes.some(route => pathname.startsWith(route))
    const isAuthRoute = authRoutes.some(route => pathname.startsWith(route))

    // 保護されたルートに未認証でアクセスした場合
    if (isProtectedRoute && !user) {
      const redirectUrl = new URL('/login', request.url)
      redirectUrl.searchParams.set('redirect_to', pathname)
      const response = NextResponse.redirect(redirectUrl)
      // Cookieを設定
      cookiesToSet.forEach((cookie) => {
        response.cookies.set(cookie.name, cookie.value, cookie.options)
      })
      return response
    }

    // 認証済みユーザーが認証ページにアクセスした場合
    if (isAuthRoute && user) {
      const response = NextResponse.redirect(new URL('/dashboard', request.url))
      // Cookieを設定
      cookiesToSet.forEach((cookie) => {
        response.cookies.set(cookie.name, cookie.value, cookie.options)
      })
      return response
    }

    // 通常のレスポンス
    const response = NextResponse.next({
      request: {
        headers: request.headers,
      },
    })

    // Cookieを設定
    cookiesToSet.forEach((cookie) => {
      response.cookies.set(cookie.name, cookie.value, cookie.options)
    })

    return response
  } catch (error) {
    // エラーが発生した場合は、ログを出力して通常のレスポンスを返す
    console.error('Middleware error:', error)
    return NextResponse.next()
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
