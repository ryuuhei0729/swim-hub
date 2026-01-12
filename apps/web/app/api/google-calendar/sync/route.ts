import { competitionToCalendarEvent, practiceToCalendarEvent } from '@/lib/google-calendar'
import { createAuthenticatedServerClient, getServerUser } from '@/lib/supabase-server-auth'
import type { Competition, Practice } from '@apps/shared/types/database'
import { NextRequest, NextResponse } from 'next/server'

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

    // RPC関数でトークンを復号化して取得
    // @ts-expect-error - @supabase/ssr v0.8.0のcreateServerClientはDatabase['public']['Functions']の型推論をサポートしていない
    const { data: refreshToken, error: tokenError } = await supabase.rpc('get_google_refresh_token', {
      p_user_id: user.id
    })

    if (tokenError || !refreshToken) {
      return NextResponse.json({ error: 'Google Calendar連携トークンの取得に失敗しました' }, { status: 401 })
    }

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

    // SupabaseからOAuthトークンを取得
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.provider_token) {
      return NextResponse.json({ error: 'Google認証トークンが取得できません' }, { status: 401 })
    }

    // Google Calendar APIを呼び出し
    const accessToken = session.provider_token
    const calendarApiUrl = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'

    if (action === 'delete') {
      if (!googleEventId) {
        return NextResponse.json({ error: 'googleEventIdが必要です' }, { status: 400 })
      }

      // イベント削除
      const deleteResponse = await fetch(`${calendarApiUrl}/${googleEventId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      })

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

    // イベント作成・更新
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

    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(event)
    })

    if (!response.ok) {
      return NextResponse.json({ error: 'Google Calendarへの同期に失敗しました' }, { status: response.status })
    }

    const result = await response.json()

    return NextResponse.json({
      success: true,
      googleEventId: result.id
    })
  } catch {
    return NextResponse.json(
      { error: '予期しないエラーが発生しました' },
      { status: 500 }
    )
  }
}


