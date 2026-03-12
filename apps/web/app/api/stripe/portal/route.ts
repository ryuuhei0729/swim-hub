import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-auth/server'
import { getStripe } from '@/lib/stripe'

export async function POST(request: NextRequest) {
  try {
    // 1. 認証チェック
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: '認証が必要です' },
        { status: 401 }
      )
    }

    // 2. Stripe Customer を検索
    const stripe = getStripe()

    const existingCustomers = await stripe.customers.search({
      query: `metadata["supabase_user_id"]:"${user.id}"`,
    })

    if (existingCustomers.data.length === 0) {
      return NextResponse.json(
        { error: 'Stripe の顧客情報が見つかりません' },
        { status: 404 }
      )
    }

    const customerId = existingCustomers.data[0].id

    // 3. Customer Portal Session 作成
    const origin = new URL(request.url).origin

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/settings`,
    })

    // 4. session.url を返却
    return NextResponse.json({ url: session.url })
  } catch (error) {
    console.error('Stripe Portal エラー:', error)
    return NextResponse.json(
      { error: 'ポータルセッションの作成に失敗しました' },
      { status: 500 }
    )
  }
}
