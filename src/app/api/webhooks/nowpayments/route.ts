import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyNowPaymentsSignature } from '@/lib/payments/hmac'
import type { NowPaymentsWebhookPayload } from '@/types/payments-crypto'

// Map NOWPayments pay_currency codes to the order system's payment_asset codes
const NP_TO_ASSET: Record<string, string> = {
  usdttrc20: 'usdt_trc20',
  usdterc20: 'usdt_erc20',
  btc:       'btc',
  eth:       'eth',
  ltc:       'ltc',
  xmr:       'xmr',
  sol:       'sol',
}

function normalisePayCurrency(code: string): string {
  return NP_TO_ASSET[code.toLowerCase()] ?? code
}

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
    return NextResponse.json({ ok: true })
  }

  // Always update crypto_payment_links status
  await supabase
    .from('crypto_payment_links')
    .update({ status: payload.payment_status })
    .eq('id', link.id)

  // Payment detected on-chain (not yet fully settled) → awaiting → confirming
  const PAYMENT_DETECTED = ['confirming', 'confirmed', 'sending', 'partially_paid']
  if (PAYMENT_DETECTED.includes(payload.payment_status)) {
    const { data: advanced } = await supabase.from('orders')
      .update({ status: 'confirming' })
      .eq('id', link.order_id)
      .eq('status', 'awaiting')
      .select('id, tenant_id')
      .maybeSingle()

    if (advanced) {
      await supabase.from('order_events').insert({
        tenant_id: advanced.tenant_id,
        order_id: advanced.id,
        actor: 'system',
        action: 'Payment detected',
        note: `${payload.pay_currency.toUpperCase()} transaction seen on-chain — awaiting confirmations`,
      })
    }
    return NextResponse.json({ ok: true })
  }

  // Only do ledger writes on 'finished'
  if (payload.payment_status !== 'finished') {
    return NextResponse.json({ ok: true })
  }

  // Idempotency: skip if already recorded this transaction
  if (link.nowpayments_tx_id === payload.payment_id) {
    return NextResponse.json({ ok: true })
  }

  const usdcReceived = payload.outcome_amount ?? payload.actually_paid

  // Confirm the payment link with final amounts
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

  // Update order with confirmed payment details
  const normalisedAsset = normalisePayCurrency(payload.pay_currency)
  await supabase.from('orders')
    .update({
      payment_asset: normalisedAsset,
      payment_amount: payload.pay_amount,
      tx_hash: payload.payment_id,
    })
    .eq('id', link.order_id)

  // Payment settled → advance order to packing
  // Handles both confirming→packing (normal) and awaiting→packing (if confirming webhook was missed)
  const { data: advanced } = await supabase.from('orders')
    .update({ status: 'packing' })
    .eq('id', link.order_id)
    .in('status', ['awaiting', 'confirming'])
    .select('id, tenant_id')
    .maybeSingle()

  if (advanced) {
    await supabase.from('order_events').insert({
      tenant_id: advanced.tenant_id,
      order_id: advanced.id,
      actor: 'system',
      action: 'Payment settled',
      note: `${normalisedAsset.toUpperCase()} payment settled — ${usdcReceived} USDC received`,
    })
  }

  return NextResponse.json({ ok: true })
}
