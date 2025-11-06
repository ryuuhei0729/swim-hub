import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

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
    '/profile'
  ]

  // 認証が不要なルート
  const publicRoutes = [
    '/',
    '/login',
    '/signup',
    '/reset-password',
    '/auth/callback'
  ]

  // 認証が必要なルートにアクセスしている場合
  const _isProtectedRoute = protectedRoutes.some(route => pathname.startsWith(route))
  
  // 認証が不要なルートにアクセスしている場合
  const _isPublicRoute = publicRoutes.some(route => pathname === route || pathname.startsWith(route))

  // NOTE: ここでは認証判定を行わずパスベースの制御のみ。
  // 認証判定はアプリ側で行う（SSR/クライアント）

  return response
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
