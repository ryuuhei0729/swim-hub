import { createRouteHandlerClient } from '@/lib/supabase-server'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

/**
 * redirectToパラメータを検証・サニタイズする
 * - '/'で始まるパスであることを確認
 * - CR/LFや制御文字を含まないことを確認
 * - 無効な値の場合は'/dashboard'にフォールバック
 * - デコード後の値に対してバリデーションを実行（二重エンコード攻撃を防止）
 */
function validateRedirectPath(redirectTo: string | null): string {
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
  
  // 検証を通過したデコード済みパスを返す
  return decoded
}

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const redirectTo = validateRedirectPath(requestUrl.searchParams.get('redirect_to'))

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

    // calendar_connectパラメータがある場合のみ、Google Calendar連携を有効化
    const isCalendarConnect = requestUrl.searchParams.get('calendar_connect') === 'true'
    if (isCalendarConnect) {
      // providers配列にgoogleが含まれているかチェック（メールで登録後にGoogleでログインした場合も対応）
      const providers = data.user?.app_metadata?.providers as string[] | undefined
      const hasGoogleProvider = providers?.includes('google') ?? false
      if (hasGoogleProvider && data.user) {
        // Google Calendar連携を有効化（マイページで確認される）
        // リフレッシュトークンはRPC関数で暗号化して保存
        const refreshToken = data.session.provider_refresh_token || null
        
        // RPC関数でトークンを暗号化して保存（トークンが存在する場合のみ）
        let tokenError: Error | null = null
        if (refreshToken) {
          // @ts-expect-error - @supabase/ssr v0.8.0のcreateServerClientはDatabase['public']['Functions']の型推論をサポートしていない
          const { error } = await supabase.rpc('set_google_refresh_token', {
            p_user_id: data.user.id,
            p_token: refreshToken
          })
          tokenError = error
        }
        
        // google_calendar_enabledフラグを更新
        const { error: updateError } = await supabase
          .from('users')
          // @ts-expect-error: Supabaseの型推論がupdateでneverになる既知の問題のため
          .update({ google_calendar_enabled: true })
          .eq('id', data.user.id)
        
        if (tokenError || updateError) {
          // エラーは無視（既に有効化されている可能性がある）
          if (tokenError) {
            console.error('Google Calendar連携有効化エラー（トークン保存）:', tokenError)
          }
          if (updateError) {
            console.error('Google Calendar連携有効化エラー（ユーザー更新）:', updateError)
          }
        }
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
    console.error('OAuthコールバックエラー:', error)
    const errorMessage = error instanceof Error ? error.message : 'unknown_error'
    const errorResponse = NextResponse.redirect(
      requestUrl.origin + `/login?error=${encodeURIComponent(errorMessage)}`
    )
    // setCookiesOnResponseが利用可能な場合は、他のエラーパスと同様にCookieを設定
    if (setCookiesOnResponse) {
      setCookiesOnResponse(errorResponse)
    }
    return errorResponse
  }
}
