import { createClient } from '@/lib/supabase-auth/server'
import { NextRequest, NextResponse } from 'next/server'

/**
 * Apple Sign In Web用コールバックエンドポイント
 * AppleはPOSTでフォームデータを送信する
 *
 * フロー:
 * 1. ユーザーがAppleでサインイン
 * 2. Appleがこのエンドポイントにid_tokenをPOST
 * 3. signInWithIdTokenでSupabaseセッションを確立
 * 4. ダッシュボードにリダイレクト
 */

export async function POST(request: NextRequest) {
  const requestUrl = new URL(request.url)

  try {
    // AppleはPOSTでフォームデータを送信
    const formData = await request.formData()
    const idToken = formData.get('id_token') as string | null
    const _code = formData.get('code') as string | null
    const state = formData.get('state') as string | null
    const error = formData.get('error') as string | null
    const _user = formData.get('user') as string | null // 初回サインイン時のみ

    // エラーチェック
    if (error) {
      console.error('Apple Sign In エラー:', error)
      return NextResponse.redirect(
        requestUrl.origin + `/login?error=${encodeURIComponent(error)}`
      )
    }

    if (!idToken) {
      console.error('Apple Sign In エラー: id_tokenがありません')
      return NextResponse.redirect(
        requestUrl.origin + '/login?error=missing_id_token'
      )
    }

    // Supabaseクライアントを作成
    const supabase = await createClient()

    // id_tokenを使用してSupabaseセッションを確立
    const { data, error: signInError } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: idToken,
    })

    if (signInError) {
      console.error('Apple Sign In セッション作成エラー:', signInError)
      return NextResponse.redirect(
        requestUrl.origin + `/login?error=${encodeURIComponent(signInError.message)}`
      )
    }

    if (!data.session) {
      console.error('Apple Sign In エラー: セッションが作成されませんでした')
      return NextResponse.redirect(
        requestUrl.origin + '/login?error=session_creation_failed'
      )
    }

    // 成功 - ダッシュボードにリダイレクト
    // stateパラメータにリダイレクト先が含まれている場合はそこにリダイレクト
    let redirectTo = '/dashboard'
    if (state) {
      try {
        const stateData = JSON.parse(state)
        if (stateData.redirectTo && stateData.redirectTo.startsWith('/')) {
          redirectTo = stateData.redirectTo
        }
      } catch {
        // stateのパースに失敗した場合はデフォルトのリダイレクト先を使用
      }
    }

    return NextResponse.redirect(requestUrl.origin + redirectTo)
  } catch (err) {
    console.error('Apple Sign In コールバックエラー:', err)
    const errorMessage = err instanceof Error ? err.message : 'unknown_error'
    return NextResponse.redirect(
      requestUrl.origin + `/login?error=${encodeURIComponent(errorMessage)}`
    )
  }
}

// GETリクエストはサポートしない（Appleからの正規コールバックはPOST）
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  return NextResponse.redirect(
    requestUrl.origin + '/login?error=invalid_request_method'
  )
}
