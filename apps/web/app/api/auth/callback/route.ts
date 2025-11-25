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
      const { error } = await supabase.auth.exchangeCodeForSession(code)
      
      if (error) {
        console.error('OAuthコールバックエラー:', error)
      }
    } catch (error) {
      console.error('OAuthコールバックエラー:', error)
    }
  }

  // リダイレクト（Route HandlerではNextResponse.redirectを使用）
  return NextResponse.redirect(requestUrl.origin + redirectTo)
}
