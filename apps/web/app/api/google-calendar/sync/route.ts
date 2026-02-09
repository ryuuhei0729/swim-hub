import { competitionToCalendarEvent, fetchGoogleCalendarWithTokenRefresh, practiceToCalendarEvent, refreshGoogleAccessToken } from '@/lib/google-calendar'
import { getGoogleCalendarAuth } from '@/lib/google-calendar-auth'
import type { Competition, Practice } from '@apps/shared/types'
import { NextRequest, NextResponse } from 'next/server'

/**
 * Google Calendar APIへの同期処理
 * POST /api/google-calendar/sync
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization')
    const authResult = await getGoogleCalendarAuth(authHeader)

    if ('error' in authResult) {
      return authResult.error
    }

    const { supabase, profile: profileData, refreshToken } = authResult.result

    const body = await request.json()
    const { type, data, action, googleEventId } = body as {
      type: 'practice' | 'competition'
      data: Practice | Competition
      action: 'create' | 'update' | 'delete'
      googleEventId?: string
    }

    // 同期設定を確認
    if (type === 'practice' && !profileData.google_calendar_sync_practices) {
      return NextResponse.json({ error: '練習記録の同期が無効です' }, { status: 400 })
    }
    if (type === 'competition' && !profileData.google_calendar_sync_competitions) {
      return NextResponse.json({ error: '大会記録の同期が無効です' }, { status: 400 })
    }

    // リフレッシュトークンを使用して新しいアクセストークンを取得
    let accessToken: string
    try {
      accessToken = await refreshGoogleAccessToken(refreshToken)
    } catch {
      // フォールバック: Supabaseセッションのprovider_tokenを使用
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.provider_token) {
        return NextResponse.json({ error: 'Google認証トークンの取得に失敗しました' }, { status: 401 })
      }
      accessToken = session.provider_token
    }
    const calendarApiUrl = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'

    if (action === 'delete') {
      if (!googleEventId) {
        return NextResponse.json({ error: 'googleEventIdが必要です' }, { status: 400 })
      }

      const deleteResponse = await fetchGoogleCalendarWithTokenRefresh(
        `${calendarApiUrl}/${googleEventId}`,
        { method: 'DELETE' },
        accessToken,
        refreshToken
      )

      if (!deleteResponse.ok) {
        return NextResponse.json({ error: 'Google Calendarへの削除に失敗しました' }, { status: deleteResponse.status })
      }

      return NextResponse.json({ success: true })
    }

    // チーム名を取得（team_idがある場合）
    let teamName: string | null = null
    if ('team_id' in data && data.team_id) {
      const { data: team } = await supabase
        .from('teams')
        .select('name')
        .eq('id', data.team_id)
        .single()
      teamName = (team as { name: string } | null)?.name || null
    }

    // Google Calendarイベントに変換
    const event = type === 'practice'
      ? practiceToCalendarEvent(data as Practice, teamName)
      : competitionToCalendarEvent(data as Competition, teamName)

    // updateアクションの場合はgoogleEventIdが必須
    if (action === 'update' && !googleEventId) {
      return NextResponse.json(
        { error: '更新にはgoogleEventIdが必要です' },
        { status: 400 }
      )
    }

    const method = action === 'create' ? 'POST' : 'PUT'
    const url = action === 'update'
      ? `${calendarApiUrl}/${googleEventId}`
      : calendarApiUrl

    const response = await fetchGoogleCalendarWithTokenRefresh(
      url,
      { method, body: JSON.stringify(event) },
      accessToken,
      refreshToken
    )

    if (!response.ok) {
      return NextResponse.json({ error: 'Google Calendarへの同期に失敗しました' }, { status: response.status })
    }

    const result = await response.json() as { id?: string }

    return NextResponse.json({
      success: true,
      googleEventId: result.id
    })
  } catch (err) {
    console.error('Unexpected error in google-calendar/sync:', err)
    return NextResponse.json(
      { error: '予期しないエラーが発生しました' },
      { status: 500 }
    )
  }
}
