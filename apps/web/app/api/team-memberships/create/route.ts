import { NextRequest, NextResponse } from 'next/server'
import { createServerComponentClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const supabase = await createServerComponentClient()
    const { error } = await supabase
      .from('team_memberships')
      .insert(body)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}


