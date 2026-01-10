import { createRouteHandlerClient } from '@/lib/supabase-server'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const redirectTo = requestUrl.searchParams.get('redirect_to') || '/dashboard'

  if (!code) {
    // codeパラメータがない場合はエラーページにリダイレクト
    return NextResponse.redirect(requestUrl.origin + '/login?error=missing_code')
  }

  try {
    // 重要: Next.js 14以降では、cookies()を明示的に呼び出してCookieを読み取る必要がある
    // これにより、PKCE code verifierが確実に読み取られる
    // cookies().getAll()を先に呼び出すことで、遅延評価を回避
    const cookieStore = await cookies()
    // 明示的にgetAll()を呼び出して、すべてのCookieを読み込む
    const cookieStoreCookies = cookieStore.getAll()
    
    // デバッグ: リクエストから直接Cookieを確認
    const requestCookies = request.cookies.getAll()
    console.log('OAuthコールバック - request.cookiesから検出されたCookie数:', requestCookies.length)
    console.log('OAuthコールバック - request.cookiesから検出されたCookie名:', requestCookies.map(c => c.name).join(', '))
    const codeVerifierCookie = requestCookies.find(c => c.name.includes('code-verifier') || c.name.includes('pkce'))
    console.log('OAuthコールバック - request.cookiesからcode-verifier Cookie:', codeVerifierCookie ? `${codeVerifierCookie.name} = ${codeVerifierCookie.value.substring(0, 20)}...` : '見つかりません')
    
    console.log('OAuthコールバック - cookies()から検出されたCookie数:', cookieStoreCookies.length)
    console.log('OAuthコールバック - cookies()から検出されたCookie名:', cookieStoreCookies.map(c => c.name).join(', '))
    const cookieStoreCodeVerifier = cookieStoreCookies.find(c => c.name.includes('code-verifier') || c.name.includes('pkce'))
    console.log('OAuthコールバック - cookies()からcode-verifier Cookie:', cookieStoreCodeVerifier ? `${cookieStoreCodeVerifier.name} = ${cookieStoreCodeVerifier.value.substring(0, 20)}...` : '見つかりません')
    
    // Route Handler用のクライアントを作成（Cookie操作を記録）
    // cookies()から取得したCookieストアを優先的に使用
    // これにより、Next.js 14+の遅延評価問題を回避
    const { client: supabase, setCookiesOnResponse } = createRouteHandlerClient(request, cookieStore)
    
    // コードをセッションに交換（Cookie操作は自動的に処理される）
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (error) {
      console.error('OAuthコールバックエラー:', error)
      // エラーが発生した場合はログイン画面にリダイレクト（エラーメッセージ付き）
      const errorResponse = NextResponse.redirect(
        requestUrl.origin + `/login?error=${encodeURIComponent(error.message)}`
      )
      setCookiesOnResponse(errorResponse)
      return errorResponse
    }

    if (!data.session) {
      console.error('OAuthコールバックエラー: セッションが作成されませんでした')
      const errorResponse = NextResponse.redirect(
        requestUrl.origin + '/login?error=session_creation_failed'
      )
      setCookiesOnResponse(errorResponse)
      return errorResponse
    }

    // Google OAuthの場合、Google Calendar連携を有効化
    const provider = data.session.provider_token ? 'google' : null
    if (provider === 'google' && data.user) {
      // Google Calendar連携を有効化（マイページで確認される）
      const updateData: { google_calendar_enabled: boolean; google_calendar_refresh_token: string | null } = {
        google_calendar_enabled: true,
        google_calendar_refresh_token: data.session.provider_refresh_token || null
      }
      const { error: updateError } = await supabase
        .from('users')
        // @ts-expect-error: Supabaseの型推論がupdateでneverになる既知の問題のため
        .update(updateData)
        .eq('id', data.user.id)
      
      if (updateError) {
        // エラーは無視（既に有効化されている可能性がある）
        console.error('Google Calendar連携有効化エラー:', updateError)
      }
    }

    // セッションが正しく作成されたことを確認
    const { data: { session: verifiedSession } } = await supabase.auth.getSession()
    if (!verifiedSession) {
      console.error('OAuthコールバックエラー: セッションの検証に失敗しました')
      const errorResponse = NextResponse.redirect(
        requestUrl.origin + '/login?error=session_verification_failed'
      )
      setCookiesOnResponse(errorResponse)
      return errorResponse
    }

    // リダイレクト（Cookieを設定）
    const successResponse = NextResponse.redirect(requestUrl.origin + redirectTo)
    setCookiesOnResponse(successResponse)
    return successResponse
  } catch (error) {
    console.error('OAuthコールバックエラー:', error)
    const errorMessage = error instanceof Error ? error.message : 'unknown_error'
    const errorResponse = NextResponse.redirect(
      requestUrl.origin + `/login?error=${encodeURIComponent(errorMessage)}`
    )
    return errorResponse
  }
}
