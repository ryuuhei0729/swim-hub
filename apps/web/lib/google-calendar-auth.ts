/**
 * Google Calendar API 認証・トークン取得の共通ユーティリティ
 */
import { createAuthenticatedServerClient, getServerUser } from '@/lib/supabase-server-auth'
import { decrypt, isEncrypted } from '@/lib/encryption'
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export type ProfileData = {
  google_calendar_enabled: boolean
  google_calendar_sync_practices: boolean
  google_calendar_sync_competitions: boolean
}

export type AuthResult = {
  supabase: SupabaseClient
  user: User
  profile: ProfileData
  refreshToken: string
}

/**
 * Supabase設定を取得
 */
function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !anonKey) {
    return null
  }

  return { url, anonKey, serviceRoleKey }
}

/**
 * サービスロールクライアントを取得（トークン取得用）
 */
function getServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    return null
  }

  return createClient(url, serviceRoleKey)
}

/**
 * Bearerトークンからモバイルユーザーを認証
 */
async function authenticateMobileUser(authHeader: string): Promise<{ supabase: SupabaseClient; user: User } | null> {
  if (!authHeader.startsWith('Bearer ')) {
    return null
  }

  const accessToken = authHeader.substring(7)
  const config = getSupabaseConfig()

  if (!config) {
    return null
  }

  const supabase = createClient(config.url, config.anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  })
  const { data: { user }, error } = await supabase.auth.getUser(accessToken)

  if (error || !user) {
    return null
  }

  return { supabase, user }
}

/**
 * Google Calendar API呼び出しに必要な認証情報を取得
 * Web/モバイル両対応、プロファイル取得、トークン復号化を一括で行う
 */
export async function getGoogleCalendarAuth(
  authHeader: string | null
): Promise<{ result: AuthResult } | { error: NextResponse }> {
  let supabase: SupabaseClient
  let user: User | null = null

  // 認証
  if (authHeader?.startsWith('Bearer ')) {
    const mobileAuth = await authenticateMobileUser(authHeader)
    if (!mobileAuth) {
      return { error: NextResponse.json({ error: '認証が必要です' }, { status: 401 }) }
    }
    supabase = mobileAuth.supabase
    user = mobileAuth.user
  } else {
    supabase = await createAuthenticatedServerClient()
    user = await getServerUser()
  }

  if (!user) {
    return { error: NextResponse.json({ error: '認証が必要です' }, { status: 401 }) }
  }

  // プロファイル取得
  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('google_calendar_enabled, google_calendar_sync_practices, google_calendar_sync_competitions')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) {
    return { error: NextResponse.json({ error: 'ユーザー情報の取得に失敗しました' }, { status: 500 }) }
  }

  const profileData = profile as ProfileData

  if (!profileData.google_calendar_enabled) {
    return { error: NextResponse.json({ error: 'Google Calendar連携が有効になっていません' }, { status: 400 }) }
  }

  // 暗号化キーの確認
  if (!process.env.TOKEN_ENCRYPTION_KEY) {
    console.error('TOKEN_ENCRYPTION_KEY is not set')
    return { error: NextResponse.json({ error: 'サーバー設定エラー' }, { status: 500 }) }
  }

  // サービスロールクライアントでトークン取得
  const serviceClient = getServiceRoleClient()
  if (!serviceClient) {
    return { error: NextResponse.json({ error: 'サーバー設定エラー' }, { status: 500 }) }
  }

  const { data: encryptedToken, error: tokenError } = await serviceClient.rpc('get_google_refresh_token', {
    p_user_id: user.id
  })

  if (tokenError || !encryptedToken) {
    return { error: NextResponse.json({ error: 'Google Calendar連携トークンの取得に失敗しました' }, { status: 401 }) }
  }

  // トークンを復号化（暗号化されている場合のみ）
  const refreshToken = isEncrypted(encryptedToken) ? decrypt(encryptedToken) : encryptedToken

  return {
    result: {
      supabase,
      user,
      profile: profileData,
      refreshToken
    }
  }
}
