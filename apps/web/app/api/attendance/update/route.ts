import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

type Body = {
  table: 'practices' | 'competitions'
  id: string
  status: 'before' | 'open' | 'closed' | null
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<Body>
    if (!body || !body.table || !body.id || body.status === undefined) {
      return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
    }

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

    const table = body.table
    const statusValue: string | null = body.status

    const { error } = await supabase
      .from(table)
      .update({ attendance_status: statusValue })
      .eq('id', body.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}




