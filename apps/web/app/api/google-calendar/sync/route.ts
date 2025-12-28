import { createAuthenticatedServerClient, getServerUser } from '@/lib/supabase-server-auth'
import { NextRequest, NextResponse } from 'next/server'
import { practiceToCalendarEvent, competitionToCalendarEvent } from '@/lib/google-calendar'
import type { Practice, Competition } from '@apps/shared/types/database'

/**
 * Google Calendar APIへの同期処理
 * POST /api/google-calendar/sync
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createAuthenticatedServerClient()
    const user = await getServerUser()
    
    if (!user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
    }

    // ユーザーのGoogle Calendar連携設定を取得
    const { data: profile, error: profileError } = await supabase
      .from('users')
      .select('google_calendar_enabled, google_calendar_refresh_token, google_calendar_sync_practices, google_calendar_sync_competitions')
      .eq('id', user.id)
      .single()

    if (profileError || !profile) {
      return NextResponse.json({ error: 'ユーザー情報の取得に失敗しました' }, { status: 500 })
    }

    if (!profile.google_calendar_enabled || !profile.google_calendar_refresh_token) {
      return NextResponse.json({ error: 'Google Calendar連携が有効になっていません' }, { status: 400 })
    }

    const body = await request.json()
    const { type, data, action } = body as {
      type: 'practice' | 'competition'
      data: Practice | Competition
      action: 'create' | 'update' | 'delete'
      googleEventId?: string
    }

    // 同期設定を確認
    if (type === 'practice' && !profile.google_calendar_sync_practices) {
      return NextResponse.json({ error: '練習記録の同期が無効です' }, { status: 400 })
    }
    if (type === 'competition' && !profile.google_calendar_sync_competitions) {
      return NextResponse.json({ error: '大会記録の同期が無効です' }, { status: 400 })
    }

    // SupabaseからOAuthトークンを取得
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.provider_token) {
      return NextResponse.json({ error: 'Google認証トークンが取得できません' }, { status: 401 })
    }

    // チーム名を取得（team_idがある場合）
    let teamName: string | null = null
    if ('team_id' in data && data.team_id) {
      const { data: team } = await supabase
        .from('teams')
        .select('name')
        .eq('id', data.team_id)
        .single()
      teamName = team?.name || null
    }

    // Google Calendarイベントに変換
    const event = type === 'practice'
      ? practiceToCalendarEvent(data as Practice, teamName)
      : competitionToCalendarEvent(data as Competition, teamName)

    // Google Calendar APIを呼び出し
    const accessToken = session.provider_token
    const calendarApiUrl = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'

    if (action === 'delete' && body.googleEventId) {
      // イベント削除
      const deleteResponse = await fetch(`${calendarApiUrl}/${body.googleEventId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      })

      if (!deleteResponse.ok) {
        const errorText = await deleteResponse.text()
        console.error('Google Calendar削除エラー:', errorText)
        return NextResponse.json({ error: 'Google Calendarへの削除に失敗しました' }, { status: deleteResponse.status })
      }

      return NextResponse.json({ success: true })
    }

    // イベント作成・更新
    const method = action === 'create' ? 'POST' : 'PUT'
    const url = action === 'update' && body.googleEventId
      ? `${calendarApiUrl}/${body.googleEventId}`
      : calendarApiUrl

    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(event)
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Google Calendar APIエラー:', errorText)
      return NextResponse.json({ error: 'Google Calendarへの同期に失敗しました' }, { status: response.status })
    }

    const result = await response.json()

    return NextResponse.json({
      success: true,
      googleEventId: result.id
    })
  } catch (error) {
    console.error('Google Calendar同期エラー:', error)
    return NextResponse.json(
      { error: '予期しないエラーが発生しました' },
      { status: 500 }
    )
  }
}


