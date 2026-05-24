import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import type { CheckoutData } from '@/types/payments-crypto'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = createServiceClient()

  const { data, error } = await supabase
    .from('crypto_payment_links')
    .select(`
      id, status, amount_usd, amount_base, base_currency, memo,
      pay_address, pay_currency, pay_amount_crypto, expires_at, confirmed_at, created_at,
      orders ( ref_number ),
      tenants ( name )
    `)
    .eq('id', id)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = data as any
  const checkout: CheckoutData = {
    id: d.id,
    status: d.status,
    amount_usd: Number(d.amount_usd),
    amount_base: d.amount_base !== null ? Number(d.amount_base) : null,
    base_currency: d.base_currency,
    memo: d.memo,
    pay_address: d.pay_address,
    pay_currency: d.pay_currency,
    pay_amount_crypto: d.pay_amount_crypto !== null ? Number(d.pay_amount_crypto) : null,
    expires_at: d.expires_at,
    confirmed_at: d.confirmed_at,
    created_at: d.created_at,
    tenant_name: d.tenants?.name ?? 'Merchant',
    order_ref: d.orders?.ref_number ?? '',
  }

  return NextResponse.json(checkout)
}
