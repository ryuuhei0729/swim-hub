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

    // 練習・大会データを並行取得
    const [practicesResult, competitionsResult] = await Promise.all([
      profileData.google_calendar_sync_practices
        ? supabase.from('practices').select('*').eq('user_id', user.id).is('google_event_id', null)
        : Promise.resolve({ data: null, error: null }),
      profileData.google_calendar_sync_competitions
        ? supabase.from('competitions').select('*').eq('user_id', user.id).is('google_event_id', null)
        : Promise.resolve({ data: null, error: null })
    ])

    const practices = (!practicesResult.error && practicesResult.data) ? practicesResult.data as Practice[] : []
    const competitions = (!competitionsResult.error && competitionsResult.data) ? competitionsResult.data as Competition[] : []

    // チーム名を事前に一括取得（N+1クエリ回避）
    const allTeamIds = [...new Set([
      ...practices.filter(p => p.team_id).map(p => p.team_id!),
      ...competitions.filter(c => c.team_id).map(c => c.team_id!)
    ])]

    const teamNameMap = new Map<string, string>()
    if (allTeamIds.length > 0) {
      const { data: teams } = await supabase
        .from('teams')
        .select('id, name')
        .in('id', allTeamIds)
      if (teams) {
        for (const team of teams as Array<{ id: string; name: string }>) {
          teamNameMap.set(team.id, team.name)
        }
      }
    }

    // 練習記録の一括同期（バッチ並列化）
    if (practices.length > 0) {
      const BATCH_SIZE = 5
      for (let i = 0; i < practices.length; i += BATCH_SIZE) {
        const batch = practices.slice(i, i + BATCH_SIZE)
        const results = await Promise.allSettled(
          batch.map(async (practice) => {
            const teamName = practice.team_id ? teamNameMap.get(practice.team_id) ?? null : null
            const event = practiceToCalendarEvent(practice, teamName)

            const response = await fetchGoogleCalendarWithTokenRefresh(
              calendarApiUrl,
              { method: 'POST', body: JSON.stringify(event) },
              accessToken,
              refreshToken
            )

            if (response.ok) {
              const result = await response.json() as { id: string }
              const { error: updateError } = await (
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                supabase.from('practices') as any
              )
                .update({ google_event_id: result.id })
                .eq('id', practice.id)

              if (updateError) {
                console.error(`Practice更新エラー (${practice.id}):`, updateError)
                throw updateError
              }
            } else {
              console.error(`Practice同期エラー (${practice.id}):`, await response.text())
              throw new Error(`Practice sync failed: ${practice.id}`)
            }
          })
        )
        for (const result of results) {
          if (result.status === 'fulfilled') {
            practiceSuccessCount++
          } else {
            practiceErrorCount++
          }
        }
      }
    }

    // 大会記録の一括同期（バッチ並列化）
    if (competitions.length > 0) {
      const BATCH_SIZE = 5
      for (let i = 0; i < competitions.length; i += BATCH_SIZE) {
        const batch = competitions.slice(i, i + BATCH_SIZE)
        const results = await Promise.allSettled(
          batch.map(async (competition) => {
            const teamName = competition.team_id ? teamNameMap.get(competition.team_id) ?? null : null
            const event = competitionToCalendarEvent(competition, teamName)

            const response = await fetchGoogleCalendarWithTokenRefresh(
              calendarApiUrl,
              { method: 'POST', body: JSON.stringify(event) },
              accessToken,
              refreshToken
            )

            if (response.ok) {
              const result = await response.json() as { id: string }
              const { error: updateError } = await (
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                supabase.from('competitions') as any
              )
                .update({ google_event_id: result.id })
                .eq('id', competition.id)

              if (updateError) {
                console.error(`Competition更新エラー (${competition.id}):`, updateError)
                throw updateError
              }
            } else {
              console.error(`Competition同期エラー (${competition.id}):`, await response.text())
              throw new Error(`Competition sync failed: ${competition.id}`)
            }
          })
        )
        for (const result of results) {
          if (result.status === 'fulfilled') {
            competitionSuccessCount++
          } else {
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
