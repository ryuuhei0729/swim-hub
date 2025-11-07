import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@/lib/supabase-server'

type Body = {
  table: 'practices' | 'competitions'
  id: string
  status: 'before' | 'open' | 'closed' | null
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<Body>
    if (!body || !body.table || !body.id || body.status === undefined) {
      const response = NextResponse.json({ error: 'Invalid body' }, { status: 400 })
      const { setCookiesOnResponse } = createRouteHandlerClient(req)
      setCookiesOnResponse(response)
      return response
    }

    const { client, setCookiesOnResponse } = createRouteHandlerClient(req)

    const table = body.table
    const statusValue: string | null = body.status

    // Supabaseの型推論が動的テーブル名でneverになる既知の問題のため、型アサーションを使用
    const { error } = await (client.from(table) as any)
      .update({ attendance_status: statusValue })
      .eq('id', body.id)

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




