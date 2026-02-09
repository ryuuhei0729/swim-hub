import { competitionToCalendarEvent, fetchGoogleCalendarWithTokenRefresh, practiceToCalendarEvent, refreshGoogleAccessToken } from '@/lib/google-calendar'
import { getGoogleCalendarAuth } from '@/lib/google-calendar-auth'
import type { Competition, Practice } from '@apps/shared/types'
import { NextRequest, NextResponse } from 'next/server'

/**
 * Google Calendar APIへの一括同期処理
 * POST /api/google-calendar/sync-all
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization')
    const authResult = await getGoogleCalendarAuth(authHeader)

    if ('error' in authResult) {
      return authResult.error
    }

    const { supabase, user, profile: profileData, refreshToken } = authResult.result

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

            // Google Calendar APIを呼び出し
            const response = await fetchGoogleCalendarWithTokenRefresh(
              calendarApiUrl,
              { method: 'POST', body: JSON.stringify(event) },
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

            // Google Calendar APIを呼び出し
            const response = await fetchGoogleCalendarWithTokenRefresh(
              calendarApiUrl,
              { method: 'POST', body: JSON.stringify(event) },
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
