import { NextRequest, NextResponse } from 'next/server'
import { createServerComponentClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  try {
    const { id, joinedAt } = (await req.json()) as { id: string; joinedAt: string }
    if (!id || !joinedAt) return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
    const supabase = await createServerComponentClient()
    const { error } = await supabase
      .from('team_memberships')
      // @ts-expect-error: Supabaseの型推論が更新ペイロードでneverになる既知の問題のため
      .update({ is_active: true, joined_at: joinedAt })
      .eq('id', id as string)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}


