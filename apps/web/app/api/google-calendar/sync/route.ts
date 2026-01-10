import { createAuthenticatedServerClient, getServerUser } from '@/lib/supabase-server-auth'
import { NextRequest, NextResponse } from 'next/server'
import { practiceToCalendarEvent, competitionToCalendarEvent } from '@/lib/google-calendar'
import type { Practice, Competition } from '@apps/shared/types/database'

/**
 * Google Calendar APIへの同期処理
 * POST /api/google-calendar/sync
 */
export async function POST(request: NextRequest) {
  // #region agent log
  const fs = await import('fs')
  const logDebug = (loc: string, msg: string, data: Record<string, unknown>, hyp: string) => {
    try { fs.appendFileSync('/Users/ryuuhei_0729/swim-hub/.cursor/debug.log', JSON.stringify({location:loc,message:msg,data,timestamp:Date.now(),sessionId:'debug-session',hypothesisId:hyp})+'\n') } catch {}
  }
  logDebug('route.ts:POST-start', 'API削除リクエスト受信', {}, 'E')
  // #endregion
  try {
    const supabase = await createAuthenticatedServerClient()
    const user = await getServerUser()
    
    if (!user) {
      // #region agent log
      logDebug('route.ts:no-user', 'ユーザー認証なし', {}, 'B')
      // #endregion
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

    type ProfileData = {
      google_calendar_enabled: boolean
      google_calendar_refresh_token: string | null
      google_calendar_sync_practices: boolean
      google_calendar_sync_competitions: boolean
    }
    const profileData = profile as ProfileData

    if (!profileData.google_calendar_enabled || !profileData.google_calendar_refresh_token) {
      return NextResponse.json({ error: 'Google Calendar連携が有効になっていません' }, { status: 400 })
    }

    const body = await request.json()
    const { type, data, action, googleEventId } = body as {
      type: 'practice' | 'competition'
      data: Practice | Competition
      action: 'create' | 'update' | 'delete'
      googleEventId?: string
    }
    // #region agent log
    logDebug('route.ts:body-parsed', 'リクエストボディ解析', {type,action,googleEventId,hasData:!!data}, 'E')
    // #endregion

    // 同期設定を確認
    if (type === 'practice' && !profileData.google_calendar_sync_practices) {
      return NextResponse.json({ error: '練習記録の同期が無効です' }, { status: 400 })
    }
    if (type === 'competition' && !profileData.google_calendar_sync_competitions) {
      return NextResponse.json({ error: '大会記録の同期が無効です' }, { status: 400 })
    }

    // SupabaseからOAuthトークンを取得
    const { data: { session } } = await supabase.auth.getSession()
    // #region agent log
    logDebug('route.ts:session-check', 'セッション確認', {hasSession:!!session,hasProviderToken:!!session?.provider_token,providerTokenLength:session?.provider_token?.length||0}, 'B')
    // #endregion
    if (!session?.provider_token) {
      // #region agent log
      logDebug('route.ts:no-provider-token', 'provider_tokenがない', {}, 'B')
      // #endregion
      return NextResponse.json({ error: 'Google認証トークンが取得できません' }, { status: 401 })
    }

    // Google Calendar APIを呼び出し
    const accessToken = session.provider_token
    const calendarApiUrl = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'

    if (action === 'delete') {
      // #region agent log
      logDebug('route.ts:delete-action', 'Google Calendar削除処理開始', {type,googleEventId,action}, 'C')
      // #endregion
      console.log('Google Calendar削除リクエスト:', { type, googleEventId, action })
      
      if (!googleEventId) {
        // #region agent log
        logDebug('route.ts:no-googleEventId', 'googleEventIdが提供されていない', {}, 'A')
        // #endregion
        console.warn('Google Calendar削除 - googleEventIdが提供されていません')
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

      // #region agent log
      logDebug('route.ts:delete-response', 'Google Calendar API削除レスポンス', {status:deleteResponse.status,statusText:deleteResponse.statusText,ok:deleteResponse.ok}, 'C')
      // #endregion
      console.log('Google Calendar削除レスポンス:', {
        status: deleteResponse.status,
        statusText: deleteResponse.statusText
      })

      if (!deleteResponse.ok) {
        const errorText = await deleteResponse.text()
        // #region agent log
        logDebug('route.ts:delete-error', 'Google Calendar削除失敗', {status:deleteResponse.status,errorText}, 'C')
        // #endregion
        console.error('Google Calendar削除エラー:', errorText)
        return NextResponse.json({ error: 'Google Calendarへの削除に失敗しました' }, { status: deleteResponse.status })
      }

      // #region agent log
      logDebug('route.ts:delete-success', 'Google Calendar削除成功', {googleEventId}, 'C')
      // #endregion
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
    const method = action === 'create' ? 'POST' : 'PUT'
    const url = action === 'update' && googleEventId
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


