import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  try {
    const { id, joinedAt } = (await req.json()) as { id: string; joinedAt: string }
    if (!id || !joinedAt) {
      const response = NextResponse.json({ error: 'Invalid body' }, { status: 400 })
      const { setCookiesOnResponse } = createRouteHandlerClient(req)
      setCookiesOnResponse(response)
      return response
    }
    const { client, setCookiesOnResponse } = createRouteHandlerClient(req)
    const { error } = await client
      .from('team_memberships')
      // @ts-expect-error: Supabaseの型推論が更新ペイロードでneverになる既知の問題のため
      .update({ is_active: true, joined_at: joinedAt })
      .eq('id', id as string)
    if (error) {
      const response = NextResponse.json({ error: error.message }, { status: 500 })
      setCookiesOnResponse(response)
      return response
    }
    const response = NextResponse.json({ ok: true })
    setCookiesOnResponse(response)
    return response
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const response = NextResponse.json({ error: msg }, { status: 500 })
    // エラー時でもCookieを設定（認証状態の更新がある可能性があるため）
    const { setCookiesOnResponse } = createRouteHandlerClient(req)
    setCookiesOnResponse(response)
    return response
  }
}


