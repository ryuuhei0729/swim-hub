import { createRouteHandlerClient } from '@/lib/supabase-server'
import type { TeamMembershipInsert } from '@apps/shared/types/database'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    // (1) Supabase クライアント作成と認証チェック
    const { client, setCookiesOnResponse } = createRouteHandlerClient(req)

    const { data: { user }, error: authError } = await client.auth.getUser()
    if (authError || !user) {
      const response = NextResponse.json({ error: '認証が必要です' }, { status: 401 })
      setCookiesOnResponse(response)
      return response
    }

    // (2) リクエストボディのパースとバリデーション
    const body = await req.json() as Partial<Pick<TeamMembershipInsert, 'team_id' | 'role'>>
    
    if (!body.team_id || typeof body.team_id !== 'string') {
      const response = NextResponse.json({ error: 'team_id が必須です' }, { status: 400 })
      setCookiesOnResponse(response)
      return response
    }

    if (body.role && !['admin', 'user'].includes(body.role)) {
      const response = NextResponse.json({ error: 'role は admin または user である必要があります' }, { status: 400 })
      setCookiesOnResponse(response)
      return response
    }

    // (3) 型安全な挿入ペイロードの構築
    // member_type と group_name はデータベースに存在しないため除外
    const insertPayload: Omit<TeamMembershipInsert, 'member_type' | 'group_name'> = {
      team_id: body.team_id,
      user_id: user.id,
      role: body.role || 'user',
      is_active: true,
      joined_at: new Date().toISOString().split('T')[0], // YYYY-MM-DD形式
      left_at: null
    }

    // (4) データベースに挿入
    const { error } = await client
      .from('team_memberships')
      // @ts-expect-error: Supabaseの型推論がinsertでneverになる既知の問題のため
      .insert(insertPayload)
    
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


