import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import type { TeamMembershipInsert } from '@apps/shared/types/database'

export async function POST(req: NextRequest) {
  try {
    // (1) Supabase クライアント作成と認証チェック
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return req.cookies.get(name)?.value
          },
          set() {},
          remove() {},
        },
      }
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 })
    }

    // (2) リクエストボディのパースとバリデーション
    const body = await req.json() as Partial<Pick<TeamMembershipInsert, 'team_id' | 'role'>>
    
    if (!body.team_id || typeof body.team_id !== 'string') {
      return NextResponse.json({ error: 'team_id が必須です' }, { status: 400 })
    }

    if (body.role && !['admin', 'user'].includes(body.role)) {
      return NextResponse.json({ error: 'role は admin または user である必要があります' }, { status: 400 })
    }

    // (3) 型安全な挿入ペイロードの構築
    const insertPayload: TeamMembershipInsert = {
      team_id: body.team_id,
      user_id: user.id,
      role: body.role || 'user',
      is_active: true,
      joined_at: new Date().toISOString(),
      member_type: null,
      group_name: null,
      left_at: null
    }

    // (4) データベースに挿入
    const { error } = await supabase
      .from('team_memberships')
      .insert(insertPayload)
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}


