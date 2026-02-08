import { createRouteHandlerClient } from '@/lib/supabase-server'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient, User, Session } from '@supabase/supabase-js'
import type { Database } from '@apps/shared/types/supabase-schema'

// Cookie名定数（authApple.tsと同じ値を使用）
const APPLE_AUTH_NONCE_COOKIE = 'apple_auth_nonce'

/**
 * redirectToパラメータを検証・サニタイズする
 * - '/'で始まる相対パスのみ許可（スキーム付きURLは拒否）
 * - プロトコル相対URL（//evil.com）を拒否
 * - CR/LFや制御文字を含まないことを確認
 * - 無効な値の場合は'/dashboard'にフォールバック
 * - デコード後の値に対してバリデーションを実行（二重エンコード攻撃を防止）
 * - URLコンストラクタで同一オリジン確認（オープンリダイレクト対策）
 */
function validateRedirectPath(redirectTo: string | null, origin?: string): string {
  const defaultPath = '/dashboard'

  if (!redirectTo) {
    return defaultPath
  }

  // まずデコードを試みる（二重エンコード攻撃を防止するため）
  let decoded: string
  try {
    decoded = decodeURIComponent(redirectTo)
  } catch {
    // decodeURIComponentが失敗した場合は安全のためデフォルトパスを返す
    return defaultPath
  }

  // スキームを含むURLを拒否（http:, https:, javascript:, data: など）
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(decoded)) {
    return defaultPath
  }

  // プロトコル相対URL（//evil.com）を拒否
  if (decoded.startsWith('//') || /^\/\//.test(decoded)) {
    return defaultPath
  }

  // パスが'/'で始まることを確認（デコード後の値でチェック）
  if (!decoded.startsWith('/')) {
    return defaultPath
  }

  // CR/LFや制御文字を含まないことを確認（デコード後の値でチェック）
  // 許可する文字: 英数字、パス区切り(/)、クエリパラメータ(?&)、ハッシュ(#)
  // 禁止: CR(\r), LF(\n), タブ(\t), null文字(\0), その他の制御文字
  for (let i = 0; i < decoded.length; i++) {
    const charCode = decoded.charCodeAt(i)
    // 制御文字（0x00-0x1F）、DEL（0x7F）、拡張制御文字（0x80-0x9F）をチェック
    if ((charCode >= 0x00 && charCode <= 0x1F) || charCode === 0x7F || (charCode >= 0x80 && charCode <= 0x9F)) {
      return defaultPath
    }
  }

  // 相対パストラバーサル攻撃を防ぐ（../や..\\など）（デコード後の値でチェック）
  if (decoded.includes('..')) {
    return defaultPath
  }

  // URLコンストラクタで同一オリジン確認（オープンリダイレクト対策の最終検証）
  if (origin) {
    try {
      const resolvedUrl = new URL(decoded, origin)
      // 解決後のURLが同一オリジンでない場合は拒否
      if (resolvedUrl.origin !== origin) {
        return defaultPath
      }
    } catch {
      // URL構築に失敗した場合は安全のためデフォルトパスを返す
      return defaultPath
    }
  }

  // 検証を通過したデコード済みパスを返す
  return decoded
}

/**
 * OAuth認証後のカレンダー連携を処理
 * Google: provider_refresh_tokenを暗号化保存 + google_calendar_enabled = true
 * Apple: ios_calendar_enabled = true のみ
 */
async function handleCalendarConnection(
  supabase: SupabaseClient<Database>,
  user: User,
  session: Session
): Promise<{ error: Error | null }> {
  const providers = user.app_metadata?.providers as string[] | undefined

  if (providers?.includes('google')) {
    // Google Calendar連携
    const refreshToken = session.provider_refresh_token || null

    let tokenError: Error | null = null
    if (refreshToken) {
      // @ts-expect-error - Database型推論の既知の問題
      const { error } = await supabase.rpc('set_google_refresh_token', {
        p_user_id: user.id,
        p_token: refreshToken
      })
      tokenError = error
    }

    const { error: updateError } = await supabase
      .from('users')
      // @ts-expect-error - Database型推論の既知の問題
      .update({ google_calendar_enabled: true })
      .eq('id', user.id)

    return { error: tokenError || updateError }
  }
  else if (providers?.includes('apple')) {
    // iOS Calendar連携（トークン不要）
    const { error } = await supabase
      .from('users')
      // @ts-expect-error - Database型推論の既知の問題
      .update({ ios_calendar_enabled: true })
      .eq('id', user.id)

    return { error }
  }

  return { error: null }
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  // オープンリダイレクト対策: originを渡して同一オリジン検証を実施
  const redirectTo = validateRedirectPath(requestUrl.searchParams.get('redirect_to'), requestUrl.origin)

  if (!code) {
    // codeパラメータがない場合はエラーページにリダイレクト
    return NextResponse.redirect(requestUrl.origin + '/login?error=missing_code')
  }

  // setCookiesOnResponseをtryブロックの外で宣言し、catchブロックからもアクセス可能にする
  let setCookiesOnResponse: ((response: NextResponse) => void) | null = null

  try {
    // 重要: Next.js 14以降では、cookies()を明示的に呼び出してCookieを読み取る必要がある
    // これにより、PKCE code verifierが確実に読み取られる
    // cookies().getAll()を先に呼び出すことで、遅延評価を回避
    const cookieStore = await cookies()
    // 明示的にgetAll()を呼び出して、すべてのCookieを読み込む
    const cookieStoreCookies = cookieStore.getAll()
    
    // 開発環境のみ最小限の診断情報をログ出力（Cookie値やPKCE verifierは一切出力しない）
    if (process.env.NODE_ENV !== 'production') {
      const requestCookies = request.cookies.getAll()
      const hasCodeVerifier = cookieStoreCookies.some(c => c.name.includes('code-verifier') || c.name.includes('pkce'))
      console.log('OAuthコールバック - Cookie検出:', {
        requestCookiesCount: requestCookies.length,
        cookieStoreCookiesCount: cookieStoreCookies.length,
        hasCodeVerifier: hasCodeVerifier
      })
    }
    
    // Route Handler用のクライアントを作成（Cookie操作を記録）
    // cookies()から取得したCookieストアを優先的に使用
    // これにより、Next.js 14+の遅延評価問題を回避
    const { client: supabase, setCookiesOnResponse: setCookies } = createRouteHandlerClient(request, cookieStore)
    setCookiesOnResponse = setCookies
    
    // コードをセッションに交換（Cookie操作は自動的に処理される）
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (error) {
      // 内部エラー詳細はサーバーログにのみ記録（URLには漏洩させない）
      console.error('OAuthコールバックエラー:', error)
      const errorResponse = NextResponse.redirect(
        requestUrl.origin + '/login?error=auth_failed'
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

    // calendar_connectパラメータがある場合のみ、カレンダー連携を有効化
    const isCalendarConnect = requestUrl.searchParams.get('calendar_connect') === 'true'
    if (isCalendarConnect && data.user && data.session) {
      const { error: calendarError } = await handleCalendarConnection(
        supabase,
        data.user,
        data.session
      )

      if (calendarError) {
        console.error('カレンダー連携エラー:', calendarError)
        // エラーは無視（既に有効化されている可能性がある）
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
    // redirectToは既に検証済みなので安全に結合
    // カレンダー連携成功時は、リダイレクト先にパラメータを追加
    const finalRedirectTo = isCalendarConnect 
      ? `${redirectTo}${redirectTo.includes('?') ? '&' : '?'}calendar_connected=true`
      : redirectTo
    const successResponse = NextResponse.redirect(requestUrl.origin + finalRedirectTo)
    setCookiesOnResponse(successResponse)
    return successResponse
  } catch (error) {
    // 内部エラー詳細はサーバーログにのみ記録（URLには漏洩させない）
    console.error('OAuthコールバックエラー:', error)
    const errorResponse = NextResponse.redirect(
      requestUrl.origin + '/login?error=auth_failed'
    )
    // setCookiesOnResponseが利用可能な場合は、他のエラーパスと同様にCookieを設定
    if (setCookiesOnResponse) {
      setCookiesOnResponse(errorResponse)
    }
    return errorResponse
  }
}

/**
 * Appleの初回サインイン時に送られるuserペイロードから名前を抽出する
 * @param userPayload FormDataから取得したuser文字列
 * @returns 名前（firstName + lastName）、取得できない場合はnull
 */
function parseAppleUserPayload(userPayload: string | null): { name: string | null; email: string | null } {
  if (!userPayload) {
    return { name: null, email: null }
  }

  try {
    const parsed = JSON.parse(userPayload)

    // 名前を抽出（firstName, lastName, または name.firstName, name.lastName）
    let name: string | null = null
    if (parsed.name) {
      if (typeof parsed.name === 'string') {
        // name が文字列の場合
        name = parsed.name
      } else if (typeof parsed.name === 'object') {
        // name がオブジェクトの場合（firstName, lastName）
        const firstName = parsed.name.firstName || ''
        const lastName = parsed.name.lastName || ''
        const fullName = `${lastName}${firstName}`.trim() // 日本式: 姓 + 名
        if (!fullName) {
          // 欧米式にフォールバック: firstName lastName
          const westernName = `${firstName} ${lastName}`.trim()
          name = westernName || null
        } else {
          name = fullName
        }
      }
    }

    // メールを抽出
    const email = typeof parsed.email === 'string' ? parsed.email : null

    return { name, email }
  } catch {
    // JSON parseエラーの場合は安全にフォールバック
    console.warn('Apple userペイロードのパースに失敗しました:', userPayload)
    return { name: null, email: null }
  }
}

export async function POST(request: NextRequest) {
  const requestUrl = new URL(request.url)
  // オープンリダイレクト対策: originを渡して同一オリジン検証を実施
  const redirectTo = validateRedirectPath(requestUrl.searchParams.get('redirect_to'), requestUrl.origin)
  const isCalendarConnect = requestUrl.searchParams.get('calendar_connect') === 'true'

  let setCookiesOnResponse: ((response: NextResponse) => void) | null = null

  try {
    // 1. FormData取得（Apple Sign Inのレスポンス）
    const formData = await request.formData()
    const idToken = formData.get('id_token') as string | null
    const error = formData.get('error') as string | null
    // Apple初回サインイン時のuserペイロード（名前・メール情報）
    const appleUserPayload = formData.get('user') as string | null

    // 2. Appleからのエラーをチェック
    if (error) {
      // 内部エラー詳細はサーバーログにのみ記録（URLには漏洩させない）
      console.error('Apple Sign In エラー:', error)
      return NextResponse.redirect(
        requestUrl.origin + '/login?error=apple_auth_failed'
      )
    }

    if (!idToken) {
      console.error('Apple Sign In エラー: id_tokenがありません')
      return NextResponse.redirect(
        requestUrl.origin + '/login?error=missing_id_token'
      )
    }

    // 2.5. stateパラメータからnonceを取得
    const stateNonce = formData.get('state') as string | null

    // 3. Cookie管理（GETと同じパターン）
    const cookieStore = await cookies()
    const cookieStoreCookies = cookieStore.getAll()

    // 3.5. Nonce検証（CSRF対策）
    // サーバーサイドCookieに保存されたnonceと、Appleから返されたstateを比較
    const storedNonce = cookieStore.get(APPLE_AUTH_NONCE_COOKIE)?.value

    // 検証後はCookieを削除（使い捨て）
    cookieStore.delete(APPLE_AUTH_NONCE_COOKIE)

    if (!storedNonce || !stateNonce || storedNonce !== stateNonce) {
      console.error('Apple Sign In エラー: nonce検証に失敗しました', {
        hasStoredNonce: !!storedNonce,
        hasStateNonce: !!stateNonce,
        nonceMatch: storedNonce === stateNonce,
      })
      return NextResponse.redirect(
        requestUrl.origin + '/login?error=invalid_nonce'
      )
    }

    // 開発環境のみ最小限の診断情報をログ出力
    if (process.env.NODE_ENV !== 'production') {
      const requestCookies = request.cookies.getAll()
      console.log('Apple Sign In コールバック - Cookie検出:', {
        requestCookiesCount: requestCookies.length,
        cookieStoreCookiesCount: cookieStoreCookies.length,
        nonceVerified: true,
      })
    }

    const { client: supabase, setCookiesOnResponse: setCookies } =
      createRouteHandlerClient(request, cookieStore)
    setCookiesOnResponse = setCookies

    // 4. id_tokenでSupabaseセッションを確立
    const { data, error: signInError } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: idToken,
    })

    if (signInError) {
      // 内部エラー詳細はサーバーログにのみ記録（URLには漏洩させない）
      console.error('Apple Sign In セッション作成エラー:', signInError)
      const errorResponse = NextResponse.redirect(
        requestUrl.origin + '/login?error=auth_failed'
      )
      setCookiesOnResponse(errorResponse)
      return errorResponse
    }

    if (!data.session) {
      console.error('Apple Sign In エラー: セッションが作成されませんでした')
      const errorResponse = NextResponse.redirect(
        requestUrl.origin + '/login?error=session_creation_failed'
      )
      setCookiesOnResponse(errorResponse)
      return errorResponse
    }

    // 5. Apple初回サインイン時のユーザー情報を保存
    // Appleは初回サインイン時のみuserペイロードを送信するため、この機会に名前を保存
    if (appleUserPayload && data.user) {
      const { name } = parseAppleUserPayload(appleUserPayload)
      if (name) {
        const { error: updateNameError } = await supabase
          .from('users')
          // @ts-expect-error - Database型推論の既知の問題
          .update({ name })
          .eq('id', data.user.id)

        if (updateNameError) {
          // 名前の保存失敗はログに記録するが、認証フローは継続
          console.warn('Apple Sign In: ユーザー名の保存に失敗しました:', updateNameError)
        } else if (process.env.NODE_ENV !== 'production') {
          console.log('Apple Sign In: ユーザー名を保存しました:', name)
        }
      }
    }

    // 6. カレンダー連携処理（共通関数を使用）
    if (isCalendarConnect && data.user && data.session) {
      const { error: calendarError } = await handleCalendarConnection(
        supabase,
        data.user,
        data.session
      )

      if (calendarError) {
        console.error('カレンダー連携エラー:', calendarError)
        // エラーは無視（既に有効化されている可能性がある）
      }
    }

    // 7. セッション検証（二重チェック）
    const { data: { session: verifiedSession } } = await supabase.auth.getSession()
    if (!verifiedSession) {
      console.error('Apple Sign In エラー: セッションの検証に失敗しました')
      const errorResponse = NextResponse.redirect(
        requestUrl.origin + '/login?error=session_verification_failed'
      )
      setCookiesOnResponse(errorResponse)
      return errorResponse
    }

    // 8. リダイレクト（Cookieを設定）
    const finalRedirectTo = isCalendarConnect
      ? `${redirectTo}${redirectTo.includes('?') ? '&' : '?'}calendar_connected=true`
      : redirectTo
    const successResponse = NextResponse.redirect(requestUrl.origin + finalRedirectTo)
    setCookiesOnResponse(successResponse)
    return successResponse

  } catch (err) {
    // 内部エラー詳細はサーバーログにのみ記録（URLには漏洩させない）
    console.error('Apple Sign In コールバックエラー:', err)
    const errorResponse = NextResponse.redirect(
      requestUrl.origin + '/login?error=auth_failed'
    )
    if (setCookiesOnResponse) {
      setCookiesOnResponse(errorResponse)
    }
    return errorResponse
  }
}
