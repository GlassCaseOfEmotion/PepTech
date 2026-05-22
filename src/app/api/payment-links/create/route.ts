// src/app/api/payment-links/create/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createNowPayment } from '@/lib/payments/nowpayments'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: userRow } = await supabase
    .from('users').select('tenant_id').eq('id', user.id).single()
  if (!userRow) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const tenantId = userRow.tenant_id as string
  const { order_id } = await request.json() as { order_id: string }

  // Verify order belongs to this tenant
  const { data: order } = await supabase
    .from('orders')
    .select('id, ref_number, payment_amount')
    .eq('id', order_id)
    .single()
  if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

  // Provision wallet if not yet created
  let wallet = (await supabase
    .from('tenant_crypto_wallets').select('*').eq('tenant_id', tenantId).single()).data

  if (!wallet) {
    const provRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/crypto-wallet/provision`, {
      method: 'POST',
      headers: { Cookie: request.headers.get('cookie') ?? '' },
    })
    if (!provRes.ok) return NextResponse.json({ error: 'Wallet provisioning failed' }, { status: 502 })
    wallet = await provRes.json()
  }

  if (!wallet) return NextResponse.json({ error: 'No wallet' }, { status: 500 })

  // Create NOWPayments link
  let payment
  try {
    payment = await createNowPayment({
      amountUsd: Number(order.payment_amount),
      payoutAddress: wallet.solana_address,
      orderId: order.id,
      orderDescription: order.ref_number,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'NOWPayments error'
    return NextResponse.json({ error: msg }, { status: 502 })
  }

  const { data, error } = await supabase
    .from('crypto_payment_links')
    .insert({
      tenant_id: tenantId,
      order_id: order.id,
      nowpayments_id: payment.id,
      hosted_url: payment.hostedUrl,
      amount_usd: Number(order.payment_amount),
      payout_address: wallet.solana_address,
      expires_at: payment.expiresAt,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
