import { createAuthenticatedServerClient } from '@/lib/supabase-server-auth'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const redirectTo = requestUrl.searchParams.get('redirect_to') || '/dashboard'

  if (code) {
    try {
      const supabase = await createAuthenticatedServerClient()
      // コードをセッションに交換（Cookie操作は自動的に処理される）
      const { data, error } = await supabase.auth.exchangeCodeForSession(code)
      
      if (error) {
        console.error('OAuthコールバックエラー:', error)
      } else if (data.session) {
        // Google OAuthの場合、Google Calendar連携を有効化
        const provider = data.session.provider_token ? 'google' : null
        if (provider === 'google' && data.user) {
          // Google Calendar連携を有効化（マイページで確認される）
          const updateData: { google_calendar_enabled: boolean; google_calendar_refresh_token: string | null } = {
            google_calendar_enabled: true,
            google_calendar_refresh_token: data.session.provider_refresh_token || null
          }
          const { error: updateError } = await supabase
            .from('users')
            // @ts-expect-error: Supabaseの型推論がupdateでneverになる既知の問題のため
            .update(updateData)
            .eq('id', data.user.id)
          
          if (updateError) {
            // エラーは無視（既に有効化されている可能性がある）
            console.error('Google Calendar連携有効化エラー:', updateError)
          }
        }
      }
    } catch (error) {
      console.error('OAuthコールバックエラー:', error)
    }
  }

  // リダイレクト（Route HandlerではNextResponse.redirectを使用）
  return NextResponse.redirect(requestUrl.origin + redirectTo)
}
