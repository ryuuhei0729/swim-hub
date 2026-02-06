import { competitionToCalendarEvent, fetchGoogleCalendarWithTokenRefresh, practiceToCalendarEvent, refreshGoogleAccessToken } from '@/lib/google-calendar'
import { createAuthenticatedServerClient, getServerUser } from '@/lib/supabase-server-auth'
import type { Competition, Practice } from '@apps/shared/types'
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

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
 * Google Calendar APIへの一括同期処理
 * POST /api/google-calendar/sync-all
 */
export async function POST(request: NextRequest) {
  try {
    // モバイルからのBearerトークン認証を先にチェック
    const authHeader = request.headers.get('Authorization')
    let supabase: SupabaseClient
    let user: User | null = null

    if (authHeader?.startsWith('Bearer ')) {
      // モバイルアプリからのリクエスト
      const mobileAuth = await authenticateMobileUser(authHeader)
      if (!mobileAuth) {
        return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
      }
      supabase = mobileAuth.supabase
      user = mobileAuth.user
    } else {
      // Webアプリからのリクエスト（Cookie認証）
      supabase = await createAuthenticatedServerClient()
      user = await getServerUser()
    }

    if (!user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
    }

    // ユーザーのGoogle Calendar連携設定を取得
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('google_calendar_enabled, google_calendar_sync_practices, google_calendar_sync_competitions')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'ユーザー情報の取得に失敗しました' }, { status: 500 })
    }

    type ProfileData = {
      google_calendar_enabled: boolean
      google_calendar_sync_practices: boolean
      google_calendar_sync_competitions: boolean
    }
    const profileData = profile as ProfileData

    if (!profileData.google_calendar_enabled) {
      return NextResponse.json({ error: 'Google Calendar連携が有効になっていません' }, { status: 400 })
    }

    // サービスロールクライアントを取得
    const serviceClient = getServiceRoleClient()
    if (!serviceClient) {
      return NextResponse.json({ error: 'サーバー設定エラー' }, { status: 500 })
    }

    // RPC関数でトークンを復号化して取得（サービスロールで実行）
    const { data: refreshToken, error: tokenError } = await serviceClient.rpc('get_google_refresh_token', {
      p_user_id: user.id
    })

    if (tokenError || !refreshToken) {
      return NextResponse.json({ error: 'Google Calendar連携トークンの取得に失敗しました' }, { status: 401 })
    }

    // リフレッシュトークンを使用して新しいアクセストークンを取得
    let accessToken: string
    try {
      accessToken = await refreshGoogleAccessToken(refreshToken)
    } catch (error) {
      console.error('Google OAuthトークンリフレッシュエラー:', error)
      // フォールバック: Supabaseセッションのprovider_tokenを使用
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.provider_token) {
        return NextResponse.json({ error: 'Google認証トークンの取得に失敗しました' }, { status: 401 })
      }
      accessToken = session.provider_token
    }
    const calendarApiUrl = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'

    let practiceSuccessCount = 0
    let practiceErrorCount = 0
    let competitionSuccessCount = 0
    let competitionErrorCount = 0

    // 練習記録の一括同期
    if (profileData.google_calendar_sync_practices) {
      const { data: practices, error: practicesError } = await supabase
        .from('practices')
        .select('*')
        .eq('user_id', user.id)
        .is('google_event_id', null)

      if (!practicesError && practices) {
        for (const practice of practices as Practice[]) {
          try {
            // チーム名を取得（team_idがある場合）
            let teamName: string | null = null
            if (practice.team_id) {
              const { data: team } = await supabase
                .from('teams')
                .select('name')
                .eq('id', practice.team_id)
                .single()
              teamName = (team as { name: string } | null)?.name || null
            }

            // Google Calendarイベントに変換
            const event = practiceToCalendarEvent(practice, teamName)

            // Google Calendar APIを呼び出し（401エラー時に自動的にトークンをリフレッシュして再試行）
            const response = await fetchGoogleCalendarWithTokenRefresh(
              calendarApiUrl,
              {
                method: 'POST',
                body: JSON.stringify(event),
              },
              accessToken,
              refreshToken
            )

            if (response.ok) {
              const result = await response.json() as { id: string }
              
              // google_event_idを保存
              const { error: updateError } = await (
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                supabase.from('practices') as any
              )
                .update({ google_event_id: result.id })
                .eq('id', practice.id)
              
              if (updateError) {
                console.error(`Practice更新エラー (${practice.id}):`, updateError)
                practiceErrorCount++
              } else {
                practiceSuccessCount++
              }
            } else {
              console.error(`Practice同期エラー (${practice.id}):`, await response.text())
              practiceErrorCount++
            }
          } catch (error) {
            console.error(`Practice同期エラー (${practice.id}):`, error)
            practiceErrorCount++
          }
        }
      }
    }

    // 大会記録の一括同期
    if (profileData.google_calendar_sync_competitions) {
      const { data: competitions, error: competitionsError } = await supabase
        .from('competitions')
        .select('*')
        .eq('user_id', user.id)
        .is('google_event_id', null)

      if (!competitionsError && competitions) {
        for (const competition of competitions as Competition[]) {
          try {
            // チーム名を取得（team_idがある場合）
            let teamName: string | null = null
            if (competition.team_id) {
              const { data: team } = await supabase
                .from('teams')
                .select('name')
                .eq('id', competition.team_id)
                .single()
              teamName = (team as { name: string } | null)?.name || null
            }

            // Google Calendarイベントに変換
            const event = competitionToCalendarEvent(competition, teamName)

            // Google Calendar APIを呼び出し（401エラー時に自動的にトークンをリフレッシュして再試行）
            const response = await fetchGoogleCalendarWithTokenRefresh(
              calendarApiUrl,
              {
                method: 'POST',
                body: JSON.stringify(event),
              },
              accessToken,
              refreshToken
            )

            if (response.ok) {
              const result = await response.json() as { id: string }
              
              // google_event_idを保存
              const { error: updateError } = await (
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                supabase.from('competitions') as any
              )
                .update({ google_event_id: result.id })
                .eq('id', competition.id)
              
              if (updateError) {
                console.error(`Competition更新エラー (${competition.id}):`, updateError)
                competitionErrorCount++
              } else {
                competitionSuccessCount++
              }
            } else {
              console.error(`Competition同期エラー (${competition.id}):`, await response.text())
              competitionErrorCount++
            }
          } catch (error) {
            console.error(`Competition同期エラー (${competition.id}):`, error)
            competitionErrorCount++
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      results: {
        practices: {
          success: practiceSuccessCount,
          error: practiceErrorCount
        },
        competitions: {
          success: competitionSuccessCount,
          error: competitionErrorCount
        }
      }
    })
  } catch (error) {
    console.error('Google Calendar一括同期エラー:', error)
    return NextResponse.json(
      { error: '予期しないエラーが発生しました' },
      { status: 500 }
    )
  }
}
