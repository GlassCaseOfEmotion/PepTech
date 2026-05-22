import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyNowPaymentsSignature } from '@/lib/payments/hmac'
import type { NowPaymentsWebhookPayload } from '@/types/payments-crypto'

export async function POST(request: Request) {
  const body = await request.text()
  const signature = request.headers.get('x-nowpayments-sig') ?? ''
  const secret = process.env.NOWPAYMENTS_IPN_SECRET ?? ''

  if (!verifyNowPaymentsSignature(body, signature, secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const payload = JSON.parse(body) as NowPaymentsWebhookPayload
  const supabase = createServiceClient()

  // Find the payment link by NOWPayments payment ID
  const { data: link } = await supabase
    .from('crypto_payment_links')
    .select('id, tenant_id, nowpayments_tx_id, order_id')
    .eq('nowpayments_id', payload.payment_id)
    .single()

  if (!link) {
    // Unknown payment — return 200 so NOWPayments doesn't retry indefinitely
    return NextResponse.json({ ok: true })
  }

  // Always update status
  await supabase
    .from('crypto_payment_links')
    .update({ status: payload.payment_status })
    .eq('id', link.id)

  // Only do ledger writes on 'finished'
  if (payload.payment_status !== 'finished') {
    return NextResponse.json({ ok: true })
  }

  // Idempotency: skip if already recorded this transaction
  if (link.nowpayments_tx_id === payload.payment_id) {
    return NextResponse.json({ ok: true })
  }

  const usdcReceived = payload.outcome_amount ?? payload.actually_paid

  // Confirm the payment link
  await supabase.from('crypto_payment_links').update({
    status: 'finished',
    confirmed_at: new Date().toISOString(),
    paid_token: payload.pay_currency,
    paid_amount: payload.pay_amount,
    usdc_received: usdcReceived,
    nowpayments_tx_id: payload.payment_id,
  }).eq('id', link.id)

  // Record wallet transaction
  await supabase.from('wallet_transactions').insert({
    tenant_id: link.tenant_id,
    crypto_payment_link_id: link.id,
    amount_usdc: usdcReceived,
    source_token: payload.pay_currency,
    source_amount: payload.actually_paid,
  })

  // Increment cached balance
  await supabase.rpc('increment_wallet_balance', {
    p_tenant_id: link.tenant_id,
    p_amount: usdcReceived,
  })

  // Update order payment fields
  await supabase.from('orders')
    .update({
      payment_asset: payload.pay_currency,
      payment_amount: payload.pay_amount,
      tx_hash: payload.payment_id,
    })
    .eq('id', link.order_id)

  return NextResponse.json({ ok: true })
}
