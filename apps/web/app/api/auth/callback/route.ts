import { createServerComponentClient } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const redirectTo = requestUrl.searchParams.get('redirect_to') || '/dashboard'

  if (code) {
    const supabase = await createServerComponentClient()
    
    await supabase.auth.exchangeCodeForSession(code)
  }

  // 指定されたリダイレクト先に遷移
  return NextResponse.redirect(requestUrl.origin + redirectTo)
}
