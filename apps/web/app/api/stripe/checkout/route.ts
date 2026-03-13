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

    // 2. リクエストボディから priceId を取得
    const body = await request.json()
    const { priceId } = body as { priceId: string }

    if (!priceId || typeof priceId !== 'string') {
      return NextResponse.json(
        { error: 'priceId は必須です' },
        { status: 400 }
      )
    }

    // 3. user_subscriptions テーブルから trial_start を確認
    const { data: subscription } = await supabase
      .from('user_subscriptions')
      .select('trial_start')
      .eq('id', user.id)
      .single() as { data: { trial_start: string | null } | null; error: unknown }

    const hasUsedTrial = subscription?.trial_start != null

    // 4. Stripe Customer を検索または作成
    const stripe = getStripe()

    const existingCustomers = await stripe.customers.search({
      query: `metadata["supabase_user_id"]:"${user.id}"`,
    })

    let customerId: string

    if (existingCustomers.data.length > 0) {
      customerId = existingCustomers.data[0].id
    } else {
      const newCustomer = await stripe.customers.create({
        email: user.email,
        metadata: {
          supabase_user_id: user.id,
        },
      })
      customerId = newCustomer.id
    }

    // 5. Checkout Session 作成
    const origin = new URL(request.url).origin

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/settings?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/settings`,
      subscription_data: {
        trial_period_days: hasUsedTrial ? undefined : 7,
        metadata: {
          supabase_user_id: user.id,
        },
      },
    })

    // 6. session.url を返却
    return NextResponse.json({ url: session.url })
  } catch (error) {
    console.error('Stripe Checkout エラー:', error)
    return NextResponse.json(
      { error: 'Checkout セッションの作成に失敗しました' },
      { status: 500 }
    )
  }
}
