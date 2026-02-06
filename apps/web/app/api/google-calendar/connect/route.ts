import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

/**
 * Supabase設定を取得（MOBILE_* があればそちらを優先、なければ NEXT_PUBLIC_* を使用）
 */
function getSupabaseConfig() {
  const url = process.env.MOBILE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.MOBILE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !anonKey) {
    throw new Error('Supabase環境変数が設定されていません')
  }

  return { url, anonKey, serviceRoleKey }
}

/**
 * POST /api/google-calendar/connect
 * モバイルアプリからGoogleカレンダー連携を有効化
 * provider_refresh_tokenを保存し、フラグを更新
 */
export async function POST(request: NextRequest) {
  try {
    // 認証チェック（Authorizationヘッダーからトークンを取得）
    const authHeader = request.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: '認証が必要です' },
        { status: 401 }
      )
    }

    const accessToken = authHeader.substring(7)

    // Supabaseクライアントを作成（認証済み）
    const config = getSupabaseConfig()

    // アクセストークンをヘッダーに含めて認証済みクライアントを作成
    const supabase = createClient(config.url, config.anonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    })

    // トークンでユーザーを取得
    const { data: { user }, error: userError } = await supabase.auth.getUser(accessToken)
    if (userError || !user) {
      return NextResponse.json(
        { error: '認証に失敗しました' },
        { status: 401 }
      )
    }

    // リクエストボディからprovider_refresh_tokenを取得
    let providerRefreshToken: string | undefined
    try {
      const body = await request.json() as { providerRefreshToken?: string }
      providerRefreshToken = body.providerRefreshToken
    } catch {
      return NextResponse.json(
        { error: '無効なJSONです' },
        { status: 400 }
      )
    }

    if (!providerRefreshToken) {
      return NextResponse.json(
        { error: 'provider_refresh_tokenが必要です' },
        { status: 400 }
      )
    }

    // サービスロールキーがない場合はエラー
    if (!config.serviceRoleKey) {
      return NextResponse.json(
        { error: 'サーバー設定エラー' },
        { status: 500 }
      )
    }

    // サービスロールクライアントを作成（RPC関数実行用）
    const serviceClient = createClient(config.url, config.serviceRoleKey)

    // RPC関数でトークンを保存（サービスロールで実行）
    const { error: tokenError } = await serviceClient.rpc('set_google_refresh_token', {
      p_user_id: user.id,
      p_token: providerRefreshToken,
    })

    if (tokenError) {
      return NextResponse.json(
        { error: 'トークンの保存に失敗しました' },
        { status: 500 }
      )
    }

    // google_calendar_enabledフラグを更新（サービスロールで実行）
    const { error: updateError } = await serviceClient
      .from('users')
      .update({ google_calendar_enabled: true })
      .eq('id', user.id)

    if (updateError) {
      return NextResponse.json(
        { error: 'フラグの更新に失敗しました' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json(
      { error: '予期しないエラーが発生しました' },
      { status: 500 }
    )
  }
}
